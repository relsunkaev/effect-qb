import * as Query from "../Query.ts"
import { type SelectionValue, validateAggregationSelection } from "./aggregation-validation.ts"
import { flattenSelection, type Projection } from "./projections.ts"
import { type RenderState } from "./dialect.ts"
import { postgresDialect } from "./postgres-dialect.ts"
import * as QueryAst from "./query-ast.ts"
import { renderExpression } from "./sql-expression-renderer.ts"

/**
 * Minimal rendered-query payload produced by the built-in Postgres renderer.
 *
 * The public `Renderer` wrapper adds dialect branding and validates projection
 * metadata before exposing the final `RenderedQuery`.
 */
export interface PostgresRenderResult {
  readonly sql: string
  readonly params: readonly unknown[]
  readonly projections: readonly Projection[]
}

/**
 * Renders the current query AST into Postgres SQL plus bind parameters.
 */
export const renderPostgresPlan = <PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any>>(
  plan: Query.DialectCompatiblePlan<PlanValue, "postgres">
): PostgresRenderResult => {
  const ast = plan[QueryAst.TypeId]
  const state: RenderState = {
    params: []
  }
  validateAggregationSelection(ast.select as SelectionValue, ast.groupBy)
  const flattened = flattenSelection(ast.select as Record<string, unknown>)
  const projections = flattened.map(({ path, alias }) => ({
    path,
    alias
  }))
  const selectSql = flattened.map(({ expression, alias }) =>
    `${renderExpression(expression, state, postgresDialect)} as ${postgresDialect.quoteIdentifier(alias)}`).join(", ")
  const clauses = [`select ${selectSql}`]
  if (ast.from) {
    clauses.push(`from ${postgresDialect.renderTableReference(ast.from.tableName, ast.from.baseTableName)}`)
  }
  for (const join of ast.joins) {
    clauses.push(`${join.kind} join ${postgresDialect.renderTableReference(join.tableName, join.baseTableName)} on ${renderExpression(join.on, state, postgresDialect)}`)
  }
  if (ast.where.length > 0) {
    clauses.push(`where ${ast.where.map((entry) => renderExpression(entry.predicate, state, postgresDialect)).join(" and ")}`)
  }
  if (ast.groupBy.length > 0) {
    clauses.push(`group by ${ast.groupBy.map((value) => renderExpression(value, state, postgresDialect)).join(", ")}`)
  }
  if (ast.having.length > 0) {
    clauses.push(`having ${ast.having.map((entry) => renderExpression(entry.predicate, state, postgresDialect)).join(" and ")}`)
  }
  if (ast.orderBy.length > 0) {
    clauses.push(`order by ${ast.orderBy.map((entry) => `${renderExpression(entry.value, state, postgresDialect)} ${entry.direction}`).join(", ")}`)
  }
  return {
    sql: clauses.join(" "),
    params: state.params,
    projections
  }
}
