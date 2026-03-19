import * as CoreRenderer from "../renderer.ts"

/** Postgres-specialized rendered query shape. */
export type RenderedQuery<Row> = CoreRenderer.RenderedQuery<Row, "postgres">
/** Extracts the row type carried by a Postgres rendered query. */
export type RowOf<Value extends RenderedQuery<any>> = CoreRenderer.RowOf<Value>
/** Postgres-specialized renderer contract. */
export type Renderer = CoreRenderer.Renderer<"postgres">

export { TypeId } from "../renderer.ts"
export type { Projection } from "../renderer.ts"

/** Creates the built-in Postgres renderer. */
export function make(): Renderer
export function make(dialect: "postgres"): Renderer
export function make(
  dialect: "postgres",
  render: Parameters<typeof CoreRenderer.make>[1]
): Renderer
export function make(
  dialectOrRender?: "postgres" | Parameters<typeof CoreRenderer.make>[1],
  render?: Parameters<typeof CoreRenderer.make>[1]
): Renderer {
  const customRender = typeof dialectOrRender === "function" ? dialectOrRender : render
  return customRender ? CoreRenderer.make("postgres", customRender as any) : CoreRenderer.make("postgres")
}

/** Shared built-in Postgres renderer instance. */
export const postgres = make()
