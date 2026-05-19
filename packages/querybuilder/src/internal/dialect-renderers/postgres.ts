import * as Schema from "effect/Schema"

import * as Query from "../query.js"
import * as Expression from "../scalar.js"
import * as Table from "../table.js"
import * as QueryAst from "../query-ast.js"
import type { RenderState, RenderValueContext, SqlDialect } from "../dialect.js"
import * as ExpressionAst from "../expression-ast.js"
import * as JsonPath from "../json/path.js"
import { renderSelectLockMode } from "../dsl-plan-runtime.js"
import { expectConflictClause, expectInsertSourceKind } from "../dsl-mutation-runtime.js"
import { expectDdlClauseKind, expectTruncateClause, renderTransactionIsolationLevel } from "../dsl-transaction-ddl-runtime.js"
import {
  renderJsonSelectSql,
  renderSelectSql,
  toDriverValue
} from "../runtime/driver-value-mapping.js"
import { normalizeDbValue } from "../runtime/normalize.js"
import { flattenSelection, type Projection } from "../projections.js"
import { type SelectionValue, validateAggregationSelection } from "../aggregation-validation.js"
import * as SchemaExpression from "../schema-expression.js"
import { renderReferentialAction, type DdlExpressionLike } from "../table-options.js"

const renderDbType = (
  dialect: SqlDialect,
  dbType: Expression.DbType.Any
): string => {
  if (dialect.name === "mysql" && dbType.dialect === "mysql" && dbType.kind === "uuid") {
    return "char(36)"
  }
  return dbType.kind
}

const renderCastType = (
  dialect: SqlDialect,
  dbType: Expression.DbType.Any
): string => {
  if (dialect.name !== "mysql") {
    return dbType.kind
  }
  switch (dbType.kind) {
    case "text":
      return "char"
    case "uuid":
      return "char(36)"
    case "numeric":
      return "decimal"
    case "timestamp":
      return "datetime"
    case "bool":
    case "boolean":
      return "boolean"
    case "json":
      return "json"
    default:
      return dbType.kind
  }
}

const renderPostgresDdlString = (value: string): string =>
  `'${value.replaceAll("'", "''")}'`

const renderPostgresDdlBytes = (value: Uint8Array): string =>
  `decode('${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}', 'hex')`

const renderPostgresDdlLiteral = (
  value: unknown,
  state: RenderState,
  context: RenderValueContext = {}
): string => {
  const driverValue = toDriverValue(value, {
    dialect: "postgres",
    valueMappings: state.valueMappings,
    ...context
  })
  if (driverValue === null) {
    return "null"
  }
  switch (typeof driverValue) {
    case "boolean":
      return driverValue ? "true" : "false"
    case "number":
      if (!Number.isFinite(driverValue)) {
        throw new Error("Expected a finite numeric value")
      }
      return String(driverValue)
    case "bigint":
      return driverValue.toString()
    case "string":
      return renderPostgresDdlString(driverValue)
    case "object":
      if (driverValue instanceof Uint8Array) {
        return renderPostgresDdlBytes(driverValue)
      }
      break
  }
  throw new Error("Unsupported postgres DDL literal value")
}

const renderDdlExpression = (
  expression: DdlExpressionLike,
  state: RenderState,
  dialect: SqlDialect
): string => {
  if (SchemaExpression.isSchemaExpression(expression)) {
    return SchemaExpression.render(expression)
  }
  return renderExpression(expression, state, {
    ...dialect,
    renderLiteral: renderPostgresDdlLiteral
  })
}

const renderColumnDefinition = (
  dialect: SqlDialect,
  state: RenderState,
  columnName: string,
  column: Table.AnyTable[typeof Table.TypeId]["fields"][string]
): string => {
  const clauses = [
    dialect.quoteIdentifier(columnName),
    column.metadata.ddlType ?? renderDbType(dialect, column.metadata.dbType)
  ]
  if (column.metadata.identity) {
    clauses.push(`generated ${column.metadata.identity.generation === "byDefault" ? "by default" : "always"} as identity`)
  } else if (column.metadata.generatedValue) {
    clauses.push(`generated always as (${renderDdlExpression(column.metadata.generatedValue, state, dialect)}) stored`)
  } else if (column.metadata.defaultValue) {
    clauses.push(`default ${renderDdlExpression(column.metadata.defaultValue, state, dialect)}`)
  }
  if (!column.metadata.nullable) {
    clauses.push("not null")
  }
  return clauses.join(" ")
}

const renderCreateTableSql = (
  targetSource: QueryAst.FromClause,
  state: RenderState,
  dialect: SqlDialect,
  ifNotExists: boolean
): string => {
  const table = targetSource.source as Table.AnyTable
  const fields = table[Table.TypeId].fields
  const definitions = Object.entries(fields).map(([columnName, column]) =>
    renderColumnDefinition(dialect, state, columnName, column)
  )
  for (const option of table[Table.OptionsSymbol]) {
    switch (option.kind) {
      case "primaryKey":
        definitions.push(`${option.name ? `constraint ${dialect.quoteIdentifier(option.name)} ` : ""}primary key (${option.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")})${option.deferrable ? ` deferrable${option.initiallyDeferred ? " initially deferred" : ""}` : ""}`)
        break
      case "unique":
        definitions.push(`${option.name ? `constraint ${dialect.quoteIdentifier(option.name)} ` : ""}unique${option.nullsNotDistinct ? " nulls not distinct" : ""} (${option.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")})${option.deferrable ? ` deferrable${option.initiallyDeferred ? " initially deferred" : ""}` : ""}`)
        break
      case "foreignKey": {
        const reference = option.references()
        definitions.push(
          `${option.name ? `constraint ${dialect.quoteIdentifier(option.name)} ` : ""}foreign key (${option.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")}) references ${dialect.renderTableReference(reference.tableName, reference.tableName, reference.schemaName)} (${reference.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")})${option.onDelete !== undefined ? ` on delete ${renderReferentialAction(option.onDelete)}` : ""}${option.onUpdate !== undefined ? ` on update ${renderReferentialAction(option.onUpdate)}` : ""}${option.deferrable ? ` deferrable${option.initiallyDeferred ? " initially deferred" : ""}` : ""}`
        )
        break
      }
      case "check":
        definitions.push(
          `constraint ${dialect.quoteIdentifier(option.name)} check (${renderDdlExpression(option.predicate, { ...state, rowLocalColumns: true }, dialect)})${option.noInherit ? " no inherit" : ""}`
        )
        break
      case "index":
        break
      default:
        throw new Error("Unsupported table option kind")
    }
  }
  return `create table${ifNotExists ? " if not exists" : ""} ${renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)} (${definitions.join(", ")})`
}

const renderCreateIndexSql = (
  targetSource: QueryAst.FromClause,
  ddl: Extract<QueryAst.DdlClause, { readonly kind: "createIndex" }>,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const maybeIfNotExists = dialect.name === "postgres" && ddl.ifNotExists ? " if not exists" : ""
  return `create${ddl.unique ? " unique" : ""} index${maybeIfNotExists} ${dialect.quoteIdentifier(ddl.name)} on ${renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)} (${ddl.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")})`
}

const renderDropIndexSql = (
  targetSource: QueryAst.FromClause,
  ddl: Extract<QueryAst.DdlClause, { readonly kind: "dropIndex" }>,
  state: RenderState,
  dialect: SqlDialect
): string => {
  if (dialect.name === "postgres") {
    const schemaName = typeof targetSource.source === "object" &&
      targetSource.source !== null &&
      Table.TypeId in targetSource.source
      ? (targetSource.source as Table.AnyTable)[Table.TypeId].schemaName
      : undefined
    const indexName = schemaName === undefined || schemaName === "public"
      ? dialect.quoteIdentifier(ddl.name)
      : `${dialect.quoteIdentifier(schemaName)}.${dialect.quoteIdentifier(ddl.name)}`
    return `drop index${ddl.ifExists ? " if exists" : ""} ${indexName}`
  }
  return `drop index ${dialect.quoteIdentifier(ddl.name)} on ${renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)}`
}

const isExpression = (value: unknown): value is Expression.Any =>
  value !== null && typeof value === "object" && Expression.TypeId in value

const isJsonDbType = (dbType: Expression.DbType.Any): boolean => {
  if (dbType.kind === "jsonb" || dbType.kind === "json") {
    return true
  }
  if (!("variant" in dbType)) {
    return false
  }
  const variant = dbType.variant as string
  return variant === "json" || variant === "jsonb"
}

const isJsonExpression = (value: unknown): value is Expression.Any =>
  isExpression(value) && isJsonDbType(value[Expression.TypeId].dbType)

const postgresRangeSubtypeByKind: Readonly<Record<string, string>> = {
  int4range: "int4",
  int8range: "int8",
  numrange: "numeric",
  tsrange: "timestamp",
  tstzrange: "timestamptz",
  daterange: "date",
  int4multirange: "int4",
  int8multirange: "int8",
  nummultirange: "numeric",
  tsmultirange: "timestamp",
  tstzmultirange: "timestamptz",
  datemultirange: "date"
}

