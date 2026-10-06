import * as Query from "../../internal/query/plan.js"
import type * as Expression from "../../internal/scalar.js"
import type * as Casing from "../../internal/casing.js"
import { type RenderState } from "../../internal/dialect.js"
import { sqliteDialect } from "./dialect.js"
import { type Projection } from "../../internal/projections.js"

/**
 * Internal rendered-query payload produced by the built-in SQLite renderer.
 */
export interface SqliteRenderResult {
  readonly sql: string
  readonly params: readonly unknown[]
  readonly projections: readonly Projection[]
  readonly valueMappings?: Expression.DriverValueMappings
}

export interface SqliteRenderOptions {
  readonly valueMappings?: Expression.DriverValueMappings
  readonly casing?: Casing.Options
}

/**
 * Renders the current query AST into SQLite-shaped SQL plus bind parameters.
 */
export const renderSqlitePlan = <PlanValue extends Query.Plan.Any>(
  plan: Query.DialectCompatiblePlan<PlanValue, "sqlite">,
  options: SqliteRenderOptions = {}
): SqliteRenderResult => {
  const state: RenderState = {
    params: [],
    valueMappings: options.valueMappings,
    casing: options.casing,
    ctes: [],
    cteNames: new Set<string>(),
    cteSources: new Map<string, unknown>(),
    sourceNames: new Map()
  }
  const rendered = sqliteDialect.renderQueryAst(
    Query.getAst(plan as Query.Plan.Any) as any,
    state,
    sqliteDialect
  )
  return {
    sql: rendered.sql,
    params: state.params,
    projections: rendered.projections,
    valueMappings: state.valueMappings
  }
}
