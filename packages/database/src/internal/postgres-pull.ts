import { relative } from "node:path"

import { Datatypes } from "effect-qb/postgres"
import type { ColumnModel, EnumModel, SchemaModel, TableModel, DdlExpressionLike, IndexKeySpec, TableOptionSpec } from "effect-qb/postgres/metadata"
import { defaultConstraintName } from "./postgres-schema-sql.js"
import { enumKey, tableKey, renderDdlExpressionSql } from "effect-qb/postgres/metadata"
import type { DiscoveredSourceSchema, SourceBinding, SourceDeclaration } from "./postgres-source-discovery.js"

const TABLE_ALIAS = "__EffectQbPullTable"
const COLUMN_ALIAS = "__EffectQbPullColumn"
const SCHEMA_EXPRESSION_ALIAS = "__EffectQbPullSchemaExpression"
const SCHEMA_MANAGEMENT_ALIAS = "__EffectQbPullSchemaManagement"
const SCHEMA_ALIAS = "__EffectQbPullSchema"

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
  `[${values.map(renderStringLiteral).join(", ")}] as const`

const renderSchemaExpression = (sql: string): string =>
  `${SCHEMA_EXPRESSION_ALIAS}.parseExpression(${renderStringLiteral(sql)})`

const renderOptionExpression = (value: DdlExpressionLike): string =>
  renderSchemaExpression(renderDdlExpressionSql(value))

const normalizeType = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase()

const stripOuterQuotes = (value: string): string =>
  value.startsWith("\"") && value.endsWith("\"")
    ? value.slice(1, -1).replaceAll("\"\"", "\"")
    : value

const inferKindFromDdl = (ddlType: string): string => {
  const normalized = normalizeType(ddlType)
  if (normalized.endsWith("[]")) {
    return normalized
  }
  switch (normalized) {
    case "smallint":
      return "int2"
    case "integer":
      return "int4"
    case "bigint":
      return "int8"
    case "real":
      return "float4"
    case "double precision":
      return "float8"
    case "boolean":
      return "bool"
    case "character varying":
      return "varchar"
    case "character":
      return "char"
    case "timestamp with time zone":
      return "timestamptz"
    case "timestamp without time zone":
      return "timestamp"
    case "time with time zone":
      return "timetz"
    case "time without time zone":
      return "time"
    case "bit varying":
      return "varbit"
  }
  const withoutParams = normalized.replace(/\(.+\)$/, "")
  const segments = withoutParams.split(".")
  return stripOuterQuotes(segments[segments.length - 1] ?? withoutParams)
}

const inferSchemaNameFromDdl = (ddlType: string): string | undefined => {
  const withoutParams = ddlType.trim().replace(/\(.+\)$/, "").replace(/\[\]$/, "")
  const match = /^(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\.(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))$/.exec(withoutParams)
  if (match === null) {
    return undefined
  }
  return match[1] ?? match[2]
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
} => {
  if (column.typeKind === "e") {
    return {
      code: `${COLUMN_ALIAS}.custom(${SCHEMA_ALIAS}.String, ${renderDbTypeDescriptor(column, context)})`
    }
  }
  if (normalizeType(column.ddlType).endsWith("[]")) {
    return {
      code: `${COLUMN_ALIAS}.custom(${SCHEMA_ALIAS}.Unknown, ${renderDbTypeDescriptor(column, context)})`
    }
  }
  switch (column.dbTypeKind) {
    case "uuid":
      return { code: `${COLUMN_ALIAS}.uuid()`, defaultDdlType: "uuid" }
    case "text":
      return { code: `${COLUMN_ALIAS}.text()`, defaultDdlType: "text" }
    case "int4":
      return { code: `${COLUMN_ALIAS}.int()`, defaultDdlType: "int4" }
    case "bool":
      return { code: `${COLUMN_ALIAS}.boolean()`, defaultDdlType: "bool" }
    case "date":
      return { code: `${COLUMN_ALIAS}.date()`, defaultDdlType: "date" }
    case "timestamp":
      return { code: `${COLUMN_ALIAS}.timestamp()`, defaultDdlType: "timestamp" }
    case "json":
    case "jsonb":
      return { code: `${COLUMN_ALIAS}.json(${SCHEMA_ALIAS}.Unknown)`, defaultDdlType: "json" }
    default:
      return {
        code: `${COLUMN_ALIAS}.custom(${schemaExpressionForRuntimeTag(runtimeTagOfColumn(column))}, ${renderDbTypeDescriptor(column, context)})`
      }
  }
}

