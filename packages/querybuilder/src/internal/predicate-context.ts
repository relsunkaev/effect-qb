import type { EqColumnAtom, EqLiteralAtom, NeqLiteralAtom, NonNullAtom, NullAtom, PredicateAtom, UnknownAtom } from "./predicate-atom.js"
import type { AllFormula, AnyFormula, AtomFormula, FalseFormula, NotFormula, PredicateFormula, TrueFormula } from "./predicate-formula.js"

type Polarity = "positive" | "negative"

export interface Context<
  NonNullKeys extends string = never,
  NullKeys extends string = never,
  EqLiterals = {},
  NeqLiterals = {},
  SourceNames extends string = never,
  Contradiction extends boolean = false,
  Unknown extends boolean = false
> {
  readonly nonNullKeys: NonNullKeys
  readonly nullKeys: NullKeys
  readonly eqLiterals: EqLiterals
  readonly neqLiterals: NeqLiterals
  readonly sourceNames: SourceNames
  readonly contradiction: Contradiction
  readonly unknown: Unknown
}

export type EmptyContext = Context
type AnyContext = Context<
  string,
  string,
  Record<string, string>,
  Record<string, string>,
  string,
  boolean,
  boolean
>

type Frame<
  Formula extends PredicateFormula = PredicateFormula,
  Direction extends Polarity = Polarity
> = {
  readonly formula: Formula
  readonly polarity: Direction
}

type SourceNameOfKey<Key extends string> = Key extends `${infer SourceName}.${string}` ? SourceName : never

type EqLiteralValueOf<
  EqLiterals,
  Key extends string
> = EqLiterals extends Record<string, string>
  ? Key extends keyof EqLiterals
    ? EqLiterals[Key]
    : never
  : never

type NeqLiteralValuesOf<
  NeqLiterals,
  Key extends string
> = NeqLiterals extends Record<string, string>
  ? Key extends keyof NeqLiterals
    ? NeqLiterals[Key]
    : never
  : never

type MergeEqLiteralMaps<Left, Right> = {
  readonly [K in Extract<keyof Left | keyof Right, string>]:
    K extends keyof Left
      ? K extends keyof Right
        ? Left[K] extends Right[K]
          ? Left[K]
          : never
        : Left[K]
      : K extends keyof Right
        ? Right[K]
        : never
}

type MergeNeqLiteralMaps<Left, Right> = {
  readonly [K in Extract<keyof Left | keyof Right, string>]:
    K extends keyof Left
      ? K extends keyof Right
        ? Left[K] | Right[K]
        : Left[K]
      : K extends keyof Right
        ? Right[K]
        : never
}

type FilterNeverValues<Map> = {
  readonly [K in keyof Map as Map[K] extends never ? never : K]: Map[K]
}

type MarkContradiction<Ctx extends AnyContext> = Context<
  Ctx["nonNullKeys"],
  Ctx["nullKeys"],
  Ctx["eqLiterals"],
  Ctx["neqLiterals"],
  Ctx["sourceNames"],
  true,
  Ctx["unknown"]
>

type MarkUnknown<Ctx extends AnyContext> = Context<
  Ctx["nonNullKeys"],
  Ctx["nullKeys"],
  Ctx["eqLiterals"],
  Ctx["neqLiterals"],
  Ctx["sourceNames"],
  Ctx["contradiction"],
  true
>

type AddNonNull<
  Ctx extends AnyContext,
  Key extends string
> = Context<
  Ctx["nonNullKeys"] | Key,
  Ctx["nullKeys"],
  Ctx["eqLiterals"],
  Ctx["neqLiterals"],
  Ctx["sourceNames"] | SourceNameOfKey<Key>,
  Key extends Ctx["nullKeys"] ? true : Ctx["contradiction"],
  Ctx["unknown"]
>

type AddNull<
  Ctx extends AnyContext,
  Key extends string
> = Context<
  Ctx["nonNullKeys"],
  Ctx["nullKeys"] | Key,
  Ctx["eqLiterals"],
  Ctx["neqLiterals"],
  Ctx["sourceNames"] | SourceNameOfKey<Key>,
  Key extends Ctx["nonNullKeys"] ? true : Ctx["contradiction"],
  Ctx["unknown"]
>

type AddEqLiteral<
  Ctx extends AnyContext,
  Key extends string,
  Value extends string
