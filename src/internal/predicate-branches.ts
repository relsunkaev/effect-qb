import type { PredicateAtom } from "./predicate-atom.ts"
import type { AtomFormula, FalseFormula, PredicateFormula, TrueFormula } from "./predicate-formula.ts"

export interface BranchLimitExceeded {
  readonly kind: "branch-limit-exceeded"
}

type Branch = readonly PredicateAtom[]
type Branches = readonly Branch[]

export type AppendBranch<
  Left extends Branches | BranchLimitExceeded,
  Right extends Branches | BranchLimitExceeded,
  _RemainingBudget extends readonly unknown[]
> = Left extends BranchLimitExceeded
  ? BranchLimitExceeded
  : Right extends BranchLimitExceeded
    ? BranchLimitExceeded
    : Left extends Branches
      ? Right extends Branches
        ? Left | Right
        : BranchLimitExceeded
      : BranchLimitExceeded

export type CrossProductBranches<
  Left extends Branches | BranchLimitExceeded,
  Right extends Branches | BranchLimitExceeded,
  _RemainingBudget extends readonly unknown[]
> = AppendBranch<Left, Right, []>

export type BranchesOf<
  Formula extends PredicateFormula,
  _RemainingBudget extends readonly unknown[] = readonly [1]
> = Formula extends TrueFormula
  ? [[]]
  : Formula extends FalseFormula
    ? []
    : Formula extends AtomFormula<infer Atom extends PredicateAtom>
      ? [[Atom]]
      : BranchLimitExceeded
