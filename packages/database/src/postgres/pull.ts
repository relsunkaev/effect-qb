import { mkdir } from "node:fs/promises"
import { dirname, extname, relative, resolve } from "node:path"

import { Datatypes } from "effect-qb/postgres"
import type { ColumnModel, EnumModel, SchemaModel, TableModel, DdlExpressionLike, IndexKeySpec, TableOptionSpec } from "effect-qb/postgres/metadata"
import { defaultConstraintName } from "../internal/postgres-schema-sql.js"
import { enumKey, tableKey, renderDdlExpressionSql, normalizeDdlExpressionSql, toEnumModel, toTableModel } from "effect-qb/postgres/metadata"
import type { DiscoveredSourceSchema, SourceBinding, SourceDeclaration } from "../internal/postgres-source-discovery.js"
import { canonicalizePostgresTypeName, inferPostgresTypeKind } from "../internal/postgres-type-utils.js"
import { parse, type Expr as PgSqlExpr } from "pgsql-ast-parser"

const TABLE_ALIAS = "Table"
const COLUMN_ALIAS = "Column"
const PG_ALIAS = "Pg"
const SCHEMA_ALIAS = "Schema"

export interface PullFileUpdate {
  readonly filePath: string
  readonly before: string
  readonly after: string
}

export interface PullPlan {
  readonly updates: readonly PullFileUpdate[]
}

type RenderContext = {
  readonly bindingByKey: ReadonlyMap<string, SourceBinding>
  readonly enumKeys: ReadonlySet<string>
  readonly enumExpressionByKey?: ReadonlyMap<string, string>
  readonly sequenceExpressionByKey?: ReadonlyMap<string, string>
}

type ExpressionRenderContext = {
  readonly columnByName: ReadonlyMap<string, ColumnModel>
  readonly enumKeys: ReadonlySet<string>
  readonly enumExpressionByKey?: ReadonlyMap<string, string>
  readonly sequenceExpressionByKey?: ReadonlyMap<string, string>
  readonly currentSchemaName?: string
}

const isIdentifier = (value: string): boolean =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)

const indent = (value: string, spaces = 2): string =>
  value.split("\n").map((line) => `${" ".repeat(spaces)}${line}`).join("\n")

const renderStringLiteral = (value: string): string =>
  JSON.stringify(value)

const renderPropertyKey = (value: string): string =>
  isIdentifier(value)
    ? value
    : renderStringLiteral(value)

const renderStringTuple = (values: readonly string[]): string =>
  `[${values.map(renderStringLiteral).join(", ")}]`

const chunk = <Value>(
  values: readonly Value[],
  size: number
): readonly (readonly Value[])[] => {
  if (values.length === 0) {
    return []
  }
  const chunks: Value[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

const renderPipeChain = (
  base: string,
  operations: readonly string[]
): string => {
  if (operations.length === 0) {
    return base
  }
  if (operations.length <= 3 && operations.every((operation) => !operation.includes("\n"))) {
    return `${base}.pipe(${operations.join(", ")})`
  }
  return chunk(operations, 20).reduce(
    (current, group) => `${current}.pipe(\n${indent(group.join(",\n"))}\n)`,
    base
  )
}

const schemaObjectKey = (
  schemaName: string | undefined,
  name: string
): string =>
  `${schemaName ?? "public"}.${name}`

const pairUniqueBySignature = <Source, Db>(
  sourceItems: readonly Source[],
  dbItems: readonly Db[],
  sourceSignatureOf: (item: Source) => string,
  dbSignatureOf: (item: Db) => string
): readonly { readonly source: Source; readonly db: Db }[] => {
  const sourceBySignature = new Map<string, Source[]>()
  for (const item of sourceItems) {
    const signature = sourceSignatureOf(item)
    const list = sourceBySignature.get(signature) ?? []
    list.push(item)
    sourceBySignature.set(signature, list)
  }
  const dbBySignature = new Map<string, Db[]>()
  for (const item of dbItems) {
    const signature = dbSignatureOf(item)
    const list = dbBySignature.get(signature) ?? []
    list.push(item)
    dbBySignature.set(signature, list)
  }
  const pairs: Array<{ readonly source: Source; readonly db: Db }> = []
  for (const [signature, source] of sourceBySignature) {
    const db = dbBySignature.get(signature)
    if (source.length === 1 && db?.length === 1) {
      pairs.push({
        source: source[0]!,
        db: db[0]!
      })
    }
  }
  return pairs
}

type PulledAddition = {
  readonly declaration: SourceDeclaration
  readonly kind: SourceBinding["kind"]
  readonly key: string
  readonly value: unknown
  readonly model: TableModel | EnumModel
  readonly sourceIndex: number
}

const sortPulledAdditions = (
  additions: readonly PulledAddition[]
): readonly PulledAddition[] => {
  if (additions.length <= 1) {
    return additions
  }
  return [...additions].sort((left, right) => left.sourceIndex - right.sourceIndex)
}

const sortTableAdditionsByDependency = (
  additions: readonly (PulledAddition & { readonly kind: "table"; readonly model: TableModel })[]
): readonly (PulledAddition & { readonly kind: "table"; readonly model: TableModel })[] => {
  if (additions.length <= 1) {
    return additions
  }
  const keyOf = (addition: PulledAddition & { readonly kind: "table"; readonly model: TableModel }): string =>
    tableKey(addition.model.schemaName, addition.model.name)
  const additionsByKey = new Map(additions.map((addition) => [keyOf(addition), addition] as const))
  const dependenciesByKey = new Map<string, Set<string>>()
  for (const addition of additions) {
    const key = keyOf(addition)
    const dependencies = new Set<string>()
    for (const option of addition.model.options) {
      if (option.kind !== "foreignKey") {
        continue
      }
      const reference = option.references()
      const dependencyKey = tableKey(reference.schemaName, reference.tableName)
      if (dependencyKey !== key && additionsByKey.has(dependencyKey)) {
        dependencies.add(dependencyKey)
      }
    }
    dependenciesByKey.set(key, dependencies)
  }

  const remaining = new Map(additionsByKey)
  const ordered: typeof additions = []
  const rendered = new Set<string>()
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter((addition) => {
        const dependencies = dependenciesByKey.get(keyOf(addition)) ?? new Set<string>()
        for (const dependency of dependencies) {
          if (!rendered.has(dependency)) {
            return false
          }
        }
        return true
      })
      .sort((left, right) => left.sourceIndex - right.sourceIndex)
    if (ready.length === 0) {
      ordered.push(...[...remaining.values()].sort((left, right) => left.sourceIndex - right.sourceIndex))
      break
    }
    for (const addition of ready) {
      const key = keyOf(addition)
      rendered.add(key)
      remaining.delete(key)
      ordered.push(addition)
    }
  }
  return ordered
}

const normalizeType = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase()

const canonicalDdlType = (value: string): string => {
  return canonicalizePostgresTypeName(value)
}

const renderQueryTypeName = (
  typeName: string,
  context?: ExpressionRenderContext
): string => {
  const normalized = normalizeType(typeName)
  const { schemaName, kind } = inferTypeNameFromDdl(typeName)
  if (context !== undefined && context.enumKeys.has(enumKey(schemaName, kind))) {
    const expression = context.enumExpressionByKey?.get(enumKey(schemaName, kind))
    if (expression !== undefined) {
      return `${expression}.type()`
    }
    const qualified = schemaName === undefined || schemaName === "public"
      ? kind
      : `${schemaName}.${kind}`
    return `${PG_ALIAS}.Query.type.enum(${renderStringLiteral(qualified)})`
  }
  if (normalized.endsWith("[]")) {
    const elementType = typeName.trim().slice(0, -2)
    return `${PG_ALIAS}.Query.type.array(${renderQueryTypeName(elementType, context)})`
  }
  switch (kind) {
    case "bool":
      return `${PG_ALIAS}.Query.type.bool()`
    case "date":
      return `${PG_ALIAS}.Query.type.date()`
    case "int2":
      return `${PG_ALIAS}.Query.type.int2()`
    case "int4":
      return `${PG_ALIAS}.Query.type.int4()`
    case "int8":
      return `${PG_ALIAS}.Query.type.int8()`
    case "numeric":
      return `${PG_ALIAS}.Query.type.numeric()`
    case "float4":
      return `${PG_ALIAS}.Query.type.float4()`
    case "float8":
      return `${PG_ALIAS}.Query.type.float8()`
    case "time":
      return `${PG_ALIAS}.Query.type.time()`
    case "timetz":
      return `${PG_ALIAS}.Query.type.timetz()`
    case "timestamp":
      return `${PG_ALIAS}.Query.type.timestamp()`
    case "timestamptz":
      return `${PG_ALIAS}.Query.type.timestamptz()`
    case "uuid":
      return `${PG_ALIAS}.Query.type.uuid()`
    case "text":
      return `${PG_ALIAS}.Query.type.text()`
    case "varchar":
      return `${PG_ALIAS}.Query.type.varchar()`
    case "char":
    case "bpchar":
      return `${PG_ALIAS}.Query.type.char()`
    case "name":
      return `${PG_ALIAS}.Query.type.name()`
    case "interval":
      return `${PG_ALIAS}.Query.type.interval()`
    case "bytea":
      return `${PG_ALIAS}.Query.type.bytea()`
    case "json":
      return `${PG_ALIAS}.Query.type.json()`
    case "jsonb":
      return `${PG_ALIAS}.Query.type.jsonb()`
    case "regclass":
      return `${PG_ALIAS}.Query.type.regclass()`
    case "oid":
      return `${PG_ALIAS}.Query.type.oid()`
    case "bit":
      return `${PG_ALIAS}.Query.type.bit()`
    case "varbit":
      return `${PG_ALIAS}.Query.type.varbit()`
    case "xml":
      return `${PG_ALIAS}.Query.type.xml()`
    case "pg_lsn":
      return `${PG_ALIAS}.Query.type.pg_lsn()`
    default:
      return `${PG_ALIAS}.Query.type.custom(${renderStringLiteral(typeName)})`
  }
}

const renderCastTarget = (
  target: unknown,
  context?: ExpressionRenderContext
): string => {
  if (typeof target === "string") {
    return renderQueryTypeName(target, context)
  }
  if (target !== null && typeof target === "object") {
    const record = target as {
      readonly kind?: unknown
      readonly schema?: unknown
      readonly name?: unknown
      readonly type?: unknown
      readonly config?: unknown
      readonly arrayOf?: unknown
    }
    if (record.kind === "array" && record.arrayOf !== undefined) {
      return `${PG_ALIAS}.Query.type.array(${renderCastTarget(record.arrayOf, context)})`
    }
    if (typeof record.schema === "string" && typeof record.name === "string") {
      const qualified = `${record.schema}.${record.name}`
      if (Array.isArray(record.config) && record.config.length > 0) {
        return `${PG_ALIAS}.Query.type.custom(${renderStringLiteral(`${qualified}(${record.config.join(", ")})`)})`
      }
      return renderQueryTypeName(qualified, context)
    }
    if (typeof record.name === "string") {
      if (Array.isArray(record.config) && record.config.length > 0) {
        return `${PG_ALIAS}.Query.type.custom(${renderStringLiteral(`${record.name}(${record.config.join(", ")})`)})`
      }
      return renderQueryTypeName(record.name, context)
    }
    if (typeof record.type === "string") {
      return renderQueryTypeName(record.type, context)
    }
  }
  throw new Error(`Unsupported cast target in pulled schema: ${JSON.stringify(target)}`)
}

const renderQueryTypeExpression = (
  column: ColumnModel,
  context: RenderContext | ExpressionRenderContext
): string => {
  const normalized = normalizeType(column.ddlType)
  if (normalized.endsWith("[]")) {
    const elementType = normalized.slice(0, -2)
    const elementColumn = {
      ...column,
      ddlType: elementType,
      dbTypeKind: inferKindFromDdl(elementType),
      typeKind: undefined,
      typeSchema: undefined
    }
    return `${PG_ALIAS}.Query.type.array(${renderQueryTypeExpression(elementColumn, context)})`
  }
  if (column.typeKind === "e" || ("enumKeys" in context && context.enumKeys.has(enumKey(column.typeSchema, column.dbTypeKind)))) {
    const typeName = column.typeSchema === undefined || column.typeSchema === "public"
      ? column.dbTypeKind
      : `${column.typeSchema}.${column.dbTypeKind}`
    return `${PG_ALIAS}.Query.type.enum(${renderStringLiteral(typeName)})`
  }
  return renderQueryTypeName(normalized)
}

const renderQueryColumnReference = (
  name: string,
  context: ExpressionRenderContext
): string => {
  const column = context.columnByName.get(name)
  if (column === undefined) {
    throw new Error(`Unsupported PostgreSQL expression: unknown column reference '${name}'`)
  }
  return `${PG_ALIAS}.Query.column(${renderStringLiteral(name)}, ${renderQueryTypeExpression(column, context)}${column.nullable ? ", true" : ""})`
}

const parseQualifiedNameLiteral = (
  value: string
): {
  readonly schemaName?: string
  readonly name: string
} | undefined => {
  const trimmed = value.trim()
  const match = /^(?:(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\.)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))$/.exec(trimmed)
  if (match === null) {
    return undefined
  }
  return {
    schemaName: match[1] ?? match[2],
    name: match[3] ?? match[4]!
  }
}