> = Context<
  Ctx["nonNullKeys"] | Key,
  Ctx["nullKeys"],
  FilterNeverValues<MergeEqLiteralMaps<Ctx["eqLiterals"], { readonly [K in Key]: Value }>>,
  Ctx["neqLiterals"],
  Ctx["sourceNames"] | SourceNameOfKey<Key>,
  EqLiteralValueOf<Ctx["eqLiterals"], Key> extends never
    ? NeqLiteralValuesOf<Ctx["neqLiterals"], Key> extends infer NeqValues
      ? Value extends NeqValues
        ? true
        : Key extends Ctx["nullKeys"] ? true : Ctx["contradiction"]
      : true
    : EqLiteralValueOf<Ctx["eqLiterals"], Key> extends Value
      ? NeqLiteralValuesOf<Ctx["neqLiterals"], Key> extends infer NeqValues
        ? Value extends NeqValues
          ? true
          : Key extends Ctx["nullKeys"] ? true : Ctx["contradiction"]
        : true
      : true,
  Ctx["unknown"]
>

type AddNeqLiteral<
  Ctx extends AnyContext,
  Key extends string,
  Value extends string
> = Context<
  Ctx["nonNullKeys"] | Key,
  Ctx["nullKeys"],
  Ctx["eqLiterals"],
  FilterNeverValues<MergeNeqLiteralMaps<Ctx["neqLiterals"], { readonly [K in Key]: Value }>>,
  Ctx["sourceNames"] | SourceNameOfKey<Key>,
  EqLiteralValueOf<Ctx["eqLiterals"], Key> extends infer EqValue
    ? [EqValue] extends [never]
      ? Key extends Ctx["nullKeys"] ? true : Ctx["contradiction"]
      : EqValue extends Value
        ? true
        : Key extends Ctx["nullKeys"] ? true : Ctx["contradiction"]
    : true,
  Ctx["unknown"]
>

type ApplyEqColumn<
  Ctx extends AnyContext,
  Left extends string,
  Right extends string
> =
  EqLiteralValueOf<Ctx["eqLiterals"], Left> extends infer LeftValue
    ? EqLiteralValueOf<Ctx["eqLiterals"], Right> extends infer RightValue
      ? [LeftValue] extends [never]
        ? [RightValue] extends [never]
          ? AddNonNull<AddNonNull<Ctx, Left>, Right>
          : RightValue extends string
            ? AddEqLiteral<AddNonNull<AddNonNull<Ctx, Left>, Right>, Left, RightValue>
            : MarkContradiction<Ctx>
        : [RightValue] extends [never]
          ? LeftValue extends string
            ? AddEqLiteral<AddNonNull<AddNonNull<Ctx, Left>, Right>, Right, LeftValue>
            : MarkContradiction<Ctx>
          : LeftValue extends RightValue
            ? LeftValue extends string
              ? RightValue extends string
                ? AddEqLiteral<AddEqLiteral<AddNonNull<AddNonNull<Ctx, Left>, Right>, Left, LeftValue>, Right, RightValue>
                : MarkContradiction<Ctx>
              : MarkContradiction<Ctx>
            : MarkContradiction<Ctx>
      : never
    : never

type ApplyAtom<
  Ctx extends AnyContext,
  Atom extends PredicateAtom
> =
  Atom extends NullAtom<infer Key extends string>
    ? AddNull<Ctx, Key>
    : Atom extends NonNullAtom<infer Key extends string>
      ? AddNonNull<Ctx, Key>
      : Atom extends EqLiteralAtom<infer Key extends string, infer Value extends string>
        ? AddEqLiteral<Ctx, Key, Value>
        : Atom extends NeqLiteralAtom<infer Key extends string, infer Value extends string>
          ? AddNeqLiteral<Ctx, Key, Value>
          : Atom extends EqColumnAtom<infer Left extends string, infer Right extends string>
            ? ApplyEqColumn<Ctx, Left, Right>
            : Atom extends UnknownAtom<any>
              ? MarkUnknown<Ctx>
              : Ctx

type ApplyNegativeAtom<
  Ctx extends AnyContext,
  Atom extends PredicateAtom
> =
  Atom extends NullAtom<infer Key extends string>
    ? AddNonNull<Ctx, Key>
    : Atom extends NonNullAtom<infer Key extends string>
      ? AddNull<Ctx, Key>
      : Atom extends EqLiteralAtom<infer Key extends string, infer Value extends string>
        ? AddNeqLiteral<Ctx, Key, Value>
        : Atom extends NeqLiteralAtom<infer Key extends string, infer Value extends string>
          ? AddEqLiteral<Ctx, Key, Value>
          : Atom extends EqColumnAtom<infer Left extends string, infer Right extends string>
            ? AddNonNull<AddNonNull<Ctx, Left>, Right>
            : Atom extends UnknownAtom<any>
              ? MarkUnknown<Ctx>
              : Ctx

type FramesFromItems<
  Items extends readonly PredicateFormula[],
  Direction extends Polarity
> = Items extends readonly [
  infer Head extends PredicateFormula,
  ...infer Tail extends readonly PredicateFormula[]
]
  ? readonly [Frame<Head, Direction>, ...FramesFromItems<Tail, Direction>]
  : readonly []

