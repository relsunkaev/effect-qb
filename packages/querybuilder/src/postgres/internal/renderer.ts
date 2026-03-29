import * as Query from "../../internal/query.js"
import { type RenderState } from "../../internal/dialect.js"
import { postgresDialect } from "./dialect.js"
import { type Projection } from "../../internal/projections.js"
import { renderQueryAst } from "./sql-expression-renderer.js"

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
export const renderPostgresPlan = <PlanValue extends Query.Plan.Any>(
  plan: Query.DialectCompatiblePlan<PlanValue, "postgres">
): PostgresRenderResult => {
  const state: RenderState = {
    params: [],
    ctes: [],
    cteNames: new Set<string>()
  }
  const rendered = renderQueryAst(
    Query.getAst(plan as Query.Plan.Any) as any,
    state,
    postgresDialect
  )
  return {
    sql: rendered.sql,
    params: state.params,
    projections: rendered.projections
  }
}
