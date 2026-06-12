import * as Schema from "effect/Schema"

import * as Query from "../query.js"
import * as Expression from "../scalar.js"
import * as Table from "../table.js"
import * as QueryAst from "../query-ast.js"
import { renderDbTypeName, type RenderState, type RenderValueContext, type SqlDialect } from "../dialect.js"
import { renderPortableDatatypeCastType, renderPortableDatatypeDdlType } from "../datatypes/matrix.js"
import * as ExpressionAst from "../expression-ast.js"
import * as JsonPath from "../json/path.js"
import { renderSelectLockMode } from "../dsl-plan-runtime.js"
import { expectConflictClause } from "../dsl-mutation-runtime.js"
import { expectDdlClauseKind, expectTruncateClause, normalizeStatementFlag, normalizeStatementIdentifier, renderTransactionIsolationLevel } from "../dsl-transaction-ddl-runtime.js"
import {
  renderJsonSelectSql,
  renderSelectSql,
  toDriverValue
} from "../runtime/driver-value-mapping.js"
import { normalizeDbValue } from "../runtime/normalize.js"
import { flattenSelection, type Projection } from "../projections.js"
import { groupingKeyOfExpression } from "../grouping-key.js"
import * as SchemaExpression from "../schema-expression.js"
import { renderReferentialAction, validateOptions, type DdlExpressionLike, type TableOptionSpec } from "../table-options.js"
import * as Casing from "../casing.js"

const renderDbType = (
  dialect: SqlDialect,
  dbType: Expression.DbType.Any
): string => {
  return renderDbTypeName(renderPortableDatatypeDdlType(dialect.name, dbType.kind) ?? dbType.kind)
}

const isArrayDbType = (dbType: Expression.DbType.Any): boolean =>
  "element" in dbType

const renderCastType = (
  dialect: SqlDialect,
  dbType: unknown
): string => {
  const kind = (dbType as { readonly kind?: string } | undefined)?.kind as string
  const portableType = renderPortableDatatypeCastType(dialect.name, kind)
  if (portableType !== undefined) {
    return renderDbTypeName(portableType)
  }
  if (dialect.name !== "mysql") {
    return renderDbTypeName(kind)
  }
  switch (kind) {
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
      return renderDbTypeName(kind)
  }
}

const casingForTable = (
  table: Table.AnyTable,
  state: RenderState
): Casing.Options | undefined =>
  Casing.merge(state.casing, table[Table.TypeId].casing)

const casedTableName = (
  table: Table.AnyTable,
  state: RenderState
): string => {
  const tableState = table[Table.TypeId]
  return Casing.applyCategory(casingForTable(table, state), "tables", tableState.baseName)
}

const casedSchemaName = (
  table: Table.AnyTable,
  state: RenderState
): string | undefined => {
  const schemaName = table[Table.TypeId].schemaName
  return schemaName === undefined
    ? undefined
    : Casing.applyCategory(casingForTable(table, state), "schemas", schemaName)
}

const casedColumnName = (
  columnName: string,
  state: RenderState,
  tableName?: string
): string => {
  if (tableName !== undefined) {
    const mapped = state.sourceNames?.get(tableName)?.columns.get(columnName)
    if (mapped !== undefined) {
      return mapped
    }
  }
  return Casing.applyCategory(state.casing, "columns", columnName)
}

const casedTableReferenceName = (
  tableName: string,
  state: RenderState
): string =>
  state.sourceNames?.get(tableName)?.tableName ?? Casing.applyCategory(state.casing, "tables", tableName)

const quoteColumn = (
  columnName: string,
  state: RenderState,
  dialect: SqlDialect,
  tableName?: string
): string => dialect.quoteIdentifier(casedColumnName(columnName, state, tableName))

const stateWithTableCasing = (
  state: RenderState,
  source: unknown
): RenderState =>
  typeof source === "object" && source !== null && Table.TypeId in source
    ? { ...state, casing: casingForTable(source as Table.AnyTable, state) }
    : state

const referenceCasing = (
  reference: { readonly casing?: Casing.Options },
  state: RenderState
): Casing.Options | undefined =>
  Casing.merge(state.casing, reference.casing)

const renderReferenceTable = (
  reference: {
    readonly tableName: string
    readonly schemaName?: string
    readonly casing?: Casing.Options
  },
  state: RenderState,
  dialect: SqlDialect
): string => {
  const casing = referenceCasing(reference, state)
  const tableName = Casing.applyCategory(casing, "tables", reference.tableName)
  const schemaName = reference.schemaName === undefined
    ? undefined
    : Casing.applyCategory(casing, "schemas", reference.schemaName)
  return dialect.renderTableReference(tableName, tableName, schemaName)
}

const quoteReferenceColumn = (
  columnName: string,
  reference: { readonly casing?: Casing.Options },
  state: RenderState,
  dialect: SqlDialect
): string =>
  dialect.quoteIdentifier(Casing.applyCategory(referenceCasing(reference, state), "columns", columnName))

const registerSourceReference = (
  source: unknown,
  tableName: string,
  state: RenderState
): void => {
  if (typeof source !== "object" || source === null) {
    return
  }
  if (Table.TypeId in source) {
    const table = source as Table.AnyTable
    const tableState = table[Table.TypeId]
    const casing = casingForTable(table, state)
    const renderedTableName = tableState.kind === "alias"
      ? tableName
      : Casing.applyCategory(casing, "tables", tableState.baseName)
    const columns = new Map(
      Object.keys(tableState.fields).map((columnName) => [
        columnName,
        Casing.applyCategory(casing, "columns", columnName)
      ] as const)
    )
    state.sourceNames?.set(tableName, {
      tableName: renderedTableName,
      columns
    })
    return
  }
  if ("columns" in source && typeof source.columns === "object" && source.columns !== null) {
    state.sourceNames?.set(tableName, {
      tableName,
      columns: new Map(Object.keys(source.columns).map((columnName) => [columnName, columnName] as const))
    })
  }
}

