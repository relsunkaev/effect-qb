import type * as QueryAst from "../query-ast.js"
import type { RenderState, SqlDialect, RenderedAst } from "../dialect.js"
import { flattenSelection, type Projection } from "../projections.js"
import { renderSelectSql } from "../runtime/driver-value-mapping.js"
import { expressionDriverContext } from "./common-expression.js"

export const selectionProjections = (selection: Record<string, unknown>): readonly Projection[] =>
  flattenSelection(selection).map(({ path, alias }) => ({
    path,
    alias
  }))

export const renderSelectionList = (
  selection: Record<string, unknown>,
  state: RenderState,
  dialect: SqlDialect
): RenderedAst => {
  const flattened = flattenSelection(selection)
  const projections = selectionProjections(selection)
  const sql = flattened.map(({ expression, alias }) =>
    `${renderSelectSql(dialect.renderExpression(expression, state, dialect), expressionDriverContext(expression, state, dialect))} as ${dialect.quoteIdentifier(alias)}`).join(", ")
  return {
    sql,
    projections
  }
}

export const nestedRenderState = (state: RenderState): RenderState => ({
  params: state.params,
  valueMappings: state.valueMappings,
  casing: state.casing,
  ctes: [],
  cteNames: new Set(state.cteNames),
  cteSources: new Map(state.cteSources),
  sourceNames: new Map(state.sourceNames)
})

export const renderSelectClauses = (
  ast: QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>,
  state: RenderState,
  dialect: SqlDialect
): readonly string[] => {
  const clauses: string[] = []
  if (ast.from) {
    clauses.push(`from ${dialect.renderSourceReference(ast.from.source, ast.from.tableName, ast.from.baseTableName, state, dialect)}`)
  }
  for (const join of ast.joins) {
    const source = dialect.renderSourceReference(join.source, join.tableName, join.baseTableName, state, dialect)
    clauses.push(
      join.kind === "cross"
        ? `cross join ${source}`
        : `${join.kind} join ${source} on ${dialect.renderExpression(join.on!, state, dialect)}`
    )
  }
  if (ast.where.length > 0) {
    clauses.push(`where ${ast.where.map((entry: QueryAst.WhereClause) => dialect.renderExpression(entry.predicate, state, dialect)).join(" and ")}`)
  }
  if (ast.groupBy.length > 0) {
    clauses.push(`group by ${ast.groupBy.map((value: QueryAst.Ast["groupBy"][number]) => dialect.renderExpression(value, state, dialect)).join(", ")}`)
  }
  if (ast.having.length > 0) {
    clauses.push(`having ${ast.having.map((entry: QueryAst.HavingClause) => dialect.renderExpression(entry.predicate, state, dialect)).join(" and ")}`)
  }
  if (ast.orderBy.length > 0) {
    clauses.push(`order by ${ast.orderBy.map((entry: QueryAst.OrderByClause) => `${dialect.renderExpression(entry.value, state, dialect)} ${entry.direction}`).join(", ")}`)
  }
  if (ast.limit) {
    clauses.push(`limit ${dialect.renderExpression(ast.limit, state, dialect)}`)
  }
  if (ast.offset) {
    clauses.push(`offset ${dialect.renderExpression(ast.offset, state, dialect)}`)
  }
  return clauses
}
