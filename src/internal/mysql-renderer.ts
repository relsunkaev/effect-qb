import * as Query from "../query.ts"
import { type RenderState } from "./dialect.ts"
import { mysqlDialect } from "./mysql-dialect.ts"
import { type Projection } from "./projections.ts"
import { renderQueryAst } from "./sql-expression-renderer.ts"

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
export const renderMysqlPlan = <PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any>>(
  plan: Query.DialectCompatiblePlan<PlanValue, "mysql">
): MysqlRenderResult => {
  const state: RenderState = {
    params: [],
    ctes: [],
    cteNames: new Set<string>()
  }
  const rendered = renderQueryAst(
    Query.getAst(plan as Query.QueryPlan<any, any, any, any, any, any, any, any, any>) as any,
    state,
    mysqlDialect
  )
  return {
    sql: rendered.sql,
    params: state.params,
    projections: rendered.projections
  }
}
