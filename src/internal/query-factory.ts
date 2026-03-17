import * as Expression from "../expression.ts"
import * as Plan from "../plan.ts"
import * as Table from "../table.ts"
import {
  currentRequiredList,
  extractRequiredRuntime,
  getAst,
  getQueryState,
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
  type AssumptionsOfPlan,
  type AvailableOfPlan,
  type DependenciesOf,
  type DependencyRecord,
  type DialectOf,
  type ExpressionInput,
  type ExtractDialect,
  type ExtractRequired,
  type GroupByInput,
  type GroupedOfPlan,
  type GroupedKeysFromValues,
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
} from "../query.ts"
import * as ExpressionAst from "./expression-ast.ts"
import type { AssumeTrue } from "./predicate-analysis.ts"
import { dedupeGroupedExpressions } from "./grouping-key.ts"
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
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.LiteralNode<Value>
}

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

/** Result nullability for variadic `coalesce(...)`. */
type CoalesceNullabilityTuple<
  Values extends readonly Expression.Any[]
> = Values extends readonly [
  infer Head extends Expression.Any,
  ...infer Tail extends readonly Expression.Any[]
]
  ? Tail["length"] extends 0
    ? Expression.NullabilityOf<Head>
    : CoalesceNullability<Expression.NullabilityOf<Head>, CoalesceNullabilityTuple<Tail>>
  : "always"

/** Runtime type of variadic `coalesce(...)` after stripping null branches. */
type CoalesceRuntimeTuple<
  Values extends readonly Expression.Any[]
> = Exclude<Expression.RuntimeOf<Values[number]>, null>

/** Normalized expression tuple for generic scalar operator inputs. */
type DialectExpressionTuple<
  Values extends readonly ExpressionInput[],
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = {
  readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
}

/** Normalized expression tuple for generic string operator inputs. */
type DialectStringExpressionTuple<
  Values extends readonly StringExpressionInput[],
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = {
  readonly [K in keyof Values]: DialectAsStringExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
}

/** Names of sources already available to a plan. */
type AvailableNames<Available extends Record<string, Plan.Source>> = Extract<keyof Available, string>

type PlanAssumptionsAfterWhere<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>,
  Predicate extends PredicateInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = AssumeTrue<
  AssumptionsOfPlan<PlanValue>,
  DialectAsExpression<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
>

type AstBackedExpression<
  Runtime,
  Db extends Expression.DbType.Any,
  Nullable extends Expression.Nullability,
  Dialect extends string,
  Aggregation extends Expression.AggregationKind,
  Source,
  Dependencies extends Expression.SourceDependencies,
  Ast extends ExpressionAst.Any,
  SourceNullability extends Expression.SourceNullabilityMode = "propagate"
> = Expression.Expression<
  Runtime,
  Db,
  Nullable,
  Dialect,
  Aggregation,
  Source,
  Dependencies,
  SourceNullability
> & {
  readonly [ExpressionAst.TypeId]: Ast
}

type CaseBranch<
  Predicate extends Expression.Any = Expression.Any,
  Then extends Expression.Any = Expression.Any
> = {
  readonly when: Predicate
  readonly then: Then
}

type CasePredicateUnion<Branches extends readonly CaseBranch[]> =
  Branches[number] extends CaseBranch<infer Predicate extends Expression.Any, any> ? Predicate : never

type CaseResultUnion<Branches extends readonly CaseBranch[]> =
  Branches[number] extends CaseBranch<any, infer Then extends Expression.Any> ? Then : never

type CasePredicateTuple<Branches extends readonly CaseBranch[]> = {
  readonly [K in keyof Branches]: Branches[K] extends CaseBranch<infer Predicate extends Expression.Any, any> ? Predicate : never
} & readonly Expression.Any[]

type CaseResultTuple<Branches extends readonly CaseBranch[]> = {
  readonly [K in keyof Branches]: Branches[K] extends CaseBranch<any, infer Then extends Expression.Any> ? Then : never
} & readonly Expression.Any[]

type CaseAllTuple<
  Branches extends readonly CaseBranch[],
  Else extends Expression.Any
> = [...CasePredicateTuple<Branches>, ...CaseResultTuple<Branches>, Else]

type CaseResultTupleWithElse<
  Branches extends readonly CaseBranch[],
  Else extends Expression.Any
> = [...CaseResultTuple<Branches>, Else]

type MergeAggregationUnion<Value extends Expression.Any> =
  Extract<AggregationOf<Value>, "window"> extends never
    ? Extract<AggregationOf<Value>, "aggregate"> extends never ? "scalar" : "aggregate"
    : "window"