type IntersectEqLiteralMaps<
  Left,
  Right
> = FilterNeverValues<{
  readonly [K in Extract<keyof Left, keyof Right>]: Left[K] extends Right[K] ? Left[K] : never
}>

type IntersectNeqLiteralMaps<
  Left,
  Right
> = FilterNeverValues<{
  readonly [K in Extract<keyof Left, keyof Right>]:
    Extract<Left[K], Right[K]> extends never ? never : Extract<Left[K], Right[K]>
}>

type IntersectContexts<
  Left extends AnyContext,
  Right extends AnyContext
> = Context<
  Extract<Left["nonNullKeys"], Right["nonNullKeys"]>,
  Extract<Left["nullKeys"], Right["nullKeys"]>,
  IntersectEqLiteralMaps<Left["eqLiterals"], Right["eqLiterals"]>,
  IntersectNeqLiteralMaps<Left["neqLiterals"], Right["neqLiterals"]>,
  Extract<Left["sourceNames"], Right["sourceNames"]>,
  Left["contradiction"] extends true
    ? Right["contradiction"]
    : Right["contradiction"] extends true
      ? Left["contradiction"]
      : false,
  Left["unknown"] extends true ? true : Right["unknown"] extends true ? true : false
>

type AnalyzeAnyBranches<
  Ctx extends AnyContext,
  Items extends readonly PredicateFormula[],
  Direction extends Polarity,
  Current extends AnyContext | never = never
> = Items extends readonly [
  infer Head extends PredicateFormula,
  ...infer Tail extends readonly PredicateFormula[]
]
  ? AnalyzeBranch<Ctx, Head, Direction> extends infer Branch extends AnyContext
    ? Branch["contradiction"] extends true
      ? AnalyzeAnyBranches<Ctx, Tail, Direction, Current>
      : [Current] extends [never]
        ? AnalyzeAnyBranches<Ctx, Tail, Direction, Branch>
        : AnalyzeAnyBranches<Ctx, Tail, Direction, IntersectContexts<Current, Branch>>
    : never
  : [Current] extends [never]
    ? MarkContradiction<Ctx>
    : Current

type Flip<Direction extends Polarity> = Direction extends "positive" ? "negative" : "positive"

type AnalyzeBranch<
  Ctx extends AnyContext,
  Formula extends PredicateFormula,
  Direction extends Polarity
> = AnalyzeStack<Ctx, readonly [Frame<Formula, Direction>]>

type AnalyzeFrame<
  Ctx extends AnyContext,
  Formula extends PredicateFormula,
  Direction extends Polarity,
  Tail extends readonly Frame[]
> = [Formula] extends [TrueFormula]
  ? Direction extends "positive"
    ? AnalyzeStack<Ctx, Tail>
    : MarkContradiction<Ctx>
  : [Formula] extends [FalseFormula]
    ? Direction extends "positive"
      ? MarkContradiction<Ctx>
      : AnalyzeStack<Ctx, Tail>
    : [Formula] extends [AtomFormula<infer Atom extends PredicateAtom>]
      ? Direction extends "positive"
        ? AnalyzeStack<ApplyAtom<Ctx, Atom>, Tail>
        : AnalyzeStack<ApplyNegativeAtom<Ctx, Atom>, Tail>
      : [Formula] extends [NotFormula<infer Item extends PredicateFormula>]
        ? AnalyzeStack<Ctx, readonly [Frame<Item, Flip<Direction>>, ...Tail]>
        : [Formula] extends [AllFormula<infer Items extends readonly PredicateFormula[]>]
          ? Direction extends "positive"
            ? AnalyzeStack<Ctx, readonly [...FramesFromItems<Items, "positive">, ...Tail]>
            : AnalyzeStack<AnalyzeAnyBranches<Ctx, Items, "negative">, Tail>
          : [Formula] extends [AnyFormula<infer Items extends readonly PredicateFormula[]>]
            ? Direction extends "positive"
              ? AnalyzeStack<AnalyzeAnyBranches<Ctx, Items, "positive">, Tail>
              : AnalyzeStack<Ctx, readonly [...FramesFromItems<Items, "negative">, ...Tail]>
            : AnalyzeStack<MarkUnknown<Ctx>, Tail>

export type AnalyzeStack<
  Ctx extends AnyContext,
  Stack extends readonly Frame[]
> = Ctx["contradiction"] extends true
  ? Ctx
  : Stack extends readonly [
      infer Head extends Frame,
      ...infer Tail extends readonly Frame[]
    ]
    ? AnalyzeFrame<Ctx, Head["formula"], Head["polarity"], Tail>
    : Ctx

export type AnalyzeFormula<Formula extends PredicateFormula> =
  AnalyzeStack<EmptyContext, readonly [Frame<Formula, "positive">]>
