import type { Pipeable } from "effect/Pipeable"
import type { PredicateFormula } from "./predicate/formula.js"

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
export interface Source<
  Name extends string = string,
  Mode extends SourceMode = SourceMode,
  PresentFormula extends PredicateFormula = PredicateFormula,
  PresenceWitness extends string = never
> {
  readonly name: Name
  readonly mode: Mode
  readonly baseName?: string
  readonly _presentFormula?: PresentFormula
  readonly _presenceWitnesses?: readonly PresenceWitness[]
}

export type AnySource = Source<string, SourceMode, PredicateFormula, string>

/**
 * Canonical static metadata stored on a plan.
 *
 * `required` tracks sources that the selection references but which are not yet
 * in scope. `available` tracks sources already in scope for subsequent query
 * operations.
 */
export interface State<
  Columns,
  Required,
  Available extends Record<string, AnySource>,
  Dialect extends string
> {
  readonly selection: Columns
  readonly required: Required
  readonly available: Available
  readonly dialect: Dialect
}

/**
 * A composable logical row set.
 *
 * Tables implement this interface as already-complete plans. Future query
 * builders such as `select()` and `from()` should produce and transform values
 * with this same structure.
 */
export interface RowSet<
  Columns,
  Required = never,
  Available extends Record<string, AnySource> = {},
  Dialect extends string = never
> extends Pipeable {
  readonly [TypeId]: State<Columns, Required, Available, Dialect>
}

/** Convenience alias for any plan-like value. */
export type Any = RowSet<any, any, Record<string, AnySource>, string>
/** Extracts a row set's columns shape. */
export type ColumnsOf<Value extends Any> = Value[typeof TypeId]["selection"]
/** Extracts a plan's selection shape. */
export type SelectionOf<Value extends Any> = ColumnsOf<Value>
/** Extracts a plan's effective dialect. */
export type DialectOf<Value extends Any> = Value[typeof TypeId]["dialect"]
