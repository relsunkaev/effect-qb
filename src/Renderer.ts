import * as Query from "./Query.ts"
import { type Projection, validateProjections } from "./internal/projections.ts"
import { renderPostgresPlan } from "./internal/postgres-renderer.ts"

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
  render<PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any>>(
    plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
  ): RenderedQuery<any, Dialect>
}

type CustomRender<Dialect extends string> = <PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any>>(
  plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
) => {
  readonly sql: string
  readonly params?: readonly unknown[]
  readonly projections?: readonly Projection[]
}

/**
 * Constructs a renderer from a dialect and optional implementation callback.
 *
 * When no callback is provided, the library supplies a built-in renderer for
 * `"postgres"` that consumes the query AST directly and produces SQL text plus
 * parameter values.
 */
export function make(dialect: "postgres"): Renderer<"postgres">
export function make<Dialect extends string>(
  dialect: Dialect,
  render: CustomRender<Dialect>
): Renderer<Dialect>
export function make<Dialect extends string>(
  dialect: Dialect,
  render?: CustomRender<Dialect>
): Renderer<Dialect> {
  const implementation = render ?? ((dialect === "postgres"
    ? renderPostgresPlan
    : undefined) as CustomRender<Dialect> | undefined)

  if (!implementation) {
    throw new Error(`No built-in renderer for dialect: ${dialect}`)
  }

  return {
    dialect,
    render(plan) {
      const rendered = implementation(plan)
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

/** Built-in Postgres renderer backed by the current query AST. */
export const postgres = make("postgres")
