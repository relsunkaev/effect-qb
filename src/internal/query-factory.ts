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
  type AvailableAfterJoin,
  type AddExpressionRequired,
  type AddJoinRequired,
  type AggregationOf,
  type AssumptionsOfPlan,
  type AvailableOfPlan,
  type CapabilitiesOfPlan,
  type DialectCompatibleNestedPlan,
  type DependenciesOf,
  type DependencyRecord,
  type DialectOf,
  type DerivedSource,
  type CompletePlan,
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
  type NumericExpressionInput,
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
  type SetCompatiblePlan,
  type SetCompatibleRightPlan,
  type SchemaTableLike,
  type SourceCapabilitiesOf,
  type SourceRequiredOf,
  type SourceRequirementError,
  type TableDialectOf,
  type StatementOfPlan,
  type MutationInputOf,
  type MutationTargetLike,
  type MergeCapabilities,
  type SourceOf,
  type SourceDialectOf,
  type SourceLike,
  type SourceNameOf,
  type StringExpressionInput,
  type TableLike,
  type TupleDependencies,
  type TupleDialect,
  type TupleSource
} from "../query.ts"
import * as ExpressionAst from "./expression-ast.ts"
import type { AssumeTrue } from "./predicate-analysis.ts"
import type { TrueFormula } from "./predicate-formula.ts"
import { dedupeGroupedExpressions } from "./grouping-key.ts"
import { makeCteSource, makeDerivedSource, makeLateralSource } from "./derived-table.ts"
import * as ProjectionAlias from "./projection-alias.ts"
import * as QueryAst from "./query-ast.ts"
import { normalizeColumnList } from "./table-options.ts"

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

/** Normalizes a numeric-clause input into the expression form used internally. */
type DialectAsNumericExpression<
  Value extends NumericExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = Value extends Expression.Any
  ? Value
  : DialectLiteralExpression<Extract<Value, number>, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>

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

/** Dialect carried by a numeric-clause input after coercion. */
type DialectOfDialectNumericInput<
  Value extends NumericExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = DialectOf<DialectAsNumericExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

/** Dependency map carried by a numeric-clause input after coercion. */
type DependenciesOfDialectNumericInput<
  Value extends NumericExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = DependenciesOf<DialectAsNumericExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

/** Required source names carried by a numeric-clause input after coercion. */
type RequiredFromDialectNumericInput<
  Value extends NumericExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = RequiredFromDependencies<DependenciesOfDialectNumericInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

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
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
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

