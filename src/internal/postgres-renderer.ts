import * as Query from "./query.ts"
import { type RenderState } from "./dialect.ts"
import { postgresDialect } from "./postgres-dialect.ts"
import { type Projection } from "./projections.ts"
import { renderQueryAst } from "./sql-expression-renderer.ts"

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
export const renderPostgresPlan = <PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any>>(
  plan: Query.DialectCompatiblePlan<PlanValue, "postgres">
): PostgresRenderResult => {
  const state: RenderState = {
    params: [],
    ctes: [],
    cteNames: new Set<string>()
  }
  const rendered = renderQueryAst(
    Query.getAst(plan as Query.QueryPlan<any, any, any, any, any, any, any, any, any>) as any,
    state,
    postgresDialect
  )
  return {
    sql: rendered.sql,
    params: state.params,
    projections: rendered.projections
  }
}
