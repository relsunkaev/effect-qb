import * as Expression from "../Expression.ts"
import * as Plan from "../Plan.ts"
import * as Table from "../Table.ts"
import {
  currentRequiredList,
  extractRequiredRuntime,
  getAst,
  makeExpression,
  makePlan,
  mergeAggregationManyRuntime,
  mergeAggregationRuntime,
  mergeDependencies,
  mergeManyDependencies,
  mergeManySources,
  mergeNullabilityManyRuntime,
  mergeSources,
  type AddAvailable,
  type AddExpressionRequired,
  type AddJoinRequired,
  type AggregationOf,
  type AvailableOfPlan,
  type DependenciesOf,
  type DependencyRecord,
  type DialectOf,
  type ExpressionInput,
  type ExtractDialect,
  type ExtractRequired,
  type GroupByInput,
  type GroupedOfPlan,
  type HavingPredicateInput,
  type JoinSourceMode,
  type LiteralValue,
  type MergeAggregation,
  type MergeNullabilityTuple,
  type OrderDirection,
  type OutstandingOfPlan,
  type PlanDialectOf,
  type PredicateInput,
  type QueryPlan,
  type RequiredFromDependencies,
  type RequiredOfPlan,
  type ScopedNamesOfPlan,
  type SelectionOfPlan,
  type SelectionShape,
  type SourceOf,
  type StringExpressionInput,
  type TableDialectOf,
  type TableLike,
  type TableNameOf,
  type TupleDependencies,
  type TupleDialect,
  type TupleSource
} from "../Query.ts"
import * as ExpressionAst from "./expression-ast.ts"
import * as ProjectionAlias from "./projection-alias.ts"
import * as QueryAst from "./query-ast.ts"

/**
 * Dialect-specific DB type profile used to specialize the shared query
 * operator surface.
 *
 * The factory does not need to know about every SQL type for a dialect. It
 * only needs the canonical output DB types produced by the query operators
 * implemented so far.
 */
export interface QueryDialectProfile<
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> {
  readonly dialect: Dialect
  readonly textDb: TextDb
  readonly numericDb: NumericDb
  readonly boolDb: BoolDb
  readonly timestampDb: TimestampDb
  readonly nullDb: NullDb
}

/** Maps a literal runtime value to the corresponding dialect-level DB type. */
type DialectLiteralDbType<
  Value extends LiteralValue,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> =
  Value extends string ? TextDb :
    Value extends number ? NumericDb :
      Value extends boolean ? BoolDb :
        Value extends Date ? TimestampDb :
          NullDb

/** Maps a literal runtime value to its intrinsic nullability state. */
type LiteralNullability<Value extends LiteralValue> = Value extends null ? "always" : "never"

/** Dialect-specialized expression produced by `literal(...)`. */
type DialectLiteralExpression<
  Value extends LiteralValue,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = Expression.Expression<
  Value,
  DialectLiteralDbType<Value, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  LiteralNullability<Value>,
  Dialect,
  "scalar",
  never
>

/** Normalizes a generic scalar input into the expression form used internally. */
type DialectAsExpression<
  Value extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = Value extends Expression.Any
  ? Value
  : DialectLiteralExpression<Extract<Value, LiteralValue>, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>

/** Normalizes a generic string input into the expression form used internally. */
type DialectAsStringExpression<
  Value extends StringExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = Value extends Expression.Any
  ? Value
  : DialectLiteralExpression<Extract<Value, string>, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>

/** Provenance carried by a dialect-specialized scalar input. */
type SourceOfDialectInput<
  Value extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = SourceOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

/** Dialect carried by a dialect-specialized scalar input. */
type DialectOfDialectInput<
  Value extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = DialectOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

/** Dependency map carried by a dialect-specialized scalar input. */
type DependenciesOfDialectInput<
  Value extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = DependenciesOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

/** Required source names carried by a dialect-specialized scalar input. */
type RequiredFromDialectInput<
  Value extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = RequiredFromDependencies<DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

/** Provenance carried by a dialect-specialized string input. */
type SourceOfDialectStringInput<
  Value extends StringExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = SourceOf<DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

/** Dialect carried by a dialect-specialized string input. */
type DialectOfDialectStringInput<
  Value extends StringExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = DialectOf<DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

/** Dependency map carried by a dialect-specialized string input. */
type DependenciesOfDialectStringInput<
  Value extends StringExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = DependenciesOf<DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