const renderColumnDefinition = (
  column: ColumnModel,
  context: RenderContext,
  inlinePrimaryKey: boolean
): string => {
  const base = renderColumnBase(column, context)
  const pipes: string[] = []
  if (base.defaultDdlType === undefined || normalizeType(column.ddlType) !== normalizeType(base.defaultDdlType)) {
    pipes.push(`${COLUMN_ALIAS}.ddlType(${renderStringLiteral(column.ddlType)})`)
  }
  if (column.nullable) {
    pipes.push(`${COLUMN_ALIAS}.nullable`)
  }
  if (inlinePrimaryKey) {
    pipes.push(`${COLUMN_ALIAS}.primaryKey`)
  }
  if (column.identity) {
    pipes.push(column.identity.generation === "always"
      ? `${COLUMN_ALIAS}.identityAlways`
      : `${COLUMN_ALIAS}.identityByDefault`)
  } else if (column.generatedSql) {
    pipes.push(`${COLUMN_ALIAS}.generated(${renderSchemaExpression(column.generatedSql)})`)
  } else if (column.defaultSql) {
    pipes.push(`${COLUMN_ALIAS}.default(${renderSchemaExpression(column.defaultSql)})`)
  }
  return pipes.length === 0
    ? base.code
    : `${base.code}.pipe(${pipes.join(", ")})`
}

const renderIndexKey = (key: IndexKeySpec): string =>
  key.kind === "column"
    ? `{ column: ${renderStringLiteral(key.column)}${key.order ? `, order: ${renderStringLiteral(key.order)}` : ""}${key.nulls ? `, nulls: ${renderStringLiteral(key.nulls)}` : ""} }`
    : `{ expression: ${renderOptionExpression(key.expression)}${key.order ? `, order: ${renderStringLiteral(key.order)}` : ""}${key.nulls ? `, nulls: ${renderStringLiteral(key.nulls)}` : ""} }`