type MatchBuilder<
  Subject extends ExpressionInput,
  Branches extends readonly [CaseBranch<any, any>, ...CaseBranch<any, any>[]],
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
  > = {
  when<Compare extends ExpressionInput, Then extends ExpressionInput>(
    compare: Compare,
    result: Then
  ): MatchBuilder<
    Subject,
    [...Branches, CaseBranch<
      Expression.Any,
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

type MatchStarter<
  Subject extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = {
  when<Compare extends ExpressionInput, Then extends ExpressionInput>(
    compare: Compare,
    result: Then
  ): MatchBuilder<
    Subject,
    [CaseBranch<
      Expression.Any,
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

type WindowPartitionInput = Expression.Expression<
  any,
  Expression.DbType.Any,
  Expression.Nullability,
  string,
  "scalar",
  any,
  Expression.SourceDependencies,
  Expression.SourceNullabilityMode
>

type WindowOrderInput = WindowPartitionInput

type WindowOrderTermInput<Value extends WindowOrderInput = WindowOrderInput> = {
  readonly value: Value
  readonly direction?: OrderDirection
}

type NonEmptyWindowOrderTerms = readonly [
  WindowOrderTermInput,
  ...WindowOrderTermInput[]
]

type WindowSpecInput<
  PartitionBy extends readonly WindowPartitionInput[] = readonly WindowPartitionInput[],
  OrderBy extends readonly WindowOrderTermInput[] = readonly WindowOrderTermInput[]
> = {
  readonly partitionBy?: PartitionBy
  readonly orderBy?: OrderBy
}

type OrderedWindowSpecInput<
  PartitionBy extends readonly WindowPartitionInput[] = readonly WindowPartitionInput[],
  OrderBy extends NonEmptyWindowOrderTerms = NonEmptyWindowOrderTerms
> = {
  readonly partitionBy?: PartitionBy
  readonly orderBy: OrderBy
}

type WindowOrderExpressionTuple<
  Values extends readonly WindowOrderTermInput[]
> = {
  readonly [K in keyof Values]: Values[K] extends WindowOrderTermInput<infer Value extends WindowOrderInput> ? Value : never
} & readonly Expression.Any[]

type WindowNodeOf<
  Kind extends ExpressionAst.WindowKind,
  Value extends Expression.Any | undefined,
  PartitionBy extends readonly WindowPartitionInput[],
  OrderBy extends readonly WindowOrderTermInput[]
> = ExpressionAst.WindowNode<
  Kind,
  Value,
  PartitionBy,
  {
    readonly [K in keyof OrderBy]: OrderBy[K] extends WindowOrderTermInput<infer OrderValue extends WindowOrderInput>
      ? ExpressionAst.WindowOrderByNode<OrderValue>
      : never
  } & readonly ExpressionAst.WindowOrderByNode[]
>

type WindowDialectOf<
  Value extends Expression.Any,
  PartitionBy extends readonly WindowPartitionInput[],
  OrderBy extends readonly WindowOrderTermInput[]
> = DialectOf<Value> | TupleDialect<PartitionBy> | TupleDialect<WindowOrderExpressionTuple<OrderBy>>

type WindowSourceOf<
  Value extends Expression.Any,
  PartitionBy extends readonly WindowPartitionInput[],
  OrderBy extends readonly WindowOrderTermInput[]
> = SourceOf<Value> | TupleSource<PartitionBy> | TupleSource<WindowOrderExpressionTuple<OrderBy>>

type WindowDependenciesOf<
  Value extends Expression.Any,
  PartitionBy extends readonly WindowPartitionInput[],
  OrderBy extends readonly WindowOrderTermInput[]
> = DependencyRecord<
  RequiredFromDependencies<DependenciesOf<Value>>
  | RequiredFromDependencies<TupleDependencies<PartitionBy>>
  | RequiredFromDependencies<TupleDependencies<WindowOrderExpressionTuple<OrderBy>>>
>

type NumberWindowDialectOf<
  PartitionBy extends readonly WindowPartitionInput[],
  OrderBy extends readonly WindowOrderTermInput[]
> = TupleDialect<PartitionBy> | TupleDialect<WindowOrderExpressionTuple<OrderBy>>

type NumberWindowSourceOf<
  PartitionBy extends readonly WindowPartitionInput[],
  OrderBy extends readonly WindowOrderTermInput[]
> = TupleSource<PartitionBy> | TupleSource<WindowOrderExpressionTuple<OrderBy>>

type NumberWindowDependenciesOf<
  PartitionBy extends readonly WindowPartitionInput[],
  OrderBy extends readonly WindowOrderTermInput[]
> = DependencyRecord<
  RequiredFromDependencies<TupleDependencies<PartitionBy>>
  | RequiredFromDependencies<TupleDependencies<WindowOrderExpressionTuple<OrderBy>>>
>

type WindowedExpression<
  Value extends Expression.Any,
  PartitionBy extends readonly WindowPartitionInput[],
  OrderBy extends readonly WindowOrderTermInput[]
> = AstBackedExpression<
  Expression.RuntimeOf<Value>,
  Expression.DbTypeOf<Value>,
  Expression.NullabilityOf<Value>,
  WindowDialectOf<Value, PartitionBy, OrderBy>,
  "window",
  WindowSourceOf<Value, PartitionBy, OrderBy>,
  WindowDependenciesOf<Value, PartitionBy, OrderBy>,
  WindowNodeOf<"over", Value, PartitionBy, OrderBy>,
  "resolved"
>

type NumberWindowExpression<
  Kind extends Extract<ExpressionAst.WindowKind, "rowNumber" | "rank" | "denseRank">,
  PartitionBy extends readonly WindowPartitionInput[],
  OrderBy extends NonEmptyWindowOrderTerms
> = AstBackedExpression<
  number,
  Expression.DbType.Any,
  "never",
  NumberWindowDialectOf<PartitionBy, OrderBy>,
  "window",
  NumberWindowSourceOf<PartitionBy, OrderBy>,
  NumberWindowDependenciesOf<PartitionBy, OrderBy>,
  WindowNodeOf<Kind, undefined, PartitionBy, OrderBy>,
  "resolved"
>

/**
 * Builds a dialect-specialized query namespace from the shared query core.
 *
 * The returned object mirrors the public `Query` surface, but the constructors
 * that manufacture new expressions are specialized to the supplied dialect DB
 * types instead of relying on the Postgres-default root module.
 */
export function makeDialectQuery<
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
>(
  profile: QueryDialectProfile<Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
) {
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

  const toDialectNumericExpression = <Value extends NumericExpressionInput>(
    value: Value
  ): DialectAsNumericExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> =>
    (typeof value === "number"
      ? literal(value)
      : value) as DialectAsNumericExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>

  const extractRequiredFromDialectInputRuntime = (value: ExpressionInput): readonly string[] => {
    const expression = toDialectExpression(value)
    return Object.keys(expression[Expression.TypeId].dependencies)
  }

  const normalizeWindowSpec = <
    PartitionBy extends readonly WindowPartitionInput[],
    OrderBy extends readonly WindowOrderTermInput[]
  >(
    spec: WindowSpecInput<PartitionBy, OrderBy> | OrderedWindowSpecInput<PartitionBy, Extract<OrderBy, NonEmptyWindowOrderTerms>> | undefined
  ) => {
    const partitionBy = [...(spec?.partitionBy ?? [])] as unknown as PartitionBy
    const orderBy = (spec?.orderBy ?? []).map((term) => ({
      value: term.value,
      direction: term.direction ?? "asc"
    })) as {
      readonly [K in keyof OrderBy]: OrderBy[K] extends WindowOrderTermInput<infer Value extends WindowOrderInput>
        ? { readonly value: Value; readonly direction: OrderDirection }
        : never
    } & readonly { readonly value: WindowOrderInput; readonly direction: OrderDirection }[]
    return {
      partitionBy,
      orderBy
    }
  }

  const mergeWindowExpressions = (
    value: Expression.Any | undefined,
    partitionBy: readonly Expression.Any[],
    orderBy: readonly { readonly value: Expression.Any }[]
  ): readonly Expression.Any[] => value === undefined
    ? [...partitionBy, ...orderBy.map((term) => term.value)]
    : [value, ...partitionBy, ...orderBy.map((term) => term.value)]

  const extractRequiredFromDialectNumericInputRuntime = (value: NumericExpressionInput): readonly string[] => {
    const expression = toDialectNumericExpression(value)
    return Object.keys(expression[Expression.TypeId].dependencies)
  }

  type BinaryPredicateExpression<
    Left extends ExpressionInput,
    Right extends ExpressionInput,
    Kind extends ExpressionAst.BinaryKind,
    Nullability extends Expression.Nullability = "maybe",
    SourceNullability extends Expression.SourceNullabilityMode = "propagate"
  > = AstBackedExpression<
    boolean,
    BoolDb,
    Nullability,
    DialectOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | DialectOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    MergeAggregation<AggregationOf<DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>, AggregationOf<DialectAsExpression<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>>,
    SourceOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | SourceOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependencyRecord<RequiredFromDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | RequiredFromDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    ExpressionAst.BinaryNode<
      Kind,
      DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      DialectAsExpression<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    >,
    SourceNullability
  >

  type VariadicPredicateExpression<
    Values extends readonly ExpressionInput[],
    Kind extends ExpressionAst.VariadicKind
  > = AstBackedExpression<
    boolean,
    BoolDb,
    "maybe",
    TupleDialect<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    MergeAggregationTuple<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    TupleSource<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    TupleDependencies<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    ExpressionAst.VariadicNode<Kind, DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
  >

  const buildBinaryPredicate = <
    Left extends ExpressionInput,
    Right extends ExpressionInput,
    Kind extends ExpressionAst.BinaryKind,
    Nullability extends Expression.Nullability = "maybe",
    SourceNullability extends Expression.SourceNullabilityMode = "propagate"
  >(
    left: Left,
    right: Right,
    kind: Kind,
    nullability: Nullability = "maybe" as Nullability,
    sourceNullability: SourceNullability = "propagate" as SourceNullability
  ): BinaryPredicateExpression<Left, Right, Kind, Nullability, SourceNullability> => {
    const leftExpression = toDialectExpression(left)
    const rightExpression = toDialectExpression(right)
    return makeExpression({
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability,
      dialect: (leftExpression[Expression.TypeId].dialect ?? rightExpression[Expression.TypeId].dialect) as DialectOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | DialectOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      aggregation: mergeAggregationRuntime(
        leftExpression[Expression.TypeId].aggregation,
        rightExpression[Expression.TypeId].aggregation
      ) as MergeAggregation<AggregationOf<DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>, AggregationOf<DialectAsExpression<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>>,
      source: mergeSources(leftExpression[Expression.TypeId].source, rightExpression[Expression.TypeId].source) as SourceOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | SourceOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      sourceNullability,
      dependencies: mergeDependencies(
        leftExpression[Expression.TypeId].dependencies,
        rightExpression[Expression.TypeId].dependencies
      ) as DependencyRecord<RequiredFromDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | RequiredFromDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
    }, {
      kind,
      left: leftExpression,
      right: rightExpression
    })
  }

  const buildVariadicPredicate = <
    Values extends readonly ExpressionInput[],
    Kind extends ExpressionAst.VariadicKind
  >(
    values: Values,
    kind: Kind
  ): VariadicPredicateExpression<Values, Kind> => {
    const expressions = values.map((value) => toDialectExpression(value)) as DialectExpressionTuple<
      Values,
      Dialect,
      TextDb,
      NumericDb,
      BoolDb,
      TimestampDb,
      NullDb
    >
    return makeExpression({
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: "maybe",
      dialect: (expressions.find((value) => value[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect) as TupleDialect<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      aggregation: mergeAggregationManyRuntime(expressions) as MergeAggregationTuple<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      source: mergeManySources(expressions) as TupleSource<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      sourceNullability: "propagate" as const,
      dependencies: mergeManyDependencies(expressions) as TupleDependencies<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
    }, {
      kind,
      values: expressions
    })
  }

  const eq = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    left: Left,
    right: Right
  ): BinaryPredicateExpression<Left, Right, "eq"> =>
    buildBinaryPredicate(left, right, "eq")

  const neq = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    left: Left,
    right: Right
  ): BinaryPredicateExpression<Left, Right, "neq"> =>
    buildBinaryPredicate(left, right, "neq")

  const lt = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    left: Left,
    right: Right
  ): BinaryPredicateExpression<Left, Right, "lt"> =>
    buildBinaryPredicate(left, right, "lt")

  const lte = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    left: Left,
    right: Right
  ): BinaryPredicateExpression<Left, Right, "lte"> =>
    buildBinaryPredicate(left, right, "lte")

  const gt = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    left: Left,
    right: Right
  ): BinaryPredicateExpression<Left, Right, "gt"> =>
    buildBinaryPredicate(left, right, "gt")

  const gte = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    left: Left,
    right: Right
  ): BinaryPredicateExpression<Left, Right, "gte"> =>
    buildBinaryPredicate(left, right, "gte")

  const like = <
    Left extends StringExpressionInput,
    Right extends StringExpressionInput
  >(
    left: Left,
    right: Right
  ): BinaryPredicateExpression<Left, Right, "like"> =>
    buildBinaryPredicate(left, right, "like")

  const ilike = <
    Left extends StringExpressionInput,
    Right extends StringExpressionInput
  >(
    left: Left,
    right: Right
  ): BinaryPredicateExpression<Left, Right, "ilike"> =>
    buildBinaryPredicate(left, right, "ilike")

  const isDistinctFrom = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    left: Left,
    right: Right
  ): BinaryPredicateExpression<Left, Right, "isDistinctFrom", "never", "resolved"> =>
    buildBinaryPredicate(left, right, "isDistinctFrom", "never", "resolved")

  const isNotDistinctFrom = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    left: Left,
    right: Right
  ): BinaryPredicateExpression<Left, Right, "isNotDistinctFrom", "never", "resolved"> =>
    buildBinaryPredicate(left, right, "isNotDistinctFrom", "never", "resolved")

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

  const in_ = <
    Values extends readonly [ExpressionInput, ExpressionInput, ...ExpressionInput[]]
  >(
    ...values: Values
  ): VariadicPredicateExpression<Values, "in"> =>
    buildVariadicPredicate(values, "in")

  const notIn = <
    Values extends readonly [ExpressionInput, ExpressionInput, ...ExpressionInput[]]
  >(
    ...values: Values
  ): VariadicPredicateExpression<Values, "notIn"> =>
    buildVariadicPredicate(values, "notIn")

  const between = <
    Value extends ExpressionInput,
    Lower extends ExpressionInput,
    Upper extends ExpressionInput
  >(
    value: Value,
    lower: Lower,
    upper: Upper
  ): VariadicPredicateExpression<[Value, Lower, Upper], "between"> =>
    buildVariadicPredicate([value, lower, upper], "between")

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

  const all_ = <
    Values extends readonly [ExpressionInput, ...ExpressionInput[]]
  >(
    ...values: Values
  ) => and(...values)

  const any_ = <
    Values extends readonly [ExpressionInput, ...ExpressionInput[]]
  >(
    ...values: Values
  ) => or(...values)

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

  const exists = <
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
  >(
    plan: DialectCompatibleNestedPlan<PlanValue, Dialect>
  ): AstBackedExpression<
    boolean,
    BoolDb,
    "never",
    Dialect,
    "scalar",
    never,
    DependencyRecord<OutstandingOfPlan<PlanValue>>,
    ExpressionAst.ExistsNode<PlanValue>,
    "resolved"
  > => {
    const dependencies = Object.fromEntries(
      currentRequiredList(plan[Plan.TypeId].required).map((name) => [name, true] as const)
    ) as DependencyRecord<OutstandingOfPlan<PlanValue>>
    return makeExpression({
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: "never",
      dialect: profile.dialect as Dialect,
      aggregation: "scalar",
      source: undefined as never,
      sourceNullability: "resolved" as const,
      dependencies
    }, {
      kind: "exists",
      plan
    })
  }

  const over = <
    Value extends Expression.Expression<
      any,
      Expression.DbType.Any,
      Expression.Nullability,
      string,
      "aggregate",
      any,
      Expression.SourceDependencies,
      Expression.SourceNullabilityMode
    >,
    PartitionBy extends readonly WindowPartitionInput[] = [],
    OrderBy extends readonly WindowOrderTermInput[] = []
  >(
    value: Value,
    spec: WindowSpecInput<PartitionBy, OrderBy> = {}
  ): WindowedExpression<Value, PartitionBy, OrderBy> => {
    const normalized = normalizeWindowSpec(spec)
    const expressions = mergeWindowExpressions(value, normalized.partitionBy, normalized.orderBy)
    return makeExpression({
      runtime: undefined as Expression.RuntimeOf<Value>,
      dbType: value[Expression.TypeId].dbType as Expression.DbTypeOf<Value>,
      nullability: value[Expression.TypeId].nullability as Expression.NullabilityOf<Value>,
      dialect: (expressions.find((expression) => expression[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect) as WindowDialectOf<Value, PartitionBy, OrderBy>,
      aggregation: "window",
      source: mergeManySources(expressions) as WindowSourceOf<Value, PartitionBy, OrderBy>,
      sourceNullability: "resolved" as const,
      dependencies: mergeManyDependencies(expressions) as WindowDependenciesOf<Value, PartitionBy, OrderBy>
    }, {
      kind: "window",
      function: "over",
      value,
      partitionBy: normalized.partitionBy,
      orderBy: normalized.orderBy
    })
  }

  const buildNumberWindow = <
    Kind extends Extract<ExpressionAst.WindowKind, "rowNumber" | "rank" | "denseRank">,
    PartitionBy extends readonly WindowPartitionInput[],
    OrderBy extends NonEmptyWindowOrderTerms
  >(
    kind: Kind,
    spec: OrderedWindowSpecInput<PartitionBy, OrderBy>
  ): NumberWindowExpression<Kind, PartitionBy, OrderBy> => {
    const normalized = normalizeWindowSpec(spec)
    const expressions = mergeWindowExpressions(undefined, normalized.partitionBy, normalized.orderBy)
    return makeExpression({
      runtime: 0 as number,
      dbType: profile.numericDb as Expression.DbType.Any,
      nullability: "never",
      dialect: (expressions.find((expression) => expression[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect) as NumberWindowDialectOf<PartitionBy, OrderBy>,
      aggregation: "window",
      source: mergeManySources(expressions) as NumberWindowSourceOf<PartitionBy, OrderBy>,
      sourceNullability: "resolved" as const,
      dependencies: mergeManyDependencies(expressions) as NumberWindowDependenciesOf<PartitionBy, OrderBy>
    }, {
      kind: "window",
      function: kind,
      partitionBy: normalized.partitionBy,
      orderBy: normalized.orderBy
    })
  }

  const rowNumber = <
    PartitionBy extends readonly WindowPartitionInput[] = [],
    OrderBy extends NonEmptyWindowOrderTerms = NonEmptyWindowOrderTerms
  >(
    spec: OrderedWindowSpecInput<PartitionBy, OrderBy>
  ): NumberWindowExpression<"rowNumber", PartitionBy, OrderBy> =>
    buildNumberWindow("rowNumber", spec)

  const rank = <
    PartitionBy extends readonly WindowPartitionInput[] = [],
    OrderBy extends NonEmptyWindowOrderTerms = NonEmptyWindowOrderTerms
  >(
    spec: OrderedWindowSpecInput<PartitionBy, OrderBy>
  ): NumberWindowExpression<"rank", PartitionBy, OrderBy> =>
    buildNumberWindow("rank", spec)

  const denseRank = <
    PartitionBy extends readonly WindowPartitionInput[] = [],
    OrderBy extends NonEmptyWindowOrderTerms = NonEmptyWindowOrderTerms
  >(
    spec: OrderedWindowSpecInput<PartitionBy, OrderBy>
  ): NumberWindowExpression<"denseRank", PartitionBy, OrderBy> =>
    buildNumberWindow("denseRank", spec)

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

  type RuntimeCaseBranch = {
    readonly when: Expression.Any
    readonly then: Expression.Any
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

  const finalizeCase = (
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

  const case_ = (): CaseStarter<Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> => {
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
        return finalizeCase(branches, toDialectExpression(fallback))
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

  const match = <Value extends ExpressionInput>(
    value: Value
  ): MatchStarter<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> => {
    const subject = toDialectExpression(value)
    const build = (
      branches: readonly RuntimeCaseBranch[]
    ): {
      when: (compare: ExpressionInput, result: ExpressionInput) => unknown
      else: (fallback: ExpressionInput) => Expression.Any
    } => ({
      when(compare, result) {
        return build([
          ...branches,
          {
            when: eq(subject, compare),
            then: toDialectExpression(result)
          }
        ])
      },
      else(fallback) {
        return finalizeCase(branches, toDialectExpression(fallback))
      }
    })

    return {
      when<Compare extends ExpressionInput, Then extends ExpressionInput>(compare: Compare, result: Then) {
        const predicate = eq(subject, compare)
        return build([{
          when: predicate,
          then: toDialectExpression(result)
        }]) as unknown as MatchBuilder<
          Value,
          [CaseBranch<
            Expression.Any,
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

  const toMutationValueExpression = <Value>(
    value: Value,
    column: Expression.Any
  ): Expression.Any => {
    if (value !== null && typeof value === "object" && Expression.TypeId in value) {
      return value as unknown as Expression.Any
    }
    return makeExpression({
      runtime: value as Value,
      dbType: column[Expression.TypeId].dbType,
      nullability: value === null ? "always" : "never",
      dialect: column[Expression.TypeId].dialect,
      aggregation: "scalar",
      source: undefined as never,
      sourceNullability: "propagate" as const,
      dependencies: {}
    }, {
      kind: "literal",
      value
    })
  }

  const targetSourceDetails = (table: MutationTargetLike | SchemaTableLike) => {
    const sourceName = (table as unknown as TableLike)[Table.TypeId].name
    const sourceBaseName = (table as unknown as TableLike)[Table.TypeId].baseName
    return {
      sourceName,
      sourceBaseName
    }
  }

  const buildMutationAssignments = <Values extends Record<string, unknown>>(
    target: MutationTargetLike,
    values: Values
  ): readonly QueryAst.AssignmentClause[] => {
    const columns = target as unknown as Record<string, Expression.Any>
    return Object.entries(values).map(([columnName, value]) => ({
      columnName,
      value: toMutationValueExpression(value, columns[columnName]!)
    }))
  }

  const defaultIndexName = (
    tableName: string,
    columns: readonly string[],
    unique: boolean
  ): string => `${tableName}_${columns.join("_")}_${unique ? "uniq" : "idx"}`

type MutationStatement = "insert" | "update" | "delete"

type DdlStatement = "createTable" | "createIndex" | "dropIndex" | "dropTable"

type DdlColumnInput = string | readonly string[]

type NormalizeDdlColumns<Columns extends DdlColumnInput> =
  Columns extends readonly [infer Head extends string, ...infer Tail extends string[]]
    ? readonly [Head, ...Tail]
    : Columns extends readonly string[]
      ? Columns extends readonly [string, ...string[]]
        ? Columns
        : never
      : Columns extends string
        ? readonly [Columns]
        : never

type SchemaColumnNames<Target extends SchemaTableLike> = Extract<keyof Target[typeof Table.TypeId]["fields"], string>

type ValidateDdlColumns<
  Target extends SchemaTableLike,
  Columns extends readonly string[]
> = Exclude<Columns[number], SchemaColumnNames<Target>> extends never ? Columns : never

type ValidateTargetColumns<
  Target extends MutationTargetLike,
  Columns extends readonly string[]
> = Exclude<Columns[number], Extract<keyof Target[typeof Table.TypeId]["fields"], string>> extends never ? Columns : never

type CreateIndexOptions = {
  readonly name?: string
  readonly unique?: boolean
  readonly ifNotExists?: boolean
}

type DropIndexOptions = {
  readonly name?: string
  readonly ifExists?: boolean
}

type CreateTableOptions = {
  readonly ifNotExists?: boolean
}

type DropTableOptions = {
  readonly ifExists?: boolean
}

type LockOptions = {
  readonly nowait?: boolean
  readonly skipLocked?: boolean
}

type UpsertConflictOptions = {
  readonly update?: Record<string, unknown>
}

type RequireSelectStatement<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  StatementOfPlan<PlanValue> extends "select" ? unknown : never

type RequireWhereStatement<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  StatementOfPlan<PlanValue> extends "select" | "update" | "delete" ? unknown : never

type RequireMutationStatement<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  StatementOfPlan<PlanValue> extends MutationStatement ? unknown : never

type MutationRequiredFromValues<Values extends Record<string, unknown>> = {
  [K in keyof Values]: Values[K] extends Expression.Any ? RequiredFromDependencies<DependenciesOf<Values[K]>> : never
}[keyof Values]

type MutationAssignments<Shape extends Record<string, unknown>> = {
  readonly [K in keyof Shape]: QueryAst.AssignmentClause
}

  function as<
    Value extends ExpressionInput,
    Alias extends string
  >(
    value: Value,
    alias: Alias
  ): DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
  function as<
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    Alias extends string
  >(
    value: CompletePlan<PlanValue>,
    alias: Alias
  ): DerivedSource<PlanValue, Alias>
  function as(value: unknown, alias: string): unknown {
    if (typeof value !== "object" || value === null || Expression.TypeId in value) {
      const expression = toDialectExpression(value as ExpressionInput)
      const projected = Object.create(Object.getPrototypeOf(expression)) as {
        [Expression.TypeId]: Expression.State<any, any, any, any, any, any, any, Expression.SourceNullabilityMode>
        [ExpressionAst.TypeId]: ExpressionAst.Any
        [ProjectionAlias.TypeId]: ProjectionAlias.State<string>
        schema?: unknown
      }
      const runtimeExpression = expression as typeof expression & {
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
      } satisfies ProjectionAlias.State<string>
      return projected
    }
    return makeDerivedSource(value as CompletePlan<QueryPlan<any, any, any, any, any, any, any, any, any, any>>, alias)
  }

  function with_<
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    Alias extends string
  >(
    value: CompletePlan<PlanValue>,
    alias: Alias
  ): import("../query.ts").CteSource<PlanValue, Alias> {
    return makeCteSource(value, alias)
  }

  function withRecursive_<
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    Alias extends string
  >(
    value: CompletePlan<PlanValue>,
    alias: Alias
  ): import("../query.ts").CteSource<PlanValue, Alias> {
    return makeCteSource(value, alias, true)
  }

  function lateral<
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    Alias extends string
  >(
    value: PlanValue,
    alias: Alias
  ): import("../query.ts").LateralSource<PlanValue, Alias> {
    return makeLateralSource(value, alias)
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
    ExtractRequired<Selection>,
    TrueFormula,
    "read",
    "select"
  > =>
    makePlan({
      selection,
      required: extractRequiredRuntime(selection) as ExtractRequired<Selection>,
      available: {},
      dialect: profile.dialect as ExtractDialect<Selection> extends never ? Dialect : ExtractDialect<Selection>
    }, {
      kind: "select",
      select: selection,
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "read", "select")

  const buildSetOperation = <
    Operator extends QueryAst.SetOperatorKind,
    LeftPlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    RightPlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
  >(
    kind: Operator,
    left: SetCompatiblePlan<LeftPlanValue, Dialect>,
    right: SetCompatibleRightPlan<LeftPlanValue, RightPlanValue, Dialect>
  ): QueryPlan<
    SelectionOfPlan<LeftPlanValue>,
    never,
    {},
    PlanDialectOf<LeftPlanValue> | PlanDialectOf<RightPlanValue>,
    GroupedOfPlan<LeftPlanValue>,
    never,
    never,
    TrueFormula,
    CapabilitiesOfPlan<LeftPlanValue> | CapabilitiesOfPlan<RightPlanValue>,
    "set"
  > => {
    const leftState = left[Plan.TypeId]
    const leftAst = getAst(left)
    const basePlan = leftAst.kind === "set"
      ? leftAst.setBase ?? left
      : left
    const leftOperations = leftAst.kind === "set"
      ? [...(leftAst.setOperations ?? [])]
      : []
    return makePlan({
      selection: leftState.selection as SelectionOfPlan<LeftPlanValue>,
      required: undefined as never,
      available: {},
      dialect: (leftState.dialect ?? right[Plan.TypeId].dialect) as PlanDialectOf<LeftPlanValue> | PlanDialectOf<RightPlanValue>
    }, {
      kind: "set",
      select: leftState.selection,
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: [],
      setBase: basePlan,
      setOperations: [
        ...leftOperations,
        {
          kind,
          query: right
        }
      ]
    }, undefined as unknown as TrueFormula, undefined as unknown as CapabilitiesOfPlan<LeftPlanValue> | CapabilitiesOfPlan<RightPlanValue>, "set")
  }

  const union = <
    LeftPlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    RightPlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
  >(
    left: SetCompatiblePlan<LeftPlanValue, Dialect>,
    right: SetCompatibleRightPlan<LeftPlanValue, RightPlanValue, Dialect>
  ): QueryPlan<
    SelectionOfPlan<LeftPlanValue>,
    never,
    {},
    PlanDialectOf<LeftPlanValue> | PlanDialectOf<RightPlanValue>,
    GroupedOfPlan<LeftPlanValue>,
    never,
    never,
    TrueFormula,
    CapabilitiesOfPlan<LeftPlanValue> | CapabilitiesOfPlan<RightPlanValue>,
    "set"
  > => buildSetOperation("union", left as never, right as never) as QueryPlan<
    SelectionOfPlan<LeftPlanValue>,
    never,
    {},
    PlanDialectOf<LeftPlanValue> | PlanDialectOf<RightPlanValue>,
    GroupedOfPlan<LeftPlanValue>,
    never,
    never,
    TrueFormula,
    CapabilitiesOfPlan<LeftPlanValue> | CapabilitiesOfPlan<RightPlanValue>,
    "set"
  >

  const intersect = <
    LeftPlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    RightPlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
  >(
    left: SetCompatiblePlan<LeftPlanValue, Dialect>,
    right: SetCompatibleRightPlan<LeftPlanValue, RightPlanValue, Dialect>
  ): QueryPlan<
    SelectionOfPlan<LeftPlanValue>,
    never,
    {},
    PlanDialectOf<LeftPlanValue> | PlanDialectOf<RightPlanValue>,
    GroupedOfPlan<LeftPlanValue>,
    never,
    never,
    TrueFormula,
    CapabilitiesOfPlan<LeftPlanValue> | CapabilitiesOfPlan<RightPlanValue>,
    "set"
  > => buildSetOperation("intersect", left as never, right as never) as QueryPlan<
    SelectionOfPlan<LeftPlanValue>,
    never,
    {},
    PlanDialectOf<LeftPlanValue> | PlanDialectOf<RightPlanValue>,
    GroupedOfPlan<LeftPlanValue>,
    never,
    never,
    TrueFormula,
    CapabilitiesOfPlan<LeftPlanValue> | CapabilitiesOfPlan<RightPlanValue>,
    "set"
  >

  const except = <
    LeftPlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    RightPlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
  >(
    left: SetCompatiblePlan<LeftPlanValue, Dialect>,
    right: SetCompatibleRightPlan<LeftPlanValue, RightPlanValue, Dialect>
  ): QueryPlan<
    SelectionOfPlan<LeftPlanValue>,
    never,
    {},
    PlanDialectOf<LeftPlanValue> | PlanDialectOf<RightPlanValue>,
    GroupedOfPlan<LeftPlanValue>,
    never,
    never,
    TrueFormula,
    CapabilitiesOfPlan<LeftPlanValue> | CapabilitiesOfPlan<RightPlanValue>,
    "set"
  > => buildSetOperation("except", left as never, right as never) as QueryPlan<
    SelectionOfPlan<LeftPlanValue>,
    never,
    {},
    PlanDialectOf<LeftPlanValue> | PlanDialectOf<RightPlanValue>,
    GroupedOfPlan<LeftPlanValue>,
    never,
    never,
    TrueFormula,
    CapabilitiesOfPlan<LeftPlanValue> | CapabilitiesOfPlan<RightPlanValue>,
    "set"
  >

  const where = <Predicate extends PredicateInput>(
    predicate: Predicate
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & RequireWhereStatement<PlanValue>
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Predicate>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue> | DialectOfDialectInput<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue>,
      AddExpressionRequired<OutstandingOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Predicate>,
      PlanAssumptionsAfterWhere<PlanValue, Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      CapabilitiesOfPlan<PlanValue>,
      StatementOfPlan<PlanValue>
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
      },
      undefined as unknown as PlanAssumptionsAfterWhere<PlanValue, Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      currentQuery.capabilities,
      currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const from = <CurrentTable extends SourceLike>(
    table: CurrentTable
  ) =>
    <PlanValue extends QueryPlan<any, any, {}, any, any, any, any, any, any>>(
      plan: PlanValue & RequireSelectStatement<PlanValue> & (
        SourceNameOf<CurrentTable> extends OutstandingOfPlan<PlanValue> ? unknown : never
      ) & (
        SourceRequiredOf<CurrentTable> extends never ? unknown : SourceRequirementError<CurrentTable>
      )
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      Exclude<RequiredOfPlan<PlanValue>, SourceNameOf<CurrentTable>>,
      AddAvailable<{}, SourceNameOf<CurrentTable>>,
      PlanDialectOf<PlanValue> | SourceDialectOf<CurrentTable>,
      GroupedOfPlan<PlanValue>,
      SourceNameOf<CurrentTable>,
      Exclude<OutstandingOfPlan<PlanValue>, SourceNameOf<CurrentTable>>,
      AssumptionsOfPlan<PlanValue>,
      MergeCapabilities<CapabilitiesOfPlan<PlanValue>, SourceCapabilitiesOf<CurrentTable>>,
      StatementOfPlan<PlanValue>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const sourceName = "kind" in table && (table.kind === "derived" || table.kind === "cte" || table.kind === "lateral")
        ? table.name
        : (table as TableLike)[Table.TypeId].name
      const sourceBaseName = "kind" in table && (table.kind === "derived" || table.kind === "cte" || table.kind === "lateral")
        ? table.baseName
        : (table as TableLike)[Table.TypeId].baseName
      const nextAst = {
        ...currentAst,
        from: {
          kind: "from",
          tableName: sourceName,
          baseTableName: sourceBaseName,
          source: table
        }
      } as QueryAst.Ast<SelectionOfPlan<PlanValue>, GroupedOfPlan<PlanValue>, StatementOfPlan<PlanValue>>
      return makePlan({
        selection: current.selection,
        required: currentRequiredList(current.required).filter((name) =>
          name !== sourceName) as Exclude<RequiredOfPlan<PlanValue>, SourceNameOf<CurrentTable & SourceLike>>,
        available: {
          [sourceName]: {
            name: sourceName,
            mode: "required",
            baseName: sourceBaseName
          }
        } as AddAvailable<{}, SourceNameOf<CurrentTable & SourceLike>>,
        dialect: current.dialect as PlanDialectOf<PlanValue> | SourceDialectOf<CurrentTable>
      }, nextAst, currentQuery.assumptions, currentQuery.capabilities as MergeCapabilities<CapabilitiesOfPlan<PlanValue>, SourceCapabilitiesOf<CurrentTable>>, currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const having = <Predicate extends HavingPredicateInput>(
    predicate: Predicate
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & RequireSelectStatement<PlanValue>
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Predicate>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue> | DialectOfDialectInput<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue>,
      AddExpressionRequired<OutstandingOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Predicate>,
      AssumptionsOfPlan<PlanValue>,
      CapabilitiesOfPlan<PlanValue>,
      StatementOfPlan<PlanValue>
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
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const innerJoin = <CurrentTable extends SourceLike, Predicate extends PredicateInput>(
    table: CurrentTable,
    on: Predicate
  ) =>
    join("inner", table, on)

  const leftJoin = <CurrentTable extends SourceLike, Predicate extends PredicateInput>(
    table: CurrentTable,
    on: Predicate
  ) =>
    join("left", table, on)

  const rightJoin = <CurrentTable extends SourceLike, Predicate extends PredicateInput>(
    table: CurrentTable,
    on: Predicate
  ) =>
    join("right", table, on)

  const fullJoin = <CurrentTable extends SourceLike, Predicate extends PredicateInput>(
    table: CurrentTable,
    on: Predicate
  ) =>
    join("full", table, on)

  const crossJoin = <CurrentTable extends SourceLike>(
    table: CurrentTable
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & RequireSelectStatement<PlanValue> & (
        keyof AvailableOfPlan<PlanValue> extends never ? never : unknown
      ) & (
        SourceNameOf<CurrentTable> extends ScopedNamesOfPlan<PlanValue> ? never : unknown
      )
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddJoinRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, SourceNameOf<CurrentTable>, never, "cross">,
      AddAvailable<AvailableOfPlan<PlanValue>, SourceNameOf<CurrentTable>, "required">,
      PlanDialectOf<PlanValue> | SourceDialectOf<CurrentTable>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue> | SourceNameOf<CurrentTable>,
      AddJoinRequired<OutstandingOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, SourceNameOf<CurrentTable>, never, "cross">,
      AssumptionsOfPlan<PlanValue>,
      MergeCapabilities<CapabilitiesOfPlan<PlanValue>, SourceCapabilitiesOf<CurrentTable>>,
      StatementOfPlan<PlanValue>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const sourceName = "kind" in table && (table.kind === "derived" || table.kind === "cte" || table.kind === "lateral")
        ? table.name
        : (table as TableLike)[Table.TypeId].name
      const sourceBaseName = "kind" in table && (table.kind === "derived" || table.kind === "cte" || table.kind === "lateral")
        ? table.baseName
        : (table as TableLike)[Table.TypeId].baseName
      const nextAvailable = Object.assign(
        {},
        current.available as AvailableOfPlan<PlanValue>,
        {
          [sourceName]: {
            name: sourceName,
            mode: "required",
            baseName: sourceBaseName
          }
        }
      ) as AddAvailable<AvailableOfPlan<PlanValue>, SourceNameOf<CurrentTable>, "required">
      return makePlan({
        selection: current.selection,
        required: currentRequiredList(current.required).filter((name) =>
          !(name in nextAvailable)) as AddJoinRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, SourceNameOf<CurrentTable>, never, "cross">,
        available: nextAvailable,
        dialect: current.dialect as PlanDialectOf<PlanValue> | SourceDialectOf<CurrentTable>
      }, {
        ...currentAst,
        joins: [...currentAst.joins, {
          kind: "cross",
          tableName: sourceName,
          baseTableName: sourceBaseName,
          source: table
        }]
      }, currentQuery.assumptions, currentQuery.capabilities as MergeCapabilities<CapabilitiesOfPlan<PlanValue>, SourceCapabilitiesOf<CurrentTable>>, currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const join = <
    Kind extends QueryAst.JoinKind,
    CurrentTable extends SourceLike,
    Predicate extends PredicateInput
  >(
    kind: Kind,
    table: CurrentTable,
    on: Predicate
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & RequireSelectStatement<PlanValue> & (
        keyof AvailableOfPlan<PlanValue> extends never ? never : unknown
      ) & (
        SourceNameOf<CurrentTable> extends ScopedNamesOfPlan<PlanValue> ? never : unknown
      )
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddJoinRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, SourceNameOf<CurrentTable>, Predicate, Kind>,
      AvailableAfterJoin<AvailableOfPlan<PlanValue>, SourceNameOf<CurrentTable>, Kind>,
      PlanDialectOf<PlanValue> | SourceDialectOf<CurrentTable> | DialectOfDialectInput<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue> | SourceNameOf<CurrentTable>,
      AddJoinRequired<OutstandingOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, SourceNameOf<CurrentTable>, Predicate, Kind>,
      AssumptionsOfPlan<PlanValue>,
      MergeCapabilities<CapabilitiesOfPlan<PlanValue>, SourceCapabilitiesOf<CurrentTable>>,
      StatementOfPlan<PlanValue>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const onExpression = toDialectExpression(on)
      const sourceName = "kind" in table && (table.kind === "derived" || table.kind === "cte" || table.kind === "lateral")
        ? table.name
        : (table as TableLike)[Table.TypeId].name
      const sourceBaseName = "kind" in table && (table.kind === "derived" || table.kind === "cte" || table.kind === "lateral")
        ? table.baseName
        : (table as TableLike)[Table.TypeId].baseName
      const baseAvailable = (kind === "right" || kind === "full"
        ? Object.fromEntries(
          Object.entries(current.available as Record<string, Plan.Source>).map(([name, source]) => [name, {
            name: source.name,
            mode: "optional" as const,
            baseName: source.baseName
          }])
        )
        : current.available) as AvailableOfPlan<PlanValue>
      const nextAvailable = {
        ...baseAvailable,
        [sourceName]: {
          name: sourceName,
          mode: (kind === "left" || kind === "full" ? "optional" : "required") as JoinSourceMode<Kind>,
          baseName: sourceBaseName
        }
      } as AvailableAfterJoin<AvailableOfPlan<PlanValue>, SourceNameOf<CurrentTable>, Kind>
      return makePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...extractRequiredFromDialectInputRuntime(on)].filter((name, index, values) =>
          !(name in nextAvailable) && values.indexOf(name) === index) as AddJoinRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, SourceNameOf<CurrentTable>, Predicate, Kind>,
        available: nextAvailable,
        dialect: current.dialect as PlanDialectOf<PlanValue> | SourceDialectOf<CurrentTable> | DialectOfDialectInput<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
      }, {
        ...currentAst,
        joins: [...currentAst.joins, {
          kind,
          tableName: sourceName,
          baseTableName: sourceBaseName,
          source: table,
          on: onExpression
        }]
      }, currentQuery.assumptions, currentQuery.capabilities as MergeCapabilities<CapabilitiesOfPlan<PlanValue>, SourceCapabilitiesOf<CurrentTable>>, currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const orderBy = <Value extends ExpressionInput>(
    value: Value,
    direction: OrderDirection = "asc"
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & RequireSelectStatement<PlanValue>
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Value>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue> | DialectOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue>,
      AddExpressionRequired<OutstandingOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, Value>,
      AssumptionsOfPlan<PlanValue>,
      CapabilitiesOfPlan<PlanValue>,
      StatementOfPlan<PlanValue>
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
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const lock = (
    mode: "update" | "share",
    options: LockOptions = {}
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & RequireSelectStatement<PlanValue>
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      RequiredOfPlan<PlanValue>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue>,
      OutstandingOfPlan<PlanValue>,
      AssumptionsOfPlan<PlanValue>,
      MergeCapabilities<CapabilitiesOfPlan<PlanValue>, "transaction">,
      StatementOfPlan<PlanValue>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      return makePlan({
        selection: current.selection,
        required: current.required as RequiredOfPlan<PlanValue>,
        available: current.available,
        dialect: current.dialect as PlanDialectOf<PlanValue>
      }, {
        ...currentAst,
        lock: {
          kind: "lock",
          mode,
          nowait: options.nowait ?? false,
          skipLocked: options.skipLocked ?? false
        }
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const distinct = () =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & RequireSelectStatement<PlanValue>
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      RequiredOfPlan<PlanValue>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue>,
      OutstandingOfPlan<PlanValue>,
      AssumptionsOfPlan<PlanValue>,
      CapabilitiesOfPlan<PlanValue>,
      StatementOfPlan<PlanValue>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      return makePlan({
        selection: current.selection,
        required: current.required as RequiredOfPlan<PlanValue>,
        available: current.available,
        dialect: current.dialect as PlanDialectOf<PlanValue>
      }, {
        ...currentAst,
        distinct: true
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const limit = <Value extends NumericExpressionInput>(
    value: Value
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & RequireSelectStatement<PlanValue>
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, DialectAsNumericExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue> | DialectOfDialectNumericInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue>,
      AddExpressionRequired<OutstandingOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, DialectAsNumericExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      AssumptionsOfPlan<PlanValue>,
      CapabilitiesOfPlan<PlanValue>,
      StatementOfPlan<PlanValue>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const expression = toDialectNumericExpression(value)
      const required = extractRequiredFromDialectNumericInputRuntime(value)
      return makePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...required].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index) as AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, DialectAsNumericExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
        available: current.available,
        dialect: current.dialect as PlanDialectOf<PlanValue> | DialectOfDialectNumericInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
      }, {
        ...currentAst,
        limit: expression
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const offset = <Value extends NumericExpressionInput>(
    value: Value
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & RequireSelectStatement<PlanValue>
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, DialectAsNumericExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue> | DialectOfDialectNumericInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue>,
      AddExpressionRequired<OutstandingOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, DialectAsNumericExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      AssumptionsOfPlan<PlanValue>,
      CapabilitiesOfPlan<PlanValue>,
      StatementOfPlan<PlanValue>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const expression = toDialectNumericExpression(value)
      const required = extractRequiredFromDialectNumericInputRuntime(value)
      return makePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...required].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index) as AddExpressionRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, DialectAsNumericExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
        available: current.available,
        dialect: current.dialect as PlanDialectOf<PlanValue> | DialectOfDialectNumericInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
      }, {
        ...currentAst,
        offset: expression
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const groupBy = <Values extends readonly [GroupByInput, ...GroupByInput[]]>(
    ...values: Values
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & RequireSelectStatement<PlanValue>
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      Exclude<RequiredOfPlan<PlanValue> | RequiredFromDependencies<TupleDependencies<Values>>, AvailableNames<AvailableOfPlan<PlanValue>>>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue> | TupleDialect<Values>,
      GroupedOfPlan<PlanValue> | GroupedKeysFromValues<Values>,
      ScopedNamesOfPlan<PlanValue>,
      Exclude<OutstandingOfPlan<PlanValue> | RequiredFromDependencies<TupleDependencies<Values>>, AvailableNames<AvailableOfPlan<PlanValue>>>,
      AssumptionsOfPlan<PlanValue>,
      CapabilitiesOfPlan<PlanValue>,
      StatementOfPlan<PlanValue>
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
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const returning = <Selection extends SelectionShape>(
    selection: Selection
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & RequireMutationStatement<PlanValue>
    ): QueryPlan<
      Selection,
      Exclude<RequiredOfPlan<PlanValue> | ExtractRequired<Selection>, AvailableNames<AvailableOfPlan<PlanValue>>>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue> | ExtractDialect<Selection>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue>,
      Exclude<OutstandingOfPlan<PlanValue> | ExtractRequired<Selection>, AvailableNames<AvailableOfPlan<PlanValue>>>,
      AssumptionsOfPlan<PlanValue>,
      CapabilitiesOfPlan<PlanValue>,
      StatementOfPlan<PlanValue>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      return makePlan({
        selection,
        required: [...currentRequiredList(current.required), ...extractRequiredRuntime(selection)].filter((name, index, list) =>
          !(name in current.available) && list.indexOf(name) === index) as Exclude<RequiredOfPlan<PlanValue> | ExtractRequired<Selection>, AvailableNames<AvailableOfPlan<PlanValue>>>,
        available: current.available,
        dialect: current.dialect as PlanDialectOf<PlanValue> | ExtractDialect<Selection>
      }, {
        ...currentAst,
        select: selection
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const insert = <
    Target extends MutationTargetLike,
    Values extends MutationInputOf<Table.InsertOf<Target>>
  >(
    target: Target,
    values: Values
  ): QueryPlan<
    {},
    Exclude<MutationRequiredFromValues<Values>, SourceNameOf<Target>>,
    AddAvailable<{}, SourceNameOf<Target>>,
    TableDialectOf<Target>,
    never,
    SourceNameOf<Target>,
    Exclude<MutationRequiredFromValues<Values>, SourceNameOf<Target>>,
    TrueFormula,
    "write",
    "insert"
  > => {
    const { sourceName, sourceBaseName } = targetSourceDetails(target)
    const assignments = buildMutationAssignments(target, values)
    const required = assignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies))
    return makePlan({
      selection: {},
      required: required.filter((name, index, list) => name !== sourceName && list.indexOf(name) === index) as unknown as Exclude<MutationRequiredFromValues<Values>, SourceNameOf<Target>>,
      available: {
        [sourceName]: {
          name: sourceName,
          mode: "required",
          baseName: sourceBaseName
        }
      } as AddAvailable<{}, SourceNameOf<Target>>,
      dialect: target[Plan.TypeId].dialect as TableDialectOf<Target>
    }, {
      kind: "insert",
      select: {},
      into: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      values: assignments,
      conflict: undefined,
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "write", "insert")
  }

  const update = <
    Target extends MutationTargetLike,
    Values extends MutationInputOf<Table.UpdateOf<Target>>
  >(
    target: Target,
    values: Values
  ): QueryPlan<
    {},
    Exclude<MutationRequiredFromValues<Values>, SourceNameOf<Target>>,
    AddAvailable<{}, SourceNameOf<Target>>,
    TableDialectOf<Target>,
    never,
    SourceNameOf<Target>,
    Exclude<MutationRequiredFromValues<Values>, SourceNameOf<Target>>,
    TrueFormula,
    "write",
    "update"
  > => {
    const { sourceName, sourceBaseName } = targetSourceDetails(target)
    const assignments = buildMutationAssignments(target, values)
    const required = assignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies))
    return makePlan({
      selection: {},
      required: required.filter((name, index, list) => name !== sourceName && list.indexOf(name) === index) as unknown as Exclude<MutationRequiredFromValues<Values>, SourceNameOf<Target>>,
      available: {
        [sourceName]: {
          name: sourceName,
          mode: "required",
          baseName: sourceBaseName
        }
      } as AddAvailable<{}, SourceNameOf<Target>>,
      dialect: target[Plan.TypeId].dialect as TableDialectOf<Target>
      }, {
        kind: "update",
        select: {},
        target: {
          kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      set: assignments,
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
      }, undefined as unknown as TrueFormula, "write", "update")
  }

  const upsert = <
    Target extends MutationTargetLike,
    Values extends MutationInputOf<Table.InsertOf<Target>>,
    Columns extends DdlColumnInput,
    UpdateValues extends MutationInputOf<Table.UpdateOf<Target>>
  >(
    target: Target,
    values: Values,
    conflictColumns: ValidateTargetColumns<Target, NormalizeDdlColumns<Columns>>,
    updateValues?: UpdateValues
  ): QueryPlan<
    {},
    Exclude<MutationRequiredFromValues<Values> | MutationRequiredFromValues<UpdateValues>, SourceNameOf<Target>>,
    AddAvailable<{}, SourceNameOf<Target>>,
    TableDialectOf<Target>,
    never,
    SourceNameOf<Target>,
    Exclude<MutationRequiredFromValues<Values> | MutationRequiredFromValues<UpdateValues>, SourceNameOf<Target>>,
    TrueFormula,
    "write",
    "insert"
  > => {
    const { sourceName, sourceBaseName } = targetSourceDetails(target)
    const assignments = buildMutationAssignments(target, values)
    const updateAssignments = updateValues ? buildMutationAssignments(target, updateValues) : []
    const required = [
      ...assignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies)),
      ...updateAssignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies))
    ]
    return makePlan({
      selection: {},
      required: required.filter((name, index, list) => name !== sourceName && list.indexOf(name) === index) as unknown as Exclude<MutationRequiredFromValues<Values> | MutationRequiredFromValues<UpdateValues>, SourceNameOf<Target>>,
      available: {
        [sourceName]: {
          name: sourceName,
          mode: "required",
          baseName: sourceBaseName
        }
      } as AddAvailable<{}, SourceNameOf<Target>>,
      dialect: target[Plan.TypeId].dialect as TableDialectOf<Target>
    }, {
      kind: "insert",
      select: {},
      into: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      values: assignments,
      conflict: {
        kind: "conflict",
        columns: normalizeColumnList(conflictColumns as string | readonly string[]) as readonly [string, ...string[]],
        action: updateAssignments.length > 0 ? "doUpdate" : "doNothing",
        values: updateAssignments.length > 0 ? updateAssignments : undefined
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "write", "insert")
  }

  const delete_ = <
    Target extends MutationTargetLike
  >(
    target: Target
  ): QueryPlan<
    {},
    never,
    AddAvailable<{}, SourceNameOf<Target>>,
    TableDialectOf<Target>,
    never,
    SourceNameOf<Target>,
    never,
    TrueFormula,
    "write",
    "delete"
  > => {
    const { sourceName, sourceBaseName } = targetSourceDetails(target)
    return makePlan({
      selection: {},
      required: [] as never,
      available: {
        [sourceName]: {
          name: sourceName,
          mode: "required",
          baseName: sourceBaseName
        }
      } as AddAvailable<{}, SourceNameOf<Target>>,
      dialect: target[Plan.TypeId].dialect as TableDialectOf<Target>
    }, {
      kind: "delete",
      select: {},
      target: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "write", "delete")
  }

  const createTable = <
    Target extends SchemaTableLike
  >(
    target: Target,
    options: CreateTableOptions = {}
  ): QueryPlan<
    {},
    never,
    {},
    TableDialectOf<Target>,
    never,
    never,
    never,
    TrueFormula,
    "ddl",
    "createTable"
  > => {
    const { sourceName, sourceBaseName } = targetSourceDetails(target)
    return makePlan({
      selection: {},
      required: [] as never,
      available: {},
      dialect: target[Plan.TypeId].dialect as TableDialectOf<Target>
    }, {
      kind: "createTable",
      select: {},
      target: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      ddl: {
        kind: "createTable",
        ifNotExists: options.ifNotExists ?? false
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "ddl", "createTable")
  }

  const dropTable = <
    Target extends SchemaTableLike
  >(
    target: Target,
    options: DropTableOptions = {}
  ): QueryPlan<
    {},
    never,
    {},
    TableDialectOf<Target>,
    never,
    never,
    never,
    TrueFormula,
    "ddl",
    "dropTable"
  > => {
    const { sourceName, sourceBaseName } = targetSourceDetails(target)
    return makePlan({
      selection: {},
      required: [] as never,
      available: {},
      dialect: target[Plan.TypeId].dialect as TableDialectOf<Target>
    }, {
      kind: "dropTable",
      select: {},
      target: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      ddl: {
        kind: "dropTable",
        ifExists: options.ifExists ?? false
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "ddl", "dropTable")
  }

  const createIndex = <
    Target extends SchemaTableLike,
    Columns extends DdlColumnInput
  >(
    target: Target,
    columns: ValidateDdlColumns<Target, NormalizeDdlColumns<Columns>>,
    options: CreateIndexOptions = {}
  ): QueryPlan<
    {},
    never,
    {},
    TableDialectOf<Target>,
    never,
    never,
    never,
    TrueFormula,
    "ddl",
    "createIndex"
  > => {
    const normalizedColumns = normalizeColumnList(columns as string | readonly string[])
    const { sourceName, sourceBaseName } = targetSourceDetails(target)
    return makePlan({
      selection: {},
      required: [] as never,
      available: {},
      dialect: target[Plan.TypeId].dialect as TableDialectOf<Target>
    }, {
      kind: "createIndex",
      select: {},
      target: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      ddl: {
        kind: "createIndex",
        name: options.name ?? defaultIndexName(sourceBaseName, normalizedColumns, options.unique ?? false),
        columns: normalizedColumns,
        unique: options.unique ?? false,
        ifNotExists: options.ifNotExists ?? false
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "ddl", "createIndex")
  }

  const dropIndex = <
    Target extends SchemaTableLike,
    Columns extends DdlColumnInput
  >(
    target: Target,
    columns: ValidateDdlColumns<Target, NormalizeDdlColumns<Columns>>,
    options: DropIndexOptions = {}
  ): QueryPlan<
    {},
    never,
    {},
    TableDialectOf<Target>,
    never,
    never,
    never,
    TrueFormula,
    "ddl",
    "dropIndex"
  > => {
    const normalizedColumns = normalizeColumnList(columns as string | readonly string[])
    const { sourceName, sourceBaseName } = targetSourceDetails(target)
    return makePlan({
      selection: {},
      required: [] as never,
      available: {},
      dialect: target[Plan.TypeId].dialect as TableDialectOf<Target>
    }, {
      kind: "dropIndex",
      select: {},
      target: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      ddl: {
        kind: "dropIndex",
        name: options.name ?? defaultIndexName(sourceBaseName, normalizedColumns, false),
        ifExists: options.ifExists ?? false
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "ddl", "dropIndex")
  }

  const api = {
    literal,
    eq,
    neq,
    lt,
    lte,
    gt,
    gte,
    isNull,
    isNotNull,
    upper,
    lower,
    like,
    ilike,
    and,
    or,
    not,
    all: all_,
    any: any_,
    case: case_,
    match,
    coalesce,
    in: in_,
    notIn,
    between,
    concat,
    exists,
    over,
    rowNumber,
    rank,
    denseRank,
    count,
    max,
    min,
    isDistinctFrom,
    isNotDistinctFrom,
    as,
    with: with_,
    withRecursive: withRecursive_,
    lateral,
    returning,
    insert,
    update,
    upsert,
    delete: delete_,
    createTable,
    dropTable,
    createIndex,
    dropIndex,
    union,
    intersect,
    except,
    select,
    where,
    having,
    from,
    innerJoin,
    leftJoin,
    rightJoin,
    fullJoin,
    crossJoin,
    distinct,
    limit,
    offset,
    lock,
    orderBy,
    groupBy
  }

  return api
}
