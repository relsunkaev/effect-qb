import * as CoreRenderer from "../internal/renderer.js"
import type * as Casing from "../internal/casing.js"
import type * as Expression from "../internal/scalar.js"
import type { StandardDatatypeFamily, StandardDatatypeKind } from "./datatypes/spec.js"
import { renderStandardPlan } from "./internal/renderer.js"

export type RenderedQuery<Row> = CoreRenderer.RenderedQuery<Row, "standard">

export type RowOf<Value extends RenderedQuery<any>> = CoreRenderer.RowOf<Value>

export type Renderer = CoreRenderer.Renderer<"standard">

export type ValueMappings = Expression.DriverValueMappingsFor<StandardDatatypeKind | "uuid", StandardDatatypeFamily | "uuid">

export interface MakeOptions {
  readonly valueMappings?: ValueMappings
  readonly casing?: Casing.Options
}

export const make = (options: MakeOptions = {}): Renderer =>
  CoreRenderer.makeTrusted("standard", (plan) => renderStandardPlan(plan, options))
