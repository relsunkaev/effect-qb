import * as Schema from "effect/Schema"

import * as Query from "../query.js"
import * as Expression from "../scalar.js"
import * as Table from "../table.js"
import * as QueryAst from "../query-ast.js"
import { renderDbTypeName, type RenderState, type RenderValueContext, type SqlDialect } from "../dialect.js"
import * as ExpressionAst from "../expression-ast.js"
import * as JsonPath from "../json/path.js"
import { expectConflictClause } from "../dsl-mutation-runtime.js"
import { expectDdlClauseKind, normalizeStatementFlag, normalizeStatementIdentifier } from "../dsl-transaction-ddl-runtime.js"
import {
  renderJsonSelectSql,
  renderSelectSql,
  toDriverValue
} from "../runtime/driver-value-mapping.js"
import { normalizeDbValue } from "../runtime/normalize.js"
import { flattenSelection, type Projection } from "../projections.js"
import * as SchemaExpression from "../schema-expression.js"
import { renderReferentialAction, validateOptions, type DdlExpressionLike, type TableOptionSpec } from "../table-options.js"
import * as Casing from "../casing.js"

const renderDbType = (
  dialect: SqlDialect,
  dbType: Expression.DbType.Any
): string => {
  if (dialect.name === "sqlite" && dbType.kind === "uuid") {
    return "text"
  }
  return renderDbTypeName(dbType.kind)
}

const isArrayDbType = (dbType: Expression.DbType.Any): boolean =>
  "element" in dbType

const renderCastType = (
  dialect: SqlDialect,
  dbType: unknown
): string => {
  const kind = (dbType as { readonly kind?: string } | undefined)?.kind as string
  if (dialect.name !== "sqlite") {
    return renderDbTypeName(kind)
  }
  switch (kind) {
    case "text":
      return "text"
    case "uuid":
      return "text"
    case "numeric":
      return "numeric"
    case "int":
      return "integer"
    case "time":
      return "time"
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

const renderSqliteDdlString = (value: string): string =>
  `'${value.replaceAll("'", "''")}'`

const renderSqliteDdlBytes = (value: Uint8Array): string =>
  `x'${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}'`

const renderSqliteDdlLiteral = (
  value: unknown,
  state: RenderState,
  context: RenderValueContext = {}
): string => {
  const driverValue = toDriverValue(value, {
    dialect: "sqlite",
    valueMappings: state.valueMappings,
    ...context
  })
  if (driverValue === null) {
    return "null"
  }
  switch (typeof driverValue) {
    case "boolean":
      return driverValue ? "1" : "0"
    case "number":
      if (!Number.isFinite(driverValue)) {
        throw new Error("Expected a finite numeric value")
      }
      return String(driverValue)
    case "bigint":
      return driverValue.toString()
    case "string":
      return renderSqliteDdlString(driverValue)
    case "object":
      if (driverValue instanceof Uint8Array) {
        return renderSqliteDdlBytes(driverValue)
      }
      break
  }
  throw new Error("Unsupported sqlite DDL literal value")
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
    renderLiteral: renderSqliteDdlLiteral
  })
}

const renderSqliteMutationLimit = (
  expression: Expression.Any,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const ast = (expression as Expression.Any & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.Any
  })[ExpressionAst.TypeId]
  if (ast.kind === "literal" && typeof ast.value === "number" && Number.isInteger(ast.value) && ast.value >= 0) {
    return String(ast.value)
  }
  return renderExpression(expression, state, dialect)
}

const casingForTable = (
  table: Table.AnyTable,
  state: RenderState
): Casing.Options | undefined =>
  Casing.merge(state.casing, table[Table.TypeId].casing)

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