const postgresRangeSubtypeKey = (dbType: Expression.DbType.Any): string | undefined => {
  if ("base" in dbType) {
    return postgresRangeSubtypeKey(dbType.base)
  }
  if ("subtype" in dbType) {
    return postgresRangeSubtypeKey(dbType.subtype) ?? dbType.subtype.kind
  }
  return postgresRangeSubtypeByKind[dbType.kind]
}

const assertCompatiblePostgresRangeOperands = (
  left: Expression.Any,
  right: Expression.Any
): void => {
  const leftKey = postgresRangeSubtypeKey(left[Expression.TypeId].dbType)
  const rightKey = postgresRangeSubtypeKey(right[Expression.TypeId].dbType)
  if (leftKey !== undefined && rightKey !== undefined && leftKey !== rightKey) {
    throw new Error("Incompatible postgres range operands")
  }
}

const unsupportedJsonFeature = (
  dialect: SqlDialect,
  feature: string
): never => {
  const error = new Error(`Unsupported JSON feature for ${dialect.name}: ${feature}`) as Error & {
    readonly tag: string
    readonly dialect: string
    readonly feature: string
  }
  Object.assign(error, {
    tag: `@${dialect.name}/unsupported/json-feature`,
    dialect: dialect.name,
    feature
  })
  throw error
}

const extractJsonBase = (node: Record<string, unknown>): unknown =>
  node.value ?? node.base ?? node.input ?? node.left ?? node.target

const isJsonPathValue = (value: unknown): value is JsonPath.Path<any> =>
  value !== null && typeof value === "object" && JsonPath.TypeId in value

const extractJsonPathSegments = (node: Record<string, unknown>): ReadonlyArray<JsonPath.AnySegment> => {
  const path = node.path ?? node.segments ?? node.keys
  if (isJsonPathValue(path)) {
    return path.segments
  }
  if (Array.isArray(path)) {
    return path as readonly JsonPath.AnySegment[]
  }
  if ("key" in node) {
    return [JsonPath.key(String(node.key))]
  }
  if ("segment" in node) {
    const segment = node.segment
    if (typeof segment === "string") {
      return [JsonPath.key(segment)]
    }
    if (typeof segment === "number") {
      return [JsonPath.index(segment)]
    }
    if (segment !== null && typeof segment === "object" && JsonPath.SegmentTypeId in segment) {
      return [segment as JsonPath.AnySegment]
    }
    return []
  }
  if ("right" in node && isJsonPathValue(node.right)) {
    return node.right.segments
  }
  return []
}

const extractJsonValue = (node: Record<string, unknown>): unknown =>
  node.newValue ?? node.insert ?? node.right

const renderJsonPathSegment = (segment: JsonPath.AnySegment | string | number): string => {
  const renderKey = (value: string): string =>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
      ? `.${value}`
      : `.${JSON.stringify(value)}`
  if (typeof segment === "string") {
    return renderKey(segment)
  }
  if (typeof segment === "number") {
    return `[${segment}]`
  }
  switch (segment.kind) {
    case "key":
      return renderKey(segment.key)
    case "index":
      return `[${segment.index}]`
    case "wildcard":
      return "[*]"
    case "slice":
      return `[${segment.start ?? 0} to ${segment.end ?? "last"}]`
    case "descend":
      return ".**"
    default:
      throw new Error("Unsupported JSON path segment")
  }
}

const renderJsonPathStringLiteral = (segments: ReadonlyArray<JsonPath.AnySegment | string | number>): string => {
  let path = "$"
  for (const segment of segments) {
    path += renderJsonPathSegment(segment)
  }
  return path
}

const renderMySqlJsonPath = (
  segments: ReadonlyArray<JsonPath.AnySegment | string | number>,
  state: RenderState,
  dialect: SqlDialect
): string => dialect.renderLiteral(renderJsonPathStringLiteral(segments), state)

const renderPostgresJsonPathArray = (
  segments: ReadonlyArray<JsonPath.AnySegment | string | number>,
  state: RenderState,
  dialect: SqlDialect
): string => `array[${segments.map((segment) => {
  if (typeof segment === "string") {
    return dialect.renderLiteral(segment, state)
  }
  if (typeof segment === "number") {
    return dialect.renderLiteral(String(segment), state)
  }
  switch (segment.kind) {
    case "key":
      return dialect.renderLiteral(segment.key, state)
    case "index":
      return dialect.renderLiteral(String(segment.index), state)
    default:
      throw new Error("Postgres JSON traversal requires exact key/index segments")
  }
}).join(", ")}]`

const renderPostgresTextLiteral = (
  value: string,
  state: RenderState,
  dialect: SqlDialect
): string => `cast(${dialect.renderLiteral(value, state)} as text)`

const renderPostgresJsonAccessStep = (
  segment: JsonPath.AnySegment,
  textMode: boolean,
  state: RenderState,
  dialect: SqlDialect
): string => {
  switch (segment.kind) {
    case "key":
      return `${textMode ? "->>" : "->"} ${dialect.renderLiteral(segment.key, state)}`
    case "index":
      return `${textMode ? "->>" : "->"} ${dialect.renderLiteral(segment.index, state)}`
    default:
      throw new Error("Postgres exact JSON access requires key/index segments")
  }
}

const renderPostgresJsonValue = (
  value: unknown,
  state: RenderState,
  dialect: SqlDialect
): string => {
  if (!isExpression(value)) {
    throw new Error("Expected a JSON expression")
  }
  const rendered = renderExpression(value, state, dialect)
  const ast = (value as Expression.Any & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.Any
  })[ExpressionAst.TypeId]
  if (ast.kind === "literal") {
    return `cast(${rendered} as jsonb)`
  }
  return value[Expression.TypeId].dbType.kind === "jsonb"
    ? rendered
    : `cast(${rendered} as jsonb)`
}

const expressionDriverContext = (
  expression: Expression.Any,
  state: RenderState,
  dialect: SqlDialect
) => ({
  dialect: dialect.name,
  valueMappings: state.valueMappings,
  dbType: expression[Expression.TypeId].dbType,
  runtimeSchema: expression[Expression.TypeId].runtimeSchema,
  driverValueMapping: expression[Expression.TypeId].driverValueMapping
})

const renderJsonInputExpression = (
  expression: Expression.Any,
  state: RenderState,
  dialect: SqlDialect
): string =>
  renderJsonSelectSql(
    renderExpression(expression, state, dialect),
    expressionDriverContext(expression, state, dialect)
  )

const encodeArrayValues = (
  values: readonly unknown[],
  column: Table.AnyTable[typeof Table.TypeId]["fields"][string],
  state: RenderState,
  dialect: SqlDialect
): readonly unknown[] =>
  values.map((value) => {
    if (value === null && column.metadata.nullable) {
      return null
    }
    const runtimeSchemaAccepts = column.schema !== undefined &&
      (Schema.is(column.schema) as (candidate: unknown) => boolean)(value)
    const normalizedValue = runtimeSchemaAccepts
      ? value
      : normalizeDbValue(column.metadata.dbType, value)
    const encodedValue = column.schema === undefined || runtimeSchemaAccepts
      ? normalizedValue
      : (Schema.decodeUnknownSync as any)(column.schema)(normalizedValue)
    return toDriverValue(encodedValue, {
      dialect: dialect.name,
      valueMappings: state.valueMappings,
      dbType: column.metadata.dbType,
      runtimeSchema: column.schema,
      driverValueMapping: column.metadata.driverValueMapping
    })
  })

const renderPostgresJsonKind = (
  value: Expression.Any
): "json" | "jsonb" => value[Expression.TypeId].dbType.kind === "jsonb" ? "jsonb" : "json"

const renderJsonOpaquePath = (
  value: unknown,
  state: RenderState,
  dialect: SqlDialect
): string => {
  if (isJsonPathValue(value)) {
    return dialect.renderLiteral(renderJsonPathStringLiteral(value.segments), state)
  }
  if (typeof value === "string") {
    return dialect.renderLiteral(value, state)
  }
  if (isExpression(value)) {
    return renderExpression(value, state, dialect)
  }
  throw new Error("Unsupported SQL/JSON path input")
}

const renderFunctionCall = (
  name: string,
  args: readonly Expression.Any[],
  state: RenderState,
  dialect: SqlDialect
): string => {
  if (name === "array") {
    return `ARRAY[${args.map((arg) => renderExpression(arg, state, dialect)).join(", ")}]`
  }
  if (name === "extract" && args.length === 2) {
    const field = args[0]
    const source = args[1]
    if (field === undefined) {
      throw new Error("Unsupported SQL extract expression")
    }
    if (source === undefined) {
      throw new Error("Unsupported SQL extract expression")
    }
    const fieldRuntime = isExpression(field) && field[Expression.TypeId].dbType.kind === "text" && typeof field[Expression.TypeId].runtime === "string"
      ? field[Expression.TypeId].runtime
      : undefined
    const renderedField = fieldRuntime ?? renderExpression(field, state, dialect)
    return `extract(${renderedField} from ${renderExpression(source, state, dialect)})`
  }
  const renderedArgs = args.map((arg) => renderExpression(arg, state, dialect)).join(", ")
  if (args.length === 0) {
    switch (name) {
      case "current_date":
      case "current_time":
      case "current_timestamp":
      case "localtime":
      case "localtimestamp":
        return name
      default:
        return `${name}()`
    }
  }
  return `${name}(${renderedArgs})`
}

