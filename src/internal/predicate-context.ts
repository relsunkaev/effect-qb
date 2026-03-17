import type { PredicateAtom } from "./predicate-atom.ts"

type NullState = "unknown" | "null" | "non-null"

export interface ColumnFactState<
  Nullability extends NullState = "unknown",
  EqualValue extends string | never = never,
  NotEqualValues extends string = never
> {
  readonly nullability: Nullability
  readonly equalValue: EqualValue
  readonly notEqualValues: NotEqualValues
}

export interface Context<
  Columns extends Record<string, ColumnFactState> = {},
  Contradiction extends boolean = false,
  Unknown extends boolean = false
> {
  readonly columns: Columns
  readonly contradiction: Contradiction
  readonly unknown: Unknown
}

export type MergeNullState<
  Current extends NullState,
  Next extends NullState
> = Current extends "unknown"
  ? Next
  : Next extends "unknown"
    ? Current
    : Current extends Next
      ? Current
      : "contradiction"

export type MergeLiteralEquality<
  Current extends string | never,
  Next extends string
> = [Current] extends [never]
  ? Next
  : Current extends Next
    ? Current
    : "contradiction"

export type ApplyAtom<
  Ctx extends Context,
  _Atom extends PredicateAtom
> = Ctx

export type ApplyAtoms<
  Ctx extends Context,
  _Atoms extends readonly PredicateAtom[]
> = Ctx
