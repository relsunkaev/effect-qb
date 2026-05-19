import * as Query from "../../internal/query.js"
import type * as Expression from "../../internal/scalar.js"
import { type RenderState } from "../../internal/dialect.js"
import { mysqlDialect } from "./dialect.js"
import { type Projection } from "../../internal/projections.js"
import { renderQueryAst } from "../../internal/sql-expression-renderer.js"

/**
 * Internal rendered-query payload produced by the built-in MySQL renderer.
 */
export interface MysqlRenderResult {
  readonly sql: string
  readonly params: readonly unknown[]
  readonly projections: readonly Projection[]
  readonly valueMappings?: Expression.DriverValueMappings
}

export interface MysqlRenderOptions {
  readonly valueMappings?: Expression.DriverValueMappings
}

/**
 * Renders the current query AST into MySQL-shaped SQL plus bind parameters.
 */
export const renderMysqlPlan = <PlanValue extends Query.Plan.Any>(
  plan: Query.DialectCompatiblePlan<PlanValue, "mysql">,
  options: MysqlRenderOptions = {}
): MysqlRenderResult => {
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
    mysqlDialect
  )
  return {
    sql: rendered.sql,
    params: state.params,
    projections: rendered.projections,
    valueMappings: state.valueMappings
  }
}
