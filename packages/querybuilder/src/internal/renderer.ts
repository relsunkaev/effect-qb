import * as Query from "./query.js"
import { type Projection, validateProjections } from "./projections.js"

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
  ): RenderedQuery<any, Dialect>
}

type CustomRender<Dialect extends string> = <PlanValue extends Query.Plan.Any>(
  plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
) => {
  readonly sql: string
  readonly params?: readonly unknown[]
  readonly projections?: readonly Projection[]
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
      const rendered = render(plan)
      const projections = rendered.projections ?? []
      validateProjections(projections)
      return {
        sql: rendered.sql,
        params: rendered.params ?? [],
        projections,
        dialect,
        [TypeId]: {
          row: undefined as any,
          dialect
        }
      }
    }
  } as Renderer<Dialect>
}