const extractSequenceReference = (
  expression: PgSqlExpr,
  fallbackSchemaName?: string
): {
  readonly schemaName?: string
  readonly name: string
} | undefined => {
  switch (expression.type) {
    case "string": {
      const parsed = parseQualifiedNameLiteral(expression.value)
      return parsed === undefined
        ? undefined
        : {
            ...parsed,
            schemaName: parsed.schemaName ?? fallbackSchemaName
          }
    }
    case "cast":
      return extractSequenceReference(expression.operand, fallbackSchemaName)
    default:
      return undefined
  }
}

const renderSqlExpressionCode = (
  expression: PgSqlExpr,
  context: ExpressionRenderContext
): string => {
  const isTextCastTarget = (value: unknown): boolean => {
    if (typeof value !== "object" || value === null || !("name" in value)) {
      return false
    }
    const name = String((value as { readonly name: unknown }).name).toLowerCase()
    return name === "text" || name === "varchar" || name === "char" || name === "character varying" || name === "character" || name === "bpchar"
  }

  const extractStringLiteral = (value: PgSqlExpr): string | undefined => {
    switch (value.type) {
      case "string":
        return value.value
      case "cast":
        return isTextCastTarget(value.to) ? extractStringLiteral(value.operand) : undefined
      default:
        return undefined
    }
  }

  const extractStringArrayLiterals = (value: PgSqlExpr): readonly string[] | undefined => {
    switch (value.type) {
      case "array": {
        const values = value.expressions.map((item) => extractStringLiteral(item))
        return values.every((item): item is string => item !== undefined) ? values : undefined
      }
      case "cast":
        return extractStringArrayLiterals(value.operand)
      default:
        return undefined
    }
  }

  switch (expression.type) {
    case "ref":
      return renderQueryColumnReference(expression.name, context)
    case "string":
      return `${PG_ALIAS}.Query.literal(${renderStringLiteral(expression.value)})`
    case "integer":
      return `${PG_ALIAS}.Query.literal(${String(expression.value)})`
    case "numeric":
      return `${PG_ALIAS}.Query.literal(${String(expression.value)})`
    case "boolean":
      return `${PG_ALIAS}.Query.literal(${String(expression.value)})`
    case "null":
      return `${PG_ALIAS}.Query.literal(null)`
    case "keyword": {
      const keyword = (expression.keyword as string).toLowerCase()
      switch (keyword) {
        case "current_date":
          return `${PG_ALIAS}.Function.currentDate()`
        case "current_time":
          return `${PG_ALIAS}.Function.currentTime()`
        case "current_timestamp":
          return `${PG_ALIAS}.Function.currentTimestamp()`
        case "localtime":
          return `${PG_ALIAS}.Function.localTime()`
        case "localtimestamp":
          return `${PG_ALIAS}.Function.localTimestamp()`
        case "current_schema":
        case "current_catalog":
        case "current_role":
        case "current_user":
        case "session_user":
        case "user":
          return `${PG_ALIAS}.Function.call(${renderStringLiteral(keyword)})`
        case "distinct":
          throw new Error("Unsupported PostgreSQL keyword in pulled schema: distinct")
      }
      return `${PG_ALIAS}.Function.call(${renderStringLiteral(keyword)})`
    }
    case "cast":
      return `${PG_ALIAS}.Query.cast(${renderSqlExpressionCode(expression.operand, context)}, ${renderCastTarget(expression.to, context)})`
    case "member": {
      const base = renderSqlExpressionCode(expression.operand, context)
      const member = expression.member as string | number
      const path = typeof member === "number"
        ? `${PG_ALIAS}.Function.json.index(${member})`
        : `${PG_ALIAS}.Function.json.key(${renderStringLiteral(member)})`
      return expression.op === "->>"
        ? `${PG_ALIAS}.Function.json.text(${base}, ${path})`
        : `${PG_ALIAS}.Function.json.get(${base}, ${path})`
    }
    case "call": {
      const name = ((expression.function as { readonly name?: string }).name ?? "").toLowerCase()
      const args = Array.isArray(expression.args) ? expression.args : []
      switch (name) {
        case "lower":
          return `${PG_ALIAS}.Function.lower(${args.map((arg) => renderSqlExpressionCode(arg, context)).join(", ")})`
        case "upper":
          return `${PG_ALIAS}.Function.upper(${args.map((arg) => renderSqlExpressionCode(arg, context)).join(", ")})`
        case "coalesce":
          return `${PG_ALIAS}.Function.coalesce(${args.map((arg) => renderSqlExpressionCode(arg, context)).join(", ")})`
        case "now":
          return `${PG_ALIAS}.Function.now()`
        case "current_timestamp":
          return `${PG_ALIAS}.Function.currentTimestamp()`
        case "current_date":
          return `${PG_ALIAS}.Function.currentDate()`
        case "current_time":
          return `${PG_ALIAS}.Function.currentTime()`
        case "localtime":
          return `${PG_ALIAS}.Function.localTime()`
        case "localtimestamp":
          return `${PG_ALIAS}.Function.localTimestamp()`
        case "uuid_generate_v4":
        case "gen_random_uuid":
          return `${PG_ALIAS}.Function.uuidGenerateV4()`
        case "nextval": {
          const sequenceReference = args.length === 1
            ? extractSequenceReference(args[0]!, context.currentSchemaName)
            : undefined
          if (sequenceReference !== undefined) {
            const expression = context.sequenceExpressionByKey?.get(schemaObjectKey(sequenceReference.schemaName, sequenceReference.name))
            if (expression !== undefined) {
              return `${PG_ALIAS}.Function.nextVal(${expression})`
            }
          }
          return `${PG_ALIAS}.Function.nextVal(${args.map((arg) => renderSqlExpressionCode(arg, context)).join(", ")})`
        }
        case "jsonb_build_object": {
          if (args.length % 2 !== 0) {
            throw new Error("Unsupported PostgreSQL expression: jsonb_build_object requires key/value pairs")
          }
          const entries: string[] = []
          for (let index = 0; index < args.length; index += 2) {
            const key = args[index]
            const value = args[index + 1]
            if (key === undefined || value === undefined || key.type !== "string") {
              throw new Error("Unsupported PostgreSQL expression: jsonb_build_object requires literal string keys")
            }
            entries.push(`${renderStringLiteral(key.value)}: ${renderSqlExpressionCode(value, context)}`)
          }
          return `${PG_ALIAS}.Function.json.buildObject({ ${entries.join(", ")} })`
        }
        case "jsonb_build_array":
          return `${PG_ALIAS}.Function.json.buildArray(${args.map((arg) => renderSqlExpressionCode(arg, context)).join(", ")})`
        case "to_json":
          return `${PG_ALIAS}.Function.json.toJson(${args.map((arg) => renderSqlExpressionCode(arg, context)).join(", ")})`
        case "to_jsonb":
          return `${PG_ALIAS}.Function.json.toJsonb(${args.map((arg) => renderSqlExpressionCode(arg, context)).join(", ")})`
        case "jsonb_strip_nulls":
          return `${PG_ALIAS}.Function.json.stripNulls(${args.map((arg) => renderSqlExpressionCode(arg, context)).join(", ")})`
        case "jsonb_typeof":
          return `${PG_ALIAS}.Function.json.typeOf(${args.map((arg) => renderSqlExpressionCode(arg, context)).join(", ")})`
      }
      return `${PG_ALIAS}.Function.call(${renderStringLiteral(name)}${args.length === 0 ? "" : `, ${args.map((arg) => renderSqlExpressionCode(arg, context)).join(", ")}`})`
    }
    case "binary": {
      const op = expression.op as string
      if (op === "=" && expression.right.type === "call" && ((expression.right.function as { readonly name?: string }).name ?? "").toLowerCase() === "any") {
        const anyArgs = Array.isArray(expression.right.args) ? expression.right.args : []
        if (anyArgs.length === 1 && anyArgs[0]?.type === "array") {
          const arrayValues = anyArgs[0].expressions.map((item: PgSqlExpr) => renderSqlExpressionCode(item, context))
          return `${PG_ALIAS}.Query.in(${renderSqlExpressionCode(expression.left, context)}, ${arrayValues.join(", ")})`
        }
      }
      const left = renderSqlExpressionCode(expression.left, context)
      const right = renderSqlExpressionCode(expression.right, context)
      switch (op) {
        case "=":
          return `${PG_ALIAS}.Query.eq(${left}, ${right})`
        case "!=":
        case "<>":
          return `${PG_ALIAS}.Query.neq(${left}, ${right})`
        case "<":
          return `${PG_ALIAS}.Query.lt(${left}, ${right})`
        case "<=":
          return `${PG_ALIAS}.Query.lte(${left}, ${right})`
        case ">":
          return `${PG_ALIAS}.Query.gt(${left}, ${right})`
        case ">=":
          return `${PG_ALIAS}.Query.gte(${left}, ${right})`
        case "AND":
        case "and":
          return `${PG_ALIAS}.Query.and(${left}, ${right})`
        case "OR":
        case "or":
          return `${PG_ALIAS}.Query.or(${left}, ${right})`
        case "LIKE":
        case "like":
          return `${PG_ALIAS}.Query.like(${left}, ${right})`
        case "ILIKE":
        case "ilike":
          return `${PG_ALIAS}.Query.ilike(${left}, ${right})`
        case "~":
          return `${PG_ALIAS}.Query.regexMatch(${left}, ${right})`
        case "~*":
          return `${PG_ALIAS}.Query.regexIMatch(${left}, ${right})`
        case "!~":
          return `${PG_ALIAS}.Query.regexNotMatch(${left}, ${right})`
        case "!~*":
          return `${PG_ALIAS}.Query.regexNotIMatch(${left}, ${right})`
        case "?": {
          const key = extractStringLiteral(expression.right)
          if (key === undefined) {
            throw new Error("Unsupported PostgreSQL expression: jsonb key predicate requires a literal string key")
          }
          return `${PG_ALIAS}.Function.jsonb.hasKey(${left}, ${renderStringLiteral(key)})`
        }
        case "?|": {
          const keys = extractStringArrayLiterals(expression.right)
          if (keys === undefined || keys.length === 0) {
            throw new Error("Unsupported PostgreSQL expression: jsonb any-key predicate requires a literal text array")
          }
          return `${PG_ALIAS}.Function.jsonb.hasAnyKeys(${left}, ${keys.map((key) => renderStringLiteral(key)).join(", ")})`
        }
        case "?&": {
          const keys = extractStringArrayLiterals(expression.right)
          if (keys === undefined || keys.length === 0) {
            throw new Error("Unsupported PostgreSQL expression: jsonb all-keys predicate requires a literal text array")
          }
          return `${PG_ALIAS}.Function.jsonb.hasAllKeys(${left}, ${keys.map((key) => renderStringLiteral(key)).join(", ")})`
        }
        case "@?":
          return `${PG_ALIAS}.Function.jsonb.pathExists(${left}, ${right})`
        case "@@":
          return `${PG_ALIAS}.Function.jsonb.pathMatch(${left}, ${right})`
        case "IS DISTINCT FROM":
          return `${PG_ALIAS}.Query.isDistinctFrom(${left}, ${right})`
        case "IS NOT DISTINCT FROM":
          return `${PG_ALIAS}.Query.isNotDistinctFrom(${left}, ${right})`
        case "@>":
          return `${PG_ALIAS}.Query.contains(${left}, ${right})`
        case "<@":
          return `${PG_ALIAS}.Query.containedBy(${left}, ${right})`
        case "&&":
          return `${PG_ALIAS}.Query.overlaps(${left}, ${right})`
      }
      throw new Error(`Unsupported PostgreSQL binary operator in pulled schema: ${expression.op}`)
    }
    case "unary": {
      const operand = renderSqlExpressionCode(expression.operand, context)
      switch (expression.op.toUpperCase()) {
        case "IS NULL":
          return `${PG_ALIAS}.Query.isNull(${operand})`
        case "IS NOT NULL":
          return `${PG_ALIAS}.Query.isNotNull(${operand})`
        case "IS TRUE":
          return `${PG_ALIAS}.Query.and(${PG_ALIAS}.Query.isNotNull(${operand}), ${PG_ALIAS}.Query.eq(${operand}, ${PG_ALIAS}.Query.literal(true)))`
        case "IS FALSE":
          return `${PG_ALIAS}.Query.and(${PG_ALIAS}.Query.isNotNull(${operand}), ${PG_ALIAS}.Query.eq(${operand}, ${PG_ALIAS}.Query.literal(false)))`
        case "IS NOT TRUE":
          return `${PG_ALIAS}.Query.or(${PG_ALIAS}.Query.isNull(${operand}), ${PG_ALIAS}.Query.eq(${operand}, ${PG_ALIAS}.Query.literal(false)))`
        case "IS NOT FALSE":
          return `${PG_ALIAS}.Query.or(${PG_ALIAS}.Query.isNull(${operand}), ${PG_ALIAS}.Query.eq(${operand}, ${PG_ALIAS}.Query.literal(true)))`
        case "IS UNKNOWN":
          return `${PG_ALIAS}.Query.isNull(${operand})`
        case "IS NOT UNKNOWN":
          return `${PG_ALIAS}.Query.isNotNull(${operand})`
        case "NOT":
          return `${PG_ALIAS}.Query.not(${operand})`
      }
      throw new Error(`Unsupported PostgreSQL unary operator in pulled schema: ${expression.op}`)
    }
    case "array":
      {
        const values = Array.isArray(expression.expressions) ? expression.expressions : []
        return values.length === 0
          ? `${PG_ALIAS}.Function.call("array")`
          : `${PG_ALIAS}.Function.call("array", ${values.map((item: PgSqlExpr) => renderSqlExpressionCode(item, context)).join(", ")})`
      }
    case "case": {
      const whens = Array.isArray(expression.whens) ? expression.whens : []
      if (whens.length === 0) {
        throw new Error("Unsupported PostgreSQL case expression in pulled schema")
      }
      const base = expression.value === null
        ? `${PG_ALIAS}.Query.case()`
        : expression.value === undefined
          ? `${PG_ALIAS}.Query.case()`
          : `${PG_ALIAS}.Query.match(${renderSqlExpressionCode(expression.value, context)})`
      const chained = whens.reduce(
        (acc, branch) => `${acc}.when(${renderSqlExpressionCode(branch.when, context)}, ${renderSqlExpressionCode(branch.value, context)})`,
        base
      )
      return expression.else == null
        ? `${chained}.else(${PG_ALIAS}.Query.literal(null))`
        : `${chained}.else(${renderSqlExpressionCode(expression.else, context)})`
    }
    case "extract":
      return `${PG_ALIAS}.Function.call("extract", ${renderStringLiteral((expression.field as { readonly name: string }).name)}, ${renderSqlExpressionCode(expression.from, context)})`
    default:
      throw new Error(`Unsupported PostgreSQL expression in pulled schema: ${expression.type}`)
  }
}