const renderIndexOption = (
  option: Extract<TableOptionSpec, { readonly kind: "index" }>
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
    parts.push(`keys: [${option.keys.map(renderIndexKey).join(", ")}] as const`)
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
    parts.push(`include: [${option.include.map(renderStringLiteral).join(", ")}] as const`)
  }
  if (option.predicate) {
    parts.push(`predicate: ${renderOptionExpression(option.predicate)}`)
  }
  return `${TABLE_ALIAS}.index({ ${parts.join(", ")} })`
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
      return renderIndexOption(option)
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
        ? `${TABLE_ALIAS}.check({ name: ${renderStringLiteral(option.name)}, predicate: ${renderOptionExpression(option.predicate)}, noInherit: true })`
        : `${TABLE_ALIAS}.check(${renderStringLiteral(option.name)}, ${renderOptionExpression(option.predicate)})`
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
${table.columns.map((column) => `  ${renderPropertyKey(column.name)}: ${renderColumnDefinition(column, context, inlinePrimaryKey === column.name)}`).join(",\n")}
}`
}

const renderTableDeclaration = (
  declaration: SourceDeclaration,
  table: TableModel,
  context: RenderContext
): string => {
  const inlinePrimaryKey = inlinePrimaryKeyColumn(declaration, table)
  const tableOptions = table.options.filter((option) =>
    !(declaration.kind === "tableClass" && option.kind === "primaryKey" && inlinePrimaryKey !== undefined)
  )
  const renderedOptions = tableOptions.map((option) => renderTableOption(table, option, context))
  const fields = renderFieldBlock(declaration, table, context)
  const nameLiteral = renderStringLiteral(table.name)
  const schemaLiteral = table.schemaName && table.schemaName !== "public"
    ? `, ${renderStringLiteral(table.schemaName)}`
    : ""

  switch (declaration.kind) {
    case "tableFactory":
      return renderedOptions.length === 0
        ? `const ${declaration.identifier} = ${TABLE_ALIAS}.make(${nameLiteral}, ${fields}${schemaLiteral})`
        : `const ${declaration.identifier} = ${TABLE_ALIAS}.make(${nameLiteral}, ${fields}${schemaLiteral}).pipe(\n${indent(renderedOptions.join(",\n"))}\n)`
    case "tableSchema":
      return renderedOptions.length === 0
        ? `const ${declaration.identifier} = ${declaration.schemaBuilderIdentifier}.table(${nameLiteral}, ${fields})`
        : `const ${declaration.identifier} = ${declaration.schemaBuilderIdentifier}.table(\n${indent([nameLiteral, fields, ...renderedOptions].join(",\n"))}\n)`
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

const renderEnumDeclaration = (
  declaration: SourceDeclaration,
  enumType: EnumModel
): string => {
  const values = renderStringTuple(enumType.values)
  switch (declaration.kind) {
    case "enumFactory":
      return enumType.schemaName === undefined || enumType.schemaName === "public"
        ? `const ${declaration.identifier} = ${SCHEMA_MANAGEMENT_ALIAS}.enumType(${renderStringLiteral(enumType.name)}, ${values})`
        : `const ${declaration.identifier} = ${SCHEMA_MANAGEMENT_ALIAS}.enumType(${renderStringLiteral(enumType.name)}, ${values}, ${renderStringLiteral(enumType.schemaName)})`
    case "enumSchema":
      return `const ${declaration.identifier} = ${declaration.schemaBuilderIdentifier}.enumType(${renderStringLiteral(enumType.name)}, ${values})`
    default:
      throw new Error(`Cannot render enum declaration for kind '${declaration.kind}'`)
  }
}

const ensureImports = (contents: string): string => {
  const required = [
    `import { Table as ${TABLE_ALIAS}, Column as ${COLUMN_ALIAS}, SchemaExpression as ${SCHEMA_EXPRESSION_ALIAS}, SchemaManagement as ${SCHEMA_MANAGEMENT_ALIAS} } from "effect-qb/postgres"`,
    `import * as ${SCHEMA_ALIAS} from "effect/Schema"`
  ]
  const missing = required.filter((line) => !contents.includes(line))
  if (missing.length === 0) {
    return contents
  }
  return `${missing.join("\n")}\n${contents}`
}

export const planPostgresPull = async (
  cwd: string,
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

  for (const key of databaseTablesByKey.keys()) {
    const binding = bindingByKey.get(key)
    if (binding === undefined || binding.kind !== "table") {
      throw new Error(`No source table declaration found for '${key}'`)
    }
  }
  for (const key of databaseEnumsByKey.keys()) {
    const binding = bindingByKey.get(key)
    if (binding === undefined || binding.kind !== "enum") {
      throw new Error(`No source enum declaration found for '${key}'`)
    }
  }

  const byFile = new Map<string, SourceBinding[]>()
  for (const binding of discovered.bindings) {
    if (binding.kind === "table" && !databaseTablesByKey.has(binding.key)) {
      continue
    }
    if (binding.kind === "enum" && !databaseEnumsByKey.has(binding.key)) {
      continue
    }
    const list = byFile.get(binding.declaration.filePath) ?? []
    list.push(binding)
    byFile.set(binding.declaration.filePath, list)
  }

  const updates: PullFileUpdate[] = []
  for (const [filePath, bindings] of byFile) {
    const original = await Bun.file(filePath).text()
    let next = ensureImports(original)
    const importOffset = next.length - original.length

    for (const binding of [...bindings].sort((left, right) => right.declaration.start - left.declaration.start)) {
      const replacement = binding.kind === "table"
        ? renderTableDeclaration(
            binding.declaration,
            databaseTablesByKey.get(binding.key) ?? (() => {
              throw new Error(`Missing database table '${binding.key}'`)
            })(),
            context
          )
        : renderEnumDeclaration(
            binding.declaration,
            databaseEnumsByKey.get(binding.key) ?? (() => {
              throw new Error(`Missing database enum '${binding.key}'`)
            })()
          )
      const start = binding.declaration.start + importOffset
      const end = binding.declaration.end + importOffset
      next = `${next.slice(0, start)}${replacement}${next.slice(end)}`
    }

    if (next !== original) {
      updates.push({
        filePath,
        before: original,
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
    await Bun.write(update.filePath, update.after)
  }
}

export const summarizePullPlan = (cwd: string, plan: PullPlan): readonly string[] =>
  plan.updates.map((update) => `update ${relative(cwd, update.filePath)}`)
