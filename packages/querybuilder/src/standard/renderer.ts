import * as CoreRenderer from "../internal/renderer.js"
import type * as Expression from "../internal/scalar.js"
import { renderStandardPlan } from "./internal/renderer.js"

export type RenderedQuery<Row> = CoreRenderer.RenderedQuery<Row, "standard">

export type RowOf<Value extends RenderedQuery<any>> = CoreRenderer.RowOf<Value>

export type Renderer = CoreRenderer.Renderer<"standard">

export interface MakeOptions {
  readonly valueMappings?: Expression.DriverValueMappings
}

export const make = (options: MakeOptions = {}): Renderer =>
  CoreRenderer.make("standard", (plan) => renderStandardPlan(plan, options))