const renderJsonExpression = (
  expression: Expression.Any,
  ast: Record<string, unknown>,
  state: RenderState,
  dialect: SqlDialect
): string | undefined => {
  const kind = typeof ast.kind === "string" ? ast.kind : undefined
  if (!kind) {
    return undefined
  }

  const base = extractJsonBase(ast)
  const segments = extractJsonPathSegments(ast)
  const exact = segments.every((segment) => segment.kind === "key" || segment.kind === "index")
  const postgresExpressionKind = dialect.name === "postgres" && isJsonExpression(expression)
    ? renderPostgresJsonKind(expression)
    : undefined
  const postgresBaseKind = dialect.name === "postgres" && isJsonExpression(base)
    ? renderPostgresJsonKind(base)
    : undefined

  switch (kind) {
    case "jsonGet":
    case "jsonPath":
    case "jsonAccess":
    case "jsonTraverse":
    case "jsonGetText":
    case "jsonPathText":
    case "jsonAccessText":
    case "jsonTraverseText": {
      if (!isExpression(base) || segments.length === 0) {
        return undefined
      }
      const baseSql = renderExpression(base, state, dialect)
      const textMode = kind.endsWith("Text") || ast.text === true || ast.asText === true
      if (dialect.name === "postgres") {
        if (exact) {
          return segments.length === 1
            ? `(${baseSql} ${renderPostgresJsonAccessStep(segments[0]!, textMode, state, dialect)})`
            : `(${baseSql} ${textMode ? "#>>" : "#>"} ${renderPostgresJsonPathArray(segments, state, dialect)})`
        }
        const jsonPathLiteral = dialect.renderLiteral(renderJsonPathStringLiteral(segments), state)
        const queried = `jsonb_path_query_first(${renderPostgresJsonValue(base, state, dialect)}, ${jsonPathLiteral})`
        return textMode ? `(${queried} #>> '{}')` : queried
      }
      if (dialect.name === "mysql") {
        const extracted = `json_extract(${baseSql}, ${renderMySqlJsonPath(segments, state, dialect)})`
        return textMode ? `json_unquote(${extracted})` : extracted
      }
      return undefined
    }
    case "jsonHasKey":
    case "jsonKeyExists":
    case "jsonHasAnyKeys":
    case "jsonHasAllKeys": {
      if (!isExpression(base)) {
        return undefined
      }
      const baseSql = dialect.name === "postgres"
        ? renderPostgresJsonValue(base, state, dialect)
        : renderExpression(base, state, dialect)
      const keys = segments
      if (keys.length === 0) {
        return undefined
      }
      if (dialect.name === "postgres") {
        if (kind === "jsonHasAnyKeys") {
          return `(${baseSql} ?| array[${keys.map((key) => renderPostgresTextLiteral(String(key), state, dialect)).join(", ")}])`
        }
        if (kind === "jsonHasAllKeys") {
          return `(${baseSql} ?& array[${keys.map((key) => renderPostgresTextLiteral(String(key), state, dialect)).join(", ")}])`
        }
        return `(${baseSql} ? ${renderPostgresTextLiteral(String(keys[0]!), state, dialect)})`
      }
      if (dialect.name === "mysql") {
        const mode = kind === "jsonHasAllKeys" ? "all" : "one"
        const paths = keys.map((segment) => renderMySqlJsonPath([segment], state, dialect)).join(", ")
        return `json_contains_path(${baseSql}, ${dialect.renderLiteral(mode, state)}, ${paths})`
      }
      return undefined
    }
    case "jsonConcat":
    case "jsonMerge": {
      if (!isExpression(ast.left) || !isExpression(ast.right)) {
        return undefined
      }
      if (dialect.name === "postgres") {
        return `(${renderPostgresJsonValue(ast.left, state, dialect)} || ${renderPostgresJsonValue(ast.right, state, dialect)})`
      }
      if (dialect.name === "mysql") {
        return `json_merge_preserve(${renderExpression(ast.left, state, dialect)}, ${renderExpression(ast.right, state, dialect)})`
      }
      return undefined
    }
    case "jsonBuildObject": {
      const entries = Array.isArray((ast as { readonly entries?: readonly { readonly key: string; readonly value: Expression.Any }[] }).entries)
        ? (ast as { readonly entries: readonly { readonly key: string; readonly value: Expression.Any }[] }).entries
        : []
      const renderedEntries = entries.flatMap((entry) => [
        dialect.renderLiteral(entry.key, state),
        renderJsonInputExpression(entry.value, state, dialect)
      ])
      if (dialect.name === "postgres") {
        return `${postgresExpressionKind === "jsonb" ? "jsonb" : "json"}_build_object(${renderedEntries.join(", ")})`
      }
      if (dialect.name === "mysql") {
        return `json_object(${renderedEntries.join(", ")})`
      }
      return undefined
    }
    case "jsonBuildArray": {
      const values = Array.isArray((ast as { readonly values?: readonly Expression.Any[] }).values)
        ? (ast as { readonly values: readonly Expression.Any[] }).values
        : []
      const renderedValues = values.map((value) => renderJsonInputExpression(value, state, dialect)).join(", ")
      if (dialect.name === "postgres") {
        return `${postgresExpressionKind === "jsonb" ? "jsonb" : "json"}_build_array(${renderedValues})`
      }
      if (dialect.name === "mysql") {
        return `json_array(${renderedValues})`
      }
      return undefined
    }
    case "jsonToJson":
      if (!isExpression(base)) {
        return undefined
      }
      if (dialect.name === "postgres") {
        return `to_json(${renderJsonInputExpression(base, state, dialect)})`
      }
      if (dialect.name === "mysql") {
        return `cast(${renderExpression(base, state, dialect)} as json)`
      }
      return undefined
    case "jsonToJsonb":
      if (!isExpression(base)) {
        return undefined
      }
      if (dialect.name === "postgres") {
        return `to_jsonb(${renderJsonInputExpression(base, state, dialect)})`
      }
      if (dialect.name === "mysql") {
        return `cast(${renderExpression(base, state, dialect)} as json)`
      }
      return undefined
    case "jsonTypeOf":
      if (!isExpression(base)) {
        return undefined
      }
      if (dialect.name === "postgres") {
        const baseSql = renderExpression(base, state, dialect)
        return `${postgresBaseKind === "jsonb" ? "jsonb" : "json"}_typeof(${baseSql})`
      }
      if (dialect.name === "mysql") {
        return `json_type(${renderExpression(base, state, dialect)})`
      }
      return undefined
    case "jsonLength":
      if (!isExpression(base)) {
        return undefined
      }
      if (dialect.name === "postgres") {
        const baseSql = renderExpression(base, state, dialect)
        const typeOf = `${postgresBaseKind === "jsonb" ? "jsonb" : "json"}_typeof`
        const arrayLength = `${postgresBaseKind === "jsonb" ? "jsonb" : "json"}_array_length`
        const objectKeys = `${postgresBaseKind === "jsonb" ? "jsonb" : "json"}_object_keys`
        return `(case when ${typeOf}(${baseSql}) = 'array' then ${arrayLength}(${baseSql}) when ${typeOf}(${baseSql}) = 'object' then (select count(*)::int from ${objectKeys}(${baseSql})) else null end)`
      }
      if (dialect.name === "mysql") {
        return `json_length(${renderExpression(base, state, dialect)})`
      }
      return undefined
    case "jsonKeys":
      if (!isExpression(base)) {
        return undefined
      }
      if (dialect.name === "postgres") {
        const baseSql = renderExpression(base, state, dialect)
        const typeOf = `${postgresBaseKind === "jsonb" ? "jsonb" : "json"}_typeof`
        const objectKeys = `${postgresBaseKind === "jsonb" ? "jsonb" : "json"}_object_keys`
        return `(case when ${typeOf}(${baseSql}) = 'object' then to_json(array(select ${objectKeys}(${baseSql}))) else null end)`
      }
      if (dialect.name === "mysql") {
        return `json_keys(${renderExpression(base, state, dialect)})`
      }
      return undefined
    case "jsonStripNulls":
      if (!isExpression(base)) {
        return undefined
      }
      if (dialect.name === "postgres") {
        return `${postgresBaseKind === "jsonb" ? "jsonb" : "json"}_strip_nulls(${renderExpression(base, state, dialect)})`
      }
      unsupportedJsonFeature(dialect, "jsonStripNulls")
      return undefined
    case "jsonDelete":
    case "jsonDeletePath":
    case "jsonRemove": {
      if (!isExpression(base) || segments.length === 0) {
        return undefined
      }
      if (dialect.name === "postgres") {
        const baseSql = renderPostgresJsonValue(base, state, dialect)
        if (segments.length === 1 && (segments[0]!.kind === "key" || segments[0]!.kind === "index")) {
          const segment = segments[0]!
          return `(${baseSql} - ${segment.kind === "key"
            ? dialect.renderLiteral(segment.key, state)
            : dialect.renderLiteral(segment.index, state)})`
        }
        return `(${baseSql} #- ${renderPostgresJsonPathArray(segments, state, dialect)})`
      }
      if (dialect.name === "mysql") {
        return `json_remove(${renderExpression(base, state, dialect)}, ${segments.map((segment) =>
          renderMySqlJsonPath([segment], state, dialect)
        ).join(", ")})`
      }
      return undefined
    }
    case "jsonSet":
    case "jsonInsert": {
      if (!isExpression(base) || segments.length === 0) {
        return undefined
      }
      const nextValue = extractJsonValue(ast)
      if (!isExpression(nextValue)) {
        return undefined
      }
      const createMissing = ast.createMissing === true
      const insertAfter = ast.insertAfter === true
      if (dialect.name === "postgres") {
        const functionName = kind === "jsonInsert" ? "jsonb_insert" : "jsonb_set"
        const extra =
          kind === "jsonInsert"
            ? `, ${insertAfter ? "true" : "false"}`
            : `, ${createMissing ? "true" : "false"}`
        return `${functionName}(${renderPostgresJsonValue(base, state, dialect)}, ${renderPostgresJsonPathArray(segments, state, dialect)}, ${renderPostgresJsonValue(nextValue, state, dialect)}${extra})`
      }
      if (dialect.name === "mysql") {
        const functionName = kind === "jsonInsert" ? "json_insert" : "json_set"
        return `${functionName}(${renderExpression(base, state, dialect)}, ${renderMySqlJsonPath(segments, state, dialect)}, ${renderExpression(nextValue, state, dialect)})`
      }
      return undefined
    }
    case "jsonPathExists": {
      if (!isExpression(base)) {
        return undefined
      }
      const path = ast.path ?? ast.query ?? ast.right
      if (path === undefined) {
        return undefined
      }
      if (dialect.name === "postgres") {
        return `(${renderPostgresJsonValue(base, state, dialect)} @? ${renderJsonOpaquePath(path, state, dialect)})`
      }
      if (dialect.name === "mysql") {
        return `json_contains_path(${renderExpression(base, state, dialect)}, ${dialect.renderLiteral("one", state)}, ${renderJsonOpaquePath(path, state, dialect)})`
      }
      return undefined
    }
    case "jsonPathMatch": {
      if (!isExpression(base)) {
        return undefined
      }
      const path = ast.path ?? ast.query ?? ast.right
      if (path === undefined) {
        return undefined
      }
      if (dialect.name === "postgres") {
        return `(${renderPostgresJsonValue(base, state, dialect)} @@ ${renderJsonOpaquePath(path, state, dialect)})`
      }
      unsupportedJsonFeature(dialect, "jsonPathMatch")
    }
  }

  return undefined
}

