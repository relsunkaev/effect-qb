import * as Query from "./query.js"
import type * as Expression from "./scalar.js"
import { flattenSelection, type Projection, validateProjections } from "./projections.js"
import * as Plan from "./row-set.js"

/** Symbol used to attach rendered-query phantom row metadata. */
export const TypeId: unique symbol = Symbol.for("effect-qb/Renderer")

export type TypeId = typeof TypeId

/** Column projection metadata emitted by the renderer. */
export type { Projection }

/**
 * Rendered SQL plus phantom row typing.
 *
 * The rendered query exposes the SQL text, parameter values, target dialect,
 * and projection metadata alongside the canonical row type implied by the
 * source query plan.
 */
export interface RenderedQuery<Row, Dialect extends string = string> {
  readonly sql: string
  readonly params: readonly unknown[]
  readonly dialect: Dialect
  readonly projections: readonly Projection[]
  readonly valueMappings?: Expression.DriverValueMappings
  readonly [TypeId]: {
    readonly row: Row
    readonly dialect: Dialect
  }
}

/** Extracts the row type carried by a rendered query. */
export type RowOf<Value extends RenderedQuery<any, any>> = Value[typeof TypeId]["row"]

/**
 * Public rendering contract.
 *
 * Renderers only accept complete, dialect-compatible plans. The returned
 * `RenderedQuery` keeps the canonical `Query.ResultRow<...>` type attached for
 * downstream executor layers, and the built-in renderer also performs a
 * matching runtime aggregate-shape validation.
 */
export interface Renderer<Dialect extends string = string> {
  readonly dialect: Dialect
  render<PlanValue extends Query.Plan.Any>(
    plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
  ): RenderedQuery<Query.ResultRow<PlanValue>, Dialect>
}

type CustomRender<Dialect extends string> = <PlanValue extends Query.Plan.Any>(
  plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
) => {
  readonly sql: string
  readonly params?: readonly unknown[]
  readonly projections?: readonly Projection[]
  readonly valueMappings?: Expression.DriverValueMappings
}

const projectionPathKey = (path: readonly string[]): string => JSON.stringify(path)

const formatProjectionPath = (path: readonly string[]): string => path.join(".")

const validateProjectionPathsMatchSelection = (
  plan: Query.Plan.Any,
  projections: readonly Projection[]
): void => {
  const expected = flattenSelection(Query.getAst(plan).select as Record<string, unknown>)
  const expectedPaths = new Set(expected.map((projection) => projectionPathKey(projection.path)))
  const actualPaths = new Set(projections.map((projection) => projectionPathKey(projection.path)))
  for (const projection of projections) {
    if (!expectedPaths.has(projectionPathKey(projection.path))) {
      throw new Error(`Projection path ${formatProjectionPath(projection.path)} does not exist in the query selection`)
    }
  }
  for (const projection of expected) {
    if (!actualPaths.has(projectionPathKey(projection.path))) {
      throw new Error(`Projection path ${formatProjectionPath(projection.path)} is missing from rendered projections`)
    }
  }
}

/**
 * Constructs a renderer from a dialect and implementation callback.
 */
export function make<Dialect extends string>(
  dialect: Dialect,
  render: CustomRender<Dialect>
): Renderer<Dialect>
export function make<Dialect extends string>(
  dialect: Dialect,
  render: CustomRender<Dialect>
): Renderer<Dialect> {
  if (typeof render !== "function") {
    throw new Error(`Renderer.make requires an explicit render implementation for dialect: ${dialect}`)
  }
  return {
    dialect,
    render(plan) {
      const required = Query.currentRequiredList(plan[Plan.TypeId].required)
      if (required.length > 0) {
        throw new Error(`query references sources that are not yet in scope: ${required.join(", ")}`)
      }
      const planDialect = plan[Plan.TypeId].dialect
      if (planDialect !== dialect && planDialect !== "standard") {
        throw new Error("effect-qb: plan dialect is not compatible with the target renderer or executor")
      }
      const rendered = render(plan)
      const projections = rendered.projections ?? []
      validateProjections(projections)
      validateProjectionPathsMatchSelection(plan as Query.Plan.Any, projections)
      return {
        sql: rendered.sql,
        params: rendered.params ?? [],
        projections,
        valueMappings: rendered.valueMappings,
        dialect,
        [TypeId]: {
          row: undefined as any,
          dialect
        }
      }
    }
  } as Renderer<Dialect>
}
