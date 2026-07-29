import * as Schema from "effect/Schema"

import { standardDatatypes } from "../standard/datatypes/index.js"
import * as ExpressionAst from "./expression-ast.js"
import * as Expression from "./scalar.js"
import {
  makeExpression,
  mergeAggregationManyRuntime,
  mergeManyDependencies,
  mergeNullabilityManyRuntime,
  type MergeAggregation,
  type MergeNullabilityTuple,
  type NumericExpressionInput,
  type TupleDependencies,
  type TupleDialect
} from "./query.js"

type NumberLiteral<Value extends number> = Expression.Scalar<
  Value,
  ReturnType<typeof standardDatatypes.real>,
  "never",
  "standard",
  "scalar",
  never
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.LiteralNode<Value>
}

type AsExpression<Value extends NumericExpressionInput> =
  Value extends Expression.Any ? Value : NumberLiteral<Extract<Value, number>>

type BinaryResult<
  Kind extends Extract<ExpressionAst.BinaryKind, "add" | "subtract" | "multiply" | "divide" | "modulo">,
  Left extends NumericExpressionInput,
  Right extends NumericExpressionInput
> = Expression.Scalar<
  number,
  Expression.DbTypeOf<AsExpression<Left>>,
  MergeNullabilityTuple<readonly [AsExpression<Left>, AsExpression<Right>]>,
  TupleDialect<readonly [AsExpression<Left>, AsExpression<Right>]>,
  MergeAggregation<Expression.KindOf<AsExpression<Left>>, Expression.KindOf<AsExpression<Right>>>,
  TupleDependencies<readonly [AsExpression<Left>, AsExpression<Right>]>
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.BinaryNode<Kind, AsExpression<Left>, AsExpression<Right>>
}

const numberLiteral = <const Value extends number>(value: Value): NumberLiteral<Value> =>
  makeExpression({
    runtime: value,
    dbType: standardDatatypes.real(),
    runtimeSchema: Schema.Number,
    nullability: "never",
    dialect: "standard",
    kind: "scalar",
    dependencies: {}
  }, {
    kind: "literal",
    value
  })

const toExpression = <Value extends NumericExpressionInput>(
  value: Value
): AsExpression<Value> =>
  (typeof value === "number" ? numberLiteral(value) : value) as AsExpression<Value>

const retargetLiteral = (
  value: Expression.Any,
  target: Expression.Any
): Expression.Any => {
  const ast = (value as Expression.Any & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.Any
  })[ExpressionAst.TypeId]
  if (ast.kind !== "literal") {
    return value
  }
  const state = target[Expression.TypeId]
  return makeExpression({
    runtime: value[Expression.TypeId].runtime,
    dbType: state.dbType,
    runtimeSchema: state.runtimeSchema,
    driverValueMapping: state.driverValueMapping,
    nullability: value[Expression.TypeId].nullability,
    dialect: state.dialect,
    kind: "scalar",
    dependencies: {}
  }, ast)
}

const binary = <
  Kind extends Extract<ExpressionAst.BinaryKind, "add" | "subtract" | "multiply" | "divide" | "modulo">,
  Left extends NumericExpressionInput,
  Right extends NumericExpressionInput
>(
  kind: Kind,
  left: Left,
  right: Right
): BinaryResult<Kind, Left, Right> => {
  let leftExpression = toExpression(left)
  let rightExpression = toExpression(right)
  const leftAst = (leftExpression as Expression.Any & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.Any
  })[ExpressionAst.TypeId]
  const rightAst = (rightExpression as Expression.Any & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.Any
  })[ExpressionAst.TypeId]
  if (leftAst.kind === "literal" && rightAst.kind !== "literal") {
    leftExpression = retargetLiteral(leftExpression, rightExpression) as AsExpression<Left>
  } else if (rightAst.kind === "literal" && leftAst.kind !== "literal") {
    rightExpression = retargetLiteral(rightExpression, leftExpression) as AsExpression<Right>
  }
  const values = [leftExpression, rightExpression] as const
  return makeExpression({
    runtime: 0,
    dbType: leftExpression[Expression.TypeId].dbType,
    runtimeSchema: Schema.Number,
    driverValueMapping: leftExpression[Expression.TypeId].driverValueMapping,
    nullability: mergeNullabilityManyRuntime(values),
    dialect: values.find((value) => value[Expression.TypeId].dialect !== "standard")?.[Expression.TypeId].dialect ??
      leftExpression[Expression.TypeId].dialect,
    kind: mergeAggregationManyRuntime(values),
    dependencies: mergeManyDependencies(values)
  }, {
    kind,
    left: leftExpression,
    right: rightExpression
  }) as BinaryResult<Kind, Left, Right>
}