export interface RenderedQueryAst {
  readonly sql: string
  readonly projections: readonly Projection[]
}

const selectionProjections = (selection: Record<string, unknown>): readonly Projection[] =>
  flattenSelection(selection).map(({ path, alias }) => ({
    path,
    alias
  }))

const renderMutationAssignment = (
  entry: QueryAst.AssignmentClause,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const column = entry.tableName && dialect.name === "mysql"
    ? `${dialect.quoteIdentifier(entry.tableName)}.${dialect.quoteIdentifier(entry.columnName)}`
    : dialect.quoteIdentifier(entry.columnName)
  return `${column} = ${renderExpression(entry.value, state, dialect)}`
}

const renderJoinSourcesForMutation = (
  joins: readonly QueryAst.JoinClause[],
  state: RenderState,
  dialect: SqlDialect
): string => joins.map((join) =>
  renderSourceReference(join.source, join.tableName, join.baseTableName, state, dialect)
).join(", ")

const renderFromSources = (
  sources: readonly QueryAst.FromClause[],
  state: RenderState,
  dialect: SqlDialect
): string => sources.map((source) =>
  renderSourceReference(source.source, source.tableName, source.baseTableName, state, dialect)
).join(", ")

const renderJoinPredicatesForMutation = (
  joins: readonly QueryAst.JoinClause[],
  state: RenderState,
  dialect: SqlDialect
): readonly string[] =>
  joins.flatMap((join) =>
    join.kind === "cross" || !join.on
      ? []
      : [renderExpression(join.on, state, dialect)]
  )

const renderDeleteTargets = (
  targets: readonly QueryAst.FromClause[],
  dialect: SqlDialect
): string => targets.map((target) => dialect.quoteIdentifier(target.tableName)).join(", ")

const assertMergeActionKind = (
  kind: unknown,
  allowed: readonly string[]
): void => {
  if (typeof kind !== "string" || !allowed.includes(kind)) {
    throw new Error("Unsupported merge action kind")
  }
}

const renderMysqlMutationLock = (
  lock: QueryAst.LockClause | undefined,
  statement: "update" | "delete"
): string => {
  if (!lock) {
    return ""
  }
  switch (lock.mode) {
    case "lowPriority":
      return " low_priority"
    case "ignore":
      return " ignore"
    case "quick":
      return statement === "delete" ? " quick" : ""
    default:
      return ""
  }
}

const renderTransactionClause = (
  clause: QueryAst.TransactionClause,
  dialect: SqlDialect
): string => {
  switch (clause.kind) {
    case "transaction": {
      const modes: string[] = []
      const isolationLevel = renderTransactionIsolationLevel(clause.isolationLevel)
      if (isolationLevel) {
        modes.push(isolationLevel)
      }
      if (clause.readOnly === true) {
        modes.push("read only")
      }
      return modes.length > 0
        ? `start transaction ${modes.join(", ")}`
        : "start transaction"
    }
    case "commit":
      return "commit"
    case "rollback":
      return "rollback"
    case "savepoint":
      return `savepoint ${dialect.quoteIdentifier(clause.name)}`
    case "rollbackTo":
      return `rollback to savepoint ${dialect.quoteIdentifier(clause.name)}`
    case "releaseSavepoint":
      return `release savepoint ${dialect.quoteIdentifier(clause.name)}`
  }
  throw new Error("Unsupported transaction statement kind")
}

const renderSelectionList = (
  selection: Record<string, unknown>,
  state: RenderState,
  dialect: SqlDialect,
  validateAggregation: boolean
): RenderedQueryAst => {
  if (validateAggregation) {
    validateAggregationSelection(selection as SelectionValue, [])
  }
  const flattened = flattenSelection(selection)
  if (dialect.name === "mysql" && flattened.length === 0) {
    throw new Error("mysql select statements require at least one selected expression")
  }
  const projections = selectionProjections(selection)
  const sql = flattened.map(({ expression, alias }) =>
    `${renderSelectSql(renderExpression(expression, state, dialect), expressionDriverContext(expression, state, dialect))} as ${dialect.quoteIdentifier(alias)}`).join(", ")
  return {
    sql,
    projections
  }
}

const nestedRenderState = (state: RenderState): RenderState => ({
  params: state.params,
  valueMappings: state.valueMappings,
  ctes: [],
  cteNames: new Set(state.cteNames),
  cteSources: new Map(state.cteSources)
})

const assertMatchingSetProjections = (
  left: readonly Projection[],
  right: readonly Projection[]
): void => {
  const leftKeys = left.map((projection) => JSON.stringify(projection.path))
  const rightKeys = right.map((projection) => JSON.stringify(projection.path))
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) {
    throw new Error("set operator operands must have matching result rows")
  }
}

const assertNoGroupedMutationClauses = (
  ast: Pick<QueryAst.Ast, "groupBy" | "having">,
  statement: string
): void => {
  if (ast.groupBy.length > 0) {
    throw new Error(`groupBy(...) is not supported for ${statement} statements`)
  }
  if (ast.having.length > 0) {
    throw new Error(`having(...) is not supported for ${statement} statements`)
  }
}

const assertNoInsertQueryClauses = (
  ast: Pick<QueryAst.Ast, "where" | "joins" | "orderBy" | "limit" | "offset" | "lock">
): void => {
  if (ast.where.length > 0) {
    throw new Error("where(...) is not supported for insert statements")
  }
  if (ast.joins.length > 0) {
    throw new Error("join(...) is not supported for insert statements")
  }
  if (ast.orderBy.length > 0) {
    throw new Error("orderBy(...) is not supported for insert statements")
  }
  if (ast.limit) {
    throw new Error("limit(...) is not supported for insert statements")
  }
  if (ast.offset) {
    throw new Error("offset(...) is not supported for insert statements")
  }
  if (ast.lock) {
    throw new Error("lock(...) is not supported for insert statements")
  }
}

const assertNoStatementQueryClauses = (
  ast: QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>,
  statement: string,
  options: { readonly allowSelection?: boolean } = {}
): void => {
  if (ast.distinct) {
    throw new Error(`distinct(...) is not supported for ${statement} statements`)
  }
  if (ast.where.length > 0) {
    throw new Error(`where(...) is not supported for ${statement} statements`)
  }
  if ((ast.fromSources?.length ?? 0) > 0 || ast.from) {
    throw new Error(`from(...) is not supported for ${statement} statements`)
  }
  if (ast.joins.length > 0) {
    throw new Error(`join(...) is not supported for ${statement} statements`)
  }
  if (ast.groupBy.length > 0) {
    throw new Error(`groupBy(...) is not supported for ${statement} statements`)
  }
  if (ast.having.length > 0) {
    throw new Error(`having(...) is not supported for ${statement} statements`)
  }
  if (ast.orderBy.length > 0) {
    throw new Error(`orderBy(...) is not supported for ${statement} statements`)
  }
  if (ast.limit) {
    throw new Error(`limit(...) is not supported for ${statement} statements`)
  }
  if (ast.offset) {
    throw new Error(`offset(...) is not supported for ${statement} statements`)
  }
  if (ast.lock) {
    throw new Error(`lock(...) is not supported for ${statement} statements`)
  }
  if (options.allowSelection !== true && Object.keys(ast.select).length > 0) {
    throw new Error(`returning(...) is not supported for ${statement} statements`)
  }
}