const renderDdlExpressionCode = (
  sql: string,
  context: ExpressionRenderContext
): string =>
  renderSqlExpressionCode(parse(sql, "expr") as PgSqlExpr, context)

const columnShapeSignature = (column: ColumnModel): string =>
  JSON.stringify({
    ddlType: canonicalDdlType(column.ddlType),
    dbTypeKind: canonicalDdlType(column.dbTypeKind),
    typeSchema: column.typeSchema ?? null,
    typeKind: column.typeKind ?? null,
    nullable: column.nullable,
    hasDefault: column.hasDefault,
    generated: column.generated,
    defaultSql: column.defaultSql ?? null,
    generatedSql: column.generatedSql ?? null,
    identity: column.identity ?? null
  })

const constraintShapeSignature = (option: Exclude<TableOptionSpec, { readonly kind: "index" }>): string => {
  switch (option.kind) {
    case "primaryKey":
      return JSON.stringify({
        kind: option.kind,
        columns: option.columns,
        deferrable: option.deferrable ?? false,
        initiallyDeferred: option.initiallyDeferred ?? false
      })
    case "unique":
      return JSON.stringify({
        kind: option.kind,
        columns: option.columns,
        nullsNotDistinct: option.nullsNotDistinct ?? false,
        deferrable: option.deferrable ?? false,
        initiallyDeferred: option.initiallyDeferred ?? false
      })
    case "foreignKey": {
      const reference = option.references()
      return JSON.stringify({
        kind: option.kind,
        columns: option.columns,
        referencedSchemaName: reference.schemaName ?? "public",
        referencedTableName: reference.tableName,
        referencedColumns: reference.columns,
        onUpdate: option.onUpdate ?? null,
        onDelete: option.onDelete ?? null,
        deferrable: option.deferrable ?? false,
        initiallyDeferred: option.initiallyDeferred ?? false
      })
    }
    case "check":
      return JSON.stringify({
        kind: option.kind,
        predicate: normalizeDdlExpressionSql(option.predicate),
        noInherit: option.noInherit ?? false
      })
  }
}

const indexShapeSignature = (option: Extract<TableOptionSpec, { readonly kind: "index" }>): string => {
  const keys: readonly IndexKeySpec[] = option.keys ?? (option.columns ?? []).map((column) => ({
    kind: "column" as const,
    column
  }))
  return JSON.stringify({
    kind: option.kind,
    unique: option.unique ?? false,
    method: option.method ?? null,
    include: option.include ?? [],
    predicate: option.predicate ? normalizeDdlExpressionSql(option.predicate) : null,
    keys: keys.map((key) => key.kind === "column"
      ? {
          kind: key.kind,
          column: key.column,
          order: key.order ?? null,
          nulls: key.nulls ?? null
        }
      : {
          kind: key.kind,
          expression: normalizeDdlExpressionSql(key.expression),
          order: key.order ?? null,
          nulls: key.nulls ?? null
        })
  })
}

const tableShapeSignature = (table: TableModel): string =>
  JSON.stringify({
    schemaName: table.schemaName ?? "public",
    columns: table.columns.map((column) => columnShapeSignature(column)),
    options: table.options.map((option) =>
      option.kind === "index"
        ? indexShapeSignature(option)
        : constraintShapeSignature(option))
      .sort()
  })

const enumShapeSignature = (enumType: EnumModel): string =>
  JSON.stringify({
    schemaName: enumType.schemaName ?? "public",
    values: enumType.values
  })

const schemaNameOfTable = (table: TableModel): string =>
  table.schemaName ?? "public"

const schemaNameOfEnum = (enumType: EnumModel): string =>
  enumType.schemaName ?? "public"

const stripOuterQuotes = (value: string): string =>
  value.startsWith("\"") && value.endsWith("\"")
    ? value.slice(1, -1).replaceAll("\"\"", "\"")
    : value

const inferKindFromDdl = (ddlType: string): string => {
  return inferPostgresTypeKind(ddlType)
}

const inferSchemaNameFromDdl = (ddlType: string): string | undefined => {
  const withoutParams = ddlType.trim().replace(/\(.+\)$/, "").replace(/\[\]$/, "")
  const match = /^(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\.(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))$/.exec(withoutParams)
  if (match === null) {
    return undefined
  }
  return match[1] ?? match[2]
}

const inferTypeNameFromDdl = (ddlType: string): {
  readonly schemaName?: string
  readonly kind: string
} => {
  const normalized = ddlType.trim().replace(/\s+/g, " ").toLowerCase()
  const withoutArray = normalized.replace(/\[\]$/, "")
  const withoutParams = withoutArray.replace(/\(.+\)$/, "")
  const match = /^(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\.(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))$/.exec(withoutParams)
  if (match === null) {
    return {
      schemaName: undefined,
      kind: inferKindFromDdl(ddlType)
    }
  }
  return {
    schemaName: match[1] ?? match[2],
    kind: match[3] ?? match[4]!
  }
}

const runtimeTagOfColumn = (column: ColumnModel): string | undefined => {
  if (normalizeType(column.ddlType).endsWith("[]")) {
    return "array"
  }
  if (column.typeKind === "e") {
    return "string"
  }
  return Datatypes.postgresDatatypeKinds[column.dbTypeKind as keyof typeof Datatypes.postgresDatatypeKinds]?.runtime
}

const schemaExpressionForRuntimeTag = (runtimeTag: string | undefined): string => {
  switch (runtimeTag) {
    case "string":
    case "bigintString":
    case "localDate":
    case "localTime":
    case "offsetTime":
    case "localDateTime":
    case "instant":
    case "decimalString":
    case "year":
      return `${SCHEMA_ALIAS}.String`
    case "number":
      return `${SCHEMA_ALIAS}.Number`
    case "boolean":
      return `${SCHEMA_ALIAS}.Boolean`
    default:
      return `${SCHEMA_ALIAS}.Unknown`
  }
}

const makeDerivedColumn = (
  column: ColumnModel,
  context: RenderContext,
  ddlType: string
): ColumnModel => {
  const schemaName = inferSchemaNameFromDdl(ddlType) ?? column.typeSchema
  const dbTypeKind = inferKindFromDdl(ddlType)
  return {
    ...column,
    ddlType,
    dbTypeKind,
    typeSchema: schemaName,
    typeKind: context.enumKeys.has(enumKey(schemaName, dbTypeKind)) ? "e" : undefined
  }
}

