import type { EqLiteralAtom, NonNullAtom, NullAtom, PredicateAtom } from "./predicate-atom.ts"
import type { AllFormula, AnyFormula, AtomFormula, FalseFormula, NotFormula, PredicateFormula, TrueFormula } from "./predicate-formula.ts"
import type { FormulaOfPredicate } from "./predicate-normalize.ts"

type AtomKey<Atom extends PredicateAtom> =
  Atom extends NullAtom<infer Key extends string> ? Key :
    Atom extends NonNullAtom<infer Key extends string> ? Key :
      Atom extends EqLiteralAtom<infer Key extends string, string> ? Key :
        never

type AtomValue<Atom extends PredicateAtom> =
  Atom extends EqLiteralAtom<string, infer Value extends string> ? Value : never

type ImpliesFormula<
  Assumptions extends PredicateFormula,
  Formula extends PredicateFormula
> =
  Formula extends TrueFormula ? true :
    Formula extends FalseFormula ? false :
      Formula extends AtomFormula<infer Atom extends PredicateAtom>
        ? Atom extends NullAtom<infer Key extends string>
          ? Key extends GuaranteedNullKeys<Assumptions> ? true : false
          : Atom extends NonNullAtom<infer Key extends string>
            ? Key extends GuaranteedNonNullKeys<Assumptions> ? true : false
            : Atom extends EqLiteralAtom<infer Key extends string, infer Value extends string>
              ? GuaranteedEqLiteral<Assumptions, Key> extends Value ? true : false
              : false
        : Formula extends AllFormula<infer Items extends readonly PredicateFormula[]>
          ? Extract<ImpliesFormula<Assumptions, Items[number]>, false> extends never
            ? true
            : false
          : Formula extends AnyFormula<infer Items extends readonly PredicateFormula[]>
            ? Extract<ImpliesFormula<Assumptions, Items[number]>, true> extends never
              ? false
              : true
            : Formula extends NotFormula<infer Item extends PredicateFormula>
              ? ContradictsFormula<Assumptions, Item>
              : false

type ContradictsFormula<
  Assumptions extends PredicateFormula,
  Formula extends PredicateFormula
> =
  Formula extends FalseFormula ? true :
    Formula extends TrueFormula ? false :
      Formula extends AtomFormula<infer Atom extends PredicateAtom>
        ? Atom extends NullAtom<infer Key extends string>
          ? Key extends GuaranteedNonNullKeys<Assumptions> ? true : false
          : Atom extends NonNullAtom<infer Key extends string>
            ? Key extends GuaranteedNullKeys<Assumptions> ? true : false
            : Atom extends EqLiteralAtom<infer Key extends string, infer Value extends string>
              ? Key extends GuaranteedNullKeys<Assumptions>
                ? true
                : GuaranteedEqLiteral<Assumptions, Key> extends infer Current extends string
                  ? [Current] extends [never]
                    ? false
                    : Current extends Value ? false : true
                  : false
              : false
        : Formula extends AllFormula<infer Items extends readonly PredicateFormula[]>
          ? Extract<ContradictsFormula<Assumptions, Items[number]>, true> extends never
            ? false
            : true
          : Formula extends AnyFormula<infer Items extends readonly PredicateFormula[]>
            ? Extract<ContradictsFormula<Assumptions, Items[number]>, false> extends never
              ? true
              : false
            : Formula extends NotFormula<infer Item extends PredicateFormula>
              ? ImpliesFormula<Assumptions, Item>
              : false

export type AssumeFormulaTrue<
  Assumptions extends PredicateFormula,
  Formula extends PredicateFormula
> = Assumptions extends TrueFormula
  ? Formula
  : import("./predicate-formula.ts").And<Assumptions, Formula>

export type AssumeFormulaFalse<
  Assumptions extends PredicateFormula,
  Formula extends PredicateFormula
> = Assumptions extends TrueFormula
  ? import("./predicate-formula.ts").Not<Formula>
  : PredicateFormula

export type AssumeTrue<
  Assumptions extends PredicateFormula,
  Predicate
> = AssumeFormulaTrue<Assumptions, FormulaOfPredicate<Predicate>>

export type AssumeFalse<
  Assumptions extends PredicateFormula,
  Predicate
> = AssumeFormulaFalse<Assumptions, FormulaOfPredicate<Predicate>>

export type Contradicts<
  Assumptions extends PredicateFormula,
  Predicate
> = ContradictsFormula<Assumptions, FormulaOfPredicate<Predicate>>

export type Implies<
  Assumptions extends PredicateFormula,
  Predicate
> = ImpliesFormula<Assumptions, FormulaOfPredicate<Predicate>>

export type GuaranteedNonNullKeys<
  Assumptions extends PredicateFormula
> =
  Assumptions extends TrueFormula | FalseFormula ? never :
    Assumptions extends AtomFormula<infer Atom extends PredicateAtom>
      ? Atom extends NonNullAtom<string>
        ? AtomKey<Atom>
        : Atom extends EqLiteralAtom<string, string>
          ? AtomKey<Atom>
          : never
      : Assumptions extends AllFormula<infer Items extends readonly PredicateFormula[]>
        ? GuaranteedNonNullKeys<Items[number]>
        : Assumptions extends AnyFormula<infer Items extends readonly PredicateFormula[]>
          ? never
          : Assumptions extends NotFormula<infer Item extends PredicateFormula>
            ? Item extends AtomFormula<NullAtom<infer Key extends string>> ? Key : never
            : never

export type GuaranteedNullKeys<
  Assumptions extends PredicateFormula
> =
  Assumptions extends TrueFormula | FalseFormula ? never :
    Assumptions extends AtomFormula<infer Atom extends PredicateAtom>
      ? Atom extends NullAtom<string> ? AtomKey<Atom> : never
      : Assumptions extends AllFormula<infer Items extends readonly PredicateFormula[]>
        ? GuaranteedNullKeys<Items[number]>
        : Assumptions extends AnyFormula<infer Items extends readonly PredicateFormula[]>
          ? never
          : Assumptions extends NotFormula<infer Item extends PredicateFormula>
            ? Item extends AtomFormula<NonNullAtom<infer Key extends string>> ? Key : never
            : never

export type GuaranteedEqLiteral<
  Assumptions extends PredicateFormula,
  Key extends string
> =
  Assumptions extends TrueFormula | FalseFormula ? never :
    Assumptions extends AtomFormula<infer Atom extends PredicateAtom>
      ? Atom extends EqLiteralAtom<infer AtomKeyValue extends string, infer Value extends string>
        ? AtomKeyValue extends Key ? Value : never
        : never
      : Assumptions extends AllFormula<infer Items extends readonly PredicateFormula[]>
        ? GuaranteedEqLiteral<Items[number], Key>
        : Assumptions extends AnyFormula<infer Items extends readonly PredicateFormula[]>
          ? never
          : never