export const renderQueryAst = (
  ast: QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>,
  state: RenderState,
  dialect: SqlDialect,
  options: { readonly emitCtes?: boolean } = {}
): RenderedQueryAst => {
  let sql = ""
  let projections: readonly Projection[] = []

  switch (ast.kind) {
    case "select": {
      validateAggregationSelection(ast.select as SelectionValue, ast.groupBy)
      const rendered = renderSelectionList(ast.select as Record<string, unknown>, state, dialect, false)
      projections = rendered.projections
      const selectList = rendered.sql.length > 0 ? ` ${rendered.sql}` : ""
      const clauses = [
        ast.distinctOn && ast.distinctOn.length > 0
          ? `select distinct on (${ast.distinctOn.map((value) => renderExpression(value, state, dialect)).join(", ")})${selectList}`
          : `select${ast.distinct ? " distinct" : ""}${selectList}`
      ]
      if (ast.from) {
        clauses.push(`from ${renderSourceReference(ast.from.source, ast.from.tableName, ast.from.baseTableName, state, dialect)}`)
      }
      for (const join of ast.joins) {
        const source = renderSourceReference(join.source, join.tableName, join.baseTableName, state, dialect)
        clauses.push(
          join.kind === "cross"
            ? `cross join ${source}`
            : `${join.kind} join ${source} on ${renderExpression(join.on!, state, dialect)}`
        )
      }
      if (ast.where.length > 0) {
        clauses.push(`where ${ast.where.map((entry: QueryAst.WhereClause) => renderExpression(entry.predicate, state, dialect)).join(" and ")}`)
      }
      if (ast.groupBy.length > 0) {
        clauses.push(`group by ${ast.groupBy.map((value: QueryAst.Ast["groupBy"][number]) => renderExpression(value, state, dialect)).join(", ")}`)
      }
      if (ast.having.length > 0) {
        clauses.push(`having ${ast.having.map((entry: QueryAst.HavingClause) => renderExpression(entry.predicate, state, dialect)).join(" and ")}`)
      }
      if (ast.orderBy.length > 0) {
        clauses.push(`order by ${ast.orderBy.map((entry: QueryAst.OrderByClause) => `${renderExpression(entry.value, state, dialect)} ${entry.direction}`).join(", ")}`)
      }
      if (ast.limit) {
        clauses.push(`limit ${renderExpression(ast.limit, state, dialect)}`)
      }
      if (ast.offset) {
        clauses.push(`offset ${renderExpression(ast.offset, state, dialect)}`)
      }
      if (ast.lock) {
        if (ast.lock.nowait && ast.lock.skipLocked) {
          throw new Error("lock(...) cannot specify both nowait and skipLocked")
        }
        clauses.push(
          `${renderSelectLockMode(ast.lock.mode)}${ast.lock.nowait ? " nowait" : ""}${ast.lock.skipLocked ? " skip locked" : ""}`
        )
      }
      sql = clauses.join(" ")
      break
    }
    case "set": {
      const setAst = ast as QueryAst.Ast<Record<string, unknown>, any, "set">
      assertNoStatementQueryClauses(setAst, "set", { allowSelection: true })
      const base = renderQueryAst(
        Query.getAst(setAst.setBase as Query.Plan.Any) as QueryAst.Ast<
          Record<string, unknown>,
          any,
          QueryAst.QueryStatement
        >,
        state,
        dialect
      )
      projections = selectionProjections(setAst.select as Record<string, unknown>)
      assertMatchingSetProjections(projections, base.projections)
      sql = [
        `(${base.sql})`,
        ...(setAst.setOperations ?? []).map((entry) => {
          const rendered = renderQueryAst(
            Query.getAst(entry.query as Query.Plan.Any) as QueryAst.Ast<
              Record<string, unknown>,
              any,
              QueryAst.QueryStatement
            >,
            state,
            dialect
          )
          assertMatchingSetProjections(projections, rendered.projections)
          return `${entry.kind}${entry.all ? " all" : ""} (${rendered.sql})`
        })
      ].join(" ")
      break
    }
    case "insert": {
      const insertAst = ast as QueryAst.Ast<Record<string, unknown>, any, "insert">
      if (insertAst.distinct) {
        throw new Error("distinct(...) is not supported for insert statements")
      }
      assertNoGroupedMutationClauses(insertAst, "insert")
      assertNoInsertQueryClauses(insertAst)
      const targetSource = insertAst.into!
      const target = renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)
      const insertSource = expectInsertSourceKind(insertAst.insertSource)
      const conflict = expectConflictClause(insertAst.conflict)
      sql = `insert into ${target}`
      if (insertSource?.kind === "values") {
        const columns = insertSource.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")
        const rows = insertSource.rows.map((row) =>
          `(${row.values.map((entry) => renderExpression(entry.value, state, dialect)).join(", ")})`
        ).join(", ")
        sql += ` (${columns}) values ${rows}`
      } else if (insertSource?.kind === "query") {
        const columns = insertSource.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")
        const renderedQuery = renderQueryAst(
          Query.getAst(insertSource.query as Query.Plan.Any) as QueryAst.Ast<
            Record<string, unknown>,
            any,
            QueryAst.QueryStatement
          >,
          state,
          dialect
        )
        sql += ` (${columns}) ${renderedQuery.sql}`
      } else if (insertSource?.kind === "unnest") {
        const columns = insertSource.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")
        if (dialect.name === "postgres") {
          const table = targetSource.source as Table.AnyTable
          const fields = table[Table.TypeId].fields
          const rendered = insertSource.values.map((entry) =>
            `cast(${dialect.renderLiteral(encodeArrayValues(entry.values, fields[entry.columnName]!, state, dialect), state)} as ${renderCastType(dialect, fields[entry.columnName]!.metadata.dbType)}[])`
          ).join(", ")
          sql += ` (${columns}) select * from unnest(${rendered})`
        } else {
          const rowCount = insertSource.values[0]?.values.length ?? 0
          const rows = Array.from({ length: rowCount }, (_, index) =>
            `(${insertSource.values.map((entry) =>
              dialect.renderLiteral(
                entry.values[index],
                state,
                (targetSource.source as Table.AnyTable)[Table.TypeId].fields[entry.columnName]![Expression.TypeId]
              )
            ).join(", ")})`
          ).join(", ")
          sql += ` (${columns}) values ${rows}`
        }
      } else {
        const columns = (insertAst.values ?? []).map((entry) => dialect.quoteIdentifier(entry.columnName)).join(", ")
        const values = (insertAst.values ?? []).map((entry) => renderExpression(entry.value, state, dialect)).join(", ")
        if ((insertAst.values ?? []).length > 0) {
          sql += ` (${columns}) values (${values})`
        } else {
          sql += " default values"
        }
      }
      if (conflict) {
        if (conflict.action === "doNothing" && conflict.where) {
          throw new Error("conflict action predicates require update assignments")
        }
        const updateValues = (conflict.values ?? []).map((entry) =>
          `${dialect.quoteIdentifier(entry.columnName)} = ${renderExpression(entry.value, state, dialect)}`
        ).join(", ")
        if (dialect.name === "postgres") {
          const targetSql = conflict.target?.kind === "constraint"
            ? ` on conflict on constraint ${dialect.quoteIdentifier(conflict.target.name)}`
            : conflict.target?.kind === "columns"
              ? ` on conflict (${conflict.target.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")})${conflict.target.where ? ` where ${renderExpression(conflict.target.where, state, dialect)}` : ""}`
              : " on conflict"
          sql += targetSql
          sql += conflict.action === "doNothing"
            ? " do nothing"
            : ` do update set ${updateValues}${conflict.where ? ` where ${renderExpression(conflict.where, state, dialect)}` : ""}`
        } else if (conflict.action === "doNothing") {
          sql = sql.replace(/^insert/, "insert ignore")
        } else {
          sql += ` on duplicate key update ${updateValues}`
        }
      }
      const returning = renderSelectionList(insertAst.select as Record<string, unknown>, state, dialect, false)
      projections = returning.projections
      if (returning.sql.length > 0) {
        sql += ` returning ${returning.sql}`
      }
      break
    }
    case "update": {
      const updateAst = ast as QueryAst.Ast<Record<string, unknown>, any, "update">
      if (updateAst.distinct) {
        throw new Error("distinct(...) is not supported for update statements")
      }
      assertNoGroupedMutationClauses(updateAst, "update")
      if (updateAst.orderBy.length > 0) {
        throw new Error("orderBy(...) is not supported for update statements")
      }
      if (updateAst.limit) {
        throw new Error("limit(...) is not supported for update statements")
      }
      if (updateAst.offset) {
        throw new Error("offset(...) is not supported for update statements")
      }
      if (updateAst.lock) {
        throw new Error("lock(...) is not supported for update statements")
      }
      const targetSource = updateAst.target!
      const target = renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)
      const targets = updateAst.targets ?? [targetSource]
      const fromSources = updateAst.fromSources ?? []
      if ((updateAst.set ?? []).length === 0) {
        throw new Error("update statements require at least one assignment")
      }
      const assignments = updateAst.set!.map((entry) =>
        renderMutationAssignment(entry, state, dialect)).join(", ")
      if (dialect.name === "mysql") {
        const modifiers = renderMysqlMutationLock(updateAst.lock, "update")
        const extraSources = renderFromSources(fromSources, state, dialect)
        const joinSources = updateAst.joins.map((join) =>
          join.kind === "cross"
            ? `cross join ${renderSourceReference(join.source, join.tableName, join.baseTableName, state, dialect)}`
            : `${join.kind} join ${renderSourceReference(join.source, join.tableName, join.baseTableName, state, dialect)} on ${renderExpression(join.on!, state, dialect)}`
        ).join(" ")
        const targetList = [
          ...targets.map((entry) =>
            renderSourceReference(entry.source, entry.tableName, entry.baseTableName, state, dialect)
          ),
          ...(extraSources.length > 0 ? [extraSources] : [])
        ].join(", ")
        sql = `update${modifiers} ${targetList}${joinSources.length > 0 ? ` ${joinSources}` : ""} set ${assignments}`
      } else {
        sql = `update ${target} set ${assignments}`
        const mutationSources = [
          ...(fromSources.length > 0 ? [renderFromSources(fromSources, state, dialect)] : []),
          ...(updateAst.joins.length > 0 ? [renderJoinSourcesForMutation(updateAst.joins, state, dialect)] : [])
        ].filter((part) => part.length > 0)
        if (mutationSources.length > 0) {
          sql += ` from ${mutationSources.join(", ")}`
        }
      }
      const whereParts = [
        ...(dialect.name === "postgres" ? renderJoinPredicatesForMutation(updateAst.joins, state, dialect) : []),
        ...updateAst.where.map((entry: QueryAst.WhereClause) => renderExpression(entry.predicate, state, dialect))
      ]
      if (whereParts.length > 0) {
        sql += ` where ${whereParts.join(" and ")}`
      }
      if (dialect.name === "mysql" && updateAst.orderBy.length > 0) {
        sql += ` order by ${updateAst.orderBy.map((entry: QueryAst.OrderByClause) => `${renderExpression(entry.value, state, dialect)} ${entry.direction}`).join(", ")}`
      }
      if (dialect.name === "mysql" && updateAst.limit) {
        sql += ` limit ${renderExpression(updateAst.limit, state, dialect)}`
      }
      const returning = renderSelectionList(updateAst.select as Record<string, unknown>, state, dialect, false)
      projections = returning.projections
      if (returning.sql.length > 0) {
        sql += ` returning ${returning.sql}`
      }
      break
    }
    case "delete": {
      const deleteAst = ast as QueryAst.Ast<Record<string, unknown>, any, "delete">
      if (deleteAst.distinct) {
        throw new Error("distinct(...) is not supported for delete statements")
      }
      assertNoGroupedMutationClauses(deleteAst, "delete")
      if (deleteAst.orderBy.length > 0 && dialect.name === "postgres") {
        throw new Error("orderBy(...) is not supported for delete statements")
      }
      if (deleteAst.limit && dialect.name === "postgres") {
        throw new Error("limit(...) is not supported for delete statements")
      }
      if (deleteAst.offset) {
        throw new Error("offset(...) is not supported for delete statements")
      }
      if (deleteAst.lock) {
        throw new Error("lock(...) is not supported for delete statements")
      }
      const targetSource = deleteAst.target!
      const target = renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)
      const targets = deleteAst.targets ?? [targetSource]
      if (dialect.name === "mysql") {
        const modifiers = renderMysqlMutationLock(deleteAst.lock, "delete")
        const hasJoinedSources = deleteAst.joins.length > 0 || targets.length > 1
        const targetList = renderDeleteTargets(targets, dialect)
        const fromSources = targets.map((entry) =>
          renderSourceReference(entry.source, entry.tableName, entry.baseTableName, state, dialect)
        ).join(", ")
        const joinSources = deleteAst.joins.map((join) =>
          join.kind === "cross"
            ? `cross join ${renderSourceReference(join.source, join.tableName, join.baseTableName, state, dialect)}`
            : `${join.kind} join ${renderSourceReference(join.source, join.tableName, join.baseTableName, state, dialect)} on ${renderExpression(join.on!, state, dialect)}`
        ).join(" ")
        sql = hasJoinedSources
          ? `delete${modifiers} ${targetList} from ${fromSources}${joinSources.length > 0 ? ` ${joinSources}` : ""}`
          : `delete${modifiers} from ${fromSources}`
      } else {
        sql = `delete from ${target}`
        if (deleteAst.joins.length > 0) {
          sql += ` using ${renderJoinSourcesForMutation(deleteAst.joins, state, dialect)}`
        }
      }
      const whereParts = [
        ...(dialect.name === "postgres" ? renderJoinPredicatesForMutation(deleteAst.joins, state, dialect) : []),
        ...deleteAst.where.map((entry: QueryAst.WhereClause) => renderExpression(entry.predicate, state, dialect))
      ]
      if (whereParts.length > 0) {
        sql += ` where ${whereParts.join(" and ")}`
      }
      if (dialect.name === "mysql" && deleteAst.orderBy.length > 0) {
        sql += ` order by ${deleteAst.orderBy.map((entry: QueryAst.OrderByClause) => `${renderExpression(entry.value, state, dialect)} ${entry.direction}`).join(", ")}`
      }
      if (dialect.name === "mysql" && deleteAst.limit) {
        sql += ` limit ${renderExpression(deleteAst.limit, state, dialect)}`
      }
      const returning = renderSelectionList(deleteAst.select as Record<string, unknown>, state, dialect, false)
      projections = returning.projections
      if (returning.sql.length > 0) {
        sql += ` returning ${returning.sql}`
      }
      break
    }
    case "truncate": {
      const truncateAst = ast as QueryAst.Ast<Record<string, unknown>, any, "truncate">
      assertNoStatementQueryClauses(truncateAst, "truncate")
      const truncate = expectTruncateClause(truncateAst.truncate)
      const targetSource = truncateAst.target!
      sql = `truncate table ${renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)}`
      if (truncate.restartIdentity) {
        sql += " restart identity"
      }
      if (truncate.cascade) {
        sql += " cascade"
      }
      break
    }
    case "merge": {
      if (dialect.name !== "postgres") {
        throw new Error(`Unsupported merge statement for ${dialect.name}`)
      }
      const mergeAst = ast as QueryAst.Ast<Record<string, unknown>, any, "merge">
      const targetSource = mergeAst.target!
      const usingSource = mergeAst.using!
      const merge = mergeAst.merge!
      if (merge.kind !== "merge") {
        throw new Error("Unsupported merge statement kind")
      }
      if (Object.keys(mergeAst.select as Record<string, unknown>).length > 0) {
        throw new Error("returning(...) is not supported for merge statements")
      }
      if (!merge.whenMatched && !merge.whenNotMatched) {
        throw new Error("merge statements require at least one action")
      }
      sql = `merge into ${renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)} using ${renderSourceReference(usingSource.source, usingSource.tableName, usingSource.baseTableName, state, dialect)} on ${renderExpression(merge.on, state, dialect)}`
      if (merge.whenMatched) {
        assertMergeActionKind(merge.whenMatched.kind, ["update", "delete"])
        sql += " when matched"
        if (merge.whenMatched.predicate) {
          sql += ` and ${renderExpression(merge.whenMatched.predicate, state, dialect)}`
        }
        if (merge.whenMatched.kind === "delete") {
          sql += " then delete"
        } else {
          if (merge.whenMatched.values.length === 0) {
            throw new Error("merge update actions require at least one assignment")
          }
          sql += ` then update set ${merge.whenMatched.values.map((entry) =>
            `${dialect.quoteIdentifier(entry.columnName)} = ${renderExpression(entry.value, state, dialect)}`
          ).join(", ")}`
        }
      }
      if (merge.whenNotMatched) {
        assertMergeActionKind(merge.whenNotMatched.kind, ["insert"])
        sql += " when not matched"
        if (merge.whenNotMatched.predicate) {
          sql += ` and ${renderExpression(merge.whenNotMatched.predicate, state, dialect)}`
        }
        if (merge.whenNotMatched.values.length === 0) {
          throw new Error("merge insert actions require at least one value")
        }
        sql += ` then insert (${merge.whenNotMatched.values.map((entry) => dialect.quoteIdentifier(entry.columnName)).join(", ")}) values (${merge.whenNotMatched.values.map((entry) => renderExpression(entry.value, state, dialect)).join(", ")})`
      }
      break
    }
    case "transaction":
    case "commit":
    case "rollback":
    case "savepoint":
    case "rollbackTo":
    case "releaseSavepoint": {
      assertNoStatementQueryClauses(ast, ast.kind)
      sql = renderTransactionClause(ast.transaction!, dialect)
      break
    }
    case "createTable": {
      const createTableAst = ast as QueryAst.Ast<Record<string, unknown>, any, "createTable">
      assertNoStatementQueryClauses(createTableAst, "createTable")
      const ddl = expectDdlClauseKind(createTableAst.ddl, "createTable")
      sql = renderCreateTableSql(createTableAst.target!, state, dialect, ddl.ifNotExists)
      break
    }
    case "dropTable": {
      const dropTableAst = ast as QueryAst.Ast<Record<string, unknown>, any, "dropTable">
      assertNoStatementQueryClauses(dropTableAst, "dropTable")
      const ddl = expectDdlClauseKind(dropTableAst.ddl, "dropTable")
      sql = `drop table${ddl.ifExists ? " if exists" : ""} ${renderSourceReference(dropTableAst.target!.source, dropTableAst.target!.tableName, dropTableAst.target!.baseTableName, state, dialect)}`
      break
    }
    case "createIndex": {
      const createIndexAst = ast as QueryAst.Ast<Record<string, unknown>, any, "createIndex">
      assertNoStatementQueryClauses(createIndexAst, "createIndex")
      sql = renderCreateIndexSql(
        createIndexAst.target!,
        expectDdlClauseKind(createIndexAst.ddl, "createIndex"),
        state,
        dialect
      )
      break
    }
    case "dropIndex": {
      const dropIndexAst = ast as QueryAst.Ast<Record<string, unknown>, any, "dropIndex">
      assertNoStatementQueryClauses(dropIndexAst, "dropIndex")
      sql = renderDropIndexSql(
        dropIndexAst.target!,
        expectDdlClauseKind(dropIndexAst.ddl, "dropIndex"),
        state,
        dialect
      )
      break
    }
    default:
      throw new Error("Unsupported query statement kind")
  }

  if (state.ctes.length === 0 || options.emitCtes === false) {
    return {
      sql,
      projections
    }
  }
  return {
    sql: `with${state.ctes.some((entry) => entry.recursive) ? " recursive" : ""} ${state.ctes.map((entry) => `${dialect.quoteIdentifier(entry.name)} as (${entry.sql})`).join(", ")} ${sql}`,
    projections
  }
}

