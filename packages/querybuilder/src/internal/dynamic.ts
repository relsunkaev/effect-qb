import * as Schema from "effect/Schema"

import { standardDatatypes } from "../standard/datatypes/index.js"
import * as ExpressionAst from "./expression-ast.js"
import * as Expression from "./scalar.js"
import {
  makeExpression,
  mergeManyDependencies,
  mergeNullabilityManyRuntime,
  type MergeNullabilityTuple,
  type PredicateInput,
  type TupleDependencies,
  type TupleDialect
} from "./query.js"

type BooleanLiteral<Value extends boolean> = Expression.Scalar<
  Value,
  ReturnType<typeof standardDatatypes.boolean>,
  "never",
  "standard",
  "scalar",
  never
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.LiteralNode<Value>
}

type AsPredicate<Value extends PredicateInput> =
  Value extends Expression.Any ? Value : BooleanLiteral<Extract<Value, boolean>>

type PredicateTuple<Values extends readonly PredicateInput[]> = {
  readonly [Key in keyof Values]: AsPredicate<Values[Key]>
}

type CombinedPredicate<
  Kind extends "and" | "or",
  Values extends readonly PredicateInput[]
> = Values extends readonly [] ? BooleanLiteral<Kind extends "and" ? true : false> : Expression.Scalar<
  boolean,
  ReturnType<typeof standardDatatypes.boolean>,
  MergeNullabilityTuple<PredicateTuple<Values>>,
  TupleDialect<PredicateTuple<Values>>,
  "scalar",
  TupleDependencies<PredicateTuple<Values>>
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.VariadicNode<Kind, PredicateTuple<Values>>
}

const booleanLiteral = <const Value extends boolean>(
  value: Value
): BooleanLiteral<Value> => makeExpression({
  runtime: value,
  dbType: standardDatatypes.boolean(),
  runtimeSchema: Schema.Boolean,
  nullability: "never",
  dialect: "standard",
  kind: "scalar",
  dependencies: {}
}, {
  kind: "literal",
  value
})

const combine = <
  Kind extends "and" | "or",
  const Values extends readonly PredicateInput[]
>(
  kind: Kind,
  values: Values,
  identity: boolean
): CombinedPredicate<Kind, Values> => {
  if (values.length === 0) {
    return booleanLiteral(identity) as unknown as CombinedPredicate<Kind, Values>
  }
  const expressions = values.map((value) =>
    typeof value === "boolean" ? booleanLiteral(value) : value) as PredicateTuple<Values>
  return makeExpression({
    runtime: identity,
    dbType: standardDatatypes.boolean(),
    runtimeSchema: Schema.Boolean,
    nullability: mergeNullabilityManyRuntime(expressions),
    dialect: expressions.find((value) => value[Expression.TypeId].dialect !== "standard")?.[Expression.TypeId].dialect ??
      expressions[0]![Expression.TypeId].dialect,
    kind: "scalar",
    dependencies: mergeManyDependencies(expressions)
  }, {
    kind,
    values: expressions
  }) as CombinedPredicate<Kind, Values>
}

/** Combines a runtime list of predicates; an empty list is SQL true. */
export const andAll = <
  const Values extends readonly PredicateInput[]
>(values: Values): CombinedPredicate<"and", Values> =>
  combine("and", values, true)

/** Combines a runtime list of predicates; an empty list is SQL false. */
export const orAll = <
  const Values extends readonly PredicateInput[]
>(values: Values): CombinedPredicate<"or", Values> =>
  combine("or", values, false)

/** Applies a query modifier only when the condition is true. */
export const when = <
  const Condition extends boolean,
  Modifier extends (value: any) => any
>(
  condition: Condition,
  modifier: Modifier
) => <Value>(
  value: Value
): Condition extends true ? ReturnType<Modifier> : Condition extends false ? Value : Value | ReturnType<Modifier> =>
  (condition ? modifier(value) : value) as never

/**
 * Returns a selection fragment suitable for object spread.
 *
 * Dynamic conditions correctly make the selected fields optional.
 */
export const includeIf = <
  const Condition extends boolean,
  const Selection extends Readonly<Record<string, unknown>>
>(
  condition: Condition,
  selection: Selection
): Condition extends true
  ? Selection
  : Condition extends false
    ? {}
    : Partial<Selection> =>
  (condition ? selection : {}) as never