const registerQuerySources = (
  ast: QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>,
  state: RenderState
): void => {
  if (ast.from !== undefined) {
    registerSourceReference(ast.from.source, ast.from.tableName, state)
  }
  for (const source of ast.fromSources ?? []) {
    registerSourceReference(source.source, source.tableName, state)
  }
  for (const join of ast.joins) {
    registerSourceReference(join.source, join.tableName, state)
  }
  if (ast.into !== undefined) {
    registerSourceReference(ast.into.source, ast.into.tableName, state)
  }
  if (ast.target !== undefined) {
    registerSourceReference(ast.target.source, ast.target.tableName, state)
  }
  for (const target of ast.targets ?? []) {
    registerSourceReference(target.source, target.tableName, state)
  }
  if (ast.using !== undefined) {
    registerSourceReference(ast.using.source, ast.using.tableName, state)
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
  column: Table.AnyTable[typeof Table.TypeId]["fields"][string],
  tableName?: string,
  casing?: Casing.Options
): string => {
  const expressionState = { ...state, casing, rowLocalColumns: true }
  if (dialect.name !== "postgres" && isArrayDbType(column.metadata.dbType)) {
    throw new Error(`Unsupported ${dialect.name} array column options`)
  }
  const clauses = [
    quoteColumn(columnName, state, dialect, tableName),
    column.metadata.ddlType === undefined
      ? renderDbType(dialect, column.metadata.dbType)
      : renderDbTypeName(column.metadata.ddlType)
  ]
  if (column.metadata.identity) {
    if (dialect.name !== "postgres") {
      throw new Error(`Unsupported ${dialect.name} identity column options`)
    }
    clauses.push(`generated ${column.metadata.identity.generation === "byDefault" ? "by default" : "always"} as identity`)
  } else if (column.metadata.generatedValue) {
    clauses.push(`generated always as (${renderDdlExpression(column.metadata.generatedValue, expressionState, dialect)}) stored`)
  } else if (column.metadata.defaultValue) {
    clauses.push(`default ${renderDdlExpression(column.metadata.defaultValue, expressionState, dialect)}`)
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
  ifNotExists: unknown
): string => {
  const normalizedIfNotExists = normalizeStatementFlag(ifNotExists)
  if (dialect.name !== "postgres" && normalizedIfNotExists) {
    throw new Error(`Unsupported ${dialect.name} create table options`)
  }
  const table = targetSource.source as Table.AnyTable
  const tableCasing = casingForTable(table, state)
  const fields = table[Table.TypeId].fields
  const definitions = Object.entries(fields).map(([columnName, column]) =>
    renderColumnDefinition(dialect, state, columnName, column, targetSource.tableName, tableCasing)
  )
  const options = table[Table.OptionsSymbol] as unknown
  const tableOptions = (Array.isArray(options) ? options : [options]) as readonly TableOptionSpec[]
  validateOptions(table[Table.TypeId].name, fields, tableOptions)
  for (const option of tableOptions) {
    if (typeof option !== "object" || option === null || !("kind" in option)) {
      continue
    }
    switch (option.kind) {
      case "primaryKey":
        if (dialect.name !== "postgres" && (option.deferrable || option.initiallyDeferred)) {
          throw new Error(`Unsupported ${dialect.name} primary key constraint options`)
        }
        definitions.push(`${option.name ? `constraint ${dialect.quoteIdentifier(Casing.applyCategory(tableCasing, "constraints", option.name))} ` : ""}primary key (${option.columns.map((column) => quoteColumn(column, state, dialect, targetSource.tableName)).join(", ")})${option.deferrable ? ` deferrable${option.initiallyDeferred ? " initially deferred" : ""}` : ""}`)
        break
      case "unique":
        if (dialect.name !== "postgres" && (option.nullsNotDistinct || option.deferrable || option.initiallyDeferred)) {
          throw new Error(`Unsupported ${dialect.name} unique constraint options`)
        }
        definitions.push(`${option.name ? `constraint ${dialect.quoteIdentifier(Casing.applyCategory(tableCasing, "constraints", option.name))} ` : ""}unique${option.nullsNotDistinct ? " nulls not distinct" : ""} (${option.columns.map((column) => quoteColumn(column, state, dialect, targetSource.tableName)).join(", ")})${option.deferrable ? ` deferrable${option.initiallyDeferred ? " initially deferred" : ""}` : ""}`)
        break
      case "foreignKey": {
        if (dialect.name !== "postgres" && (option.deferrable || option.initiallyDeferred)) {
          throw new Error(`Unsupported ${dialect.name} foreign key constraint options`)
        }
        const reference = typeof option.references === "function"
          ? option.references()
          : option.references
        definitions.push(
          `${option.name ? `constraint ${dialect.quoteIdentifier(Casing.applyCategory(tableCasing, "constraints", option.name))} ` : ""}foreign key (${option.columns.map((column) => quoteColumn(column, state, dialect, targetSource.tableName)).join(", ")}) references ${renderReferenceTable(reference, state, dialect)} (${reference.columns.map((column) => quoteReferenceColumn(column, reference, state, dialect)).join(", ")})${option.onDelete !== undefined ? ` on delete ${renderReferentialAction(option.onDelete)}` : ""}${option.onUpdate !== undefined ? ` on update ${renderReferentialAction(option.onUpdate)}` : ""}${option.deferrable ? ` deferrable${option.initiallyDeferred ? " initially deferred" : ""}` : ""}`
        )
        break
      }
      case "check":
        if (dialect.name !== "postgres" && option.noInherit) {
          throw new Error(`Unsupported ${dialect.name} check constraint options`)
        }
        definitions.push(
          `constraint ${dialect.quoteIdentifier(Casing.applyCategory(tableCasing, "constraints", option.name))} check (${renderDdlExpression(option.predicate, { ...state, casing: tableCasing, rowLocalColumns: true }, dialect)})${option.noInherit ? " no inherit" : ""}`
        )
        break
      case "index":
        break
      default:
        throw new Error("Unsupported table option kind")
    }
  }
  return `create table${normalizedIfNotExists ? " if not exists" : ""} ${renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)} (${definitions.join(", ")})`
}

const renderCreateIndexSql = (
  targetSource: QueryAst.FromClause,
  ddl: Extract<QueryAst.DdlClause, { readonly kind: "createIndex" }>,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const unique = normalizeStatementFlag(ddl.unique)
  const ifNotExists = normalizeStatementFlag(ddl.ifNotExists)
  const name = normalizeStatementIdentifier("createIndex", "option 'name'", ddl.name)
  if (dialect.name !== "postgres" && ifNotExists) {
    throw new Error(`Unsupported ${dialect.name} create index options`)
  }
  const maybeIfNotExists = dialect.name === "postgres" && ifNotExists ? " if not exists" : ""
  const table = targetSource.source as Table.AnyTable
  const tableCasing = casingForTable(table, state)
  return `create${unique ? " unique" : ""} index${maybeIfNotExists} ${dialect.quoteIdentifier(Casing.applyCategory(tableCasing, "indexes", name))} on ${renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)} (${ddl.columns.map((column) => quoteColumn(column, state, dialect, targetSource.tableName)).join(", ")})`
}

const renderDropIndexSql = (
  targetSource: QueryAst.FromClause,
  ddl: Extract<QueryAst.DdlClause, { readonly kind: "dropIndex" }>,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const ifExists = normalizeStatementFlag(ddl.ifExists)
  const name = normalizeStatementIdentifier("dropIndex", "option 'name'", ddl.name)
  if (dialect.name !== "postgres" && ifExists) {
    throw new Error(`Unsupported ${dialect.name} drop index options`)
  }
  if (dialect.name === "postgres") {
    const table = typeof targetSource.source === "object" &&
      targetSource.source !== null &&
      Table.TypeId in targetSource.source
      ? targetSource.source as Table.AnyTable
      : undefined
    const schemaName = table?.[Table.TypeId].schemaName
    const tableCasing = table === undefined ? state.casing : casingForTable(table, state)
    const renderedSchemaName = table === undefined ? schemaName : casedSchemaName(table, state)
    const renderedIndexName = Casing.applyCategory(tableCasing, "indexes", name)
    const indexName = schemaName === undefined || schemaName === "public"
      ? dialect.quoteIdentifier(renderedIndexName)
      : `${dialect.quoteIdentifier(renderedSchemaName ?? schemaName)}.${dialect.quoteIdentifier(renderedIndexName)}`
    return `drop index${ifExists ? " if exists" : ""} ${indexName}`
  }
  const table = targetSource.source as Table.AnyTable
  const tableCasing = casingForTable(table, state)
  return `drop index ${dialect.quoteIdentifier(Casing.applyCategory(tableCasing, "indexes", name))} on ${renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)}`
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

const expectValueExpression = (
  _functionName: string,
  value: unknown
): Expression.Any => value as Expression.Any

const expectBinaryExpressions = (
  _functionName: string,
  left: unknown,
  right: unknown
): readonly [Expression.Any, Expression.Any] => [left as Expression.Any, right as Expression.Any]

const renderBinaryExpression = (
  functionName: string,
  operator: string,
  left: unknown,
  right: unknown,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const [leftExpression, rightExpression] = expectBinaryExpressions(functionName, left, right)
  return `(${renderExpression(leftExpression, state, dialect)} ${operator} ${renderExpression(rightExpression, state, dialect)})`
}

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

const isOptionalJsonPathNumber = (value: unknown): boolean =>
  value === undefined || (typeof value === "number" && Number.isFinite(value))

const isJsonPathSegment = (segment: unknown): boolean => {
  if (typeof segment === "string") {
    return true
  }
  if (typeof segment === "number") {
    return Number.isFinite(segment)
  }
  if (segment === null || typeof segment !== "object" || !("kind" in segment)) {
    return false
  }
  switch ((segment as { readonly kind?: unknown }).kind) {
    case "key":
      return typeof (segment as { readonly key?: unknown }).key === "string"
    case "index": {
      const index = (segment as { readonly index?: unknown }).index
      return typeof index === "number" && Number.isFinite(index)
    }
    case "wildcard":
    case "descend":
      return true
    case "slice":
      return isOptionalJsonPathNumber((segment as { readonly start?: unknown }).start) &&
        isOptionalJsonPathNumber((segment as { readonly end?: unknown }).end)
    default:
      return false
  }
}

const validateJsonPathSegments = (segments: unknown): ReadonlyArray<JsonPath.AnySegment> => {
  if (!Array.isArray(segments)) {
    throw new Error("JSON path expressions require a segment array")
  }
  if (segments.some((segment) => !isJsonPathSegment(segment))) {
    throw new Error("JSON path segments require string, number, or path segment objects")
  }
  return segments as ReadonlyArray<JsonPath.AnySegment>
}

const extractJsonPathSegments = (node: Record<string, unknown>): ReadonlyArray<JsonPath.AnySegment> => {
  const path = node.path ?? node.segments ?? node.keys
  if (isJsonPathValue(path)) {
    return validateJsonPathSegments(path.segments)
  }
  if (Array.isArray(path)) {
    return validateJsonPathSegments(path)
  }
  if (node.segments !== undefined) {
    return validateJsonPathSegments(node.segments)
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
    return validateJsonPathSegments(node.right.segments)
  }
  return []
}

const extractJsonKeys = (
  node: Record<string, unknown>,
  segments: ReadonlyArray<JsonPath.AnySegment>
): readonly unknown[] =>
  Array.isArray(node.keys)
    ? node.keys
    : segments.map((segment) =>
        typeof segment === "object" && segment !== null && segment.kind === "key"
          ? segment.key
          : segment
      )

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
    if (value.trim().length === 0) {
      throw new Error("SQL/JSON path input must be a non-empty string")
    }
    return dialect.renderLiteral(value, state)
  }
  if (isExpression(value)) {
    const ast = (value as Expression.Any & {
      readonly [ExpressionAst.TypeId]: ExpressionAst.Any
    })[ExpressionAst.TypeId]
    if (ast.kind === "literal" && typeof ast.value === "string" && ast.value.trim().length === 0) {
      throw new Error("SQL/JSON path input must be a non-empty string")
    }
    return renderExpression(value, state, dialect)
  }
  throw new Error("Unsupported SQL/JSON path input")
}

const renderFunctionName = (name: unknown): string => {
  return name as string
}

const renderExtractField = (field: Expression.Any): string => {
  const ast = (field as Expression.Any & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.Any
  })[ExpressionAst.TypeId] as ExpressionAst.LiteralNode<string>
  return ast.value
}