const renderDbTypeDescriptor = (
  column: ColumnModel,
  context: RenderContext
): string => {
  const normalizedDdl = normalizeType(column.ddlType)
  if (normalizedDdl.endsWith("[]")) {
    const elementDdl = column.ddlType.trim().slice(0, -2)
    return `{
  dialect: "postgres",
  kind: ${renderStringLiteral(normalizedDdl)},
  element: ${renderDbTypeDescriptor(makeDerivedColumn(column, context, elementDdl), context)}
}`
  }
  if (column.typeKind === "e" || context.enumKeys.has(enumKey(column.typeSchema, column.dbTypeKind))) {
    return `{
  dialect: "postgres",
  kind: ${renderStringLiteral(column.dbTypeKind)},
  variant: "enum"
}`
  }
  return `{
  dialect: "postgres",
  kind: ${renderStringLiteral(column.dbTypeKind)}
}`
}

const renderColumnBase = (
  column: ColumnModel,
  context: RenderContext
): {
  readonly code: string
  readonly defaultDdlType?: string
  readonly arrayDepth?: number
} => {
  const normalizeArrayType = (value: string): {
    readonly baseType: string
    readonly arrayDepth: number
  } => {
    let current = normalizeType(value)
    let arrayDepth = 0
    while (current.endsWith("[]")) {
      current = current.slice(0, -2)
      arrayDepth += 1
    }
    return { baseType: current, arrayDepth }
  }
  const effectiveDdlType = column.ddlType ?? column.dbTypeKind
  const { baseType, arrayDepth } = normalizeArrayType(effectiveDdlType)
  if (arrayDepth > 0) {
    const typeName = inferTypeNameFromDdl(baseType)
    const baseColumn = {
      ...column,
      ddlType: baseType,
      dbTypeKind: typeName.kind,
      typeSchema: typeName.schemaName ?? column.typeSchema,
      typeKind: context.enumKeys.has(enumKey(typeName.schemaName ?? column.typeSchema, typeName.kind))
        ? "e"
        : column.typeKind
    }
    const base = renderColumnBase(baseColumn, context)
    return {
      code: base.code,
      defaultDdlType: base.defaultDdlType === undefined
        ? `${baseType}${"[]".repeat(arrayDepth)}`
        : `${base.defaultDdlType}${"[]".repeat(arrayDepth)}`,
      arrayDepth
    }
  }
  const sizedTextLength = (
    kind: "char" | "varchar"
  ): number | undefined => {
    const match = new RegExp(`^${kind}\\((\\d+)\\)$`).exec(baseType)
    if (match !== null) {
      return Number(match[1])
    }
    if (kind === "char" && (baseType === "char" || baseType === "character" || baseType === "bpchar")) {
      return 1
    }
    return undefined
  }
  const numericConfig = (): {
    readonly precision: number
    readonly scale?: number
  } | undefined => {
    const match = /^numeric\((\d+)(?:,\s*(\d+))?\)$/.exec(baseType)
    if (match === null) {
      return undefined
    }
    return {
      precision: Number(match[1]),
      scale: match[2] === undefined ? undefined : Number(match[2])
    }
  }
  if (baseType === "jsonb" || normalizeType(column.dbTypeKind) === "jsonb") {
    return {
      code: `${COLUMN_ALIAS}.jsonb(${SCHEMA_ALIAS}.Unknown)`,
      defaultDdlType: "jsonb"
    }
  }
  if (column.typeKind === "e") {
    const expression = context.enumExpressionByKey?.get(enumKey(column.typeSchema, column.dbTypeKind))
    const qualified = column.typeSchema === undefined || column.typeSchema === "public"
      ? column.dbTypeKind
      : `${column.typeSchema}.${column.dbTypeKind}`
    return {
      code: expression === undefined
        ? `${COLUMN_ALIAS}.custom(${SCHEMA_ALIAS}.String, ${renderDbTypeDescriptor(column, context)})`
        : `${expression}.column()`,
      defaultDdlType: qualified
    }
  }
  switch (column.dbTypeKind) {
    case "uuid":
      return { code: `${COLUMN_ALIAS}.uuid()`, defaultDdlType: "uuid" }
    case "text":
      return { code: `${COLUMN_ALIAS}.text()`, defaultDdlType: "text" }
    case "varchar":
      {
        const length = sizedTextLength("varchar")
        return length === undefined
          ? { code: `${COLUMN_ALIAS}.varchar()`, defaultDdlType: "varchar" }
          : { code: `${COLUMN_ALIAS}.varchar(${length})`, defaultDdlType: `varchar(${length})` }
      }
    case "char":
      {
        const length = sizedTextLength("char") ?? 1
        return { code: `${COLUMN_ALIAS}.char(${length})`, defaultDdlType: `char(${length})` }
      }
    case "int2":
      return { code: `${COLUMN_ALIAS}.int2()`, defaultDdlType: "int2" }
    case "int4":
      return { code: `${COLUMN_ALIAS}.int()`, defaultDdlType: "int4" }
    case "int8":
      return { code: `${COLUMN_ALIAS}.int8()`, defaultDdlType: "int8" }
    case "numeric":
      {
        const config = numericConfig()
        return config === undefined
          ? { code: `${COLUMN_ALIAS}.number()`, defaultDdlType: "numeric" }
          : {
            code: config.scale === undefined
              ? `${COLUMN_ALIAS}.number({ precision: ${config.precision} })`
              : `${COLUMN_ALIAS}.number({ precision: ${config.precision}, scale: ${config.scale} })`,
            defaultDdlType: config.scale === undefined
              ? `numeric(${config.precision})`
              : `numeric(${config.precision},${config.scale})`
          }
      }
    case "float4":
      return { code: `${COLUMN_ALIAS}.float4()`, defaultDdlType: "float4" }
    case "float8":
      return { code: `${COLUMN_ALIAS}.float8()`, defaultDdlType: "float8" }
    case "bool":
      return { code: `${COLUMN_ALIAS}.boolean()`, defaultDdlType: "bool" }
    case "date":
      return { code: `${COLUMN_ALIAS}.date()`, defaultDdlType: "date" }
    case "time":
      return { code: `${COLUMN_ALIAS}.time()`, defaultDdlType: "time" }
    case "timetz":
      return { code: `${COLUMN_ALIAS}.timetz()`, defaultDdlType: "timetz" }
    case "timestamp":
      return { code: `${COLUMN_ALIAS}.timestamp()`, defaultDdlType: "timestamp" }
    case "timestamptz":
      return { code: `${COLUMN_ALIAS}.timestamptz()`, defaultDdlType: "timestamptz" }
    case "interval":
      return { code: `${COLUMN_ALIAS}.interval()`, defaultDdlType: "interval" }
    case "bytea":
      return { code: `${COLUMN_ALIAS}.bytea()`, defaultDdlType: "bytea" }
    case "json":
      return { code: `${COLUMN_ALIAS}.json(${SCHEMA_ALIAS}.Unknown)`, defaultDdlType: "json" }
    case "name":
      return { code: `${COLUMN_ALIAS}.name()`, defaultDdlType: "name" }
    case "oid":
      return { code: `${COLUMN_ALIAS}.oid()`, defaultDdlType: "oid" }
    case "regclass":
      return { code: `${COLUMN_ALIAS}.regclass()`, defaultDdlType: "regclass" }
    case "bit":
      return { code: `${COLUMN_ALIAS}.bit()`, defaultDdlType: "bit" }
    case "varbit":
      return { code: `${COLUMN_ALIAS}.varbit()`, defaultDdlType: "varbit" }
    case "xml":
      return { code: `${COLUMN_ALIAS}.xml()`, defaultDdlType: "xml" }
    case "pg_lsn":
      return { code: `${COLUMN_ALIAS}.pg_lsn()`, defaultDdlType: "pg_lsn" }
    default:
      return {
        code: `${COLUMN_ALIAS}.custom(${schemaExpressionForRuntimeTag(runtimeTagOfColumn(column))}, ${renderDbTypeDescriptor(column, context)})`
      }
  }
}

const renderExpressionContext = (
  table: TableModel,
  context: RenderContext
): ExpressionRenderContext => ({
  columnByName: new Map(table.columns.map((column) => [column.name, column])),
  enumKeys: context.enumKeys,
  enumExpressionByKey: context.enumExpressionByKey,
  sequenceExpressionByKey: context.sequenceExpressionByKey,
  currentSchemaName: table.schemaName
})

const renderColumnDefinition = (
  table: TableModel,
  column: ColumnModel,
  context: RenderContext,
  inlinePrimaryKey: boolean
): string => {
  const base = renderColumnBase(column, context)
  const expressionContext = renderExpressionContext(table, context)
  const pipes: string[] = base.arrayDepth === undefined
    ? []
    : Array.from({ length: base.arrayDepth }, () => `${COLUMN_ALIAS}.array()`)
  if (base.defaultDdlType === undefined || canonicalDdlType(column.ddlType) !== canonicalDdlType(base.defaultDdlType)) {
    pipes.push(`${COLUMN_ALIAS}.ddlType(${renderStringLiteral(column.ddlType)})`)
  }
  if (column.nullable) {
    pipes.push(`${COLUMN_ALIAS}.nullable`)
  }
  pipes.push(
    ...table.options
      .map((option) => renderInlineColumnOption(table, column.name, option, context))
      .filter((value): value is string => value !== undefined)
  )
  if (inlinePrimaryKey) {
    pipes.push(`${COLUMN_ALIAS}.primaryKey`)
  }
  if (column.identity) {
    pipes.push(column.identity.generation === "always"
      ? `${COLUMN_ALIAS}.identityAlways`
      : `${COLUMN_ALIAS}.identityByDefault`)
  } else if (column.generatedSql) {
    pipes.push(`${COLUMN_ALIAS}.generated(${renderDdlExpressionCode(column.generatedSql, expressionContext)})`)
  } else if (column.defaultSql) {
    pipes.push(`${COLUMN_ALIAS}.default(${renderDdlExpressionCode(column.defaultSql, expressionContext)})`)
  }
  return renderPipeChain(base.code, pipes)
}

const renderIndexKey = (
  key: IndexKeySpec,
  table: TableModel,
  context: RenderContext
): string =>
  key.kind === "column"
    ? `{ column: ${renderStringLiteral(key.column)}${key.order ? `, order: ${renderStringLiteral(key.order)}` : ""}${key.nulls ? `, nulls: ${renderStringLiteral(key.nulls)}` : ""} }`
    : `{ expression: ${renderDdlExpressionCode(renderDdlExpressionSql(key.expression), renderExpressionContext(table, context))}${key.order ? `, order: ${renderStringLiteral(key.order)}` : ""}${key.nulls ? `, nulls: ${renderStringLiteral(key.nulls)}` : ""} }`

const renderIndexOption = (
  table: TableModel,
  option: Extract<TableOptionSpec, { readonly kind: "index" }>,
  context: RenderContext
): string => {
  const simple =
    option.name === undefined &&
    option.unique === undefined &&
    option.method === undefined &&
    option.include === undefined &&
    option.predicate === undefined &&
    option.keys === undefined &&
    option.columns !== undefined
  if (simple) {
    return `${TABLE_ALIAS}.index(${renderStringTuple(option.columns)})`
  }
  const parts: string[] = []
  if (option.columns) {
    parts.push(`columns: ${renderStringTuple(option.columns)}`)
  }
  if (option.keys) {
    parts.push(`keys: [${option.keys.map((key) => renderIndexKey(key, table, context)).join(", ")}]`)
  }
  if (option.name) {
    parts.push(`name: ${renderStringLiteral(option.name)}`)
  }
  if (option.unique !== undefined) {
    parts.push(`unique: ${String(option.unique)}`)
  }
  if (option.method) {
    parts.push(`method: ${renderStringLiteral(option.method)}`)
  }
  if (option.include && option.include.length > 0) {
    parts.push(`include: [${option.include.map(renderStringLiteral).join(", ")}]`)
  }
  if (option.predicate) {
    parts.push(`predicate: ${renderDdlExpressionCode(renderDdlExpressionSql(option.predicate), renderExpressionContext(table, context))}`)
  }
  return `${TABLE_ALIAS}.index({ ${parts.join(", ")} })`
}

