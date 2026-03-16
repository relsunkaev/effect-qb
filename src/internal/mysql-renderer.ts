import * as Query from "../Query.ts"
import { type SelectionValue, validateAggregationSelection } from "./aggregation-validation.ts"
import { type RenderState } from "./dialect.ts"
import { mysqlDialect } from "./mysql-dialect.ts"
import { flattenSelection, type Projection } from "./projections.ts"
import * as QueryAst from "./query-ast.ts"
import { renderExpression } from "./sql-expression-renderer.ts"

/**
 * Internal rendered-query payload produced by the built-in MySQL renderer.
 */
export interface MysqlRenderResult {
  readonly sql: string
  readonly params: readonly unknown[]
  readonly projections: readonly Projection[]
}

/**
 * Renders the current query AST into MySQL-shaped SQL plus bind parameters.
 */
export const renderMysqlPlan = <PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any>>(
  plan: Query.DialectCompatiblePlan<PlanValue, "mysql">
): MysqlRenderResult => {
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
    `${renderExpression(expression, state, mysqlDialect)} as ${mysqlDialect.quoteIdentifier(alias)}`).join(", ")
  const clauses = [`select ${selectSql}`]
  if (ast.from) {
    clauses.push(`from ${mysqlDialect.renderTableReference(ast.from.tableName, ast.from.baseTableName)}`)
  }
  for (const join of ast.joins) {
    clauses.push(`${join.kind} join ${mysqlDialect.renderTableReference(join.tableName, join.baseTableName)} on ${renderExpression(join.on, state, mysqlDialect)}`)
  }
  if (ast.where.length > 0) {
    clauses.push(`where ${ast.where.map((entry) => renderExpression(entry.predicate, state, mysqlDialect)).join(" and ")}`)
  }
  if (ast.groupBy.length > 0) {
    clauses.push(`group by ${ast.groupBy.map((value) => renderExpression(value, state, mysqlDialect)).join(", ")}`)
  }
  if (ast.having.length > 0) {
    clauses.push(`having ${ast.having.map((entry) => renderExpression(entry.predicate, state, mysqlDialect)).join(" and ")}`)
  }
  if (ast.orderBy.length > 0) {
    clauses.push(`order by ${ast.orderBy.map((entry) => `${renderExpression(entry.value, state, mysqlDialect)} ${entry.direction}`).join(", ")}`)
  }
  return {
    sql: clauses.join(" "),
    params: state.params,
    projections
  }
}