/** Intrinsic nullability carried by a dialect-specialized string input. */
type NullabilityOfDialectStringInput<
  Value extends StringExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = Expression.NullabilityOf<DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

/** Folds aggregation kinds across a tuple of expressions. */
type MergeAggregationTuple<
  Values extends readonly Expression.Any[],
  Current extends Expression.AggregationKind = "scalar"
> = Values extends readonly [infer Head extends Expression.Any, ...infer Tail extends readonly Expression.Any[]]
  ? MergeAggregationTuple<Tail, MergeAggregation<Current, AggregationOf<Head>>>
  : Current

/** Result nullability for binary `coalesce(...)`. */
type CoalesceNullability<
  Left extends Expression.Nullability,
  Right extends Expression.Nullability
> = Left extends "never"
  ? "never"
  : Right extends "never"
    ? "never"
    : Left extends "maybe"
      ? "maybe"
      : Right extends "maybe"
        ? "maybe"
        : "always"

/** Names of sources already available to a plan. */
type AvailableNames<Available extends Record<string, Plan.Source>> = Extract<keyof Available, string>

/** Grouped source keys carried by a tuple of scalar expressions. */
type GroupedKeysFromValues<
  Values extends readonly Expression.Any[]
> = Values[number] extends never ? never : {
  [K in keyof Values]: Values[K] extends Expression.Any
    ? SourceOf<Values[K]> extends { readonly tableName: infer TableName extends string, readonly columnName: infer ColumnName extends string }
      ? `${TableName}.${ColumnName}`
      : never
    : never
}[number]

/**
 * Builds a dialect-specialized query namespace from the shared query core.
 *
 * The returned object mirrors the public `Query` surface, but the constructors
 * that manufacture new expressions are specialized to the supplied dialect DB
 * types instead of relying on the Postgres-default root module.
 */
