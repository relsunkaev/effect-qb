import * as Expression from "./scalar.js"
import type * as Query from "./query.js"
import {
  eq,
  gt,
  limit,
  lt,
  orderBy,
  where
} from "./standard-dsl.js"
import { andAll, orAll } from "./dynamic.js"

type KeysetValue = string | number | boolean | Date

export interface KeysetTerm<
  Value extends Expression.Scalar<
    KeysetValue,
    Expression.DbType.Any,
    "never",
    string,
    "scalar",
    Expression.BindingId
  > = Expression.Scalar<
    KeysetValue,
    Expression.DbType.Any,
    "never",
    string,
    "scalar",
    Expression.BindingId
  >
> {
  readonly expression: Value
  readonly cursor: Expression.RuntimeOf<Value>
  readonly direction?: "asc" | "desc"
}

type AnyTerm = KeysetTerm<any>
type TermDependencies<Terms extends readonly AnyTerm[]> =
  Terms[number] extends KeysetTerm<infer Value>
    ? Expression.DependenciesOf<Value>
    : never

type ValidateTerms<Terms extends readonly AnyTerm[]> = {
  readonly [Key in keyof Terms]: Terms[Key] extends {
    readonly expression: infer Value extends Expression.Any
  }
    ? KeysetTerm<Extract<Value, KeysetTerm["expression"]>>
    : never
}

export interface KeysetOptions<
  Terms extends readonly [AnyTerm, ...AnyTerm[]]
> {
  readonly by: Terms & ValidateTerms<Terms>
  readonly pageSize: number
}

/**
 * Applies stable lexicographic cursor pagination.
 *
 * Every key must be non-null. Add a unique final tie-breaker to avoid skipped
 * or duplicated rows when earlier keys are equal.
 */
export const keyset = <
  const Terms extends readonly [AnyTerm, ...AnyTerm[]]
>(
  options: KeysetOptions<Terms>
) => <PlanValue extends Query.Plan.Any>(
  plan: PlanValue & (
    Query.StatementOfPlan<PlanValue> extends "select"
      ? Exclude<
          TermDependencies<Terms>,
          Extract<keyof Query.AvailableOfPlan<PlanValue>, string>
        > extends never
        ? unknown
        : never
      : never
  )
): PlanValue => {
  if (!Number.isSafeInteger(options.pageSize) || options.pageSize <= 0) {
    throw new Error("keyset pageSize must be a positive safe integer")
  }
  const branches = options.by.map((term, index) => {
    const equalPrefix = options.by.slice(0, index).map((prefix) =>
      eq(prefix.expression, prefix.cursor))
    const comparison = (term.direction ?? "asc") === "desc"
      ? lt(term.expression, term.cursor)
      : gt(term.expression, term.cursor)
    return andAll([...equalPrefix, comparison])
  })
  let next: Query.Plan.Any = (where(orAll(branches)) as any)(plan)
  for (const term of options.by) {
    next = (orderBy(term.expression, term.direction ?? "asc") as any)(next)
  }
  next = (limit(options.pageSize) as any)(next)
  return next as PlanValue
}
