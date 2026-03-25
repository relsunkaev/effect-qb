import { mkdir } from "node:fs/promises"
import { dirname, extname, relative, resolve } from "node:path"

import { Datatypes } from "effect-qb/postgres"
import type { ColumnModel, EnumModel, SchemaModel, TableModel, DdlExpressionLike, IndexKeySpec, TableOptionSpec } from "effect-qb/postgres/metadata"
import { defaultConstraintName } from "./postgres-schema-sql.js"
import { enumKey, tableKey, renderDdlExpressionSql, toEnumModel, toTableModel } from "effect-qb/postgres/metadata"
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

const renderSchemaExpression = (sql: string): string =>
  `${SCHEMA_EXPRESSION_ALIAS}.parseExpression(${renderStringLiteral(sql)})`

const renderOptionExpression = (value: DdlExpressionLike): string =>
  renderSchemaExpression(renderDdlExpressionSql(value))

const normalizeType = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase()

const columnShapeSignature = (column: ColumnModel): string =>
  JSON.stringify({
    ddlType: normalizeType(column.ddlType),
    dbTypeKind: column.dbTypeKind,
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
        predicate: renderDdlExpressionSql(option.predicate),
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
    predicate: option.predicate ? renderDdlExpressionSql(option.predicate) : null,
    keys: keys.map((key) => key.kind === "column"
      ? {
          kind: key.kind,
          column: key.column,
          order: key.order ?? null,
          nulls: key.nulls ?? null
        }
      : {
          kind: key.kind,
          expression: renderDdlExpressionSql(key.expression),
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
    const declaration: SourceDeclaration = {
      kind: "tableFactory",
      filePath,
      identifier: "",
      start: 0,
      end: 0
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
    const declaration: SourceDeclaration = {
      kind: "enumFactory",
      filePath,
      identifier: "",
      start: 0,
      end: 0
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
            context
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
      const usedIdentifiers = new Set(
        discovered.bindings
          .filter((binding) => binding.declaration.filePath === filePath)
          .map((binding) => binding.declaration.identifier)
      )
      const syntheticBindings = plan.additions.map(({ binding, model }) => {
        const identifier = uniqueIdentifier(
          binding.kind === "table"
            ? model.name
            : model.name,
          usedIdentifiers
        )
        return {
          ...binding,
          declaration: {
            ...binding.declaration,
            identifier
          }
        }
      })
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
      const fileContext: RenderContext = {
        bindingByKey: combinedBindingByKey,
        enumKeys: combinedEnumKeys
      }
      const renderedAdditions = syntheticBindings.map((binding) =>
        binding.kind === "table"
          ? renderTableDeclaration(
              binding.declaration,
              binding.value as TableModel,
              fileContext
            )
          : renderEnumDeclaration(
              binding.declaration,
              binding.value as EnumModel
            )
      )
      next = renderDeclaredModule(next, renderedAdditions, syntheticBindings.map((binding) => binding.declaration.identifier))
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