export const makeDialectQuery = <
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
>(
  profile: QueryDialectProfile<Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
) => {
  const literal = <Value extends LiteralValue>(
    value: Value
  ): DialectLiteralExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> =>
    makeExpression({
      runtime: value as Value,
      dbType: (
        value === null ? profile.nullDb :
          value instanceof Date ? profile.timestampDb :
            typeof value === "string" ? profile.textDb :
              typeof value === "number" ? profile.numericDb :
                profile.boolDb
      ) as DialectLiteralDbType<Value, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      nullability: (value === null ? "always" : "never") as LiteralNullability<Value>,
      dialect: profile.dialect as Dialect,
      aggregation: "scalar",
      source: undefined as never,
      sourceNullability: "propagate" as const,
      dependencies: {}
    }, {
      kind: "literal",
      value
    })

  const toDialectExpression = <Value extends ExpressionInput>(
    value: Value
  ): DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> =>
    (value !== null && typeof value === "object" && Expression.TypeId in value
      ? value
      : literal(value as Extract<Value, LiteralValue>)) as DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>

  const toDialectStringExpression = <Value extends StringExpressionInput>(
    value: Value
  ): DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> =>
    (typeof value === "string"
      ? literal(value)
      : value) as DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>

  const extractRequiredFromDialectInputRuntime = (value: ExpressionInput): readonly string[] => {
    const expression = toDialectExpression(value)
    return Object.keys(expression[Expression.TypeId].dependencies)
  }

  const eq = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    left: Left,
    right: Right
  ): Expression.Expression<
    boolean,
    BoolDb,
    "maybe",
    DialectOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | DialectOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    MergeAggregation<AggregationOf<DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>, AggregationOf<DialectAsExpression<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>>,
    SourceOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | SourceOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependencyRecord<RequiredFromDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | RequiredFromDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
  > => {
    const leftExpression = toDialectExpression(left)
    const rightExpression = toDialectExpression(right)
    return makeExpression({
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: "maybe",
      dialect: (leftExpression[Expression.TypeId].dialect ?? rightExpression[Expression.TypeId].dialect) as DialectOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | DialectOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      aggregation: mergeAggregationRuntime(
        leftExpression[Expression.TypeId].aggregation,
        rightExpression[Expression.TypeId].aggregation
      ) as MergeAggregation<AggregationOf<DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>, AggregationOf<DialectAsExpression<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>>,
      source: mergeSources(leftExpression[Expression.TypeId].source, rightExpression[Expression.TypeId].source) as SourceOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | SourceOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      sourceNullability: "propagate" as const,
      dependencies: mergeDependencies(
        leftExpression[Expression.TypeId].dependencies,
        rightExpression[Expression.TypeId].dependencies
      ) as DependencyRecord<RequiredFromDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | RequiredFromDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
    }, {
      kind: "eq",
      left: leftExpression,
      right: rightExpression
    })
  }

  const isNull = <Value extends ExpressionInput>(
    value: Value
  ): Expression.Expression<
    boolean,
    BoolDb,
    "never",
    DialectOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    AggregationOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    SourceOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    "resolved"
  > => {
    const expression = toDialectExpression(value)
    return makeExpression({
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: "never",
      dialect: expression[Expression.TypeId].dialect,
      aggregation: expression[Expression.TypeId].aggregation as AggregationOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      source: expression[Expression.TypeId].source as SourceOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      sourceNullability: "resolved" as const,
      dependencies: expression[Expression.TypeId].dependencies as DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    }, {
      kind: "isNull",
      value: expression
    })
  }

  const isNotNull = <Value extends ExpressionInput>(
    value: Value
  ): Expression.Expression<
    boolean,
    BoolDb,
    "never",
    DialectOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    AggregationOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    SourceOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    "resolved"
  > => {
    const expression = toDialectExpression(value)
    return makeExpression({
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: "never",
      dialect: expression[Expression.TypeId].dialect,
      aggregation: expression[Expression.TypeId].aggregation as AggregationOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      source: expression[Expression.TypeId].source as SourceOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      sourceNullability: "resolved" as const,
      dependencies: expression[Expression.TypeId].dependencies as DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    }, {
      kind: "isNotNull",
      value: expression
    })
  }

  const upper = <Value extends StringExpressionInput>(
    value: Value
  ): Expression.Expression<
    string,
    TextDb,
    NullabilityOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DialectOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    AggregationOf<DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    SourceOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependenciesOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
  > => {
    const expression = toDialectStringExpression(value)
    return makeExpression({
      runtime: "" as string,
      dbType: profile.textDb as TextDb,
      nullability: expression[Expression.TypeId].nullability as NullabilityOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      dialect: expression[Expression.TypeId].dialect,
      aggregation: expression[Expression.TypeId].aggregation as AggregationOf<DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      source: expression[Expression.TypeId].source as SourceOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      sourceNullability: "propagate" as const,
      dependencies: expression[Expression.TypeId].dependencies as DependenciesOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    }, {
      kind: "upper",
      value: expression
    })
  }

  const lower = <Value extends StringExpressionInput>(
    value: Value
  ): Expression.Expression<
    string,
    TextDb,
    NullabilityOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DialectOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    AggregationOf<DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    SourceOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependenciesOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
  > => {
    const expression = toDialectStringExpression(value)
    return makeExpression({
      runtime: "" as string,
      dbType: profile.textDb as TextDb,
      nullability: expression[Expression.TypeId].nullability as NullabilityOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      dialect: expression[Expression.TypeId].dialect,
      aggregation: expression[Expression.TypeId].aggregation as AggregationOf<DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      source: expression[Expression.TypeId].source as SourceOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      sourceNullability: "propagate" as const,
      dependencies: expression[Expression.TypeId].dependencies as DependenciesOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    }, {
      kind: "lower",
      value: expression
    })
  }

  const and = <
    Values extends readonly [ExpressionInput, ...ExpressionInput[]]
  >(
    ...values: Values
  ): Expression.Expression<
    boolean,
    BoolDb,
    MergeNullabilityTuple<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleDialect<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    MergeAggregationTuple<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleSource<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleDependencies<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>
  > => {
    const expressions = values.map((value) => toDialectExpression(value)) as readonly Expression.Any[]
    return makeExpression({
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: mergeNullabilityManyRuntime(expressions) as MergeNullabilityTuple<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
      dialect: (expressions.find((value) => value[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect) as TupleDialect<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
      aggregation: mergeAggregationManyRuntime(expressions) as MergeAggregationTuple<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
      source: mergeManySources(expressions) as TupleSource<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
      sourceNullability: "propagate" as const,
      dependencies: mergeManyDependencies(expressions) as TupleDependencies<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>
    }, {
      kind: "and",
      values: expressions
    })
  }

  const or = <
    Values extends readonly [ExpressionInput, ...ExpressionInput[]]
  >(
    ...values: Values
  ): Expression.Expression<
    boolean,
    BoolDb,
    MergeNullabilityTuple<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleDialect<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    MergeAggregationTuple<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleSource<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleDependencies<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>
  > => {
    const expressions = values.map((value) => toDialectExpression(value)) as readonly Expression.Any[]
    return makeExpression({
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: mergeNullabilityManyRuntime(expressions) as MergeNullabilityTuple<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
      dialect: (expressions.find((value) => value[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect) as TupleDialect<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
      aggregation: mergeAggregationManyRuntime(expressions) as MergeAggregationTuple<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
      source: mergeManySources(expressions) as TupleSource<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
      sourceNullability: "propagate" as const,
      dependencies: mergeManyDependencies(expressions) as TupleDependencies<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>
    }, {
      kind: "or",
      values: expressions
    })
  }

  const not = <Value extends ExpressionInput>(
    value: Value
  ): Expression.Expression<
    boolean,
    BoolDb,
    Expression.NullabilityOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    DialectOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    AggregationOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    SourceOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
  > => {
    const expression = toDialectExpression(value)
    return makeExpression({
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: expression[Expression.TypeId].nullability as Expression.NullabilityOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      dialect: expression[Expression.TypeId].dialect,
      aggregation: expression[Expression.TypeId].aggregation as AggregationOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      source: expression[Expression.TypeId].source as SourceOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      sourceNullability: "propagate" as const,
      dependencies: expression[Expression.TypeId].dependencies as DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    }, {
      kind: "not",
      value: expression
    })
  }

  const concat = <
    Values extends readonly [StringExpressionInput, StringExpressionInput, ...StringExpressionInput[]]
  >(
    ...values: Values
  ): Expression.Expression<
    string,
    TextDb,
    MergeNullabilityTuple<{ readonly [K in keyof Values]: DialectAsStringExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleDialect<{ readonly [K in keyof Values]: DialectAsStringExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    MergeAggregationTuple<{ readonly [K in keyof Values]: DialectAsStringExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleSource<{ readonly [K in keyof Values]: DialectAsStringExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleDependencies<{ readonly [K in keyof Values]: DialectAsStringExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>
  > => {
    const expressions = values.map((value) => toDialectStringExpression(value)) as readonly Expression.Any[]
    return makeExpression({
      runtime: "" as string,
      dbType: profile.textDb as TextDb,
      nullability: mergeNullabilityManyRuntime(expressions) as MergeNullabilityTuple<{ readonly [K in keyof Values]: DialectAsStringExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
      dialect: (expressions.find((value) => value[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect) as TupleDialect<{ readonly [K in keyof Values]: DialectAsStringExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
      aggregation: mergeAggregationManyRuntime(expressions) as MergeAggregationTuple<{ readonly [K in keyof Values]: DialectAsStringExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
      source: mergeManySources(expressions) as TupleSource<{ readonly [K in keyof Values]: DialectAsStringExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
      sourceNullability: "propagate" as const,
      dependencies: mergeManyDependencies(expressions) as TupleDependencies<{ readonly [K in keyof Values]: DialectAsStringExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>
    }, {
      kind: "concat",
      values: expressions
    })
  }

  const count = <Value extends ExpressionInput>(
    value: Value
  ): Expression.Expression<
    number,
    NumericDb,
    "never",
    DialectOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    "aggregate",
    SourceOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    "resolved"
  > => {
    const expression = toDialectExpression(value)
    return makeExpression({
      runtime: 0 as number,
      dbType: profile.numericDb as NumericDb,
      nullability: "never",
      dialect: expression[Expression.TypeId].dialect,
      aggregation: "aggregate",
      source: expression[Expression.TypeId].source as SourceOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      sourceNullability: "resolved" as const,
      dependencies: expression[Expression.TypeId].dependencies as DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    }, {
      kind: "count",
      value: expression
    })
  }

  const max = <Value extends Expression.Any>(
    value: Value
  ): Expression.Expression<
    Expression.RuntimeOf<Value>,
    Expression.DbTypeOf<Value>,
    "maybe",
    DialectOf<Value>,
    "aggregate",
    SourceOf<Value>,
    DependenciesOf<Value>,
    "resolved"
  > =>
    makeExpression({
      runtime: undefined as Expression.RuntimeOf<Value>,
      dbType: value[Expression.TypeId].dbType as Expression.DbTypeOf<Value>,
      nullability: "maybe",
      dialect: value[Expression.TypeId].dialect,
      aggregation: "aggregate",
      source: value[Expression.TypeId].source as SourceOf<Value>,
      sourceNullability: "resolved" as const,
      dependencies: value[Expression.TypeId].dependencies as DependenciesOf<Value>
    }, {
      kind: "max",
      value
    })

  const min = <Value extends Expression.Any>(
    value: Value
  ): Expression.Expression<
    Expression.RuntimeOf<Value>,
    Expression.DbTypeOf<Value>,
    "maybe",
    DialectOf<Value>,
    "aggregate",
    SourceOf<Value>,
    DependenciesOf<Value>,
    "resolved"
  > =>
    makeExpression({
      runtime: undefined as Expression.RuntimeOf<Value>,
      dbType: value[Expression.TypeId].dbType as Expression.DbTypeOf<Value>,
      nullability: "maybe",
      dialect: value[Expression.TypeId].dialect,
      aggregation: "aggregate",
      source: value[Expression.TypeId].source as SourceOf<Value>,
      sourceNullability: "resolved" as const,
      dependencies: value[Expression.TypeId].dependencies as DependenciesOf<Value>
    }, {
      kind: "min",
      value
    })

  const coalesce = <
    Left extends Expression.Any,
    Right extends ExpressionInput
  >(
    left: Left,
    right: Right
  ): Expression.Expression<
    NonNullable<Expression.RuntimeOf<Left>>,
    Expression.DbTypeOf<Left>,
    CoalesceNullability<
      Expression.NullabilityOf<Left>,
      Expression.NullabilityOf<DialectAsExpression<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
    >,
    DialectOf<Left> | DialectOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    MergeAggregation<
      AggregationOf<Left>,
      AggregationOf<DialectAsExpression<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
    >,
    SourceOf<Left> | SourceOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependencyRecord<
      | Extract<keyof DependenciesOf<Left>, string>
      | Extract<
        keyof DependenciesOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
        string
      >
    >,
    "resolved"
  > => {
    const rightExpression = toDialectExpression(right)
    return makeExpression({
      runtime: undefined as NonNullable<Expression.RuntimeOf<Left>>,
      dbType: left[Expression.TypeId].dbType as Expression.DbTypeOf<Left>,
      nullability: (
        left[Expression.TypeId].nullability === "never" || rightExpression[Expression.TypeId].nullability === "never"
          ? "never"
          : left[Expression.TypeId].nullability === "maybe" || rightExpression[Expression.TypeId].nullability === "maybe"
            ? "maybe"
            : "always"
      ) as CoalesceNullability<
        Expression.NullabilityOf<Left>,
        Expression.NullabilityOf<DialectAsExpression<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
      >,
      dialect: (left[Expression.TypeId].dialect ?? rightExpression[Expression.TypeId].dialect) as
        | DialectOf<Left>
        | DialectOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      aggregation: mergeAggregationRuntime(
        left[Expression.TypeId].aggregation,
        rightExpression[Expression.TypeId].aggregation
      ) as MergeAggregation<
        AggregationOf<Left>,
        AggregationOf<DialectAsExpression<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
      >,
      source: mergeSources(
        left[Expression.TypeId].source,
        rightExpression[Expression.TypeId].source
      ) as SourceOf<Left> | SourceOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      sourceNullability: "resolved" as const,
      dependencies: mergeDependencies(
        left[Expression.TypeId].dependencies,
        rightExpression[Expression.TypeId].dependencies
      ) as DependencyRecord<
        | Extract<keyof DependenciesOf<Left>, string>
        | Extract<
          keyof DependenciesOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
          string
        >
      >
    }, {
      kind: "coalesce",
      values: [left, rightExpression]
    })
  }

  const as = <
    Value extends ExpressionInput,
    Alias extends string
  >(
    value: Value,
    alias: Alias
  ): DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> => {
    const expression = toDialectExpression(value)
    const projected = Object.create(Object.getPrototypeOf(expression)) as {
      [Expression.TypeId]: Expression.State<any, any, any, any, any, any, any, Expression.SourceNullabilityMode>
      [ExpressionAst.TypeId]: ExpressionAst.Any
      [ProjectionAlias.TypeId]: ProjectionAlias.State<Alias>
    }
    const runtimeExpression = expression as DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> & {
      readonly [ExpressionAst.TypeId]: ExpressionAst.Any
    }
    projected[Expression.TypeId] = runtimeExpression[Expression.TypeId]
    projected[ExpressionAst.TypeId] = runtimeExpression[ExpressionAst.TypeId]
    projected[ProjectionAlias.TypeId] = {
      alias
    } satisfies ProjectionAlias.State<Alias>
    return projected as unknown as DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
  }

  const select = <Selection extends SelectionShape>(
    selection: Selection
  ): QueryPlan<
    Selection,
    ExtractRequired<Selection>,
    {},
    ExtractDialect<Selection> extends never ? Dialect : ExtractDialect<Selection>,
    never,
    never,
    ExtractRequired<Selection>
  > =>
    makePlan({
      selection,
      required: extractRequiredRuntime(selection) as ExtractRequired<Selection>,
      available: {},
      dialect: profile.dialect as ExtractDialect<Selection> extends never ? Dialect : ExtractDialect<Selection>
    }, {
      select: selection,
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    })

  const where = <Predicate extends PredicateInput>(
    predicate: Predicate
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any>>(
      plan: PlanValue
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Predicate>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue> | DialectOfDialectInput<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue>,
      AddExpressionRequired<OutstandingOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Predicate>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const predicateExpression = toDialectExpression(predicate)
      const predicateRequired = extractRequiredFromDialectInputRuntime(predicate)
      return makePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...predicateRequired].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index) as AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Predicate>,
        available: current.available,
        dialect: current.dialect as PlanDialectOf<PlanValue> | DialectOfDialectInput<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
      }, {
        ...currentAst,
        where: [...currentAst.where, {
          kind: "where",
          predicate: predicateExpression
        }]
      })
    }

  const from = <CurrentTable extends TableLike>(
    table: CurrentTable
  ) =>
    <PlanValue extends QueryPlan<any, any, {}, any, any, any, any>>(
      plan: PlanValue & (
        TableNameOf<CurrentTable> extends OutstandingOfPlan<PlanValue> ? unknown : never
      )
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      Exclude<RequiredOfPlan<PlanValue>, TableNameOf<CurrentTable>>,
      AddAvailable<{}, TableNameOf<CurrentTable>>,
      PlanDialectOf<PlanValue> | TableDialectOf<CurrentTable>,
      GroupedOfPlan<PlanValue>,
      TableNameOf<CurrentTable>,
      Exclude<OutstandingOfPlan<PlanValue>, TableNameOf<CurrentTable>>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      return makePlan({
        selection: current.selection,
        required: currentRequiredList(current.required).filter((name) =>
          name !== table[Table.TypeId].name) as Exclude<RequiredOfPlan<PlanValue>, TableNameOf<CurrentTable>>,
        available: {
          [table[Table.TypeId].name]: {
            name: table[Table.TypeId].name,
            mode: "required",
            baseName: table[Table.TypeId].baseName
          }
        } as AddAvailable<{}, TableNameOf<CurrentTable>>,
        dialect: current.dialect as PlanDialectOf<PlanValue> | TableDialectOf<CurrentTable>
      }, {
        ...currentAst,
        from: {
          kind: "from",
          tableName: table[Table.TypeId].name,
          baseTableName: table[Table.TypeId].baseName
        }
      })
    }

  const having = <Predicate extends HavingPredicateInput>(
    predicate: Predicate
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any>>(
      plan: PlanValue
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Predicate>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue> | DialectOfDialectInput<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue>,
      AddExpressionRequired<OutstandingOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Predicate>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const predicateExpression = toDialectExpression(predicate)
      const predicateRequired = extractRequiredFromDialectInputRuntime(predicate)
      return makePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...predicateRequired].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index) as AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Predicate>,
        available: current.available,
        dialect: current.dialect as PlanDialectOf<PlanValue> | DialectOfDialectInput<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
      }, {
        ...currentAst,
        having: [...currentAst.having, {
          kind: "having",
          predicate: predicateExpression
        }]
      })
    }

  const innerJoin = <CurrentTable extends TableLike, Predicate extends PredicateInput>(
    table: CurrentTable,
    on: Predicate
  ) =>
    join("inner", table, on)

  const leftJoin = <CurrentTable extends TableLike, Predicate extends PredicateInput>(
    table: CurrentTable,
    on: Predicate
  ) =>
    join("left", table, on)

  const join = <
    Kind extends QueryAst.JoinKind,
    CurrentTable extends TableLike,
    Predicate extends PredicateInput
  >(
    kind: Kind,
    table: CurrentTable,
    on: Predicate
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any>>(
      plan: PlanValue & (
        keyof AvailableOfPlan<PlanValue> extends never ? never : unknown
      ) & (
        TableNameOf<CurrentTable> extends ScopedNamesOfPlan<PlanValue> ? never : unknown
      )
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddJoinRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, TableNameOf<CurrentTable>, Predicate>,
      AddAvailable<AvailableOfPlan<PlanValue>, TableNameOf<CurrentTable>, JoinSourceMode<Kind>>,
      PlanDialectOf<PlanValue> | TableDialectOf<CurrentTable> | DialectOfDialectInput<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue> | TableNameOf<CurrentTable>,
      AddJoinRequired<OutstandingOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, TableNameOf<CurrentTable>, Predicate>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const onExpression = toDialectExpression(on)
      const nextAvailable = {
        ...current.available,
        [table[Table.TypeId].name]: {
          name: table[Table.TypeId].name,
          mode: (kind === "left" ? "optional" : "required") as JoinSourceMode<Kind>,
          baseName: table[Table.TypeId].baseName
        }
      } as AddAvailable<AvailableOfPlan<PlanValue>, TableNameOf<CurrentTable>, JoinSourceMode<Kind>>
      return makePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...extractRequiredFromDialectInputRuntime(on)].filter((name, index, values) =>
          !(name in nextAvailable) && values.indexOf(name) === index) as AddJoinRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, TableNameOf<CurrentTable>, Predicate>,
        available: nextAvailable,
        dialect: current.dialect as PlanDialectOf<PlanValue> | TableDialectOf<CurrentTable> | DialectOfDialectInput<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
      }, {
        ...currentAst,
        joins: [...currentAst.joins, {
          kind,
          tableName: table[Table.TypeId].name,
          baseTableName: table[Table.TypeId].baseName,
          on: onExpression
        }]
      })
    }

  const orderBy = <Value extends ExpressionInput>(
    value: Value,
    direction: OrderDirection = "asc"
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any>>(
      plan: PlanValue
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Value>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue> | DialectOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue>,
      AddExpressionRequired<OutstandingOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Value>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const expression = toDialectExpression(value)
      const required = extractRequiredFromDialectInputRuntime(value)
      return makePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...required].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index) as AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Value>,
        available: current.available,
        dialect: current.dialect as PlanDialectOf<PlanValue> | DialectOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
      }, {
        ...currentAst,
        orderBy: [...currentAst.orderBy, {
          kind: "orderBy",
          value: expression,
          direction
        }]
      })
    }

  const groupBy = <Values extends readonly [GroupByInput, ...GroupByInput[]]>(
    ...values: Values
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any>>(
      plan: PlanValue
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      Exclude<RequiredOfPlan<PlanValue> | RequiredFromDependencies<TupleDependencies<Values>>, AvailableNames<AvailableOfPlan<PlanValue>>>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue> | TupleDialect<Values>,
      GroupedOfPlan<PlanValue> | GroupedKeysFromValues<Values>,
      ScopedNamesOfPlan<PlanValue>,
      Exclude<OutstandingOfPlan<PlanValue> | RequiredFromDependencies<TupleDependencies<Values>>, AvailableNames<AvailableOfPlan<PlanValue>>>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const required = [...values.flatMap((value) => Object.keys(value[Expression.TypeId].dependencies))].filter((name, index, list) =>
        !(name in current.available) && list.indexOf(name) === index)
      return makePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...required].filter((name, index, list) =>
          !(name in current.available) && list.indexOf(name) === index) as Exclude<RequiredOfPlan<PlanValue> | RequiredFromDependencies<TupleDependencies<Values>>, AvailableNames<AvailableOfPlan<PlanValue>>>,
        available: current.available,
        dialect: current.dialect as PlanDialectOf<PlanValue> | TupleDialect<Values>
      }, {
        ...currentAst,
        groupBy: [...currentAst.groupBy, ...values]
      })
    }

  return {
    literal,
    eq,
    isNull,
    isNotNull,
    upper,
    lower,
    and,
    or,
    not,
    coalesce,
    concat,
    count,
    max,
    min,
    as,
    select,
    where,
    having,
    from,
    innerJoin,
    leftJoin,
    orderBy,
    groupBy
  }
}