const renderColumnAccess = (
  identifier: string,
  columnName: string
): string =>
  isIdentifier(columnName)
    ? `${identifier}.${columnName}`
    : `${identifier}[${renderStringLiteral(columnName)}]`

const inlineForeignKeyColumn = (
  option: Extract<TableOptionSpec, { readonly kind: "foreignKey" }>
): string | undefined => {
  if (option.columns.length !== 1) {
    return undefined
  }
  const reference = option.references()
  return reference.columns.length === 1
    ? option.columns[0]
    : undefined
}

const inlineIndexColumn = (
  option: Extract<TableOptionSpec, { readonly kind: "index" }>
): {
  readonly column: string
  readonly order?: "asc" | "desc"
  readonly nulls?: "first" | "last"
} | undefined => {
  const keys = option.keys ?? (option.columns ?? []).map((column) => ({
    kind: "column" as const,
    column,
    order: undefined as "asc" | "desc" | undefined,
    nulls: undefined as "first" | "last" | undefined
  }))
  if (keys.length !== 1) {
    return undefined
  }
  const key = keys[0]!
  return key.kind === "column"
    ? {
        column: key.column,
        order: key.order,
        nulls: key.nulls
      }
    : undefined
}

const renderInlineColumnOption = (
  table: TableModel,
  columnName: string,
  option: TableOptionSpec,
  context: RenderContext
): string | undefined => {
  switch (option.kind) {
    case "unique": {
      if (option.columns.length !== 1 || option.columns[0] !== columnName) {
        return undefined
      }
      return option.name === undefined &&
        option.nullsNotDistinct === undefined &&
        option.deferrable === undefined &&
        option.initiallyDeferred === undefined
        ? `${COLUMN_ALIAS}.unique`
        : undefined
    }
    case "foreignKey": {
      const inlineColumn = inlineForeignKeyColumn(option)
      if (inlineColumn === undefined || inlineColumn !== columnName) {
        return undefined
      }
      const reference = option.references()
      const targetKey = tableKey(reference.schemaName, reference.tableName)
      const target = context.bindingByKey.get(targetKey)
      if (target === undefined || target.kind !== "table") {
        throw new Error(`Cannot render foreign key from ${tableKey(table.schemaName, table.name)} to missing source table '${targetKey}'`)
      }
      const targetColumn = reference.columns[0]!
      const targetExpression = `() => ${renderColumnAccess(target.declaration.identifier, targetColumn)}`
      const simple =
        option.name === undefined &&
        option.onUpdate === undefined &&
        option.onDelete === undefined &&
        option.deferrable === undefined &&
        option.initiallyDeferred === undefined
      if (simple) {
        return `${COLUMN_ALIAS}.foreignKey(${targetExpression})`
      }
      const parts: string[] = [`target: ${targetExpression}`]
      if (option.name !== undefined) {
        parts.push(`name: ${renderStringLiteral(option.name)}`)
      }
      if (option.onUpdate !== undefined) {
        parts.push(`onUpdate: ${renderStringLiteral(option.onUpdate)}`)
      }
      if (option.onDelete !== undefined) {
        parts.push(`onDelete: ${renderStringLiteral(option.onDelete)}`)
      }
      if (option.deferrable !== undefined) {
        parts.push(`deferrable: ${String(option.deferrable)}`)
      }
      if (option.initiallyDeferred !== undefined) {
        parts.push(`initiallyDeferred: ${String(option.initiallyDeferred)}`)
      }
      return `${COLUMN_ALIAS}.foreignKey({ ${parts.join(", ")} })`
    }
    case "index": {
      if (option.unique === true) {
        return undefined
      }
      const inlineColumn = inlineIndexColumn(option)
      if (inlineColumn === undefined || inlineColumn.column !== columnName) {
        return undefined
      }
      const simple =
        option.name === undefined &&
        option.method === undefined &&
        (option.include === undefined || option.include.length === 0) &&
        option.predicate === undefined &&
        inlineColumn.order === undefined &&
        inlineColumn.nulls === undefined
      if (simple) {
        return `${COLUMN_ALIAS}.index`
      }
      const parts: string[] = []
      if (option.name !== undefined) {
        parts.push(`name: ${renderStringLiteral(option.name)}`)
      }
      if (option.method !== undefined) {
        parts.push(`method: ${renderStringLiteral(option.method)}`)
      }
      if (option.include !== undefined && option.include.length > 0) {
        parts.push(`include: [${option.include.map(renderStringLiteral).join(", ")}]`)
      }
      if (option.predicate !== undefined) {
        parts.push(`predicate: ${renderDdlExpressionCode(renderDdlExpressionSql(option.predicate), renderExpressionContext(table, context))}`)
      }
      if (inlineColumn.order !== undefined) {
        parts.push(`order: ${renderStringLiteral(inlineColumn.order)}`)
      }
      if (inlineColumn.nulls !== undefined) {
        parts.push(`nulls: ${renderStringLiteral(inlineColumn.nulls)}`)
      }
      return `${COLUMN_ALIAS}.index({ ${parts.join(", ")} })`
    }
    default:
      return undefined
  }
}

const isInlineColumnOption = (option: TableOptionSpec): boolean => {
  switch (option.kind) {
    case "unique":
      return option.columns.length === 1 &&
        option.name === undefined &&
        option.nullsNotDistinct === undefined &&
        option.deferrable === undefined &&
        option.initiallyDeferred === undefined
    case "foreignKey":
      return option.columns.length === 1 && option.references().columns.length === 1
    case "index":
      return option.unique !== true && inlineIndexColumn(option) !== undefined
    default:
      return false
  }
}

const renderTableOption = (
  table: TableModel,
  option: TableOptionSpec,
  context: RenderContext
): string => {
  switch (option.kind) {
    case "primaryKey": {
      const simple =
        option.name === undefined &&
        option.deferrable === undefined &&
        option.initiallyDeferred === undefined
      return simple
        ? `${TABLE_ALIAS}.primaryKey(${renderStringTuple(option.columns)})`
        : `${TABLE_ALIAS}.primaryKey({ columns: ${renderStringTuple(option.columns)}${option.name ? `, name: ${renderStringLiteral(option.name)}` : ""}${option.deferrable !== undefined ? `, deferrable: ${String(option.deferrable)}` : ""}${option.initiallyDeferred !== undefined ? `, initiallyDeferred: ${String(option.initiallyDeferred)}` : ""} })`
    }
    case "unique": {
      const simple =
        option.name === undefined &&
        option.nullsNotDistinct === undefined &&
        option.deferrable === undefined &&
        option.initiallyDeferred === undefined
      return simple
        ? `${TABLE_ALIAS}.unique(${renderStringTuple(option.columns)})`
        : `${TABLE_ALIAS}.unique({ columns: ${renderStringTuple(option.columns)}${option.name ? `, name: ${renderStringLiteral(option.name)}` : ""}${option.nullsNotDistinct !== undefined ? `, nullsNotDistinct: ${String(option.nullsNotDistinct)}` : ""}${option.deferrable !== undefined ? `, deferrable: ${String(option.deferrable)}` : ""}${option.initiallyDeferred !== undefined ? `, initiallyDeferred: ${String(option.initiallyDeferred)}` : ""} })`
    }
    case "index":
      return renderIndexOption(table, option, context)
    case "foreignKey": {
      const reference = option.references()
      const targetKey = tableKey(reference.schemaName, reference.tableName)
      const target = context.bindingByKey.get(targetKey)
      if (target === undefined || target.kind !== "table") {
        throw new Error(`Cannot render foreign key from ${tableKey(table.schemaName, table.name)} to missing source table '${targetKey}'`)
      }
      return `${TABLE_ALIAS}.foreignKey({ columns: ${renderStringTuple(option.columns)}, target: () => ${target.declaration.identifier}, referencedColumns: ${renderStringTuple(reference.columns)}${option.name ? `, name: ${renderStringLiteral(option.name)}` : ""}${option.onUpdate ? `, onUpdate: ${renderStringLiteral(option.onUpdate)}` : ""}${option.onDelete ? `, onDelete: ${renderStringLiteral(option.onDelete)}` : ""}${option.deferrable !== undefined ? `, deferrable: ${String(option.deferrable)}` : ""}${option.initiallyDeferred !== undefined ? `, initiallyDeferred: ${String(option.initiallyDeferred)}` : ""} })`
    }
    case "check":
      return option.noInherit
        ? `${TABLE_ALIAS}.check({ name: ${renderStringLiteral(option.name)}, predicate: ${renderDdlExpressionCode(renderDdlExpressionSql(option.predicate), renderExpressionContext(table, context))}, noInherit: true })`
        : `${TABLE_ALIAS}.check(${renderStringLiteral(option.name)}, ${renderDdlExpressionCode(renderDdlExpressionSql(option.predicate), renderExpressionContext(table, context))})`
  }
}

const inlinePrimaryKeyColumn = (
  declaration: SourceDeclaration,
  table: TableModel
): string | undefined => {
  if (declaration.kind !== "tableClass") {
    return undefined
  }
  const primaryKeys = table.options.filter((option): option is Extract<TableOptionSpec, { readonly kind: "primaryKey" }> => option.kind === "primaryKey")
  if (primaryKeys.length === 0) {
    return undefined
  }
  if (primaryKeys.length > 1) {
    throw new Error(`Class table '${tableKey(table.schemaName, table.name)}' has multiple primary-key declarations`)
  }
  const primaryKey = primaryKeys[0]!
  const defaultName = defaultConstraintName(table, primaryKey)
  if (
    primaryKey.columns.length !== 1 ||
    (primaryKey.name !== undefined && primaryKey.name !== defaultName) ||
    primaryKey.deferrable ||
    primaryKey.initiallyDeferred
  ) {
    throw new Error(`Class table '${tableKey(table.schemaName, table.name)}' cannot represent its primary key inline`)
  }
  return primaryKey.columns[0]
}

const renderFieldBlock = (
  declaration: SourceDeclaration,
  table: TableModel,
  context: RenderContext
): string => {
  const inlinePrimaryKey = inlinePrimaryKeyColumn(declaration, table)
  return `{
${table.columns.map((column) => `  ${renderPropertyKey(column.name)}: ${renderColumnDefinition(table, column, context, inlinePrimaryKey === column.name)}`).join(",\n")}
}`
}

const renderTableDeclaration = (
  declaration: SourceDeclaration,
  table: TableModel,
  context: RenderContext
): string => {
  const inlinePrimaryKey = inlinePrimaryKeyColumn(declaration, table)
  const tableOptions = table.options.filter((option) =>
    !(declaration.kind === "tableClass" && option.kind === "primaryKey" && inlinePrimaryKey !== undefined) &&
    !(option.kind !== "primaryKey" && isInlineColumnOption(option))
  )
  const renderedOptions = tableOptions.map((option) => renderTableOption(table, option, context))
  const fields = renderFieldBlock(declaration, table, context)
  const nameLiteral = renderStringLiteral(table.name)
  const schemaLiteral = table.schemaName && table.schemaName !== "public"
    ? `, ${renderStringLiteral(table.schemaName)}`
    : ""

  switch (declaration.kind) {
    case "tableFactory":
      return `const ${declaration.identifier} = ${renderPipeChain(
        `${TABLE_ALIAS}.make(${nameLiteral}, ${fields}${schemaLiteral})`,
        renderedOptions
      )}`
    case "tableSchema":
      return `const ${declaration.identifier} = ${renderPipeChain(
        `${declaration.schemaBuilderIdentifier}.table(${nameLiteral}, ${fields})`,
        renderedOptions
      )}`
    case "tableClass": {
      const head = `class ${declaration.identifier} extends ${TABLE_ALIAS}.Class<${declaration.identifier}>(${nameLiteral}${schemaLiteral})(${fields})`
      if (renderedOptions.length === 0) {
        return `${head} {}`
      }
      return `${head} {\n${indent(`static readonly [${TABLE_ALIAS}.options] = [\n${indent(renderedOptions.join(",\n"))}\n]`)}\n}`
    }
    default:
      throw new Error(`Cannot render table declaration for kind '${declaration.kind}'`)
  }
}