const renderFunctionCall = (
  name: unknown,
  args: unknown,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const functionName = renderFunctionName(name)
  const functionArgs = args as readonly Expression.Any[]
  if (functionName === "array") {
    return `ARRAY[${functionArgs.map((arg) => renderExpression(arg, state, dialect)).join(", ")}]`
  }
  if (functionName === "extract") {
    const field = functionArgs[0]!
    const source = functionArgs[1]!
    return `extract(${renderExtractField(field)} from ${renderExpression(source, state, dialect)})`
  }
  const renderedArgs = functionArgs.map((arg) => renderExpression(arg, state, dialect)).join(", ")
  if (functionArgs.length === 0) {
    switch (functionName) {
      case "current_date":
      case "current_time":
      case "current_timestamp":
      case "localtime":
      case "localtimestamp":
        return functionName
      default:
        return `${functionName}()`
    }
  }
  return `${functionName}(${renderedArgs})`
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
      const keys = extractJsonKeys(ast, segments)
      if (keys.length === 0) {
        return undefined
      }
      if (keys.some((key) => typeof key !== "string" || key.length === 0)) {
        throw new Error("json key predicates require string keys")
      }
      const keyNames = keys as readonly string[]
      if (dialect.name === "postgres") {
        if (kind === "jsonHasAnyKeys") {
          return `(${baseSql} ?| array[${keyNames.map((key) => renderPostgresTextLiteral(key, state, dialect)).join(", ")}])`
        }
        if (kind === "jsonHasAllKeys") {
          return `(${baseSql} ?& array[${keyNames.map((key) => renderPostgresTextLiteral(key, state, dialect)).join(", ")}])`
        }
        return `(${baseSql} ? ${renderPostgresTextLiteral(keyNames[0]!, state, dialect)})`
      }
      if (dialect.name === "mysql") {
        const mode = kind === "jsonHasAllKeys" ? "all" : "one"
        const paths = keyNames.map((segment) => renderMySqlJsonPath([segment], state, dialect)).join(", ")
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
      const entries = (ast as { readonly entries: readonly { readonly key: string; readonly value: Expression.Any }[] }).entries
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
      const values = (ast as { readonly values: readonly Expression.Any[] }).values
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
  dialect: SqlDialect,
  targetTableName?: string
): string => {
  const column = entry.tableName && dialect.name === "mysql"
    ? `${dialect.quoteIdentifier(casedTableReferenceName(entry.tableName, state))}.${quoteColumn(entry.columnName, state, dialect, entry.tableName)}`
    : quoteColumn(entry.columnName, state, dialect, targetTableName)
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
      if (normalizeStatementFlag(clause.readOnly)) {
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
      return `savepoint ${dialect.quoteIdentifier(normalizeStatementIdentifier("savepoint", "name", clause.name))}`
    case "rollbackTo":
      return `rollback to savepoint ${dialect.quoteIdentifier(normalizeStatementIdentifier("rollbackTo", "name", clause.name))}`
    case "releaseSavepoint":
      return `release savepoint ${dialect.quoteIdentifier(normalizeStatementIdentifier("releaseSavepoint", "name", clause.name))}`
  }
  return "start transaction"
}

const renderSelectionList = (
  selection: Record<string, unknown>,
  state: RenderState,
  dialect: SqlDialect
): RenderedQueryAst => {
  const flattened = flattenSelection(selection)
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
  casing: state.casing,
  ctes: [],
  cteNames: new Set(state.cteNames),
  cteSources: new Map(state.cteSources),
  sourceNames: new Map(state.sourceNames)
})