type CaseNullabilityOfUnion<Value extends Expression.Any> =
  Extract<Expression.NullabilityOf<Value>, "never"> extends never
    ? Extract<Expression.NullabilityOf<Value>, "maybe"> extends never ? "always" : "maybe"
    : Exclude<Expression.NullabilityOf<Value>, "never"> extends never ? "never" : "maybe"

type CaseAstBranches<
  Branches extends readonly CaseBranch[]
> = {
  readonly [K in keyof Branches]: Branches[K] extends CaseBranch<infer Predicate extends Expression.Any, infer Then extends Expression.Any>
    ? ExpressionAst.CaseBranchNode<Predicate, Then>
    : never
} & readonly ExpressionAst.CaseBranchNode[]

type CaseBuilder<
  Branches extends readonly [CaseBranch<any, any>, ...CaseBranch<any, any>[]],
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = {
  when<Predicate extends HavingPredicateInput, Then extends ExpressionInput>(
    predicate: Predicate,
    result: Then
  ): CaseBuilder<
    [...Branches, CaseBranch<
      DialectAsExpression<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      DialectAsExpression<Then, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    >],
    Dialect,
    TextDb,
    NumericDb,
    BoolDb,
    TimestampDb,
    NullDb
  >
  else<Else extends ExpressionInput>(
    fallback: Else
  ): AstBackedExpression<
    Expression.RuntimeOf<CaseResultTupleWithElse<Branches, DialectAsExpression<Else, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>[number]>,
    Expression.DbTypeOf<CaseResultTupleWithElse<Branches, DialectAsExpression<Else, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>[number]>,
    CaseNullabilityOfUnion<CaseResultTupleWithElse<Branches, DialectAsExpression<Else, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>[number]>,
    TupleDialect<CaseAllTuple<Branches, DialectAsExpression<Else, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>>,
    MergeAggregationTuple<CaseAllTuple<Branches, DialectAsExpression<Else, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>>,
    TupleSource<CaseAllTuple<Branches, DialectAsExpression<Else, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>>,
    TupleDependencies<CaseAllTuple<Branches, DialectAsExpression<Else, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>>,
    ExpressionAst.CaseNode<CaseAstBranches<Branches>, DialectAsExpression<Else, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    "resolved"
  >
}