const renderSourceReference = (
  source: unknown,
  tableName: string,
  baseTableName: string,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const renderSelectRows = (
    rows: readonly Record<string, Expression.Any>[],
    columnNames: readonly string[]
  ): string => {
    const renderedRows = rows.map((row) =>
      `select ${columnNames.map((columnName) =>
        `${renderExpression(row[columnName]!, state, dialect)} as ${dialect.quoteIdentifier(columnName)}`
      ).join(", ")}`
    )
    return `(${renderedRows.join(" union all ")}) as ${dialect.quoteIdentifier(tableName)}(${columnNames.map((columnName) => dialect.quoteIdentifier(columnName)).join(", ")})`
  }

  const renderUnnestRows = (
    arrays: Readonly<Record<string, readonly Expression.Any[]>>,
    columnNames: readonly string[]
  ): string => {
    const rowCount = arrays[columnNames[0]!]!.length
    const rows = Array.from({ length: rowCount }, (_, index) =>
      Object.fromEntries(columnNames.map((columnName) => [columnName, arrays[columnName]![index]!] as const)) as Record<string, Expression.Any>
    )
    return renderSelectRows(rows, columnNames)
  }

  if (typeof source === "object" && source !== null && "kind" in source && (source as { readonly kind?: string }).kind === "cte") {
    const cte = source as unknown as {
      readonly name: string
      readonly plan: Query.Plan.Any
      readonly recursive?: boolean
    }
    const registeredCteSource = state.cteSources.get(cte.name)
    if (registeredCteSource !== undefined && registeredCteSource !== cte.plan) {
      throw new Error(`common table expression name is already registered with a different plan: ${cte.name}`)
    }
    if (!state.cteNames.has(cte.name)) {
      state.cteNames.add(cte.name)
      state.cteSources.set(cte.name, cte.plan)
      const rendered = renderQueryAst(
        Query.getAst(cte.plan) as QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>,
        state,
        dialect,
        { emitCtes: false }
      )
      state.ctes.push({
        name: cte.name,
        sql: rendered.sql,
        recursive: cte.recursive
      })
    }
    return dialect.quoteIdentifier(cte.name)
  }
  if (typeof source === "object" && source !== null && "kind" in source && (source as { readonly kind?: string }).kind === "derived") {
    const derived = source as unknown as {
      readonly name: string
      readonly plan: Query.Plan.Any
    }
    if (!state.cteNames.has(derived.name)) {
      // derived tables are inlined, so no CTE registration is needed
    }
    return `(${renderQueryAst(Query.getAst(derived.plan) as QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>, nestedRenderState(state), dialect).sql}) as ${dialect.quoteIdentifier(derived.name)}`
  }
  if (typeof source === "object" && source !== null && "kind" in source && (source as { readonly kind?: string }).kind === "lateral") {
    const lateral = source as unknown as {
      readonly name: string
      readonly plan: Query.Plan.Any
    }
    return `lateral (${renderQueryAst(Query.getAst(lateral.plan) as QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>, nestedRenderState(state), dialect).sql}) as ${dialect.quoteIdentifier(lateral.name)}`
  }
  if (typeof source === "object" && source !== null && (source as { readonly kind?: string }).kind === "values") {
    const values = source as unknown as {
      readonly columns: Record<string, Expression.Any>
      readonly rows: readonly Record<string, Expression.Any>[]
    }
    return renderSelectRows(values.rows, Object.keys(values.columns))
  }
  if (typeof source === "object" && source !== null && (source as { readonly kind?: string }).kind === "unnest") {
    const unnest = source as unknown as {
      readonly columns: Record<string, Expression.Any>
      readonly arrays: Readonly<Record<string, readonly Expression.Any[]>>
    }
    return renderUnnestRows(unnest.arrays, Object.keys(unnest.columns))
  }
  if (typeof source === "object" && source !== null && (source as { readonly kind?: string }).kind === "tableFunction") {
    const tableFunction = source as unknown as {
      readonly name: string
      readonly columns: Record<string, Expression.Any>
      readonly functionName: string
      readonly args: readonly Expression.Any[]
    }
    if (dialect.name !== "postgres") {
      throw new Error("Unsupported table function source for SQL rendering")
    }
    const columnNames = Object.keys(tableFunction.columns)
    return `${tableFunction.functionName}(${tableFunction.args.map((arg) => renderExpression(arg, state, dialect)).join(", ")}) as ${dialect.quoteIdentifier(tableFunction.name)}(${columnNames.map((columnName) => dialect.quoteIdentifier(columnName)).join(", ")})`
  }
  const schemaName = typeof source === "object" && source !== null && Table.TypeId in source
    ? (source as Table.AnyTable)[Table.TypeId].schemaName
    : undefined
  return dialect.renderTableReference(tableName, baseTableName, schemaName)
}

