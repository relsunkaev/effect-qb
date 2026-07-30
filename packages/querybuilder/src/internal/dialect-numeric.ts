import * as ExpressionAst from "./expression-ast.js"
import {
  makeExpression,
  mergeAggregationManyRuntime,
  mergeManyDependencies,
  type MergeAggregation,
  type MergeNullabilityTuple,
  type TupleDependencies
} from "./query.js"
import * as Expression from "./scalar.js"

export type Input = Expression.Any | number

export type Literal<
  Value extends number,
  Db extends Expression.DbType.Any,
  Dialect extends string
> = Expression.Scalar<Value, Db, "never", Dialect, "scalar", never> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.LiteralNode<Value>
}

export type AsExpression<
  Value extends Input,
  LiteralDb extends Expression.DbType.Any,
  Dialect extends string
> = Value extends Expression.Any
  ? Value
  : Literal<Extract<Value, number>, LiteralDb, Dialect>

export type DbTypeOfInput<
  Value extends Input,
  LiteralDb extends Expression.DbType.Any,
  Dialect extends string
> = Expression.DbTypeOf<AsExpression<Value, LiteralDb, Dialect>>

export type InputDialect<
  Value extends Input,
  LiteralDb extends Expression.DbType.Any,
  Dialect extends string
> = AsExpression<Value, LiteralDb, Dialect>[typeof Expression.TypeId]["dialect"]

export type DialectConstraint<
  Value extends Input,
  LiteralDb extends Expression.DbType.Any,
  Dialect extends string
> = Exclude<InputDialect<Value, LiteralDb, Dialect>, Dialect | "standard"> extends never
  ? unknown
  : {
      readonly __effect_qb_error__: "effect-qb: numeric expression is incompatible with this dialect"
      readonly __effect_qb_expression_dialect__: InputDialect<Value, LiteralDb, Dialect>
      readonly __effect_qb_target_dialect__: Dialect
    }

type BinaryValues<
  Left extends Input,
  Right extends Input,
  LiteralDb extends Expression.DbType.Any,
  Dialect extends string
> = readonly [
  AsExpression<Left, LiteralDb, Dialect>,
  AsExpression<Right, LiteralDb, Dialect>
]

export type BinaryNullability<
  Left extends Input,
  Right extends Input,
  LiteralDb extends Expression.DbType.Any,
  Dialect extends string
> = MergeNullabilityTuple<BinaryValues<Left, Right, LiteralDb, Dialect>>

type ZeroPossibility<Value extends Input> = Value extends number
  ? number extends Value ? "possible" : Value extends 0 ? "always" : "never"
  : "possible"

export type ZeroDivisorNullability<
  Left extends Input,
  Right extends Input,
  LiteralDb extends Expression.DbType.Any,
  Dialect extends string
> = BinaryNullability<Left, Right, LiteralDb, Dialect> extends infer Nullable extends Expression.Nullability
  ? Nullable extends "always"
    ? "always"
    : ZeroPossibility<Right> extends "always" ? "always"
      : ZeroPossibility<Right> extends "possible" ? "maybe" : Nullable
  : never

export type BinaryResult<
  Left extends Input,
  Right extends Input,
  LiteralDb extends Expression.DbType.Any,
  ResultDb extends Expression.DbType.Any,
  Nullable extends Expression.Nullability,
  Dialect extends string
> = Expression.Scalar<
  Expression.RuntimeOfDbType<ResultDb>,
  ResultDb,
  Nullable,
  Dialect,
  MergeAggregation<
    Expression.KindOf<AsExpression<Left, LiteralDb, Dialect>>,
    Expression.KindOf<AsExpression<Right, LiteralDb, Dialect>>
  >,
  TupleDependencies<BinaryValues<Left, Right, LiteralDb, Dialect>>
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.BinaryNode<"modulo">
}

export type RoundResult<
  Value extends Input,
  LiteralDb extends Expression.DbType.Any,
  ResultDb extends Expression.DbType.Any,
  Nullable extends Expression.Nullability,
  Dialect extends string,
  WithScale extends boolean
> = Expression.Scalar<
  Expression.RuntimeOfDbType<ResultDb>,
  ResultDb,
  Nullable,
  Dialect,
  Expression.KindOf<AsExpression<Value, LiteralDb, Dialect>>,
  Expression.DependenciesOf<AsExpression<Value, LiteralDb, Dialect>>
> & {
  readonly [ExpressionAst.TypeId]: WithScale extends true
    ? ExpressionAst.FunctionCallNode<"round">
    : ExpressionAst.UnaryNode<"round">
}

export type AggregateResult<
  Kind extends "sum" | "avg",
  Value extends Input,
  LiteralDb extends Expression.DbType.Any,
  ResultDb extends Expression.DbType.Any,
  Dialect extends string
> = Expression.Scalar<
  Expression.RuntimeOfDbType<ResultDb>,
  ResultDb,
  "maybe",
  Dialect,
  "aggregate",
  Expression.DependenciesOf<AsExpression<Value, LiteralDb, Dialect>>
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.UnaryNode<
    Kind,
    AsExpression<Value, LiteralDb, Dialect>
  >
}

const literal = <
  Value extends number,
  Db extends Expression.DbType.Any,
  Dialect extends string
>(
  value: Value,
  dbType: Db,
  dialect: Dialect
): Literal<Value, Db, Dialect> =>
  makeExpression({
    runtime: value,
    dbType,
    driverValueMapping: dbType.driverValueMapping,
    nullability: "never",
    dialect,
    kind: "scalar",
    dependencies: {}
  }, {
    kind: "literal",
    value
  })

