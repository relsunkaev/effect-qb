import * as Query from "./query.js"
import * as Expression from "./scalar.js"
import { flattenSelection, type Projection, validateProjections } from "./projections.js"

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
 * downstream executor layers.
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
  return makeRenderer(dialect, render, true)
}

/** Internal renderer factory for built-in renderers that derive projections from typed plans. */
export function makeTrusted<Dialect extends string>(
  dialect: Dialect,
  render: CustomRender<Dialect>
): Renderer<Dialect>
export function makeTrusted<Dialect extends string>(
  dialect: Dialect,
  render: CustomRender<Dialect>
): Renderer<Dialect> {
  return makeRenderer(dialect, render, false)
}

const makeRenderer = <Dialect extends string>(
  dialect: Dialect,
  render: CustomRender<Dialect>,
  validate: boolean
): Renderer<Dialect> => {
  if (typeof render !== "function") {
    throw new Error(`Renderer.make requires an explicit render implementation for dialect: ${dialect}`)
  }
  return {
    dialect,
    render(plan) {
      const rendered = render(plan)
      const projections = rendered.projections ?? []
      if (validate) {
        validateProjections(projections)
        validateProjectionPathsMatchSelection(plan as Query.Plan.Any, projections)
      }
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
