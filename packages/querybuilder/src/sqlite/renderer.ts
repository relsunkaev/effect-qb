import * as CoreRenderer from "../internal/renderer.js"
import type * as Casing from "../internal/casing.js"
import type * as Expression from "../internal/scalar.js"
import type { SqliteDatatypeFamily, SqliteDatatypeKind } from "./datatypes/spec.js"
import { renderSqlitePlan } from "./internal/renderer.js"

/** SQLite-specialized rendered query shape. */
export type RenderedQuery<Row> = CoreRenderer.RenderedQuery<Row, "sqlite">
/** Extracts the row type carried by a SQLite rendered query. */
export type RowOf<Value extends RenderedQuery<any>> = CoreRenderer.RowOf<Value>
/** SQLite-specialized renderer contract. */
export type Renderer = CoreRenderer.Renderer<"sqlite">

export type ValueMappings = Expression.DriverValueMappingsFor<SqliteDatatypeKind | "uuid", SqliteDatatypeFamily | "uuid">

export interface MakeOptions {
  readonly valueMappings?: ValueMappings
  readonly casing?: Casing.Options
}

export { TypeId } from "../internal/renderer.js"
export type { Projection } from "../internal/renderer.js"

/** Creates the built-in SQLite renderer. */
export const make = (options: MakeOptions = {}): Renderer =>
  CoreRenderer.makeTrusted("sqlite", (plan) => renderSqlitePlan(plan, options))

/** Shared built-in SQLite renderer instance. */
export const sqlite = make()