const renderSubqueryExpressionPlan = (
  plan: Query.Plan.Any,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const statement = Query.getQueryState(plan).statement
  if (statement !== "select" && statement !== "set") {
    throw new Error("subquery expressions only accept select-like query plans")
  }
  return renderQueryAst(
    Query.getAst(plan) as QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>,
    state,
    dialect
  ).sql
}

/**
 * Renders a scalar expression AST into SQL text.
 *
 * This is parameterized by a runtime dialect so the same expression walker can
 * be reused across dialect-specific renderers while still delegating quoting
 * and literal serialization to the concrete dialect implementation.
 */
export const renderExpression = (
  expression: Expression.Any,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const rawAst = (expression as Expression.Any & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.Any
  })[ExpressionAst.TypeId] as ExpressionAst.Any | Record<string, unknown>
  const jsonSql = renderJsonExpression(expression, rawAst as Record<string, unknown>, state, dialect)
  if (jsonSql !== undefined) {
    return jsonSql
  }
  const ast = rawAst as ExpressionAst.Any
  const renderComparisonOperator = (operator: "eq" | "neq" | "lt" | "lte" | "gt" | "gte"): "=" | "<>" | "<" | "<=" | ">" | ">=" =>
    operator === "eq"
      ? "="
      : operator === "neq"
        ? "<>"
        : operator === "lt"
          ? "<"
          : operator === "lte"
            ? "<="
            : operator === "gt"
              ? ">"
              : ">="
    switch (ast.kind) {
    case "column":
      return state.rowLocalColumns || ast.tableName.length === 0
        ? dialect.quoteIdentifier(ast.columnName)
        : `${dialect.quoteIdentifier(ast.tableName)}.${dialect.quoteIdentifier(ast.columnName)}`
    case "literal":
      if (typeof ast.value === "number" && !Number.isFinite(ast.value)) {
        throw new Error("Expected a finite numeric value")
      }
      return dialect.renderLiteral(ast.value, state, expression[Expression.TypeId])
    case "excluded":
      return dialect.name === "mysql"
        ? `values(${dialect.quoteIdentifier(ast.columnName)})`
        : `excluded.${dialect.quoteIdentifier(ast.columnName)}`
    case "cast":
      return `cast(${renderExpression(ast.value, state, dialect)} as ${renderCastType(dialect, ast.target)})`
    case "collate":
      return `(${renderExpression(ast.value, state, dialect)} collate ${ast.collation.map((segment) => dialect.quoteIdentifier(segment)).join(".")})`
    case "function":
      return renderFunctionCall(ast.name, Array.isArray(ast.args) ? ast.args : [], state, dialect)
    case "eq":
      return `(${renderExpression(ast.left, state, dialect)} = ${renderExpression(ast.right, state, dialect)})`
    case "neq":
      return `(${renderExpression(ast.left, state, dialect)} <> ${renderExpression(ast.right, state, dialect)})`
    case "lt":
      return `(${renderExpression(ast.left, state, dialect)} < ${renderExpression(ast.right, state, dialect)})`
    case "lte":
      return `(${renderExpression(ast.left, state, dialect)} <= ${renderExpression(ast.right, state, dialect)})`
    case "gt":
      return `(${renderExpression(ast.left, state, dialect)} > ${renderExpression(ast.right, state, dialect)})`
    case "gte":
      return `(${renderExpression(ast.left, state, dialect)} >= ${renderExpression(ast.right, state, dialect)})`
    case "like":
      return `(${renderExpression(ast.left, state, dialect)} like ${renderExpression(ast.right, state, dialect)})`
    case "ilike":
      return dialect.name === "postgres"
        ? `(${renderExpression(ast.left, state, dialect)} ilike ${renderExpression(ast.right, state, dialect)})`
        : `(lower(${renderExpression(ast.left, state, dialect)}) like lower(${renderExpression(ast.right, state, dialect)}))`
    case "regexMatch":
      return dialect.name === "postgres"
        ? `(${renderExpression(ast.left, state, dialect)} ~ ${renderExpression(ast.right, state, dialect)})`
        : `(${renderExpression(ast.left, state, dialect)} regexp ${renderExpression(ast.right, state, dialect)})`
    case "regexIMatch":
      return dialect.name === "postgres"
        ? `(${renderExpression(ast.left, state, dialect)} ~* ${renderExpression(ast.right, state, dialect)})`
        : `(${renderExpression(ast.left, state, dialect)} regexp ${renderExpression(ast.right, state, dialect)})`
    case "regexNotMatch":
      return dialect.name === "postgres"
        ? `(${renderExpression(ast.left, state, dialect)} !~ ${renderExpression(ast.right, state, dialect)})`
        : `(${renderExpression(ast.left, state, dialect)} not regexp ${renderExpression(ast.right, state, dialect)})`
    case "regexNotIMatch":
      return dialect.name === "postgres"
        ? `(${renderExpression(ast.left, state, dialect)} !~* ${renderExpression(ast.right, state, dialect)})`
        : `(${renderExpression(ast.left, state, dialect)} not regexp ${renderExpression(ast.right, state, dialect)})`
    case "isDistinctFrom":
      return dialect.name === "mysql"
        ? `(not (${renderExpression(ast.left, state, dialect)} <=> ${renderExpression(ast.right, state, dialect)}))`
        : `(${renderExpression(ast.left, state, dialect)} is distinct from ${renderExpression(ast.right, state, dialect)})`
    case "isNotDistinctFrom":
      return dialect.name === "mysql"
        ? `(${renderExpression(ast.left, state, dialect)} <=> ${renderExpression(ast.right, state, dialect)})`
        : `(${renderExpression(ast.left, state, dialect)} is not distinct from ${renderExpression(ast.right, state, dialect)})`
    case "contains":
      if (dialect.name === "postgres") {
        assertCompatiblePostgresRangeOperands(ast.left, ast.right)
        const left = isJsonExpression(ast.left)
          ? renderPostgresJsonValue(ast.left, state, dialect)
          : renderExpression(ast.left, state, dialect)
        const right = isJsonExpression(ast.right)
          ? renderPostgresJsonValue(ast.right, state, dialect)
          : renderExpression(ast.right, state, dialect)
        return `(${left} @> ${right})`
      }
      if (dialect.name === "mysql" && isJsonExpression(ast.left) && isJsonExpression(ast.right)) {
        return `json_contains(${renderExpression(ast.left, state, dialect)}, ${renderExpression(ast.right, state, dialect)})`
      }
      throw new Error("Unsupported container operator for SQL rendering")
    case "containedBy":
      if (dialect.name === "postgres") {
        assertCompatiblePostgresRangeOperands(ast.left, ast.right)
        const left = isJsonExpression(ast.left)
          ? renderPostgresJsonValue(ast.left, state, dialect)
          : renderExpression(ast.left, state, dialect)
        const right = isJsonExpression(ast.right)
          ? renderPostgresJsonValue(ast.right, state, dialect)
          : renderExpression(ast.right, state, dialect)
        return `(${left} <@ ${right})`
      }
      if (dialect.name === "mysql" && isJsonExpression(ast.left) && isJsonExpression(ast.right)) {
        return `json_contains(${renderExpression(ast.right, state, dialect)}, ${renderExpression(ast.left, state, dialect)})`
      }
      throw new Error("Unsupported container operator for SQL rendering")
    case "overlaps":
      if (dialect.name === "postgres") {
        assertCompatiblePostgresRangeOperands(ast.left, ast.right)
        const left = isJsonExpression(ast.left)
          ? renderPostgresJsonValue(ast.left, state, dialect)
          : renderExpression(ast.left, state, dialect)
        const right = isJsonExpression(ast.right)
          ? renderPostgresJsonValue(ast.right, state, dialect)
          : renderExpression(ast.right, state, dialect)
        return `(${left} && ${right})`
      }
      if (dialect.name === "mysql" && isJsonExpression(ast.left) && isJsonExpression(ast.right)) {
        return `json_overlaps(${renderExpression(ast.left, state, dialect)}, ${renderExpression(ast.right, state, dialect)})`
      }
      throw new Error("Unsupported container operator for SQL rendering")
    case "isNull":
      return `(${renderExpression(ast.value, state, dialect)} is null)`
    case "isNotNull":
      return `(${renderExpression(ast.value, state, dialect)} is not null)`
    case "not":
      return `(not ${renderExpression(ast.value, state, dialect)})`
    case "upper":
      return `upper(${renderExpression(ast.value, state, dialect)})`
    case "lower":
      return `lower(${renderExpression(ast.value, state, dialect)})`
    case "count":
      return `count(${renderExpression(ast.value, state, dialect)})`
    case "max":
      return `max(${renderExpression(ast.value, state, dialect)})`
    case "min":
      return `min(${renderExpression(ast.value, state, dialect)})`
    case "and":
      if (ast.values.length === 0) {
        throw new Error("and(...) requires at least one predicate")
      }
      return `(${ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(" and ")})`
    case "or":
      if (ast.values.length === 0) {
        throw new Error("or(...) requires at least one predicate")
      }
      return `(${ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(" or ")})`
    case "coalesce":
      return `coalesce(${ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(", ")})`
    case "in":
      if (ast.values.length < 2) {
        throw new Error("in(...) requires at least one candidate value")
      }
      return `(${renderExpression(ast.values[0]!, state, dialect)} in (${ast.values.slice(1).map((value: Expression.Any) => renderExpression(value, state, dialect)).join(", ")}))`
    case "notIn":
      if (ast.values.length < 2) {
        throw new Error("notIn(...) requires at least one candidate value")
      }
      return `(${renderExpression(ast.values[0]!, state, dialect)} not in (${ast.values.slice(1).map((value: Expression.Any) => renderExpression(value, state, dialect)).join(", ")}))`
    case "between":
      return `(${renderExpression(ast.values[0]!, state, dialect)} between ${renderExpression(ast.values[1]!, state, dialect)} and ${renderExpression(ast.values[2]!, state, dialect)})`
    case "concat":
      return dialect.renderConcat(ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)))
    case "case":
      return `case ${ast.branches.map((branch) =>
        `when ${renderExpression(branch.when, state, dialect)} then ${renderExpression(branch.then, state, dialect)}`
      ).join(" ")} else ${renderExpression(ast.else, state, dialect)} end`
    case "exists":
      return `exists (${renderSubqueryExpressionPlan(ast.plan, state, dialect)})`
    case "scalarSubquery":
      return `(${renderSubqueryExpressionPlan(ast.plan, state, dialect)})`
    case "inSubquery":
      return `(${renderExpression(ast.left, state, dialect)} in (${renderSubqueryExpressionPlan(ast.plan, state, dialect)}))`
    case "comparisonAny":
      return `(${renderExpression(ast.left, state, dialect)} ${renderComparisonOperator(ast.operator)} any (${renderSubqueryExpressionPlan(ast.plan, state, dialect)}))`
    case "comparisonAll":
      return `(${renderExpression(ast.left, state, dialect)} ${renderComparisonOperator(ast.operator)} all (${renderSubqueryExpressionPlan(ast.plan, state, dialect)}))`
    case "window": {
      if (!Array.isArray(ast.partitionBy) || !Array.isArray(ast.orderBy) || typeof ast.function !== "string") {
        break
      }
      const clauses: string[] = []
      if (ast.partitionBy.length > 0) {
        clauses.push(`partition by ${ast.partitionBy.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(", ")}`)
      }
      if (ast.orderBy.length > 0) {
        clauses.push(`order by ${ast.orderBy.map((entry) =>
          `${renderExpression(entry.value, state, dialect)} ${entry.direction}`
        ).join(", ")}`)
      }
      const specification = clauses.join(" ")
      switch (ast.function) {
        case "rowNumber":
          return `row_number() over (${specification})`
        case "rank":
          return `rank() over (${specification})`
        case "denseRank":
          return `dense_rank() over (${specification})`
        case "over":
          return `${renderExpression(ast.value!, state, dialect)} over (${specification})`
      }
      break
    }
  }
  throw new Error("Unsupported expression for SQL rendering")
}
