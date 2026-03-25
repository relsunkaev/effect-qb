import type { Pipeable } from "effect/Pipeable"

/** Symbol used to attach logical-plan metadata to runtime values. */
export const TypeId: unique symbol = Symbol.for("effect-qb/Plan")

export type TypeId = typeof TypeId

/**
 * Source availability mode within a query scope.
 *
 * `required` means the source is guaranteed to produce a row at this point in
 * the plan. `optional` means the source may be absent, such as the nullable
 * side of a left join.
 */
export type SourceMode = "required" | "optional"

/** Source made available to a plan. */
export interface Source<Name extends string = string, Mode extends SourceMode = SourceMode> {
  readonly name: Name
  readonly mode: Mode
  readonly baseName?: string
}

/**
 * Canonical static metadata stored on a plan.
 *
 * `required` tracks sources that the selection references but which are not yet
 * in scope. `available` tracks sources already in scope for subsequent query
 * operations.
 */
export interface State<
  Selection,
  Required,
  Available extends Record<string, Source>,
  Dialect extends string
> {
  readonly selection: Selection
  readonly required: Required
  readonly available: Available
  readonly dialect: Dialect
}

/**
 * A composable logical query plan.
 *
 * Tables implement this interface as already-complete plans. Future query
 * builders such as `select()` and `from()` should produce and transform values
 * with this same structure.
 */
export interface Plan<
  Selection,
  Required = never,
  Available extends Record<string, Source> = {},
  Dialect extends string = never
> extends Pipeable {
  readonly [TypeId]: State<Selection, Required, Available, Dialect>
}

/** Convenience alias for any plan-like value. */
export type Any = Plan<any, any, Record<string, Source>, string>
/** Extracts a plan's selection shape. */
export type SelectionOf<Value extends Any> = Value[typeof TypeId]["selection"]
/** Extracts a plan's effective dialect. */
export type DialectOf<Value extends Any> = Value[typeof TypeId]["dialect"]