const renderColumnDefinition = (
  dialect: SqlDialect,
  state: RenderState,
  columnName: string,
  column: Table.AnyTable[typeof Table.TypeId]["fields"][string],
  tableName?: string,
  casing?: Casing.Options
): string => {
  const expressionState = { ...state, casing, rowLocalColumns: true }
  if (isArrayDbType(column.metadata.dbType)) {
    throw new Error("Unsupported sqlite array column options")
  }
  const clauses = [
    quoteColumn(columnName, state, dialect, tableName),
    column.metadata.ddlType === undefined
      ? renderDbType(dialect, column.metadata.dbType)
      : renderDbTypeName(column.metadata.ddlType)
  ]
  if (column.metadata.identity) {
    throw new Error("Unsupported sqlite identity column options")
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
  const table = targetSource.source as Table.AnyTable
  const tableCasing = casingForTable(table, state)
  const fields = table[Table.TypeId].fields
  const definitions = Object.entries(fields).map(([columnName, column]) =>
    renderColumnDefinition(dialect, state, columnName, column, targetSource.tableName, tableCasing)
  )
  const options = table[Table.OptionsSymbol] as unknown
  if (!Array.isArray(options)) {
    throw new Error(`Table '${table[Table.TypeId].name}' options require an array`)
  }
  const tableOptions = options as readonly TableOptionSpec[]
  validateOptions(table[Table.TypeId].name, fields, tableOptions)
  for (const option of tableOptions) {
    switch (option.kind) {
      case "primaryKey":
        if (option.deferrable || option.initiallyDeferred) {
          throw new Error("Unsupported sqlite primary key constraint options")
        }
        definitions.push(`${option.name ? `constraint ${dialect.quoteIdentifier(Casing.applyCategory(tableCasing, "constraints", option.name))} ` : ""}primary key (${option.columns.map((column) => quoteColumn(column, state, dialect, targetSource.tableName)).join(", ")})${option.deferrable ? ` deferrable${option.initiallyDeferred ? " initially deferred" : ""}` : ""}`)
        break
      case "unique":
        if (option.nullsNotDistinct || option.deferrable || option.initiallyDeferred) {
          throw new Error("Unsupported sqlite unique constraint options")
        }
        definitions.push(`${option.name ? `constraint ${dialect.quoteIdentifier(Casing.applyCategory(tableCasing, "constraints", option.name))} ` : ""}unique${option.nullsNotDistinct ? " nulls not distinct" : ""} (${option.columns.map((column) => quoteColumn(column, state, dialect, targetSource.tableName)).join(", ")})${option.deferrable ? ` deferrable${option.initiallyDeferred ? " initially deferred" : ""}` : ""}`)
        break
      case "foreignKey": {
        const reference = option.references()
        definitions.push(
          `${option.name ? `constraint ${dialect.quoteIdentifier(Casing.applyCategory(tableCasing, "constraints", option.name))} ` : ""}foreign key (${option.columns.map((column) => quoteColumn(column, state, dialect, targetSource.tableName)).join(", ")}) references ${renderReferenceTable(reference, state, dialect)} (${reference.columns.map((column) => quoteReferenceColumn(column, reference, state, dialect)).join(", ")})${option.onDelete !== undefined ? ` on delete ${renderReferentialAction(option.onDelete)}` : ""}${option.onUpdate !== undefined ? ` on update ${renderReferentialAction(option.onUpdate)}` : ""}${option.deferrable ? ` deferrable${option.initiallyDeferred ? " initially deferred" : ""}` : ""}`
        )
        break
      }
      case "check":
        if (option.noInherit) {
          throw new Error("Unsupported sqlite check constraint options")
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
  const maybeIfNotExists = (dialect.name === "postgres" || dialect.name === "sqlite") && ifNotExists ? " if not exists" : ""
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
  const table = targetSource.source as Table.AnyTable
  const tableCasing = casingForTable(table, state)
  return dialect.name === "postgres" || dialect.name === "sqlite"
    ? `drop index${ifExists ? " if exists" : ""} ${dialect.quoteIdentifier(Casing.applyCategory(tableCasing, "indexes", name))}`
    : `drop index ${dialect.quoteIdentifier(Casing.applyCategory(tableCasing, "indexes", name))} on ${renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)}`
}

const isExpression = (value: unknown): value is Expression.Any =>
  value !== null && typeof value === "object" && Expression.TypeId in value

const isJsonDbType = (dbType: Expression.DbType.Any): boolean =>
  dbType.kind === "jsonb" || dbType.kind === "json" || ("variant" in dbType && dbType.variant === "json")

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

const renderSqliteJsonIndex = (index: number): string =>
  index >= 0 ? String(index) : `#${index}`

const renderSqliteJsonPathSegment = (segment: JsonPath.AnySegment | string | number): string => {
  if (typeof segment === "number") {
    return `[${renderSqliteJsonIndex(segment)}]`
  }
  if (typeof segment === "object" && segment !== null && segment.kind === "index") {
    return `[${renderSqliteJsonIndex(segment.index)}]`
  }
  if (typeof segment === "object" && segment !== null && segment.kind === "slice") {
    throw new Error("SQLite JSON paths do not support slice segments")
  }
  if (typeof segment === "object" && segment !== null && segment.kind === "wildcard") {
    throw new Error("SQLite JSON paths do not support wildcard segments")
  }
  if (typeof segment === "object" && segment !== null && segment.kind === "descend") {
    throw new Error("SQLite JSON paths do not support recursive descent segments")
  }
  return renderJsonPathSegment(segment)
}

const renderJsonPathStringLiteral = (
  segments: ReadonlyArray<JsonPath.AnySegment | string | number>,
  renderSegment: (segment: JsonPath.AnySegment | string | number) => string = renderJsonPathSegment
): string => {
  let path = "$"
  for (const segment of segments) {
    path += renderSegment(segment)
  }
  return path
}

const renderSqliteJsonPath = (
  segments: ReadonlyArray<JsonPath.AnySegment | string | number>,
  state: RenderState,
  dialect: SqlDialect
): string => dialect.renderLiteral(renderJsonPathStringLiteral(segments, renderSqliteJsonPathSegment), state)

const isJsonArrayIndexSegment = (segment: JsonPath.AnySegment | string | number | undefined): boolean =>
  typeof segment === "number" || (typeof segment === "object" && segment !== null && segment.kind === "index")

const renderSqliteJsonInsertPath = (
  segments: ReadonlyArray<JsonPath.AnySegment | string | number>,
  insertAfter: boolean,
  state: RenderState,
  dialect: SqlDialect
): string => {
  if (!insertAfter || segments.length === 0) {
    return renderSqliteJsonPath(segments, state, dialect)
  }
  const last = segments[segments.length - 1]
  const nextSegments = segments.slice(0, -1)
  if (typeof last === "number") {
    return renderSqliteJsonPath([...nextSegments, last + 1], state, dialect)
  }
  if (typeof last === "object" && last !== null && last.kind === "index") {
    return renderSqliteJsonPath([...nextSegments, { ...last, index: last.index + 1 }], state, dialect)
  }
  return renderSqliteJsonPath(segments, state, dialect)
}

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
      return `${textMode ? "->>" : "->"} ${dialect.renderLiteral(String(segment.index), state)}`
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
): string => {
  if (dialect.name === "sqlite" && isJsonDbType(expression[Expression.TypeId].dbType)) {
    const ast = (expression as Expression.Any & {
      readonly [ExpressionAst.TypeId]: ExpressionAst.Any
    })[ExpressionAst.TypeId]
    if (ast.kind === "literal") {
      state.params.push(JSON.stringify(ast.value))
      return "json(?)"
    }
    return `json(${renderExpression(expression, state, dialect)})`
  }
  return renderJsonSelectSql(
    renderExpression(expression, state, dialect),
    expressionDriverContext(expression, state, dialect)
  )
}

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
    const renderSegment = dialect.name === "sqlite"
      ? renderSqliteJsonPathSegment
      : renderJsonPathSegment
    return dialect.renderLiteral(renderJsonPathStringLiteral(value.segments, renderSegment), state)
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
        return functionName
      case "localtime":
        return "time('now', 'localtime')"
      case "localtimestamp":
        return "datetime('now', 'localtime')"
      case "now":
        return "current_timestamp"
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
      if (dialect.name === "sqlite") {
        const extracted = `json_extract(${baseSql}, ${renderSqliteJsonPath(segments, state, dialect)})`
        return extracted
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
      if (dialect.name === "sqlite") {
        const renderBase = () => renderExpression(base, state, dialect)
        const checks = keyNames.map((segment) => `json_type(${renderBase()}, ${renderSqliteJsonPath([segment], state, dialect)}) is not null`)
        return `(${checks.join(kind === "jsonHasAllKeys" ? " and " : " or ")})`
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
      if (dialect.name === "sqlite") {
        return `json_patch(${renderJsonInputExpression(ast.left, state, dialect)}, ${renderJsonInputExpression(ast.right, state, dialect)})`
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
      if (dialect.name === "sqlite") {
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
      if (dialect.name === "sqlite") {
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
      if (dialect.name === "sqlite") {
        return `json_quote(${renderExpression(base, state, dialect)})`
      }
      return undefined
    case "jsonToJsonb":
      if (!isExpression(base)) {
        return undefined
      }
      if (dialect.name === "postgres") {
        return `to_jsonb(${renderJsonInputExpression(base, state, dialect)})`
      }
      if (dialect.name === "sqlite") {
        return `json_quote(${renderExpression(base, state, dialect)})`
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
      if (dialect.name === "sqlite") {
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
      if (dialect.name === "sqlite") {
        if (segments.length > 0) {
          return `json_array_length(${renderExpression(base, state, dialect)}, ${renderSqliteJsonPath(segments, state, dialect)})`
        }
        const renderBase = () => renderExpression(base, state, dialect)
        return `(case when json_type(${renderBase()}) = 'array' then json_array_length(${renderBase()}) when json_type(${renderBase()}) = 'object' then (select count(*) from json_each(${renderBase()})) else null end)`
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
        return `(case when ${typeOf}(${baseSql}) = 'object' then array(select ${objectKeys}(${baseSql})) else null end)`
      }
      if (dialect.name === "sqlite") {
        const renderBase = () => renderExpression(base, state, dialect)
        return `(case when json_type(${renderBase()}) = 'object' then (select json_group_array(key) from json_each(${renderBase()})) else null end)`
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
            : dialect.renderLiteral(String(segment.index), state)})`
        }
        return `(${baseSql} #- ${renderPostgresJsonPathArray(segments, state, dialect)})`
      }
      if (dialect.name === "sqlite") {
        return `json_remove(${renderExpression(base, state, dialect)}, ${renderSqliteJsonPath(segments, state, dialect)})`
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
      if (dialect.name === "sqlite") {
        if (kind === "jsonInsert" && isJsonArrayIndexSegment(segments[segments.length - 1])) {
          unsupportedJsonFeature(dialect, insertAfter ? "jsonInsertAfter" : "jsonInsertArrayIndex")
        }
        const functionName = kind === "jsonInsert" ? "json_insert" : createMissing ? "json_set" : "json_replace"
        return `${functionName}(${renderExpression(base, state, dialect)}, ${renderSqliteJsonPath(segments, state, dialect)}, ${renderJsonInputExpression(nextValue, state, dialect)})`
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
      if (dialect.name === "sqlite") {
        return `(json_type(${renderExpression(base, state, dialect)}, ${renderJsonOpaquePath(path, state, dialect)}) is not null)`
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
  const column = entry.tableName && dialect.name === "sqlite"
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

const renderTransactionClause = (
  clause: QueryAst.TransactionClause,
  dialect: SqlDialect
): string => {
  switch (clause.kind) {
    case "transaction": {
      if (clause.readOnly !== undefined) {
        normalizeStatementFlag(clause.readOnly)
      }
      if (clause.isolationLevel !== undefined || clause.readOnly !== undefined) {
        throw new Error("Unsupported sqlite transaction options")
      }
      return "begin"
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
  return "begin"
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
      const rendered = renderSelectionList(ast.select as Record<string, unknown>, state, dialect)
      projections = rendered.projections
      const clauses = [
        ast.distinctOn && ast.distinctOn.length > 0
          ? `select distinct on (${ast.distinctOn.map((value) => renderExpression(value, state, dialect)).join(", ")}) ${rendered.sql}`
          : `select${ast.distinct ? " distinct" : ""} ${rendered.sql}`
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
        throw new Error("Unsupported sqlite row locking")
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
        base.sql,
        ...(setAst.setOperations ?? []).map((entry) => {
          if (dialect.name === "sqlite" && entry.all && entry.kind !== "union") {
            throw new Error("Unsupported sqlite set operator all variant")
          }
          const rendered = renderQueryAst(
            Query.getAst(entry.query as Query.Plan.Any) as QueryAst.Ast<
              Record<string, unknown>,
              any,
              QueryAst.QueryStatement
            >,
            state,
            dialect
          )
          return `${entry.kind}${entry.all ? " all" : ""} ${rendered.sql}`
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
          const table = targetSource.source as Table.AnyTable
          const fields = table[Table.TypeId].fields
          const encodedValues = insertSource.values.map((entry) => ({
            columnName: entry.columnName,
            values: encodeArrayValues(entry.values, fields[entry.columnName]!, state, dialect)
          }))
          const rowCount = encodedValues[0]?.values.length ?? 0
          const rows = Array.from({ length: rowCount }, (_, index) =>
            `(${encodedValues.map((entry) => dialect.renderLiteral(entry.values[index], state)).join(", ")})`
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
        const conflictValueState = { ...targetCasingState, allowExcluded: true }
        const updateValues = (conflict.values ?? []).map((entry) =>
          `${quoteColumn(entry.columnName, state, dialect, targetSource.tableName)} = ${renderExpression(entry.value, conflictValueState, dialect)}`
        ).join(", ")
        if (dialect.name === "postgres" || dialect.name === "sqlite") {
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
      if (targets.length > 1) {
        throw new Error("Unsupported sqlite multi-table update")
      }
      const assignments = updateAst.set!.map((entry) =>
        renderMutationAssignment(entry, state, dialect, targetSource.tableName)).join(", ")
      if (dialect.name === "mysql") {
        const modifiers = ""
        const extraSources = renderFromSources(fromSources, state, dialect)
        const joinSources = updateAst.joins.map((join) =>
          join.kind === "full"
            ? (() => {
              throw new Error("Unsupported sqlite full join")
            })()
            : join.kind === "cross"
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
        ...(dialect.name === "postgres" || dialect.name === "sqlite" ? renderJoinPredicatesForMutation(updateAst.joins, state, dialect) : []),
        ...updateAst.where.map((entry: QueryAst.WhereClause) => renderExpression(entry.predicate, state, dialect))
      ]
      if (whereParts.length > 0) {
        sql += ` where ${whereParts.join(" and ")}`
      }
      if (dialect.name === "mysql" && updateAst.orderBy.length > 0) {
        sql += ` order by ${updateAst.orderBy.map((entry: QueryAst.OrderByClause) => `${renderExpression(entry.value, state, dialect)} ${entry.direction}`).join(", ")}`
      }
      if (dialect.name === "mysql" && updateAst.limit) {
        sql += ` limit ${renderSqliteMutationLimit(updateAst.limit, state, dialect)}`
      }
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
      if (targets.length > 1) {
        throw new Error("Unsupported sqlite multi-table delete")
      }
      if (dialect.name === "mysql") {
        const modifiers = ""
        const hasJoinedSources = deleteAst.joins.length > 0 || targets.length > 1
        const targetList = renderDeleteTargets(targets, dialect)
        const fromSources = targets.map((entry) =>
          renderSourceReference(entry.source, entry.tableName, entry.baseTableName, state, dialect)
        ).join(", ")
        const joinSources = deleteAst.joins.map((join) =>
          join.kind === "full"
            ? (() => {
              throw new Error("Unsupported sqlite full join")
            })()
            : join.kind === "cross"
              ? `cross join ${renderSourceReference(join.source, join.tableName, join.baseTableName, state, dialect)}`
              : `${join.kind} join ${renderSourceReference(join.source, join.tableName, join.baseTableName, state, dialect)} on ${renderExpression(join.on!, state, dialect)}`
        ).join(" ")
        sql = hasJoinedSources
          ? `delete${modifiers} ${targetList} from ${fromSources}${joinSources.length > 0 ? ` ${joinSources}` : ""}`
          : `delete${modifiers} from ${fromSources}`
      } else {
        if (dialect.name === "sqlite" && deleteAst.joins.length > 0) {
          throw new Error("Unsupported sqlite joined delete")
        }
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
        sql += ` limit ${renderSqliteMutationLimit(deleteAst.limit, state, dialect)}`
      }
      const returning = renderSelectionList(deleteAst.select as Record<string, unknown>, state, dialect)
      projections = returning.projections
      if (returning.sql.length > 0) {
        sql += ` returning ${returning.sql}`
      }
      break
    }
    case "truncate": {
      const truncateAst = ast as QueryAst.Ast<Record<string, unknown>, any, "truncate">
      throw new Error("Unsupported sqlite truncate statement")
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
        sql += " when matched"
        if (merge.whenMatched.predicate) {
          sql += ` and ${renderExpression(merge.whenMatched.predicate, state, dialect)}`
        }
        if (merge.whenMatched.kind === "delete") {
          sql += " then delete"
        } else {
          sql += ` then update set ${merge.whenMatched.values.map((entry) =>
            `${dialect.quoteIdentifier(entry.columnName)} = ${renderExpression(entry.value, state, dialect)}`
          ).join(", ")}`
        }
      }
      if (merge.whenNotMatched) {
        sql += " when not matched"
        if (merge.whenNotMatched.predicate) {
          sql += ` and ${renderExpression(merge.whenNotMatched.predicate, state, dialect)}`
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
    return `(${renderedRows.join(" union all ")}) as ${dialect.quoteIdentifier(tableName)}`
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
      const statement = Query.getQueryState(cte.plan).statement
      if (statement !== "select" && statement !== "set") {
        const cteAst = Query.getAst(cte.plan) as QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>
        if (Object.keys((cteAst.select ?? {}) as Record<string, unknown>).length > 0) {
          throw new Error("Unsupported sqlite returning")
        }
        throw new Error("Unsupported sqlite data-modifying cte")
      }
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
    if (dialect.name === "sqlite") {
      throw new Error("Unsupported sqlite lateral source")
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
    ? (source as Table.AnyTable)[Table.TypeId].schemaName
    : undefined
  if (typeof source === "object" && source !== null && Table.TypeId in source) {
    const table = source as Table.AnyTable
    const tableState = table[Table.TypeId]
    const casing = casingForTable(table, state)
    const renderedTableName = tableState.kind === "alias"
      ? tableName
      : Casing.applyCategory(casing, "tables", baseTableName)
    const renderedBaseName = Casing.applyCategory(casing, "tables", baseTableName)
    const renderedSchemaName = schemaName === undefined
      ? undefined
      : Casing.applyCategory(casing, "schemas", schemaName)
    return dialect.renderTableReference(renderedTableName, renderedBaseName, renderedSchemaName)
  }
  return dialect.renderTableReference(
    Casing.applyCategory(state.casing, "tables", tableName),
    Casing.applyCategory(state.casing, "tables", baseTableName),
    schemaName === undefined ? undefined : Casing.applyCategory(state.casing, "schemas", schemaName)
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
      return `excluded.${quoteColumn(ast.columnName, state, dialect)}`
    case "cast":
      return `cast(${renderExpression(expectValueExpression("cast", ast.value), state, dialect)} as ${renderCastType(dialect, ast.target)})`
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
    case "regexMatch":
      expectBinaryExpressions("regexMatch", ast.left, ast.right)
      if (dialect.name === "sqlite") {
        throw new Error("Unsupported sqlite regex operator")
      }
      return dialect.name === "postgres"
        ? `(${renderExpression(ast.left, state, dialect)} ~ ${renderExpression(ast.right, state, dialect)})`
        : `(${renderExpression(ast.left, state, dialect)} regexp ${renderExpression(ast.right, state, dialect)})`
    case "regexIMatch":
      expectBinaryExpressions("regexIMatch", ast.left, ast.right)
      if (dialect.name === "sqlite") {
        throw new Error("Unsupported sqlite regex operator")
      }
      return dialect.name === "postgres"
        ? `(${renderExpression(ast.left, state, dialect)} ~* ${renderExpression(ast.right, state, dialect)})`
        : `(${renderExpression(ast.left, state, dialect)} regexp ${renderExpression(ast.right, state, dialect)})`
    case "regexNotMatch":
      expectBinaryExpressions("regexNotMatch", ast.left, ast.right)
      if (dialect.name === "sqlite") {
        throw new Error("Unsupported sqlite regex operator")
      }
      return dialect.name === "postgres"
        ? `(${renderExpression(ast.left, state, dialect)} !~ ${renderExpression(ast.right, state, dialect)})`
        : `(${renderExpression(ast.left, state, dialect)} not regexp ${renderExpression(ast.right, state, dialect)})`
    case "regexNotIMatch":
      expectBinaryExpressions("regexNotIMatch", ast.left, ast.right)
      if (dialect.name === "sqlite") {
        throw new Error("Unsupported sqlite regex operator")
      }
      return dialect.name === "postgres"
        ? `(${renderExpression(ast.left, state, dialect)} !~* ${renderExpression(ast.right, state, dialect)})`
        : `(${renderExpression(ast.left, state, dialect)} not regexp ${renderExpression(ast.right, state, dialect)})`
    case "isDistinctFrom":
      return renderBinaryExpression("isDistinctFrom", "is distinct from", ast.left, ast.right, state, dialect)
    case "isNotDistinctFrom":
      return renderBinaryExpression("isNotDistinctFrom", "is not distinct from", ast.left, ast.right, state, dialect)
    case "contains": {
      const [leftExpression, rightExpression] = expectBinaryExpressions("contains", ast.left, ast.right)
      if (dialect.name === "postgres") {
        const left = isJsonExpression(leftExpression)
          ? renderPostgresJsonValue(leftExpression, state, dialect)
          : renderExpression(leftExpression, state, dialect)
        const right = isJsonExpression(rightExpression)
          ? renderPostgresJsonValue(rightExpression, state, dialect)
          : renderExpression(rightExpression, state, dialect)
        return `(${left} @> ${right})`
      }
      throw new Error("Unsupported container operator for SQL rendering")
    }
    case "containedBy": {
      const [leftExpression, rightExpression] = expectBinaryExpressions("containedBy", ast.left, ast.right)
      if (dialect.name === "postgres") {
        const left = isJsonExpression(leftExpression)
          ? renderPostgresJsonValue(leftExpression, state, dialect)
          : renderExpression(leftExpression, state, dialect)
        const right = isJsonExpression(rightExpression)
          ? renderPostgresJsonValue(rightExpression, state, dialect)
          : renderExpression(rightExpression, state, dialect)
        return `(${left} <@ ${right})`
      }
      throw new Error("Unsupported container operator for SQL rendering")
    }
    case "overlaps": {
      const [leftExpression, rightExpression] = expectBinaryExpressions("overlaps", ast.left, ast.right)
      if (dialect.name === "postgres") {
        const left = isJsonExpression(leftExpression)
          ? renderPostgresJsonValue(leftExpression, state, dialect)
          : renderExpression(leftExpression, state, dialect)
        const right = isJsonExpression(rightExpression)
          ? renderPostgresJsonValue(rightExpression, state, dialect)
          : renderExpression(rightExpression, state, dialect)
        return `(${left} && ${right})`
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
      if (dialect.name === "sqlite") {
        throw new Error("Unsupported sqlite quantified comparison")
      }
      return `(${renderExpression(left, state, dialect)} ${operator} any (${renderSubqueryExpressionPlan(ast.plan, state, dialect)}))`
    }
    case "comparisonAll": {
      const left = expectValueExpression("compareAll", ast.left)
      const operator = renderComparisonOperator(ast.operator)
      if (dialect.name === "sqlite") {
        throw new Error("Unsupported sqlite quantified comparison")
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