export const add = <Left extends NumericExpressionInput, Right extends NumericExpressionInput>(
  left: Left,
  right: Right
): BinaryResult<"add", Left, Right> => binary("add", left, right)

export const subtract = <Left extends NumericExpressionInput, Right extends NumericExpressionInput>(
  left: Left,
  right: Right
): BinaryResult<"subtract", Left, Right> => binary("subtract", left, right)

export const multiply = <Left extends NumericExpressionInput, Right extends NumericExpressionInput>(
  left: Left,
  right: Right
): BinaryResult<"multiply", Left, Right> => binary("multiply", left, right)

export const divide = <Left extends NumericExpressionInput, Right extends NumericExpressionInput>(
  left: Left,
  right: Right
): BinaryResult<"divide", Left, Right> => binary("divide", left, right)

export const modulo = <Left extends NumericExpressionInput, Right extends NumericExpressionInput>(
  left: Left,
  right: Right
): BinaryResult<"modulo", Left, Right> => binary("modulo", left, right)

type UnaryResult<
  Kind extends Extract<ExpressionAst.UnaryKind, "sum" | "avg" | "abs" | "round" | "negate">,
  Value extends NumericExpressionInput,
  Nullable extends Expression.Nullability,
  ResultKind extends Expression.ScalarKind
> = Expression.Scalar<
  number,
  Expression.DbTypeOf<AsExpression<Value>>,
  Nullable,
  AsExpression<Value>[typeof Expression.TypeId]["dialect"],
  ResultKind,
  Expression.DependenciesOf<AsExpression<Value>>
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.UnaryNode<Kind, AsExpression<Value>>
}

const unary = <
  Kind extends Extract<ExpressionAst.UnaryKind, "sum" | "avg" | "abs" | "round" | "negate">,
  Value extends NumericExpressionInput,
  Nullable extends Expression.Nullability,
  ResultKind extends Expression.ScalarKind
>(
  kind: Kind,
  value: Value,
  nullability: Nullable,
  resultKind: ResultKind
): UnaryResult<Kind, Value, Nullable, ResultKind> => {
  const expression = toExpression(value)
  return makeExpression({
    runtime: 0,
    dbType: expression[Expression.TypeId].dbType,
    runtimeSchema: Schema.Number,
    driverValueMapping: expression[Expression.TypeId].driverValueMapping,
    nullability,
    dialect: expression[Expression.TypeId].dialect,
    kind: resultKind,
    dependencies: expression[Expression.TypeId].dependencies
  }, {
    kind,
    value: expression
  }) as UnaryResult<Kind, Value, Nullable, ResultKind>
}

export const sum = <Value extends NumericExpressionInput>(
  value: Value
): UnaryResult<"sum", Value, "maybe", "aggregate"> =>
  unary("sum", value, "maybe", "aggregate")

export const avg = <Value extends NumericExpressionInput>(
  value: Value
): UnaryResult<"avg", Value, "maybe", "aggregate"> =>
  unary("avg", value, "maybe", "aggregate")

export const abs = <Value extends NumericExpressionInput>(
  value: Value
): UnaryResult<"abs", Value, Expression.NullabilityOf<AsExpression<Value>>, Expression.KindOf<AsExpression<Value>>> => {
  const expression = toExpression(value)
  return unary("abs", value, expression[Expression.TypeId].nullability, expression[Expression.TypeId].kind) as never
}

export const round = <Value extends NumericExpressionInput>(
  value: Value
): UnaryResult<"round", Value, Expression.NullabilityOf<AsExpression<Value>>, Expression.KindOf<AsExpression<Value>>> => {
  const expression = toExpression(value)
  return unary("round", value, expression[Expression.TypeId].nullability, expression[Expression.TypeId].kind) as never
}

export const negate = <Value extends NumericExpressionInput>(
  value: Value
): UnaryResult<"negate", Value, Expression.NullabilityOf<AsExpression<Value>>, Expression.KindOf<AsExpression<Value>>> => {
  const expression = toExpression(value)
  return unary("negate", value, expression[Expression.TypeId].nullability, expression[Expression.TypeId].kind) as never
}
