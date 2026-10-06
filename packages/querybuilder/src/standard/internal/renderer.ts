import * as Query from "../../internal/query/plan.js"
import type * as Expression from "../../internal/scalar.js"
import type * as Casing from "../../internal/casing.js"
import { type RenderState } from "../../internal/dialect.js"
import { type Projection } from "../../internal/projections.js"
import { standardDialect } from "../dialect.js"

export interface StandardRenderResult {
  readonly sql: string
  readonly params: readonly unknown[]
  readonly projections: readonly Projection[]
  readonly valueMappings?: Expression.DriverValueMappings
}

export interface StandardRenderOptions {
  readonly valueMappings?: Expression.DriverValueMappings
  readonly casing?: Casing.Options
}

export const renderStandardPlan = <PlanValue extends Query.Plan.Any>(
  plan: Query.DialectCompatiblePlan<PlanValue, "standard">,
  options: StandardRenderOptions = {}
): StandardRenderResult => {
  const state: RenderState = {
    params: [],
    valueMappings: options.valueMappings,
    casing: options.casing,
    ctes: [],
    cteNames: new Set<string>(),
    cteSources: new Map<string, unknown>(),
    sourceNames: new Map()
  }
  const rendered = standardDialect.renderQueryAst(
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
