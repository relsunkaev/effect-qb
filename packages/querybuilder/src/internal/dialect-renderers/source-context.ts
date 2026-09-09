import * as Table from "../table.js"
import type * as QueryAst from "../query-ast.js"
import type { RenderState, SqlDialect } from "../dialect.js"
import * as Casing from "../casing.js"

export const casingForTable = (
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

export const casedTableReferenceName = (
  tableName: string,
  state: RenderState
): string =>
  state.sourceNames?.get(tableName)?.tableName ?? Casing.applyCategory(state.casing, "tables", tableName)

export const quoteColumn = (
  columnName: string,
  state: RenderState,
  dialect: SqlDialect,
  tableName?: string
): string => dialect.quoteIdentifier(casedColumnName(columnName, state, tableName))

export const stateWithTableCasing = (
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

export const renderReferenceTable = (
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

export const quoteReferenceColumn = (
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

export const registerQuerySources = (
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