const renderTableAdditionBase = (
  declaration: SourceDeclaration,
  table: TableModel,
  context: RenderContext
): string => {
  const inlinePrimaryKey = inlinePrimaryKeyColumn(declaration, table)
  const hasForeignKeys = table.options.some((option) => option.kind === "foreignKey" && !isInlineColumnOption(option))
  const tableOptions = table.options.filter((option) =>
    option.kind !== "foreignKey" &&
    !(option.kind !== "primaryKey" && isInlineColumnOption(option)) &&
    !(declaration.kind === "tableClass" && option.kind === "primaryKey" && inlinePrimaryKey !== undefined)
  )
  const renderedOptions = tableOptions.map((option) => renderTableOption(table, option, context))
  const fields = renderFieldBlock(declaration, table, context)
  const nameLiteral = renderStringLiteral(table.name)
  const schemaLiteral = table.schemaName && table.schemaName !== "public"
    ? `, ${renderStringLiteral(table.schemaName)}`
    : ""

  switch (declaration.kind) {
    case "tableFactory": {
      return `${hasForeignKeys ? "let" : "const"} ${declaration.identifier} = ${renderPipeChain(
        `${TABLE_ALIAS}.make(${nameLiteral}, ${fields}${schemaLiteral})`,
        renderedOptions
      )}`
    }
    case "tableClass":
      return renderTableDeclaration(declaration, table, context)
    case "tableSchema": {
      return `${hasForeignKeys ? "let" : "const"} ${declaration.identifier} = ${renderPipeChain(
        `${declaration.schemaBuilderIdentifier}.table(${nameLiteral}, ${fields})`,
        renderedOptions
      )}`
    }
    default:
      throw new Error(`Cannot render table declaration for kind '${declaration.kind}'`)
  }
}

const renderTableForeignKeyUpdate = (
  declaration: SourceDeclaration,
  table: TableModel,
  context: RenderContext
): string | undefined => {
  const foreignKeys = table.options.filter((option): option is Extract<TableOptionSpec, { readonly kind: "foreignKey" }> =>
    option.kind === "foreignKey" && !isInlineColumnOption(option))
  if (foreignKeys.length === 0) {
    return undefined
  }
  return `${declaration.identifier} = ${renderPipeChain(
    declaration.identifier,
    foreignKeys.map((option) => renderTableOption(table, option, context))
  )}`
}

const renderEnumDeclaration = (
  declaration: SourceDeclaration,
  enumType: EnumModel
): string => {
  const values = renderStringTuple(enumType.values)
  switch (declaration.kind) {
    case "enumFactory":
      return enumType.schemaName === undefined || enumType.schemaName === "public"
        ? `const ${declaration.identifier} = ${PG_ALIAS}.enum(${renderStringLiteral(enumType.name)}, ${values})`
        : `const ${declaration.identifier} = ${PG_ALIAS}.schema(${renderStringLiteral(enumType.schemaName)}).enum(${renderStringLiteral(enumType.name)}, ${values})`
    case "enumSchema":
      return `const ${declaration.identifier} = ${declaration.schemaBuilderIdentifier}.enum(${renderStringLiteral(enumType.name)}, ${values})`
    default:
      throw new Error(`Cannot render enum declaration for kind '${declaration.kind}'`)
  }
}

type SequenceReference = {
  readonly schemaName?: string
  readonly name: string
}

type CanonicalSequence = SequenceReference & {
  readonly identifier: string
  readonly usageCount: number
}

const renderSequenceExpression = (
  sequence: SequenceReference,
  schemaBuilderIdentifier?: string
): string =>
  sequence.schemaName === undefined || sequence.schemaName === "public"
    ? `${PG_ALIAS}.sequence(${renderStringLiteral(sequence.name)})`
    : `${schemaBuilderIdentifier ?? `${PG_ALIAS}.schema(${renderStringLiteral(sequence.schemaName)})`}.sequence(${renderStringLiteral(sequence.name)})`

const renderSequenceDeclaration = (
  sequence: CanonicalSequence,
  schemaBuilderIdentifier?: string
): string =>
  `const ${sequence.identifier} = ${renderSequenceExpression(sequence, schemaBuilderIdentifier)}`

const ensureImports = (contents: string): string => {
  const cleaned = contents
    .replace(/^import \* as [A-Za-z0-9_$]+ from "effect-qb\/postgres"\n?/gm, "")
    .replace(/^import \{[^}]+\} from "effect-qb\/postgres"\n?/gm, "")
    .replace(/^import \* as [A-Za-z0-9_$]+ from "effect\/Schema"\n?/gm, "")
    .trimStart()
  const required = [
    `import * as ${PG_ALIAS} from "effect-qb/postgres"`,
    `import { ${TABLE_ALIAS}, ${COLUMN_ALIAS} } from "effect-qb/postgres"`,
    `import * as ${SCHEMA_ALIAS} from "effect/Schema"`
  ]
  const missing = required.filter((line) => !cleaned.includes(line))
  if (missing.length === 0) {
    return cleaned
  }
  return `${missing.join("\n")}\n${cleaned}`
}

const sanitizeIdentifier = (value: string): string => {
  const normalized = value.trim().replace(/[^A-Za-z0-9_$]+/g, "_").replace(/^_+|_+$/g, "")
  if (normalized.length === 0) {
    return "item"
  }
  return /^[A-Za-z_$]/.test(normalized)
    ? normalized
    : `_${normalized}`
}

const uniqueIdentifier = (
  preferred: string,
  used: Set<string>
): string => {
  const base = sanitizeIdentifier(preferred)
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let index = 2
  while (used.has(`${base}_${index}`)) {
    index += 1
  }
  const identifier = `${base}_${index}`
  used.add(identifier)
  return identifier
}

const visitExpression = (
  expression: PgSqlExpr,
  visit: (expression: PgSqlExpr) => void
): void => {
  visit(expression)
  switch (expression.type) {
    case "cast":
      visitExpression(expression.operand, visit)
      return
    case "member":
      visitExpression(expression.operand, visit)
      return
    case "call":
      for (const arg of Array.isArray(expression.args) ? expression.args : []) {
        visitExpression(arg, visit)
      }
      return
    case "binary":
      visitExpression(expression.left, visit)
      visitExpression(expression.right, visit)
      return
    case "unary":
      visitExpression(expression.operand, visit)
      return
    case "array":
      for (const item of expression.expressions) {
        visitExpression(item, visit)
      }
      return
    case "case":
      if (expression.value !== undefined && expression.value !== null) {
        visitExpression(expression.value, visit)
      }
      for (const branch of expression.whens ?? []) {
        visitExpression(branch.when, visit)
        visitExpression(branch.value, visit)
      }
      if (expression.else !== undefined && expression.else !== null) {
        visitExpression(expression.else, visit)
      }
      return
    case "extract":
      visitExpression(expression.from, visit)
      return
    default:
      return
  }
}

const collectExpressionReferences = (
  sql: string,
  options: {
    readonly fallbackSchemaName?: string
    readonly enumUsageByKey: Map<string, number>
    readonly sequenceUsageByKey: Map<string, number>
    readonly enumKeys: ReadonlySet<string>
  }
): void => {
  const expression = parse(sql, "expr") as PgSqlExpr
  visitExpression(expression, (current) => {
    if (current.type === "call") {
      const name = ((current.function as { readonly name?: string }).name ?? "").toLowerCase()
      if (name === "nextval" && Array.isArray(current.args) && current.args.length === 1) {
        const sequence = extractSequenceReference(current.args[0]!, options.fallbackSchemaName)
        if (sequence !== undefined) {
          const key = schemaObjectKey(sequence.schemaName, sequence.name)
          options.sequenceUsageByKey.set(key, (options.sequenceUsageByKey.get(key) ?? 0) + 1)
        }
      }
      return
    }
    if (current.type === "cast") {
      const target = current.to
      if (typeof target === "string") {
        const { schemaName, kind } = inferTypeNameFromDdl(target)
        const key = enumKey(schemaName, kind)
        if (options.enumKeys.has(key)) {
          options.enumUsageByKey.set(key, (options.enumUsageByKey.get(key) ?? 0) + 1)
        }
        return
      }
      if (target !== null && typeof target === "object") {
        const record = target as { readonly schema?: unknown; readonly name?: unknown; readonly type?: unknown }
        if (typeof record.schema === "string" && typeof record.name === "string") {
          const key = enumKey(record.schema, record.name)
          if (options.enumKeys.has(key)) {
            options.enumUsageByKey.set(key, (options.enumUsageByKey.get(key) ?? 0) + 1)
          }
          return
        }
        if (typeof record.name === "string") {
          const key = enumKey(options.fallbackSchemaName, record.name)
          if (options.enumKeys.has(key)) {
            options.enumUsageByKey.set(key, (options.enumUsageByKey.get(key) ?? 0) + 1)
          }
        } else if (typeof record.type === "string") {
          const { schemaName, kind } = inferTypeNameFromDdl(record.type)
          const key = enumKey(schemaName, kind)
          if (options.enumKeys.has(key)) {
            options.enumUsageByKey.set(key, (options.enumUsageByKey.get(key) ?? 0) + 1)
          }
        }
      }
    }
  })
}

const countTableReferences = (
  table: TableModel,
  enumKeys: ReadonlySet<string>
): {
  readonly enumUsageByKey: ReadonlyMap<string, number>
  readonly columnEnumUsageByKey: ReadonlyMap<string, number>
  readonly sequenceUsageByKey: ReadonlyMap<string, number>
} => {
  const enumUsageByKey = new Map<string, number>()
  const columnEnumUsageByKey = new Map<string, number>()
  const sequenceUsageByKey = new Map<string, number>()
  for (const column of table.columns) {
    if (column.typeKind === "e") {
      const key = enumKey(column.typeSchema, column.dbTypeKind)
      enumUsageByKey.set(key, (enumUsageByKey.get(key) ?? 0) + 1)
      columnEnumUsageByKey.set(key, (columnEnumUsageByKey.get(key) ?? 0) + 1)
    }
    if (column.defaultSql !== undefined) {
      collectExpressionReferences(column.defaultSql, {
        fallbackSchemaName: table.schemaName,
        enumUsageByKey,
        sequenceUsageByKey,
        enumKeys
      })
    }
    if (column.generatedSql !== undefined) {
      collectExpressionReferences(column.generatedSql, {
        fallbackSchemaName: table.schemaName,
        enumUsageByKey,
        sequenceUsageByKey,
        enumKeys
      })
    }
  }
  for (const option of table.options) {
    if (option.kind === "check") {
      collectExpressionReferences(renderDdlExpressionSql(option.predicate), {
        fallbackSchemaName: table.schemaName,
        enumUsageByKey,
        sequenceUsageByKey,
        enumKeys
      })
    } else if (option.kind === "index") {
      if (option.predicate !== undefined) {
        collectExpressionReferences(renderDdlExpressionSql(option.predicate), {
          fallbackSchemaName: table.schemaName,
          enumUsageByKey,
          sequenceUsageByKey,
          enumKeys
        })
      }
      for (const key of option.keys ?? []) {
        if (key.kind === "expression") {
          collectExpressionReferences(renderDdlExpressionSql(key.expression), {
            fallbackSchemaName: table.schemaName,
            enumUsageByKey,
            sequenceUsageByKey,
            enumKeys
          })
        }
      }
    }
  }
  return {
    enumUsageByKey,
    columnEnumUsageByKey,
    sequenceUsageByKey
  }
}

