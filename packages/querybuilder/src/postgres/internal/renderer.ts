import * as Query from "../../internal/query/plan.js"
import type * as Expression from "../../internal/scalar.js"
import type * as Casing from "../../internal/casing.js"
import { type RenderState } from "../../internal/dialect.js"
import { postgresDialect } from "./dialect.js"
import { type Projection } from "../../internal/projections.js"

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
  readonly valueMappings?: Expression.DriverValueMappings
}

export interface PostgresRenderOptions {
  readonly valueMappings?: Expression.DriverValueMappings
  readonly casing?: Casing.Options
}

/**
 * Renders the current query AST into Postgres SQL plus bind parameters.
 */
export const renderPostgresPlan = <PlanValue extends Query.Plan.Any>(
  plan: Query.DialectCompatiblePlan<PlanValue, "postgres">,
  options: PostgresRenderOptions = {}
): PostgresRenderResult => {
  const state: RenderState = {
    params: [],
    valueMappings: options.valueMappings,
    casing: options.casing,
    ctes: [],
    cteNames: new Set<string>(),
    cteSources: new Map<string, unknown>(),
    sourceNames: new Map()
  }
  const rendered = postgresDialect.renderQueryAst(
    Query.getAst(plan as Query.Plan.Any) as any,
    state,
    postgresDialect
  )
  return {
    sql: rendered.sql,
    params: state.params,
    projections: rendered.projections,
    valueMappings: state.valueMappings
  }
}
