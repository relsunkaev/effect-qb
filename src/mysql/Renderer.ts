import * as CoreRenderer from "../Renderer.ts"
import { renderMysqlPlan } from "../internal/mysql-renderer.ts"

/** MySQL-specialized rendered query shape. */
export type RenderedQuery<Row> = CoreRenderer.RenderedQuery<Row, "mysql">
/** Extracts the row type carried by a MySQL rendered query. */
export type RowOf<Value extends RenderedQuery<any>> = CoreRenderer.RowOf<Value>
/** MySQL-specialized renderer contract. */
export type Renderer = CoreRenderer.Renderer<"mysql">

export { TypeId } from "../Renderer.ts"
export type { Projection } from "../Renderer.ts"

/** Creates the built-in MySQL renderer. */
export const make = (): Renderer =>
  CoreRenderer.make("mysql", renderMysqlPlan)

/** Shared built-in MySQL renderer instance. */
export const mysql = make()