type CaseStarter<
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = {
  when<Predicate extends HavingPredicateInput, Then extends ExpressionInput>(
    predicate: Predicate,
    result: Then
  ): CaseBuilder<
    [CaseBranch<
      DialectAsExpression<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      DialectAsExpression<Then, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    >],
    Dialect,
    TextDb,
    NumericDb,
    BoolDb,
    TimestampDb,
    NullDb
  >
}

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
  ): AstBackedExpression<
    boolean,
    BoolDb,
    "maybe",
    DialectOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | DialectOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    MergeAggregation<AggregationOf<DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>, AggregationOf<DialectAsExpression<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>>,
    SourceOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | SourceOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependencyRecord<RequiredFromDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | RequiredFromDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    ExpressionAst.BinaryNode<
      "eq",
      DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      DialectAsExpression<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    >
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
  ): AstBackedExpression<
    boolean,
    BoolDb,
    "never",
    DialectOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    AggregationOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    SourceOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    ExpressionAst.UnaryNode<"isNull", DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
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
  ): AstBackedExpression<
    boolean,
    BoolDb,
    "never",
    DialectOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    AggregationOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    SourceOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    ExpressionAst.UnaryNode<"isNotNull", DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
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
  ): AstBackedExpression<
    string,
    TextDb,
    NullabilityOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DialectOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    AggregationOf<DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    SourceOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependenciesOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    ExpressionAst.UnaryNode<"upper", DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
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
  ): AstBackedExpression<
    string,
    TextDb,
    NullabilityOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DialectOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    AggregationOf<DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    SourceOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependenciesOfDialectStringInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    ExpressionAst.UnaryNode<"lower", DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
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
  ): AstBackedExpression<
    boolean,
    BoolDb,
    MergeNullabilityTuple<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleDialect<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    MergeAggregationTuple<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleSource<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleDependencies<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    ExpressionAst.VariadicNode<"and", { readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>
  > => {
    const expressions = values.map((value) => toDialectExpression(value)) as {
      readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    } & readonly Expression.Any[]
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
  ): AstBackedExpression<
    boolean,
    BoolDb,
    MergeNullabilityTuple<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleDialect<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    MergeAggregationTuple<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleSource<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    TupleDependencies<{ readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>,
    ExpressionAst.VariadicNode<"or", { readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]>
  > => {
    const expressions = values.map((value) => toDialectExpression(value)) as {
      readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    } & readonly Expression.Any[]
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
  ): AstBackedExpression<
    boolean,
    BoolDb,
    Expression.NullabilityOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    DialectOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    AggregationOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    SourceOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    ExpressionAst.UnaryNode<"not", DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
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
  ): AstBackedExpression<
    string,
    TextDb,
    MergeNullabilityTuple<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    TupleDialect<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    MergeAggregationTuple<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    TupleSource<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    TupleDependencies<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    ExpressionAst.VariadicNode<"concat", DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
  > => {
    const expressions = values.map((value) => toDialectStringExpression(value)) as DialectStringExpressionTuple<
      Values,
      Dialect,
      TextDb,
      NumericDb,
      BoolDb,
      TimestampDb,
      NullDb
    >
    return makeExpression({
      runtime: "" as string,
      dbType: profile.textDb as TextDb,
      nullability: mergeNullabilityManyRuntime(expressions) as MergeNullabilityTuple<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      dialect: (expressions.find((value) => value[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect) as TupleDialect<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      aggregation: mergeAggregationManyRuntime(expressions) as MergeAggregationTuple<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      source: mergeManySources(expressions) as TupleSource<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      sourceNullability: "propagate" as const,
      dependencies: mergeManyDependencies(expressions) as TupleDependencies<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
    }, {
      kind: "concat",
      values: expressions
    })
  }

  const count = <Value extends ExpressionInput>(
    value: Value
  ): AstBackedExpression<
    number,
    NumericDb,
    "never",
    DialectOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    "aggregate",
    SourceOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    ExpressionAst.UnaryNode<"count", DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
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
  ): AstBackedExpression<
    Expression.RuntimeOf<Value>,
    Expression.DbTypeOf<Value>,
    "maybe",
    DialectOf<Value>,
    "aggregate",
    SourceOf<Value>,
    DependenciesOf<Value>,
    ExpressionAst.UnaryNode<"max", Value>,
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
  ): AstBackedExpression<
    Expression.RuntimeOf<Value>,
    Expression.DbTypeOf<Value>,
    "maybe",
    DialectOf<Value>,
    "aggregate",
    SourceOf<Value>,
    DependenciesOf<Value>,
    ExpressionAst.UnaryNode<"min", Value>,
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

  const resolveCoalesceNullabilityRuntime = (
    values: readonly Expression.Any[]
  ): Expression.Nullability =>
    values.some((value) => value[Expression.TypeId].nullability === "never")
      ? "never"
      : values.some((value) => value[Expression.TypeId].nullability === "maybe")
        ? "maybe"
        : "always"

  const coalesce = <
    Values extends readonly [ExpressionInput, ExpressionInput, ...ExpressionInput[]]
  >(
    ...values: Values
  ): AstBackedExpression<
    CoalesceRuntimeTuple<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    Expression.DbTypeOf<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>[number]>,
    CoalesceNullabilityTuple<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    TupleDialect<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    MergeAggregationTuple<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    TupleSource<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    TupleDependencies<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    ExpressionAst.VariadicNode<"coalesce", DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    "resolved"
  > => {
    const expressions = values.map((value) => toDialectExpression(value)) as DialectExpressionTuple<
      Values,
      Dialect,
      TextDb,
      NumericDb,
      BoolDb,
      TimestampDb,
      NullDb
    >
    const representative = expressions.find((value) =>
      value[Expression.TypeId].nullability !== "always") ?? expressions[0]!
    return makeExpression({
      runtime: undefined as CoalesceRuntimeTuple<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      dbType: representative[Expression.TypeId].dbType as Expression.DbTypeOf<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>[number]>,
      nullability: resolveCoalesceNullabilityRuntime(expressions) as CoalesceNullabilityTuple<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      dialect: (expressions.find((value) => value[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect) as TupleDialect<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      aggregation: mergeAggregationManyRuntime(expressions) as MergeAggregationTuple<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      source: mergeManySources(expressions) as TupleSource<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      sourceNullability: "resolved" as const,
      dependencies: mergeManyDependencies(expressions) as TupleDependencies<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
    }, {
      kind: "coalesce",
      values: expressions
    })
  }

  const resolveCaseNullabilityRuntime = (
    values: readonly Expression.Any[]
  ): Expression.Nullability => {
    let sawNever = false
    let sawMaybe = false
    let sawAlways = false
    for (const value of values) {
      switch (value[Expression.TypeId].nullability) {
        case "never":
          sawNever = true
          break
        case "maybe":
          sawMaybe = true
          break
        case "always":
          sawAlways = true
          break
      }
    }
    return sawNever
      ? sawMaybe || sawAlways ? "maybe" : "never"
      : sawMaybe ? "maybe" : "always"
  }

  const case_ = (): CaseStarter<Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> => {
    type RuntimeCaseBranch = {
      readonly when: Expression.Any
      readonly then: Expression.Any
    }

    const finalize = (
      branches: readonly RuntimeCaseBranch[],
      fallback: Expression.Any
    ): Expression.Any => {
      const resultExpressions = [...branches.map((branch) => branch.then), fallback]
      const allExpressions = [...branches.flatMap((branch) => [branch.when, branch.then]), fallback]
      const representative = resultExpressions.find((value) =>
        value[Expression.TypeId].nullability !== "always") ?? fallback
      return makeExpression({
        runtime: undefined as never,
        dbType: representative[Expression.TypeId].dbType,
        nullability: resolveCaseNullabilityRuntime(resultExpressions),
        dialect: (allExpressions.find((value) => value[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect),
        aggregation: mergeAggregationManyRuntime(allExpressions),
        source: mergeManySources(allExpressions),
        sourceNullability: "resolved" as const,
        dependencies: mergeManyDependencies(allExpressions)
      }, {
        kind: "case",
        branches: branches.map((branch) => ({
          when: branch.when,
          then: branch.then
        })),
        else: fallback
      })
    }

    const build = (
      branches: readonly RuntimeCaseBranch[]
    ): {
      when: (predicate: HavingPredicateInput, result: ExpressionInput) => unknown
      else: (fallback: ExpressionInput) => Expression.Any
    } => ({
      when(predicate, result) {
        return build([
          ...branches,
          {
            when: toDialectExpression(predicate),
            then: toDialectExpression(result)
          }
        ])
      },
      else(fallback) {
        return finalize(branches, toDialectExpression(fallback))
      }
    })

    return {
      when<Predicate extends HavingPredicateInput, Then extends ExpressionInput>(predicate: Predicate, result: Then) {
        return build([{
          when: toDialectExpression(predicate),
          then: toDialectExpression(result)
        }]) as unknown as CaseBuilder<
          [CaseBranch<
            DialectAsExpression<typeof predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
            DialectAsExpression<typeof result, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
          >],
          Dialect,
          TextDb,
          NumericDb,
          BoolDb,
          TimestampDb,
          NullDb
        >
      }
    }
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
      schema?: unknown
    }
    const runtimeExpression = expression as DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> & {
      readonly [ExpressionAst.TypeId]: ExpressionAst.Any
      readonly schema?: unknown
    }
    projected[Expression.TypeId] = runtimeExpression[Expression.TypeId]
    projected[ExpressionAst.TypeId] = runtimeExpression[ExpressionAst.TypeId]
    if ("schema" in runtimeExpression) {
      projected.schema = runtimeExpression.schema
    }
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
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>>(
      plan: PlanValue
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Predicate>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue> | DialectOfDialectInput<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue>,
      AddExpressionRequired<OutstandingOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Predicate>,
      PlanAssumptionsAfterWhere<PlanValue, Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
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
      }, undefined as unknown as PlanAssumptionsAfterWhere<PlanValue, Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>)
    }

  const from = <CurrentTable extends TableLike>(
    table: CurrentTable
  ) =>
    <PlanValue extends QueryPlan<any, any, {}, any, any, any, any, any>>(
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
      const currentQuery = getQueryState(plan)
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
      }, currentQuery.assumptions)
    }

  const having = <Predicate extends HavingPredicateInput>(
    predicate: Predicate
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>>(
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
      const currentQuery = getQueryState(plan)
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
      }, currentQuery.assumptions)
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
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>>(
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
      const currentQuery = getQueryState(plan)
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
      }, currentQuery.assumptions)
    }

  const orderBy = <Value extends ExpressionInput>(
    value: Value,
    direction: OrderDirection = "asc"
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>>(
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
      const currentQuery = getQueryState(plan)
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
      }, currentQuery.assumptions)
    }

  const groupBy = <Values extends readonly [GroupByInput, ...GroupByInput[]]>(
    ...values: Values
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>>(
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
      const currentQuery = getQueryState(plan)
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
        groupBy: dedupeGroupedExpressions([...currentAst.groupBy, ...values])
      }, currentQuery.assumptions)
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
    case: case_,
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
