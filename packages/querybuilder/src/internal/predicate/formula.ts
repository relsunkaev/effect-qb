import type { PredicateAtom } from "./atom.js"

export interface TrueFormula {
  readonly kind: "true"
}

export interface FalseFormula {
  readonly kind: "false"
}

export interface AtomFormula<Atom extends PredicateAtom> {
  readonly kind: "atom"
  readonly atom: Atom
}

export interface AllFormula<Items extends readonly PredicateFormula[]> {
  readonly kind: "all"
  readonly items: Items
}

export interface AnyFormula<Items extends readonly PredicateFormula[]> {
  readonly kind: "any"
  readonly items: Items
}

export interface NotFormula<Item extends PredicateFormula> {
  readonly kind: "not"
  readonly item: Item
}

export type PredicateFormula =
  | TrueFormula
  | FalseFormula
  | AtomFormula<PredicateAtom>
  | AllFormula<readonly PredicateFormula[]>
  | AnyFormula<readonly PredicateFormula[]>
  | NotFormula<PredicateFormula>

type NormalizeAllItems<
  Items extends readonly PredicateFormula[],
  Current extends readonly PredicateFormula[] = []
> = Items extends readonly [infer Head extends PredicateFormula, ...infer Tail extends readonly PredicateFormula[]]
  ? Head extends TrueFormula
    ? NormalizeAllItems<Tail, Current>
    : Head extends FalseFormula
      ? [FalseFormula]
      : Head extends AllFormula<infer Nested extends readonly PredicateFormula[]>
        ? NormalizeAllItems<[...Nested, ...Tail], Current>
        : NormalizeAllItems<Tail, [...Current, Head]>
  : Current

type NormalizeAnyItems<
  Items extends readonly PredicateFormula[],
  Current extends readonly PredicateFormula[] = []
> = Items extends readonly [infer Head extends PredicateFormula, ...infer Tail extends readonly PredicateFormula[]]
  ? Head extends FalseFormula
    ? NormalizeAnyItems<Tail, Current>
    : Head extends TrueFormula
      ? [TrueFormula]
      : Head extends AnyFormula<infer Nested extends readonly PredicateFormula[]>
        ? NormalizeAnyItems<[...Nested, ...Tail], Current>
        : NormalizeAnyItems<Tail, [...Current, Head]>
  : Current

type CollapseNormalizedAll<
  Items extends readonly PredicateFormula[]
> = NormalizeAllItems<Items> extends infer Normalized extends readonly PredicateFormula[]
  ? [Normalized] extends [readonly [FalseFormula]]
    ? FalseFormula
    : [Normalized] extends [readonly []]
      ? TrueFormula
      : [Normalized] extends [readonly [infer Only extends PredicateFormula]]
        ? Only
        : AllFormula<Normalized>
  : never

type CollapseNormalizedAny<
  Items extends readonly PredicateFormula[]
> = NormalizeAnyItems<Items> extends infer Normalized extends readonly PredicateFormula[]
  ? [Normalized] extends [readonly [TrueFormula]]
    ? TrueFormula
    : [Normalized] extends [readonly []]
      ? FalseFormula
      : [Normalized] extends [readonly [infer Only extends PredicateFormula]]
        ? Only
        : AnyFormula<Normalized>
  : never

export type NormalizeBooleanConstants<Formula extends PredicateFormula> =
  [Formula] extends [AllFormula<infer Items extends readonly PredicateFormula[]>]
    ? CollapseNormalizedAll<Items>
    : [Formula] extends [AnyFormula<infer Items extends readonly PredicateFormula[]>]
      ? CollapseNormalizedAny<Items>
      : [Formula] extends [NotFormula<infer Item extends PredicateFormula>]
        ? [Item] extends [TrueFormula]
          ? FalseFormula
          : [Item] extends [FalseFormula]
            ? TrueFormula
            : Formula
        : Formula

export type And<
  Left extends PredicateFormula,
  Right extends PredicateFormula
> = NormalizeBooleanConstants<AllFormula<[Left, Right]>>

export type Or<
  Left extends PredicateFormula,
  Right extends PredicateFormula
> = NormalizeBooleanConstants<AnyFormula<[Left, Right]>>

export type Not<Value extends PredicateFormula> = NormalizeBooleanConstants<NotFormula<Value>>