const assertSupportedMutationReturning = (
  dialect: SqlDialect,
  selection: Record<string, unknown>
): void => {
  if (dialect.name === "standard" && Object.keys(selection).length > 0) {
    throw new Error("Unsupported standard returning")
  }
}

const validateDistinctOnOrdering = (
  distinctOn: readonly Expression.Any[] | undefined,
  orderBy: readonly QueryAst.OrderByClause[]
): void => {
  if (distinctOn === undefined || distinctOn.length === 0 || orderBy.length === 0) {
    return
  }
  const remainingDistinctKeys = new Set(distinctOn.map(groupingKeyOfExpression))
  for (const order of orderBy) {
    const key = groupingKeyOfExpression(order.value)
    if (remainingDistinctKeys.has(key)) {
      remainingDistinctKeys.delete(key)
      continue
    }
    if (remainingDistinctKeys.size > 0) {
      throw new Error("distinctOn(...) expressions must match the leftmost orderBy(...) expressions")
    }
    return
  }
}

export const renderQueryAst = (
  ast: QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>,
  state: RenderState,
  dialect: SqlDialect,
  options: { readonly emitCtes?: boolean } = {}
): RenderedQueryAst => {
  registerQuerySources(ast, state)
  let sql = ""
  let projections: readonly Projection[] = []

  switch (ast.kind) {
    case "select": {
      validateDistinctOnOrdering(ast.distinctOn, ast.orderBy)
      const rendered = renderSelectionList(ast.select as Record<string, unknown>, state, dialect)
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
        if (dialect.name === "standard" && join.kind === "full") {
          throw new Error("Unsupported standard full join")
        }
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
        if (dialect.name === "standard") {
          throw new Error("Unsupported standard row locking")
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
          if (dialect.name === "standard" && entry.all && entry.kind !== "union") {
            throw new Error("Unsupported standard set operator all variant")
          }
          return `${entry.kind}${entry.all ? " all" : ""} (${rendered.sql})`
        })
      ].join(" ")
      break
    }
    case "insert": {
      const insertAst = ast as QueryAst.Ast<Record<string, unknown>, any, "insert">
      const targetSource = insertAst.into!
      const target = renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)
      const targetCasingState = stateWithTableCasing(state, targetSource.source)
      const insertSource = insertAst.insertSource
      const conflict = expectConflictClause(insertAst.conflict)
      sql = `insert into ${target}`
      if (insertSource?.kind === "values") {
        const columns = insertSource.columns.map((column) => quoteColumn(column, state, dialect, targetSource.tableName)).join(", ")
        const rows = insertSource.rows.map((row) =>
          `(${row.values.map((entry) => renderExpression(entry.value, targetCasingState, dialect)).join(", ")})`
        ).join(", ")
        sql += ` (${columns}) values ${rows}`
      } else if (insertSource?.kind === "query") {
        const columns = insertSource.columns.map((column) => quoteColumn(column, state, dialect, targetSource.tableName)).join(", ")
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
        const columns = insertSource.columns.map((column) => quoteColumn(column, state, dialect, targetSource.tableName)).join(", ")
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
        const insertValues = insertAst.values ?? []
        const columns = insertValues.map((entry) => quoteColumn(entry.columnName, state, dialect, targetSource.tableName)).join(", ")
        const values = insertValues.map((entry) => renderExpression(entry.value, targetCasingState, dialect)).join(", ")
        if (insertValues.length > 0) {
          sql += ` (${columns}) values (${values})`
        } else {
          sql += " default values"
        }
      }
      if (conflict) {
        if (dialect.name === "standard") {
          throw new Error("Unsupported standard insert conflict")
        }
        const conflictValueState = { ...targetCasingState, allowExcluded: true }
        const updateValues = (conflict.values ?? []).map((entry) =>
          `${quoteColumn(entry.columnName, state, dialect, targetSource.tableName)} = ${renderExpression(entry.value, conflictValueState, dialect)}`
        ).join(", ")
        if (dialect.name === "postgres") {
          const targetSql = conflict.target?.kind === "constraint"
            ? ` on conflict on constraint ${dialect.quoteIdentifier(Casing.applyCategory(targetCasingState.casing, "constraints", conflict.target.name))}`
            : conflict.target?.kind === "columns"
              ? ` on conflict (${conflict.target.columns.map((column) => quoteColumn(column, state, dialect, targetSource.tableName)).join(", ")})${conflict.target.where ? ` where ${renderExpression(conflict.target.where, targetCasingState, dialect)}` : ""}`
              : " on conflict"
          sql += targetSql
          sql += conflict.action === "doNothing"
            ? " do nothing"
            : ` do update set ${updateValues}${conflict.where ? ` where ${renderExpression(conflict.where, conflictValueState, dialect)}` : ""}`
        } else if (conflict.action === "doNothing") {
          sql = sql.replace(/^insert/, "insert ignore")
        } else {
          sql += ` on duplicate key update ${updateValues}`
        }
      }
      assertSupportedMutationReturning(dialect, insertAst.select as Record<string, unknown>)
      const returning = renderSelectionList(insertAst.select as Record<string, unknown>, state, dialect)
      projections = returning.projections
      if (returning.sql.length > 0) {
        sql += ` returning ${returning.sql}`
      }
      break
    }
    case "update": {
      const updateAst = ast as QueryAst.Ast<Record<string, unknown>, any, "update">
      const targetSource = updateAst.target!
      const target = renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)
      const targets = updateAst.targets ?? [targetSource]
      const fromSources = updateAst.fromSources ?? []
      if (dialect.name === "standard" && (targets.length > 1 || fromSources.length > 0 || updateAst.joins.length > 0)) {
        throw new Error("Unsupported standard joined mutation")
      }
      const assignments = updateAst.set!.map((entry) =>
        renderMutationAssignment(entry, state, dialect, targetSource.tableName)).join(", ")
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
      assertSupportedMutationReturning(dialect, updateAst.select as Record<string, unknown>)
      const returning = renderSelectionList(updateAst.select as Record<string, unknown>, state, dialect)
      projections = returning.projections
      if (returning.sql.length > 0) {
        sql += ` returning ${returning.sql}`
      }
      break
    }
    case "delete": {
      const deleteAst = ast as QueryAst.Ast<Record<string, unknown>, any, "delete">
      const targetSource = deleteAst.target!
      const target = renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)
      const targets = deleteAst.targets ?? [targetSource]
      if (dialect.name === "standard" && (targets.length > 1 || deleteAst.joins.length > 0)) {
        throw new Error("Unsupported standard joined mutation")
      }
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
      assertSupportedMutationReturning(dialect, deleteAst.select as Record<string, unknown>)
      const returning = renderSelectionList(deleteAst.select as Record<string, unknown>, state, dialect)
      projections = returning.projections
      if (returning.sql.length > 0) {
        sql += ` returning ${returning.sql}`
      }
      break
    }
    case "truncate": {
      const truncateAst = ast as QueryAst.Ast<Record<string, unknown>, any, "truncate">
      if (dialect.name === "standard") {
        throw new Error("Unsupported standard truncate statement")
      }
      const truncate = expectTruncateClause(truncateAst.truncate)
      const targetSource = truncateAst.target!
      const restartIdentity = truncate.restartIdentity
      const cascade = truncate.cascade
      sql = `truncate table ${renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)}`
      if (restartIdentity) {
        sql += " restart identity"
      }
      if (cascade) {
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
      sql = `merge into ${renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)} using ${renderSourceReference(usingSource.source, usingSource.tableName, usingSource.baseTableName, state, dialect)} on ${renderExpression(merge.on, state, dialect)}`
      if (merge.whenMatched) {
        const matchedKind = merge.whenMatched.kind === "delete" ? "delete" : "update"
        sql += " when matched"
        if (merge.whenMatched.predicate) {
          sql += ` and ${renderExpression(merge.whenMatched.predicate, state, dialect)}`
        }
        if (matchedKind === "delete") {
          sql += " then delete"
        } else {
          const matchedUpdate = merge.whenMatched as Extract<QueryAst.MergeMatchedClause, { readonly kind: "update" }>
          sql += ` then update set ${matchedUpdate.values.map((entry) =>
            `${quoteColumn(entry.columnName, state, dialect, targetSource.tableName)} = ${renderExpression(entry.value, state, dialect)}`
          ).join(", ")}`
        }
      }
      if (merge.whenNotMatched) {
        sql += " when not matched"
        if (merge.whenNotMatched.predicate) {
          sql += ` and ${renderExpression(merge.whenNotMatched.predicate, state, dialect)}`
        }
        sql += ` then insert (${merge.whenNotMatched.values.map((entry) => quoteColumn(entry.columnName, state, dialect, targetSource.tableName)).join(", ")}) values (${merge.whenNotMatched.values.map((entry) => renderExpression(entry.value, state, dialect)).join(", ")})`
      }
      break
    }
    case "transaction":
    case "commit":
    case "rollback":
    case "savepoint":
    case "rollbackTo":
    case "releaseSavepoint": {
      sql = renderTransactionClause(ast.transaction!, dialect)
      break
    }
    case "createTable": {
      const createTableAst = ast as QueryAst.Ast<Record<string, unknown>, any, "createTable">
      const ddl = expectDdlClauseKind(createTableAst.ddl, "createTable")
      sql = renderCreateTableSql(createTableAst.target!, state, dialect, ddl.ifNotExists)
      break
    }
    case "dropTable": {
      const dropTableAst = ast as QueryAst.Ast<Record<string, unknown>, any, "dropTable">
      const ddl = expectDdlClauseKind(dropTableAst.ddl, "dropTable")
      const ifExists = normalizeStatementFlag(ddl.ifExists)
      if (dialect.name !== "postgres" && ifExists) {
        throw new Error(`Unsupported ${dialect.name} drop table options`)
      }
      sql = `drop table${ifExists ? " if exists" : ""} ${renderSourceReference(dropTableAst.target!.source, dropTableAst.target!.tableName, dropTableAst.target!.baseTableName, state, dialect)}`
      break
    }
    case "createIndex": {
      const createIndexAst = ast as QueryAst.Ast<Record<string, unknown>, any, "createIndex">
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
      sql = renderDropIndexSql(
        dropIndexAst.target!,
        expectDdlClauseKind(dropIndexAst.ddl, "dropIndex"),
        state,
        dialect
      )
      break
    }
    default: {
      if (ast.transaction !== undefined) {
        sql = renderTransactionClause(ast.transaction, dialect)
      }
      break
    }
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
    if (dialect.name === "standard") {
      throw new Error("Unsupported standard lateral source")
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
    const functionName = renderFunctionName(tableFunction.functionName)
    const columnNames = Object.keys(tableFunction.columns)
    return `${functionName}(${tableFunction.args.map((arg) => renderExpression(arg, state, dialect)).join(", ")}) as ${dialect.quoteIdentifier(tableFunction.name)}(${columnNames.map((columnName) => dialect.quoteIdentifier(columnName)).join(", ")})`
  }
  const schemaName = typeof source === "object" && source !== null && Table.TypeId in source
    ? casedSchemaName(source as Table.AnyTable, state)
    : undefined
  if (typeof source === "object" && source !== null && Table.TypeId in source) {
    const table = source as Table.AnyTable
    const renderedBaseName = casedTableName(table, state)
    const renderedTableName = table[Table.TypeId].kind === "alias"
      ? tableName
      : renderedBaseName
    return dialect.renderTableReference(renderedTableName, renderedBaseName, schemaName)
  }
  return dialect.renderTableReference(
    Casing.applyCategory(state.casing, "tables", tableName),
    Casing.applyCategory(state.casing, "tables", baseTableName),
    schemaName
  )
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
  const renderComparisonOperator = (operator: unknown): "=" | "<>" | "<" | "<=" | ">" | ">=" =>
    ({
      eq: "=",
      neq: "<>",
      lt: "<",
      lte: "<=",
      gt: ">",
      gte: ">="
    } as const)[operator as "eq" | "neq" | "lt" | "lte" | "gt" | "gte"]!
  const renderCollation = (collation: unknown): string => {
    return (collation as readonly string[]).map((segment) => dialect.quoteIdentifier(segment)).join(".")
  }
  switch (ast.kind) {
    case "column":
      return state.rowLocalColumns || ast.tableName.length === 0
        ? quoteColumn(ast.columnName, state, dialect, ast.tableName)
        : `${dialect.quoteIdentifier(casedTableReferenceName(ast.tableName, state))}.${quoteColumn(ast.columnName, state, dialect, ast.tableName)}`
    case "literal":
      if (typeof ast.value === "number" && !Number.isFinite(ast.value)) {
        throw new Error("Expected a finite numeric value")
      }
      return dialect.renderLiteral(ast.value, state, expression[Expression.TypeId])
    case "excluded":
      if (state.allowExcluded !== true) {
        throw new Error("excluded(...) is only supported inside insert conflict handlers")
      }
      return dialect.name === "mysql"
        ? `values(${quoteColumn(ast.columnName, state, dialect)})`
        : `excluded.${quoteColumn(ast.columnName, state, dialect)}`
    case "cast":
      return `cast(${renderExpression(expectValueExpression("cast", ast.value), state, dialect)} as ${renderCastType(dialect, ast.target)})`
    case "collate":
      return `(${renderExpression(expectValueExpression("collate", ast.value), state, dialect)} collate ${renderCollation(ast.collation)})`
    case "function":
      return renderFunctionCall(ast.name, ast.args, state, dialect)
    case "eq":
      return renderBinaryExpression("eq", "=", ast.left, ast.right, state, dialect)
    case "neq":
      return renderBinaryExpression("neq", "<>", ast.left, ast.right, state, dialect)
    case "lt":
      return renderBinaryExpression("lt", "<", ast.left, ast.right, state, dialect)
    case "lte":
      return renderBinaryExpression("lte", "<=", ast.left, ast.right, state, dialect)
    case "gt":
      return renderBinaryExpression("gt", ">", ast.left, ast.right, state, dialect)
    case "gte":
      return renderBinaryExpression("gte", ">=", ast.left, ast.right, state, dialect)
    case "like":
      return renderBinaryExpression("like", "like", ast.left, ast.right, state, dialect)
    case "ilike": {
      const [left, right] = expectBinaryExpressions("ilike", ast.left, ast.right)
      return dialect.name === "postgres"
        ? `(${renderExpression(left, state, dialect)} ilike ${renderExpression(right, state, dialect)})`
        : `(lower(${renderExpression(left, state, dialect)}) like lower(${renderExpression(right, state, dialect)}))`
    }
    case "regexMatch": {
      const [left, right] = expectBinaryExpressions("regexMatch", ast.left, ast.right)
      if (dialect.name === "standard") {
        throw new Error("Unsupported standard regular-expression predicates")
      }
      return dialect.name === "postgres"
        ? `(${renderExpression(left, state, dialect)} ~ ${renderExpression(right, state, dialect)})`
        : `(${renderExpression(left, state, dialect)} regexp ${renderExpression(right, state, dialect)})`
    }
    case "regexIMatch": {
      const [left, right] = expectBinaryExpressions("regexIMatch", ast.left, ast.right)
      if (dialect.name === "standard") {
        throw new Error("Unsupported standard regular-expression predicates")
      }
      return dialect.name === "postgres"
        ? `(${renderExpression(left, state, dialect)} ~* ${renderExpression(right, state, dialect)})`
        : `(${renderExpression(left, state, dialect)} regexp ${renderExpression(right, state, dialect)})`
    }
    case "regexNotMatch": {
      const [left, right] = expectBinaryExpressions("regexNotMatch", ast.left, ast.right)
      if (dialect.name === "standard") {
        throw new Error("Unsupported standard regular-expression predicates")
      }
      return dialect.name === "postgres"
        ? `(${renderExpression(left, state, dialect)} !~ ${renderExpression(right, state, dialect)})`
        : `(${renderExpression(left, state, dialect)} not regexp ${renderExpression(right, state, dialect)})`
    }
    case "regexNotIMatch": {
      const [left, right] = expectBinaryExpressions("regexNotIMatch", ast.left, ast.right)
      if (dialect.name === "standard") {
        throw new Error("Unsupported standard regular-expression predicates")
      }
      return dialect.name === "postgres"
        ? `(${renderExpression(left, state, dialect)} !~* ${renderExpression(right, state, dialect)})`
        : `(${renderExpression(left, state, dialect)} not regexp ${renderExpression(right, state, dialect)})`
    }
    case "isDistinctFrom": {
      const [left, right] = expectBinaryExpressions("isDistinctFrom", ast.left, ast.right)
      return dialect.name === "mysql"
        ? `(not (${renderExpression(left, state, dialect)} <=> ${renderExpression(right, state, dialect)}))`
        : `(${renderExpression(left, state, dialect)} is distinct from ${renderExpression(right, state, dialect)})`
    }
    case "isNotDistinctFrom": {
      const [left, right] = expectBinaryExpressions("isNotDistinctFrom", ast.left, ast.right)
      return dialect.name === "mysql"
        ? `(${renderExpression(left, state, dialect)} <=> ${renderExpression(right, state, dialect)})`
        : `(${renderExpression(left, state, dialect)} is not distinct from ${renderExpression(right, state, dialect)})`
    }
    case "contains": {
      const [leftExpression, rightExpression] = expectBinaryExpressions("contains", ast.left, ast.right)
      if (dialect.name === "postgres") {
        assertCompatiblePostgresRangeOperands(leftExpression, rightExpression)
        const left = isJsonExpression(leftExpression)
          ? renderPostgresJsonValue(leftExpression, state, dialect)
          : renderExpression(leftExpression, state, dialect)
        const right = isJsonExpression(rightExpression)
          ? renderPostgresJsonValue(rightExpression, state, dialect)
          : renderExpression(rightExpression, state, dialect)
        return `(${left} @> ${right})`
      }
      if (dialect.name === "mysql" && isJsonExpression(leftExpression) && isJsonExpression(rightExpression)) {
        return `json_contains(${renderExpression(leftExpression, state, dialect)}, ${renderExpression(rightExpression, state, dialect)})`
      }
      throw new Error("Unsupported container operator for SQL rendering")
    }
    case "containedBy": {
      const [leftExpression, rightExpression] = expectBinaryExpressions("containedBy", ast.left, ast.right)
      if (dialect.name === "postgres") {
        assertCompatiblePostgresRangeOperands(leftExpression, rightExpression)
        const left = isJsonExpression(leftExpression)
          ? renderPostgresJsonValue(leftExpression, state, dialect)
          : renderExpression(leftExpression, state, dialect)
        const right = isJsonExpression(rightExpression)
          ? renderPostgresJsonValue(rightExpression, state, dialect)
          : renderExpression(rightExpression, state, dialect)
        return `(${left} <@ ${right})`
      }
      if (dialect.name === "mysql" && isJsonExpression(leftExpression) && isJsonExpression(rightExpression)) {
        return `json_contains(${renderExpression(rightExpression, state, dialect)}, ${renderExpression(leftExpression, state, dialect)})`
      }
      throw new Error("Unsupported container operator for SQL rendering")
    }
    case "overlaps": {
      const [leftExpression, rightExpression] = expectBinaryExpressions("overlaps", ast.left, ast.right)
      if (dialect.name === "postgres") {
        assertCompatiblePostgresRangeOperands(leftExpression, rightExpression)
        const left = isJsonExpression(leftExpression)
          ? renderPostgresJsonValue(leftExpression, state, dialect)
          : renderExpression(leftExpression, state, dialect)
        const right = isJsonExpression(rightExpression)
          ? renderPostgresJsonValue(rightExpression, state, dialect)
          : renderExpression(rightExpression, state, dialect)
        return `(${left} && ${right})`
      }
      if (dialect.name === "mysql" && isJsonExpression(leftExpression) && isJsonExpression(rightExpression)) {
        return `json_overlaps(${renderExpression(leftExpression, state, dialect)}, ${renderExpression(rightExpression, state, dialect)})`
      }
      throw new Error("Unsupported container operator for SQL rendering")
    }
    case "isNull":
      return `(${renderExpression(expectValueExpression("isNull", ast.value), state, dialect)} is null)`
    case "isNotNull":
      return `(${renderExpression(expectValueExpression("isNotNull", ast.value), state, dialect)} is not null)`
    case "not":
      return `(not ${renderExpression(expectValueExpression("not", ast.value), state, dialect)})`
    case "upper":
      return `upper(${renderExpression(expectValueExpression("upper", ast.value), state, dialect)})`
    case "lower":
      return `lower(${renderExpression(expectValueExpression("lower", ast.value), state, dialect)})`
    case "count":
      return `count(${renderExpression(expectValueExpression("count", ast.value), state, dialect)})`
    case "max":
      return `max(${renderExpression(expectValueExpression("max", ast.value), state, dialect)})`
    case "min":
      return `min(${renderExpression(expectValueExpression("min", ast.value), state, dialect)})`
    case "and":
      return `(${ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(" and ")})`
    case "or":
      return `(${ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(" or ")})`
    case "coalesce":
      return `coalesce(${ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(", ")})`
    case "in":
      return `(${renderExpression(ast.values[0]!, state, dialect)} in (${ast.values.slice(1).map((value: Expression.Any) => renderExpression(value, state, dialect)).join(", ")}))`
    case "notIn":
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
      return `(${renderExpression(expectValueExpression("inSubquery", ast.left), state, dialect)} in (${renderSubqueryExpressionPlan(ast.plan, state, dialect)}))`
    case "comparisonAny": {
      const left = expectValueExpression("compareAny", ast.left)
      const operator = renderComparisonOperator(ast.operator)
      if (dialect.name === "standard") {
        throw new Error("Unsupported standard quantified comparison")
      }
      return `(${renderExpression(left, state, dialect)} ${operator} any (${renderSubqueryExpressionPlan(ast.plan, state, dialect)}))`
    }
    case "comparisonAll": {
      const left = expectValueExpression("compareAll", ast.left)
      const operator = renderComparisonOperator(ast.operator)
      if (dialect.name === "standard") {
        throw new Error("Unsupported standard quantified comparison")
      }
      return `(${renderExpression(left, state, dialect)} ${operator} all (${renderSubqueryExpressionPlan(ast.plan, state, dialect)}))`
    }
    case "window": {
      const partitionBy = ast.partitionBy as readonly Expression.Any[]
      const orderBy = ast.orderBy as readonly {
        readonly value: Expression.Any
        readonly direction: string
      }[]
      const clauses: string[] = []
      if (partitionBy.length > 0) {
        clauses.push(`partition by ${partitionBy.map((value) => renderExpression(value, state, dialect)).join(", ")}`)
      }
      if (orderBy.length > 0) {
        clauses.push(`order by ${orderBy.map((entry) =>
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
          return `${renderExpression(ast.value as Expression.Any, state, dialect)} over (${specification})`
      }
      break
    }
  }
  throw new Error("Unsupported expression for SQL rendering")
}
