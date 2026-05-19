import * as Query from "../../internal/query.js"
import type * as Expression from "../../internal/scalar.js"
import { type RenderState } from "../../internal/dialect.js"
import { type Projection } from "../../internal/projections.js"
import { renderQueryAst } from "../../internal/sql-expression-renderer.js"
import { standardDialect } from "../dialect.js"

export interface StandardRenderResult {
  readonly sql: string
  readonly params: readonly unknown[]
  readonly projections: readonly Projection[]
  readonly valueMappings?: Expression.DriverValueMappings
}

export interface StandardRenderOptions {
  readonly valueMappings?: Expression.DriverValueMappings
}

export const renderStandardPlan = <PlanValue extends Query.Plan.Any>(
  plan: Query.DialectCompatiblePlan<PlanValue, "standard">,
  options: StandardRenderOptions = {}
): StandardRenderResult => {
  const state: RenderState = {
    params: [],
    valueMappings: options.valueMappings,
    ctes: [],
    cteNames: new Set<string>(),
    cteSources: new Map<string, unknown>()
  }
  const rendered = renderQueryAst(
    Query.getAst(plan as Query.Plan.Any) as any,
    state,
    standardDialect
  )
  return {
    sql: rendered.sql,
    params: state.params,
    projections: rendered.projections,
    valueMappings: state.valueMappings
  }
}
