import * as CoreRenderer from "../internal/renderer.js"
import type * as Casing from "../internal/casing.js"
import type * as Expression from "../internal/scalar.js"
import type { MysqlDatatypeFamily, MysqlDatatypeKind } from "./datatypes/spec.js"
import { renderMysqlPlan } from "./internal/renderer.js"

/** MySQL-specialized rendered query shape. */
export type RenderedQuery<Row> = CoreRenderer.RenderedQuery<Row, "mysql">
/** Extracts the row type carried by a MySQL rendered query. */
export type RowOf<Value extends RenderedQuery<any>> = CoreRenderer.RowOf<Value>
/** MySQL-specialized renderer contract. */
export type Renderer = CoreRenderer.Renderer<"mysql">

export type ValueMappings = Expression.DriverValueMappingsFor<MysqlDatatypeKind | "uuid", MysqlDatatypeFamily | "uuid">

export interface MakeOptions {
  readonly valueMappings?: ValueMappings
  readonly casing?: Casing.Options
}

export { TypeId } from "../internal/renderer.js"
export type { Projection } from "../internal/renderer.js"

/** Creates the built-in MySQL renderer. */
export const make = (options: MakeOptions = {}): Renderer =>
  CoreRenderer.makeTrusted("mysql", (plan) => renderMysqlPlan(plan, options))

/** Shared built-in MySQL renderer instance. */
export const mysql = make()
