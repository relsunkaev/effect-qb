import * as CoreRenderer from "../internal/renderer.js"
import type * as Expression from "../internal/scalar.js"
import { renderPostgresPlan } from "./internal/renderer.js"

/** Postgres-specialized rendered query shape. */
export type RenderedQuery<Row> = CoreRenderer.RenderedQuery<Row, "postgres">
/** Extracts the row type carried by a Postgres rendered query. */
export type RowOf<Value extends RenderedQuery<any>> = CoreRenderer.RowOf<Value>
/** Postgres-specialized renderer contract. */
export type Renderer = CoreRenderer.Renderer<"postgres">

export interface MakeOptions {
  readonly valueMappings?: Expression.DriverValueMappings
}

export { TypeId } from "../internal/renderer.js"
export type { Projection } from "../internal/renderer.js"

/** Creates the built-in Postgres renderer. */
export const make = (options: MakeOptions = {}): Renderer =>
  CoreRenderer.make("postgres", (plan) => renderPostgresPlan(plan, options))

/** Shared built-in Postgres renderer instance. */
export const postgres = make()
