import type * as Expression from "./expression.js"
import type * as ExpressionAst from "./expression-ast.js"
import type { PredicateFormula } from "./predicate-formula.js"
import type { AssumeFormulaFalse, AssumeFormulaTrue, Contradicts, Implies } from "./predicate-analysis.js"
import type { FormulaOfExpression } from "./predicate-normalize.js"

export interface CasePath<
  Assumptions extends PredicateFormula,
  Value extends Expression.Any
> {
  readonly assumptions: Assumptions
  readonly value: Value
}

type PredicateFormulaOf<Predicate extends Expression.Any> = FormulaOfExpression<Predicate>

export type CaseBranchAssumeTrue<
  Assumptions extends PredicateFormula,
  Predicate extends Expression.Any
> = AssumeFormulaTrue<Assumptions, PredicateFormulaOf<Predicate>>

export type CaseBranchAssumeFalse<
  Assumptions extends PredicateFormula,
  Predicate extends Expression.Any
> = AssumeFormulaFalse<Assumptions, PredicateFormulaOf<Predicate>>

export type CaseBranchDecision<
  Assumptions extends PredicateFormula,
  Predicate extends Expression.Any
> = Contradicts<Assumptions, Predicate> extends true
  ? "skip"
  : Implies<Assumptions, Predicate> extends true
    ? "take"
    : "branch"

export type ReachableCasePaths<
  Assumptions extends PredicateFormula,
  Branches extends readonly ExpressionAst.CaseBranchNode[],
  Else extends Expression.Any
> = Branches extends readonly [
  infer Head extends ExpressionAst.CaseBranchNode,
  ...infer Tail extends readonly ExpressionAst.CaseBranchNode[]
]
  ? CaseBranchDecision<Assumptions, Head["when"]> extends "skip"
    ? ReachableCasePaths<Assumptions, Tail, Else>
    : CaseBranchDecision<Assumptions, Head["when"]> extends "take"
      ? CasePath<CaseBranchAssumeTrue<Assumptions, Head["when"]>, Head["then"]>
      : CasePath<CaseBranchAssumeTrue<Assumptions, Head["when"]>, Head["then"]> |
        ReachableCasePaths<CaseBranchAssumeFalse<Assumptions, Head["when"]>, Tail, Else>
  : CasePath<Assumptions, Else>
