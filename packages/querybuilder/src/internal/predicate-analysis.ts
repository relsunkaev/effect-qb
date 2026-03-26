import type { AnalyzeFormula } from "./predicate-context.js"
import type { FormulaOfPredicate } from "./predicate-normalize.js"
import type { And, Not, PredicateFormula, TrueFormula } from "./predicate-formula.js"

type ContextOf<Formula extends PredicateFormula> = AnalyzeFormula<Formula>

export type GuaranteedNonNullKeys<
  Assumptions extends PredicateFormula
> = ContextOf<Assumptions>["nonNullKeys"]

export type GuaranteedNullKeys<
  Assumptions extends PredicateFormula
> = ContextOf<Assumptions>["nullKeys"]

export type GuaranteedSourceNames<
  Assumptions extends PredicateFormula
> = ContextOf<Assumptions>["sourceNames"]

export type GuaranteedEqLiteral<
  Assumptions extends PredicateFormula,
  Key extends string
> = Key extends keyof ContextOf<Assumptions>["eqLiterals"]
  ? ContextOf<Assumptions>["eqLiterals"][Key]
  : never

type IsContradiction<Formula extends PredicateFormula> =
  ContextOf<Formula>["contradiction"] extends true ? true : false

type ContradictoryAssumption<
  Assumptions extends PredicateFormula,
  Formula extends PredicateFormula
> = IsContradiction<And<Assumptions, Formula>>

type ContradictionFromNegation<
  Assumptions extends PredicateFormula,
  Formula extends PredicateFormula
> = IsContradiction<And<Assumptions, Not<Formula>>>

export type ContradictsFormula<
  Assumptions extends PredicateFormula,
  Formula extends PredicateFormula
> = ContradictoryAssumption<Assumptions, Formula>

export type ImpliesFormula<
  Assumptions extends PredicateFormula,
  Formula extends PredicateFormula
> = ContradictionFromNegation<Assumptions, Formula>

export type AssumeFormulaTrue<
  Assumptions extends PredicateFormula,
  Formula extends PredicateFormula
> = Assumptions extends TrueFormula
  ? Formula
  : And<Assumptions, Formula>

export type AssumeFormulaFalse<
  Assumptions extends PredicateFormula,
  Formula extends PredicateFormula
> = Assumptions extends TrueFormula
  ? Not<Formula>
  : And<Assumptions, Not<Formula>>

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
> = ContradictoryAssumption<Assumptions, FormulaOfPredicate<Predicate>>

export type Implies<
  Assumptions extends PredicateFormula,
  Predicate
> = ContradictionFromNegation<Assumptions, FormulaOfPredicate<Predicate>>