const renderInlineEnumExpression = (
  enumType: EnumModel,
  schemaBuilderIdentifier?: string
): string => {
  const values = renderStringTuple(enumType.values)
  return enumType.schemaName === undefined || enumType.schemaName === "public"
    ? `${PG_ALIAS}.enum(${renderStringLiteral(enumType.name)}, ${values})`
    : `${schemaBuilderIdentifier ?? `${PG_ALIAS}.schema(${renderStringLiteral(enumType.schemaName)})`}.enum(${renderStringLiteral(enumType.name)}, ${values})`
}

const sequenceReferenceOfKey = (key: string): SequenceReference => {
  const [resolvedSchemaName, ...nameParts] = key.split(".")
  return {
    schemaName: resolvedSchemaName === "public" ? undefined : resolvedSchemaName,
    name: nameParts.join(".")
  }
}

const countRenderedTableUsages = (
  tables: readonly TableModel[],
  enumKeys: ReadonlySet<string>
): {
  readonly enumUsageByKey: ReadonlyMap<string, number>
  readonly columnEnumUsageByKey: ReadonlyMap<string, number>
  readonly sequenceUsageByKey: ReadonlyMap<string, number>
} => {
  const enumUsageByKey = new Map<string, number>()
  const columnEnumUsageByKey = new Map<string, number>()
  const sequenceUsageByKey = new Map<string, number>()
  for (const table of tables) {
    const usage = countTableReferences(table, enumKeys)
    for (const [key, count] of usage.enumUsageByKey) {
      enumUsageByKey.set(key, (enumUsageByKey.get(key) ?? 0) + count)
    }
    for (const [key, count] of usage.columnEnumUsageByKey) {
      columnEnumUsageByKey.set(key, (columnEnumUsageByKey.get(key) ?? 0) + count)
    }
    for (const [key, count] of usage.sequenceUsageByKey) {
      sequenceUsageByKey.set(key, (sequenceUsageByKey.get(key) ?? 0) + count)
    }
  }
  return {
    enumUsageByKey,
    columnEnumUsageByKey,
    sequenceUsageByKey
  }
}

const renderCanonicalNewModule = (
  additions: readonly PulledAddition[],
  baseContext: RenderContext
): string => {
  const tables = additions.filter((addition): addition is PulledAddition & { readonly kind: "table"; readonly model: TableModel } => addition.kind === "table")
  const enums = additions.filter((addition): addition is PulledAddition & { readonly kind: "enum"; readonly model: EnumModel } => addition.kind === "enum")
  const firstModel = additions[0]?.model
  const schemaName = firstModel === undefined
    ? undefined
    : "columns" in firstModel
      ? firstModel.schemaName
      : firstModel.schemaName
  const usedIdentifiers = new Set(additions.map((addition) => addition.declaration.identifier))
  const schemaBuilderIdentifier = schemaName !== undefined && schemaName !== "public"
    ? uniqueIdentifier(schemaName, usedIdentifiers)
    : undefined
  const normalizeDeclaration = <Declaration extends SourceDeclaration>(declaration: Declaration): Declaration =>
    (schemaBuilderIdentifier === undefined || !("schemaBuilderIdentifier" in declaration)
      ? declaration
      : {
          ...declaration,
          schemaBuilderIdentifier
        }) as Declaration

  const {
    enumUsageByKey,
    columnEnumUsageByKey: _columnEnumUsageByKey,
    sequenceUsageByKey
  } = countRenderedTableUsages(
    tables.map((addition) => addition.model),
    baseContext.enumKeys
  )

  const enumExpressionByKey = new Map<string, string>()
  const hoistedEnumDeclarations: string[] = []
  const hoistedEnumExports: string[] = []
  for (const addition of enums) {
    const key = enumKey(addition.model.schemaName, addition.model.name)
    const usageCount = enumUsageByKey.get(key) ?? 0
    const hoist = usageCount > 1
    enumExpressionByKey.set(
      key,
      hoist
        ? addition.declaration.identifier
        : renderInlineEnumExpression(addition.model, schemaBuilderIdentifier)
    )
    if (hoist) {
      hoistedEnumDeclarations.push(renderEnumDeclaration(normalizeDeclaration(addition.declaration), addition.model))
      hoistedEnumExports.push(addition.declaration.identifier)
    }
  }

  const hoistedSequences: CanonicalSequence[] = []
  const sequenceExpressionByKey = new Map<string, string>()
  for (const [key, usageCount] of sequenceUsageByKey) {
    const sequenceReference = sequenceReferenceOfKey(key)
    if (usageCount === 1) {
      sequenceExpressionByKey.set(key, renderSequenceExpression(sequenceReference, schemaBuilderIdentifier))
      continue
    }
    const identifier = uniqueIdentifier(sequenceReference.name, usedIdentifiers)
    const sequence = {
      schemaName: sequenceReference.schemaName,
      name: sequenceReference.name,
      identifier,
      usageCount
    } satisfies CanonicalSequence
    hoistedSequences.push(sequence)
    sequenceExpressionByKey.set(key, identifier)
  }

  const fileContext: RenderContext = {
    ...baseContext,
    enumExpressionByKey,
    sequenceExpressionByKey
  }
  const orderedTables = sortTableAdditionsByDependency(tables)

  const lines: string[] = [
    `import * as ${PG_ALIAS} from "effect-qb/postgres"`,
    `import { ${TABLE_ALIAS}, ${COLUMN_ALIAS} } from "effect-qb/postgres"`,
    `import * as ${SCHEMA_ALIAS} from "effect/Schema"`
  ]
  const body: string[] = []
  if (schemaBuilderIdentifier !== undefined) {
    body.push(`const ${schemaBuilderIdentifier} = ${PG_ALIAS}.schema(${renderStringLiteral(schemaName!)})`)
  }
  body.push(...hoistedSequences.map((sequence) => renderSequenceDeclaration(sequence, schemaBuilderIdentifier)))
  body.push(...hoistedEnumDeclarations)
  body.push(...orderedTables.map((addition) => renderTableAdditionBase(normalizeDeclaration(addition.declaration), addition.model, fileContext)))
  body.push(...orderedTables.flatMap((addition) => {
    const update = renderTableForeignKeyUpdate(normalizeDeclaration(addition.declaration), addition.model, fileContext)
    return update === undefined ? [] : [update]
  }))
  const exportNames = [
    ...orderedTables.map((addition) => addition.declaration.identifier),
    ...hoistedEnumExports
  ]
  const exportBlock = exportNames.length === 0
    ? ""
    : `export { ${exportNames.join(", ")} }`
  return `${lines.join("\n")}\n\n${[...body, exportBlock].filter((value) => value.length > 0).join("\n\n")}\n`
}