const asExpression = <
  Value extends Input,
  Db extends Expression.DbType.Any,
  Dialect extends string
>(
  value: Value,
  literalDb: Db,
  dialect: Dialect
): AsExpression<Value, Db, Dialect> =>
  (typeof value === "number"
    ? literal(value, literalDb, dialect)
    : value) as AsExpression<Value, Db, Dialect>

export const modulo = <
  Left extends Input,
  Right extends Input,
  LiteralDb extends Expression.DbType.Any,
  ResultDb extends Expression.DbType.Any,
  Nullable extends Expression.Nullability,
  Dialect extends string
>(
  left: Left,
  right: Right,
  options: {
    readonly dialect: Dialect
    readonly literalDb: LiteralDb
    readonly resultDb: ResultDb
    readonly nullability: Nullable
  }
): BinaryResult<Left, Right, LiteralDb, ResultDb, Nullable, Dialect> => {
  const leftExpression = asExpression(left, options.literalDb, options.dialect)
  const rightExpression = asExpression(right, options.literalDb, options.dialect)
  const values = [leftExpression, rightExpression] as const
  return (makeExpression as any)({
    runtime: undefined,
    dbType: options.resultDb,
    driverValueMapping: options.resultDb.driverValueMapping,
    nullability: options.nullability,
    dialect: options.dialect,
    kind: mergeAggregationManyRuntime(values),
    dependencies: mergeManyDependencies(values)
  }, {
    kind: "modulo",
    left: leftExpression,
    right: rightExpression
  }) as BinaryResult<Left, Right, LiteralDb, ResultDb, Nullable, Dialect>
}

export const round = <
  Value extends Input,
  LiteralDb extends Expression.DbType.Any,
  ScaleDb extends Expression.DbType.Any,
  ResultDb extends Expression.DbType.Any,
  Nullable extends Expression.Nullability,
  Dialect extends string,
  WithScale extends boolean
>(
  value: Value,
  scale: number | undefined,
  options: {
    readonly dialect: Dialect
    readonly literalDb: LiteralDb
    readonly scaleDb: ScaleDb
    readonly resultDb: ResultDb
    readonly nullability: Nullable
  }
): RoundResult<Value, LiteralDb, ResultDb, Nullable, Dialect, WithScale> => {
  const expression = asExpression(value, options.literalDb, options.dialect)
  if (scale === undefined) {
    return (makeExpression as any)({
      runtime: undefined,
      dbType: options.resultDb,
      driverValueMapping: options.resultDb.driverValueMapping,
      nullability: options.nullability,
      dialect: options.dialect,
      kind: expression[Expression.TypeId].kind,
      dependencies: expression[Expression.TypeId].dependencies
    }, {
      kind: "round",
      value: expression
    }) as RoundResult<Value, LiteralDb, ResultDb, Nullable, Dialect, WithScale>
  }
  if (!Number.isSafeInteger(scale)) {
    throw new Error("round scale must be a safe integer")
  }
  const scaleExpression = literal(scale, options.scaleDb, options.dialect)
  return (makeExpression as any)({
    runtime: undefined,
    dbType: options.resultDb,
    driverValueMapping: options.resultDb.driverValueMapping,
    nullability: options.nullability,
    dialect: options.dialect,
    kind: expression[Expression.TypeId].kind,
    dependencies: expression[Expression.TypeId].dependencies
  }, {
    kind: "function",
    name: "round",
    args: [expression, scaleExpression]
  }) as RoundResult<Value, LiteralDb, ResultDb, Nullable, Dialect, WithScale>
}

export const aggregate = <
  Kind extends "sum" | "avg",
  Value extends Input,
  LiteralDb extends Expression.DbType.Any,
  ResultDb extends Expression.DbType.Any,
  Dialect extends string
>(
  kind: Kind,
  value: Value,
  options: {
    readonly dialect: Dialect
    readonly literalDb: LiteralDb
    readonly resultDb: ResultDb
  }
): AggregateResult<Kind, Value, LiteralDb, ResultDb, Dialect> => {
  const expression = asExpression(value, options.literalDb, options.dialect)
  return (makeExpression as any)({
    runtime: undefined,
    dbType: options.resultDb,
    driverValueMapping: options.resultDb.driverValueMapping,
    nullability: "maybe",
    dialect: options.dialect,
    kind: "aggregate",
    dependencies: expression[Expression.TypeId].dependencies
  }, {
    kind,
    value: expression
  }) as AggregateResult<Kind, Value, LiteralDb, ResultDb, Dialect>
}

const inputNullability = (value: Input): Expression.Nullability =>
  typeof value === "number"
    ? "never"
    : value[Expression.TypeId].nullability

export const binaryInputNullability = (
  left: Input,
  right: Input
): Expression.Nullability => {
  const leftNullability = inputNullability(left)
  const rightNullability = inputNullability(right)
  if (leftNullability === "always" || rightNullability === "always") {
    return "always"
  }
  return leftNullability === "maybe" || rightNullability === "maybe"
    ? "maybe"
    : "never"
}

export const nullableForZeroDivisor = (
  left: Input,
  right: Input
): Expression.Nullability => {
  const merged = binaryInputNullability(left, right)
  if (merged === "always") {
    return "always"
  }
  if (typeof right === "number") {
    return right === 0 ? "always" : merged
  }
  return "maybe"
}
