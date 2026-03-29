import * as CoreRenderer from "../internal/renderer.js"
import { renderMysqlPlan } from "./internal/renderer.js"

/** MySQL-specialized rendered query shape. */
export type RenderedQuery<Row> = CoreRenderer.RenderedQuery<Row, "mysql">
/** Extracts the row type carried by a MySQL rendered query. */
export type RowOf<Value extends RenderedQuery<any>> = CoreRenderer.RowOf<Value>
/** MySQL-specialized renderer contract. */
export type Renderer = CoreRenderer.Renderer<"mysql">

export { TypeId } from "../internal/renderer.js"
export type { Projection } from "../internal/renderer.js"

/** Creates the built-in MySQL renderer. */
export const make = (): Renderer =>
  CoreRenderer.make("mysql", renderMysqlPlan)

/** Shared built-in MySQL renderer instance. */
export const mysql = make()