const inferSourceRoot = (
  cwd: string,
  includes: readonly string[]
): string => {
  const first = includes[0] ?? "src/**/*.ts"
  const wildcard = first.search(/[*?{\[]/)
  const prefix = wildcard === -1 ? first : first.slice(0, wildcard)
  if (prefix.length === 0) {
    return cwd
  }
  if (prefix.endsWith("/")) {
    return resolve(cwd, prefix)
  }
  if (extname(prefix).length > 0) {
    return resolve(cwd, dirname(prefix))
  }
  return resolve(cwd, prefix)
}

const renderDeclaredModule = (
  original: string,
  declarations: readonly string[],
  exportNames: readonly string[]
): string => {
  const declarationBlock = declarations.join("\n\n")
  if (!original.includes("export {")) {
    const body = declarationBlock.length > 0
      ? `${declarationBlock}\nexport { ${exportNames.join(", ")} }`
      : `export { ${exportNames.join(", ")} }`
    return ensureImports(body)
  }

  const exportIndex = original.lastIndexOf("export {")
  const beforeExport = original.slice(0, exportIndex).trimEnd()
  const exportLine = original.slice(exportIndex).trim()
  const match = /^export\s*\{([^}]*)\}/.exec(exportLine)
  if (match === null) {
    const body = declarationBlock.length > 0
      ? `${original.trimEnd()}\n${declarationBlock}\nexport { ${exportNames.join(", ")} }`
      : original.trimEnd()
    return ensureImports(body)
  }
  const existingNames = match[1]!
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  const merged = [...new Set([...existingNames, ...exportNames])]
  const replacement = `export { ${merged.join(", ")} }`
  const body = declarationBlock.length > 0
    ? `${beforeExport}\n${declarationBlock}\n${replacement}`
    : `${beforeExport}\n${replacement}`
  return ensureImports(body)
}

export const planPostgresPull = async (
  cwd: string,
  source: {
    readonly include: readonly string[]
    readonly exclude?: readonly string[]
  },
  discovered: DiscoveredSourceSchema,
  database: SchemaModel
): Promise<PullPlan> => {
  const bindingByKey = new Map(discovered.bindings.map((binding) => [binding.key, binding]))
  const databaseTablesByKey = new Map(database.tables.map((table) => [tableKey(table.schemaName, table.name), table]))
  const databaseEnumsByKey = new Map(database.enums.map((enumType) => [enumKey(enumType.schemaName, enumType.name), enumType]))
  const context: RenderContext = {
    bindingByKey,
    enumKeys: new Set(databaseEnumsByKey.keys())
  }
  const sourceRoot = inferSourceRoot(cwd, source.include)

  const schemaFilePathByName = new Map<string, string>()
  for (const binding of discovered.bindings) {
    const schemaName = binding.kind === "table"
      ? schemaNameOfTable(toTableModel(binding.value as any))
      : schemaNameOfEnum(toEnumModel(binding.value as any))
    if (!schemaFilePathByName.has(schemaName)) {
      schemaFilePathByName.set(schemaName, binding.declaration.filePath)
    }
  }

  const matchedSourceBindings = new Set<SourceBinding>()
  const matchedDbTableKeys = new Set<string>()
  const matchedDbEnumKeys = new Set<string>()
  const filePlans = new Map<string, {
    readonly original: string
    readonly replacements: SourceBinding[]
    readonly additions: Array<{
      readonly binding: SourceBinding
      readonly model: TableModel | EnumModel
    }>
  }>()

  const ensureFilePlan = async (filePath: string): Promise<{
    readonly original: string
    readonly replacements: SourceBinding[]
    readonly additions: Array<{
      readonly binding: SourceBinding
      readonly model: TableModel | EnumModel
    }>
  }> => {
    const existing = filePlans.get(filePath)
    if (existing !== undefined) {
      return existing
    }
    const original = await Bun.file(filePath).exists()
      ? await Bun.file(filePath).text()
      : ""
    const created = {
      original,
      replacements: [] as SourceBinding[],
      additions: [] as Array<{
        readonly binding: SourceBinding
        readonly model: TableModel | EnumModel
      }>
    }
    filePlans.set(filePath, created)
    return created
  }

  const scheduleReplacement = async (
    binding: SourceBinding,
    model: TableModel | EnumModel
  ): Promise<void> => {
    const plan = await ensureFilePlan(binding.declaration.filePath)
    plan.replacements.push(binding)
    bindingByKey.set(binding.key, binding)
    void model
  }

  for (const [key, table] of databaseTablesByKey) {
    const binding = bindingByKey.get(key)
    if (binding !== undefined && binding.kind === "table") {
      matchedSourceBindings.add(binding)
      matchedDbTableKeys.add(key)
      await scheduleReplacement(binding, table)
    }
  }

  for (const [key, enumType] of databaseEnumsByKey) {
    const binding = bindingByKey.get(key)
    if (binding !== undefined && binding.kind === "enum") {
      matchedSourceBindings.add(binding)
      matchedDbEnumKeys.add(key)
      await scheduleReplacement(binding, enumType)
    }
  }

  const renameTablePairs = pairUniqueBySignature(
    discovered.bindings.filter((binding) => binding.kind === "table" && !matchedSourceBindings.has(binding)),
    database.tables.filter((table) => !matchedDbTableKeys.has(tableKey(table.schemaName, table.name))),
    (binding) => tableShapeSignature(toTableModel(binding.value as any)),
    (table) => tableShapeSignature(table)
  )
  for (const { source: binding, db: table } of renameTablePairs) {
    matchedSourceBindings.add(binding)
    matchedDbTableKeys.add(tableKey(table.schemaName, table.name))
    await scheduleReplacement(binding, table)
  }

  const renameEnumPairs = pairUniqueBySignature(
    discovered.bindings.filter((binding) => binding.kind === "enum" && !matchedSourceBindings.has(binding)),
    database.enums.filter((enumType) => !matchedDbEnumKeys.has(enumKey(enumType.schemaName, enumType.name))),
    (binding) => enumShapeSignature(toEnumModel(binding.value as any)),
    (enumType) => enumShapeSignature(enumType)
  )
  for (const { source: binding, db: enumType } of renameEnumPairs) {
    matchedSourceBindings.add(binding)
    matchedDbEnumKeys.add(enumKey(enumType.schemaName, enumType.name))
    await scheduleReplacement(binding, enumType)
  }

  const newBindingsByFile = new Map<string, Array<{
    readonly binding: SourceBinding
    readonly model: TableModel | EnumModel
  }>>()

  for (const table of database.tables) {
    const key = tableKey(table.schemaName, table.name)
    if (matchedDbTableKeys.has(key)) {
      continue
    }
    const sourceBinding = discovered.bindings.find((binding) =>
      binding.kind === "table" &&
      !matchedSourceBindings.has(binding) &&
      tableShapeSignature(toTableModel(binding.value as any)) === tableShapeSignature(table)
    )
    if (sourceBinding !== undefined) {
      matchedSourceBindings.add(sourceBinding)
      matchedDbTableKeys.add(key)
      await scheduleReplacement(sourceBinding, table)
      continue
    }
    const schemaName = schemaNameOfTable(table)
    const filePath = schemaFilePathByName.get(schemaName) ?? resolve(sourceRoot, `${schemaName}.schema.ts`)
    const list = newBindingsByFile.get(filePath) ?? []
    const declaration: SourceDeclaration = schemaName === "public"
      ? {
          kind: "tableFactory",
          filePath,
          identifier: "",
          start: 0,
          end: 0
        }
      : {
          kind: "tableSchema",
          filePath,
          identifier: "",
          start: 0,
          end: 0,
          schemaBuilderIdentifier: sanitizeIdentifier(schemaName)
        }
    list.push({
      binding: {
        declaration,
        kind: "table",
        key,
        value: table
      },
      model: table
    })
    newBindingsByFile.set(filePath, list)
  }

  for (const enumType of database.enums) {
    const key = enumKey(enumType.schemaName, enumType.name)
    if (matchedDbEnumKeys.has(key)) {
      continue
    }
    const sourceBinding = discovered.bindings.find((binding) =>
      binding.kind === "enum" &&
      !matchedSourceBindings.has(binding) &&
      enumShapeSignature(toEnumModel(binding.value as any)) === enumShapeSignature(enumType)
    )
    if (sourceBinding !== undefined) {
      matchedSourceBindings.add(sourceBinding)
      matchedDbEnumKeys.add(key)
      await scheduleReplacement(sourceBinding, enumType)
      continue
    }
    const schemaName = schemaNameOfEnum(enumType)
    const filePath = schemaFilePathByName.get(schemaName) ?? resolve(sourceRoot, `${schemaName}.schema.ts`)
    const list = newBindingsByFile.get(filePath) ?? []
    const declaration: SourceDeclaration = schemaName === "public"
      ? {
          kind: "enumFactory",
          filePath,
          identifier: "",
          start: 0,
          end: 0
        }
      : {
          kind: "enumSchema",
          filePath,
          identifier: "",
          start: 0,
          end: 0,
          schemaBuilderIdentifier: sanitizeIdentifier(schemaName)
        }
    list.push({
      binding: {
        declaration,
        kind: "enum",
        key,
        value: enumType
      },
      model: enumType
    })
    newBindingsByFile.set(filePath, list)
  }

  for (const [filePath, additions] of newBindingsByFile) {
    const plan = await ensureFilePlan(filePath)
    plan.additions.push(...additions)
  }

  const updates: PullFileUpdate[] = []
  for (const [filePath, plan] of filePlans) {
    const existingSchemaBuilderIdentifier = discovered.declarations.find((declaration) =>
      declaration.filePath === filePath &&
      "schemaBuilderIdentifier" in declaration
    )
    const schemaBuilderIdentifier = existingSchemaBuilderIdentifier !== undefined && "schemaBuilderIdentifier" in existingSchemaBuilderIdentifier
      ? existingSchemaBuilderIdentifier.schemaBuilderIdentifier
      : undefined
    const usedIdentifiers = new Set(
      discovered.bindings
        .filter((binding) => binding.declaration.filePath === filePath)
        .map((binding) => binding.declaration.identifier)
    )
    const syntheticAdditions = plan.additions.map(({ binding, model }, sourceIndex) => {
      const identifier = uniqueIdentifier(model.name, usedIdentifiers)
      return {
        ...binding,
        model,
        sourceIndex,
        declaration: {
          ...binding.declaration,
          identifier,
          ...(
            schemaBuilderIdentifier !== undefined && "schemaBuilderIdentifier" in binding.declaration
              ? { schemaBuilderIdentifier }
              : {}
          )
        }
      }
    })
    const syntheticBindings = syntheticAdditions.map(({ model: _model, sourceIndex: _sourceIndex, ...binding }) => binding)
    const combinedBindingByKey = new Map(bindingByKey)
    for (const binding of syntheticBindings) {
      combinedBindingByKey.set(binding.key, binding)
    }
    const combinedEnumKeys = new Set(context.enumKeys)
    for (const binding of syntheticBindings) {
      if (binding.kind === "enum") {
        combinedEnumKeys.add(binding.key)
      }
    }
    const tableModelsToRender = [
      ...plan.replacements
        .filter((binding): binding is SourceBinding & { readonly kind: "table" } => binding.kind === "table")
        .map((binding) => databaseTablesByKey.get(binding.key) ?? (() => {
          throw new Error(`Missing database table '${binding.key}'`)
        })()),
      ...syntheticAdditions
        .filter((binding): binding is PulledAddition & { readonly kind: "table"; readonly model: TableModel } => binding.kind === "table")
        .map((binding) => binding.model)
    ]
    const fileUsage = countRenderedTableUsages(tableModelsToRender, combinedEnumKeys)
    const enumExpressionByKey = new Map<string, string>()
    for (const binding of discovered.bindings) {
      if (binding.declaration.filePath === filePath && binding.kind === "enum") {
        enumExpressionByKey.set(binding.key, binding.declaration.identifier)
      }
    }
    const sequenceExpressionByKey = new Map<string, string>()
    for (const key of fileUsage.sequenceUsageByKey.keys()) {
      sequenceExpressionByKey.set(
        key,
        renderSequenceExpression(sequenceReferenceOfKey(key), schemaBuilderIdentifier)
      )
    }
    for (const addition of syntheticAdditions) {
      if (addition.kind === "enum") {
        const usageCount = fileUsage.enumUsageByKey.get(addition.key) ?? 0
        if (usageCount > 0) {
          enumExpressionByKey.set(
            addition.key,
            renderInlineEnumExpression(addition.model as EnumModel, schemaBuilderIdentifier)
          )
        }
      }
    }
    const fileContext: RenderContext = {
      bindingByKey: combinedBindingByKey,
      enumKeys: combinedEnumKeys,
      enumExpressionByKey,
      sequenceExpressionByKey
    }

    let next = ensureImports(plan.original)
    const importOffset = next.length - plan.original.length
    for (const binding of [...plan.replacements].sort((left, right) => right.declaration.start - left.declaration.start)) {
      const model = binding.kind === "table"
        ? databaseTablesByKey.get(binding.key) ?? (() => {
            throw new Error(`Missing database table '${binding.key}'`)
          })()
        : databaseEnumsByKey.get(binding.key) ?? (() => {
            throw new Error(`Missing database enum '${binding.key}'`)
          })()
      const replacement = binding.kind === "table"
        ? renderTableDeclaration(
            binding.declaration,
            model as TableModel,
            fileContext
          )
        : renderEnumDeclaration(
            binding.declaration,
            model as EnumModel
          )
      const start = binding.declaration.start + importOffset
      const end = binding.declaration.end + importOffset
      next = `${next.slice(0, start)}${replacement}${next.slice(end)}`
    }

    if (plan.additions.length > 0) {
      const orderedAdditions = sortPulledAdditions(syntheticAdditions)
      if (plan.original.trim().length === 0 && plan.replacements.length === 0) {
        next = renderCanonicalNewModule(orderedAdditions, fileContext)
      } else {
        const orderedTables = sortTableAdditionsByDependency(
          orderedAdditions.filter((binding): binding is PulledAddition & { readonly kind: "table"; readonly model: TableModel } =>
            binding.kind === "table")
        )
        const renderedEnumAdditions = orderedAdditions.filter((binding): binding is PulledAddition & { readonly kind: "enum"; readonly model: EnumModel } =>
          binding.kind === "enum" && (fileUsage.enumUsageByKey.get(binding.key) ?? 0) === 0
        )
        const renderedAdditions = [
          ...orderedTables.map((binding) => renderTableAdditionBase(
            binding.declaration,
            binding.model as TableModel,
            fileContext
          )),
          ...renderedEnumAdditions.map((binding) =>
            renderEnumDeclaration(
              binding.declaration,
              binding.model
            )
          ),
          ...orderedTables.flatMap((binding) => {
            const update = renderTableForeignKeyUpdate(
              binding.declaration,
              binding.model as TableModel,
              fileContext
            )
            return update === undefined ? [] : [update]
          })
        ]
        next = renderDeclaredModule(
          next,
          renderedAdditions,
          [
            ...orderedTables
              .map((binding) => binding.declaration.identifier),
            ...renderedEnumAdditions.map((binding) => binding.declaration.identifier)
          ]
        )
      }
    }

    if (next !== plan.original) {
      updates.push({
        filePath,
        before: plan.original,
        after: next
      })
    }
  }

  return {
    updates
  }
}

export const applyPullPlan = async (plan: PullPlan): Promise<void> => {
  for (const update of plan.updates) {
    await mkdir(dirname(update.filePath), { recursive: true })
    await Bun.write(update.filePath, update.after)
  }
}

export const summarizePullPlan = (cwd: string, plan: PullPlan): readonly string[] =>
  plan.updates.map((update) => `${update.before.length === 0 ? "create" : "update"} ${relative(cwd, update.filePath)}`)
