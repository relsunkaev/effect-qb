import { pipeArguments } from "effect/Pipeable"
import * as Schema from "effect/Schema"

import { mysqlDatatypes } from "../mysql/datatypes/index.js"

import * as Expression from "./expression.js"
import * as Plan from "./plan.js"
import * as Table from "./table.js"
import type { CastTargetError, OperandCompatibilityError } from "./coercion-errors.js"
import type { RuntimeOfDbType } from "./coercion-analysis.js"
import type { CanCastDbType, CanCompareDbTypes, CanContainDbTypes, CanTextuallyCoerceDbType } from "./coercion-rules.js"
import {
  currentRequiredList,
  extractRequiredRuntime,
  extractSingleSelectedExpressionRuntime,
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
  type AddAvailableMany,
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
  type DerivedSelectionOf,
  type DerivedSource,
  type CompletePlan,
  type ExpressionInput,
  type ExtractDialect,
  type ExtractRequired,
  type GroupByInput,
  type GroupedOfPlan,
  type GroupedKeysFromValues,
  type HavingPredicateInput,
  type InsertSourceStateOfPlan,
  type JoinSourceMode,
  type LiteralValue,
  type MergeAggregation,
  type MergeNullabilityTuple,
  type NumericExpressionInput,
  type OrderDirection,
  type OutstandingOfPlan,
  type PlanDialectOf,
  type PresenceWitnessKeysOfSource,
  type PredicateInput,
  type QueryPlan,
  type OutputOfSelection,
  type ScalarOutputOfPlan,
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
  type MutationTargetOfPlan,
  type MergeCapabilities,
  type MutationTargetInput,
  type MutationValuesInput,
  type SourceOf,
  type SourceDialectOf,
  type SourceLike,
  type SourceNameOf,
  type AnyValuesInput,
  type ValuesSource,
  type ValuesInput,
  type AnyValuesSource,
  type AnyUnnestSource,
  type UnnestSource,
  type TableFunctionSource,
  type StringExpressionInput,
  type TableLike,
  type UpdateInputOfTarget,
  type MutationTargetNamesOf,
  type MutationTargetTuple,
  type TupleDependencies,
  type TupleDialect,
  type TupleSource,
  type ResultRow
} from "./query.js"
import * as ExpressionAst from "./expression-ast.js"
import { presenceWitnessesOfSourceLike } from "./implication-runtime.js"
import type { JsonNode } from "./json/ast.js"
import type { JsonPathUsageError } from "./json/errors.js"
import * as JsonPath from "./json/path.js"
import type {
  JsonConcatResult,
  JsonDeleteAtPath,
  JsonInsertAtPath,
  JsonKeysResult,
  JsonLengthResult,
  JsonLiteralInput,
  JsonStripNullsResult,
  JsonSetAtPath,
  JsonTextResult,
  JsonTypeName,
  JsonValueAtPath,
  NormalizeJsonLiteral
} from "./json/types.js"
import type { AssumeTrue } from "./predicate-analysis.js"
import type { FormulaOfPredicate } from "./predicate-normalize.js"
import type { TrueFormula } from "./predicate-formula.js"
import { assumeFormulaTrue, formulaOfExpression as formulaOfExpressionRuntime, trueFormula } from "./predicate-runtime.js"
import { dedupeGroupedExpressions } from "./grouping-key.js"
import { makeCteSource, makeDerivedSource, makeLateralSource } from "./derived-table.js"
import * as ProjectionAlias from "./projection-alias.js"
import * as QueryAst from "./query-ast.js"
import { normalizeColumnList } from "./table-options.js"

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
  NullDb extends Expression.DbType.Any,
  TypeWitnesses extends object = object
> {
  readonly dialect: Dialect
  readonly textDb: TextDb
  readonly numericDb: NumericDb
  readonly boolDb: BoolDb
  readonly timestampDb: TimestampDb
  readonly nullDb: NullDb
  readonly type: TypeWitnesses
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

type DialectLiteralRuntime<
  Value extends LiteralValue,
  TimestampDb extends Expression.DbType.Any
> = Value extends Date
  ? RuntimeOfDbType<TimestampDb>
  : Value

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
  DialectLiteralRuntime<Value, TimestampDb>,
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

/** Normalizes a generic string-capable input into the expression form used internally. */
type DialectAsStringExpression<
  Value extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = Value extends Expression.Any
  ? Value
  : Value extends string
    ? DialectLiteralExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    : never

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

/** Database type carried by a dialect-specialized scalar input. */
type DialectDbTypeOfInput<
  Value extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = Expression.DbTypeOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

type JoinPresenceFormula<
  Kind extends QueryAst.JoinKind,
  Predicate extends PredicateInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = Kind extends "inner" | "left"
  ? FormulaOfPredicate<DialectAsExpression<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
  : TrueFormula

type ComparableInput<
  Left extends ExpressionInput,
  Right extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any,
  Operator extends string
> = CanCompareDbTypes<
  DialectDbTypeOfInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  DialectDbTypeOfInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  Dialect
> extends true ? Right : OperandCompatibilityError<
    Operator,
    DialectDbTypeOfInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DialectDbTypeOfInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    Dialect,
    "the same db type family"
  >

type TextInput<
  Value extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any,
  Operator extends string
> = CanTextuallyCoerceDbType<
  DialectDbTypeOfInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  Dialect
> extends true ? Value : OperandCompatibilityError<
    Operator,
    DialectDbTypeOfInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DialectDbTypeOfInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    Dialect,
    "a text-compatible db type"
  >

type CastTarget<
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any
> = Expression.DbType.Any

type CastResult<
  Value extends ExpressionInput,
  Target extends Expression.DbType.Any,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = Expression.Expression<
  RuntimeOfDbType<Target>,
  Target,
  Expression.NullabilityOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
  Dialect,
  AggregationOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
  SourceOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  DependenciesOfDialectInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  Expression.SourceNullabilityOf<DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.CastNode<
    DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    Target
  >
}

type CastInput<
  Value extends ExpressionInput,
  Target extends Expression.DbType.Any,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = CanCastDbType<
    DialectDbTypeOfInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    Target,
    Dialect
  > extends true ? Target : CastTargetError<
    DialectDbTypeOfInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    Target,
    Dialect
  >

type ComparableGuard<
  Left extends ExpressionInput,
  Right extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any,
  Operator extends string
> = CanCompareDbTypes<
  DialectDbTypeOfInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  DialectDbTypeOfInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  Dialect
> extends true ? true : OperandCompatibilityError<
  Operator,
  DialectDbTypeOfInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  DialectDbTypeOfInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  Dialect,
  "the same db type family"
>

type TextGuard<
  Value extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any,
  Operator extends string
> = CanTextuallyCoerceDbType<
  DialectDbTypeOfInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  Dialect
> extends true ? true : OperandCompatibilityError<
  Operator,
  DialectDbTypeOfInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  DialectDbTypeOfInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  Dialect,
  "a text-compatible db type"
>

type CastGuard<
  Value extends ExpressionInput,
  Target extends Expression.DbType.Any,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = CanCastDbType<
  DialectDbTypeOfInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  Target,
  Dialect
> extends true ? true : CastTargetError<
  DialectDbTypeOfInput<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  Target,
  Dialect
>

type TextTupleGuard<
  Values extends readonly ExpressionInput[],
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any,
  Operator extends string
> = Values extends readonly [infer Head extends ExpressionInput, ...infer Tail extends readonly ExpressionInput[]]
  ? Tail extends readonly []
    ? TextGuard<Head, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator>
    : TextGuard<Head, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator> extends true
      ? TextTupleGuard<Tail, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator>
      : TextGuard<Head, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator>
  : true

type ComparableTupleGuard<
  Values extends readonly ExpressionInput[],
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any,
  Operator extends string
> = Values extends readonly [infer Head extends ExpressionInput, ...infer Tail extends readonly ExpressionInput[]]
  ? Tail extends readonly []
    ? true
    : ComparableGuard<Values[0], Head, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator> extends true
      ? ComparableTupleGuard<[Values[0], ...Tail], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator>
      : ComparableGuard<Values[0], Head, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator>
  : true

type ComparableArgs<
  Left extends ExpressionInput,
  Right extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any,
  Operator extends string
> = ComparableGuard<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator> extends true
  ? readonly [left: Left, right: Right]
  : readonly [ComparableGuard<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator>]

type ContainmentGuard<
  Left extends ExpressionInput,
  Right extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any,
  Operator extends string
> = CanContainDbTypes<
  DialectDbTypeOfInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  DialectDbTypeOfInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  Dialect
> extends true ? true : OperandCompatibilityError<
  Operator,
  DialectDbTypeOfInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  DialectDbTypeOfInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  Dialect,
  "the same container kind"
>

type ContainmentArgs<
  Left extends ExpressionInput,
  Right extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any,
  Operator extends string
> = ContainmentGuard<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator> extends true
  ? readonly [left: Left, right: Right]
  : readonly [ContainmentGuard<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator>]

type TextArgs<
  Left extends ExpressionInput,
  Right extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any,
  Operator extends string
> = TextGuard<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator> extends true
  ? TextGuard<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator> extends true
    ? readonly [left: Left, right: Right]
    : readonly [TextGuard<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator>]
  : readonly [TextGuard<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator>]

type MembershipArgs<
  Values extends readonly [ExpressionInput, ExpressionInput, ...ExpressionInput[]],
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any,
  Operator extends string
> = ComparableTupleGuard<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator> extends true
  ? Values
  : readonly [ComparableTupleGuard<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, Operator>]

type BetweenArgs<
  Value extends ExpressionInput,
  Lower extends ExpressionInput,
  Upper extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = ComparableGuard<
  Value,
  Lower,
  Dialect,
  TextDb,
  NumericDb,
  BoolDb,
  TimestampDb,
  NullDb,
  "between"
> extends true
  ? ComparableGuard<
      Value,
      Upper,
      Dialect,
      TextDb,
      NumericDb,
      BoolDb,
      TimestampDb,
      NullDb,
      "between"
    > extends true
      ? readonly [value: Value, lower: Lower, upper: Upper]
      : readonly [ComparableGuard<
          Value,
          Upper,
          Dialect,
          TextDb,
          NumericDb,
          BoolDb,
          TimestampDb,
          NullDb,
          "between"
        >]
  : readonly [ComparableGuard<
      Value,
      Lower,
      Dialect,
      TextDb,
      NumericDb,
      BoolDb,
      TimestampDb,
      NullDb,
      "between"
    >]

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
  Value extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = SourceOf<DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

/** Dialect carried by a dialect-specialized string input. */
type DialectOfDialectStringInput<
  Value extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = DialectOf<DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

/** Dependency map carried by a dialect-specialized string input. */
type DependenciesOfDialectStringInput<
  Value extends ExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = DependenciesOf<DialectAsStringExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>

/** Intrinsic nullability carried by a dialect-specialized string input. */
type NullabilityOfDialectStringInput<
  Value extends ExpressionInput,
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
  Values extends readonly ExpressionInput[],
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
type AvailableNames<Available extends Record<string, Plan.AnySource>> = Extract<keyof Available, string>

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

type PlanAssumptionsAfterHaving<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Predicate extends HavingPredicateInput,
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

type PlanAssumptionsAfterJoin<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Predicate extends PredicateInput,
  Kind extends QueryAst.JoinKind,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = Kind extends "inner"
  ? AssumeTrue<
      AssumptionsOfPlan<PlanValue>,
      DialectAsExpression<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    >
  : AssumptionsOfPlan<PlanValue>

type ScalarSubqueryInput<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  EngineDialect extends string
> = PlanValue & DialectCompatibleNestedPlan<PlanValue, EngineDialect> & (
  ScalarOutputOfPlan<PlanValue> extends never ? never : unknown
)

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

type AppendDialectExpressionTuple<
  Current extends readonly Expression.Any[],
  More extends readonly ExpressionInput[],
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = readonly [
  ...Current,
  ...DialectExpressionTuple<More, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
]

type VariadicBooleanExpression<
  Kind extends "and" | "or",
  Values extends readonly Expression.Any[],
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = AstBackedExpression<
  boolean,
  BoolDb,
  MergeNullabilityTuple<Values>,
  TupleDialect<Values>,
  MergeAggregationTuple<Values>,
  TupleSource<Values>,
  TupleDependencies<Values>,
  ExpressionAst.VariadicNode<Kind, Values>
> & {
  pipe<More extends readonly [ExpressionInput, ...ExpressionInput[]]>(
    ...values: More
  ): VariadicBooleanExpression<
    Kind,
    AppendDialectExpressionTuple<Values, More, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    Dialect,
    TextDb,
    NumericDb,
    BoolDb,
    TimestampDb,
    NullDb
  >
}

type JsonRuntime<Value> = NormalizeJsonLiteral<Value> extends never
  ? unknown
  : NormalizeJsonLiteral<Value>

type JsonDb<
  Dialect extends string,
  Kind extends string = "json"
> = Expression.DbType.Json<Dialect, Kind>

type JsonExpression<
  Runtime,
  Db extends Expression.DbType.Any,
  Nullability extends Expression.Nullability,
  Dialect extends string,
  Aggregation extends Expression.AggregationKind,
  Source,
  Dependencies extends Expression.SourceDependencies,
  Ast extends ExpressionAst.Any,
  SourceNullability extends Expression.SourceNullabilityMode = "propagate"
> = AstBackedExpression<
  Runtime,
  Db,
  Nullability,
  Dialect,
  Aggregation,
  Source,
  Dependencies,
  Ast,
  SourceNullability
>

type JsonExpressionLike<Runtime = unknown> = Expression.Expression<
  Runtime,
  Expression.DbType.Json<any, any>,
  Expression.Nullability,
  string,
  Expression.AggregationKind,
  any,
  Expression.SourceDependencies,
  Expression.SourceNullabilityMode
>

type JsonDbOfExpression<Value extends JsonExpressionLike<any>> = Expression.DbTypeOf<Value>

type JsonKindOfInput<
  Value,
  Fallback extends string = "json"
> = Value extends Expression.Any
  ? Expression.DbTypeOf<Value> extends Expression.DbType.Json<any, infer Kind> ? Kind : Fallback
  : Fallback

type JsonConcatKind<
  Left,
  Right,
  EngineDialect extends string
> = EngineDialect extends "postgres"
  ? "jsonb"
  : JsonKindOfInput<Left> extends "jsonb"
    ? "jsonb"
    : JsonKindOfInput<Right> extends "jsonb"
      ? "jsonb"
      : "json"

type JsonbKindForDialect<EngineDialect extends string> = EngineDialect extends "postgres" ? "jsonb" : "json"

type JsonValueInput = JsonLiteralInput | Expression.Any

type JsonPathInput = JsonPath.Path<any> | JsonPath.CanonicalSegment

type JsonQueryInput = JsonPath.Path<any> | StringExpressionInput

type JsonPathOutputOf<
  Root,
  Target extends JsonPathInput,
  Operation extends string
> = Target extends JsonPath.Path<any>
  ? JsonValueAtPath<Root, Target, Operation>
  : Target extends JsonPath.CanonicalSegment
    ? JsonValueAtPath<Root, JsonPath.Path<[Target]>, Operation>
    : never

type JsonDeleteOutputOf<
  Root,
  Target extends JsonPathInput,
  Operation extends string
> = Target extends JsonPath.Path<any>
  ? JsonDeleteAtPath<Root, Target, Operation>
  : Target extends JsonPath.CanonicalSegment
    ? JsonDeleteAtPath<Root, JsonPath.Path<[Target]>, Operation>
    : never

type JsonSetOutputOf<
  Root,
  Target extends JsonPathInput,
  Next,
  Operation extends string
> = Target extends JsonPath.Path<any>
  ? JsonSetAtPath<Root, Target, Next, Operation>
  : Target extends JsonPath.CanonicalSegment
    ? JsonSetAtPath<Root, JsonPath.Path<[Target]>, Next, Operation>
    : never

type JsonInsertOutputOf<
  Root,
  Target extends JsonPathInput,
  Next,
  InsertAfter extends boolean,
  Operation extends string
> = Target extends JsonPath.Path<any>
  ? JsonInsertAtPath<Root, Target, Next, InsertAfter, Operation>
  : Target extends JsonPath.CanonicalSegment
    ? JsonInsertAtPath<Root, JsonPath.Path<[Target]>, Next, InsertAfter, Operation>
    : never

type JsonPathGuard<
  Root,
  Target extends JsonPathInput,
  Operation extends string
> = JsonPathOutputOf<Root, Target, Operation> extends JsonPathUsageError<any, any, any, any>
  ? JsonPathOutputOf<Root, Target, Operation>
  : unknown

type JsonDeleteGuard<
  Root,
  Target extends JsonPathInput,
  Operation extends string
> = JsonDeleteOutputOf<Root, Target, Operation> extends JsonPathUsageError<any, any, any, any>
  ? JsonDeleteOutputOf<Root, Target, Operation>
  : unknown

type JsonSetGuard<
  Root,
  Target extends JsonPathInput,
  Next,
  Operation extends string
> = JsonSetOutputOf<Root, Target, Next, Operation> extends JsonPathUsageError<any, any, any, any>
  ? JsonSetOutputOf<Root, Target, Next, Operation>
  : unknown

type JsonInsertGuard<
  Root,
  Target extends JsonPathInput,
  Next,
  InsertAfter extends boolean,
  Operation extends string
> = JsonInsertOutputOf<Root, Target, Next, InsertAfter, Operation> extends JsonPathUsageError<any, any, any, any>
  ? JsonInsertOutputOf<Root, Target, Next, InsertAfter, Operation>
  : unknown

type JsonNullabilityOf<Output> =
  null extends Output
    ? Exclude<Output, null> extends never ? "always" : "maybe"
    : "never"

type JsonOutputOfInput<Value> = Value extends Expression.Any
  ? JsonRuntime<Expression.RuntimeOf<Value>>
  : JsonRuntime<Value>

type JsonObjectOutput<Shape extends Record<string, JsonValueInput>> = {
  readonly [K in keyof Shape]: JsonOutputOfInput<Shape[K]>
}

type JsonArrayOutput<Values extends readonly JsonValueInput[]> = {
  readonly [K in keyof Values]: JsonOutputOfInput<Values[K]>
} & readonly unknown[]

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
    compare: Compare & ComparableInput<Subject, Compare, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "match">,
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
    compare: Compare & ComparableInput<Subject, Compare, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "match">,
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
export const mysqlQuery = (() => {
type Dialect = "mysql"
type TextDb = Expression.DbType.MySqlText
type NumericDb = Expression.DbType.MySqlDouble
type BoolDb = Expression.DbType.MySqlBool
type TimestampDb = Expression.DbType.MySqlTimestamp
type NullDb = Expression.DbType.Base<"mysql", "null">
type TypeWitnesses = typeof mysqlDatatypes

const profile: QueryDialectProfile<Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, TypeWitnesses> = {
  dialect: "mysql",
  textDb: { dialect: "mysql", kind: "text" } as TextDb,
  numericDb: { dialect: "mysql", kind: "double" } as NumericDb,
  boolDb: { dialect: "mysql", kind: "boolean" } as BoolDb,
  timestampDb: { dialect: "mysql", kind: "timestamp" } as TimestampDb,
  nullDb: { dialect: "mysql", kind: "null" } as NullDb,
  type: mysqlDatatypes
}
  const ValuesInputProto = {
    pipe(this: unknown) {
      return pipeArguments(this, arguments)
    }
  }

  const literalSchemaOf = <Value extends LiteralValue>(
    value: Value
  ): Schema.Schema.Any | undefined => {
    if (value === null || value instanceof Date) {
      return undefined
    }
    return Schema.Literal(value) as unknown as Schema.Schema.Any
  }

  const literal = <const Value extends LiteralValue>(
    value: Value
  ): DialectLiteralExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> =>
    makeExpression({
      runtime: undefined as any,
      dbType: (
        value === null ? profile.nullDb :
          value instanceof Date ? profile.timestampDb :
            typeof value === "string" ? profile.textDb :
              typeof value === "number" ? profile.numericDb :
                profile.boolDb
      ) as DialectLiteralDbType<Value, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      runtimeSchema: literalSchemaOf(value),
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

  const column = <
    Name extends string,
    Db extends Expression.DbType.Any
  >(
    name: Name,
    dbType: Db,
    nullable = false
  ): Expression.Expression<
    Expression.RuntimeOfDbType<Db> | null,
    Db,
    Expression.Nullability,
    Dialect,
    "scalar",
    never,
    {},
    "resolved"
  > & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.ColumnNode<"", Name>
  } =>
    makeExpression({
      runtime: undefined as unknown as Expression.RuntimeOfDbType<Db> | (typeof nullable extends true ? null : never),
      dbType,
      nullability: (nullable ? "maybe" : "never") as typeof nullable extends true ? "maybe" : "never",
      dialect: profile.dialect as Dialect,
      aggregation: "scalar",
      source: undefined as never,
      sourceNullability: "resolved" as const,
      dependencies: {}
    }, {
      kind: "column",
      tableName: "",
      columnName: name
    }) as Expression.Expression<
      Expression.RuntimeOfDbType<Db> | null,
      Db,
      Expression.Nullability,
      Dialect,
      "scalar",
      never,
      {},
      "resolved"
    > & {
      readonly [ExpressionAst.TypeId]: ExpressionAst.ColumnNode<"", Name>
    }

  const toDialectExpression = <Value extends ExpressionInput>(
    value: Value
  ): DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> => {
    if (value !== null && typeof value === "object" && Expression.TypeId in value) {
      return value as DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    }
    return literal(value as Extract<Value, LiteralValue>) as unknown as DialectAsExpression<
      Value,
      Dialect,
      TextDb,
      NumericDb,
      BoolDb,
      TimestampDb,
      NullDb
    >
  }

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

  const flattenVariadicBooleanExpressions = <
    Kind extends "and" | "or",
    Values extends readonly Expression.Any[]
  >(
    kind: Kind,
    values: Values
  ): readonly Expression.Any[] => {
    const flattened: Array<Expression.Any> = []
    for (const value of values) {
      const ast = (value as unknown as { readonly [ExpressionAst.TypeId]: ExpressionAst.Any })[ExpressionAst.TypeId]
      if (ast.kind === kind) {
        flattened.push(...ast.values)
      } else {
        flattened.push(value)
      }
    }
    return flattened
  }

  const makeVariadicBooleanExpression = <
    Kind extends "and" | "or",
    Values extends readonly Expression.Any[]
  >(
    kind: Kind,
    values: Values
  ): VariadicBooleanExpression<Kind, Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> => {
    const expressions = flattenVariadicBooleanExpressions(kind, values) as Values
    const expression = makeExpression({
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: mergeNullabilityManyRuntime(expressions) as MergeNullabilityTuple<Values>,
      dialect: (expressions.find((value) => value[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect) as TupleDialect<Values>,
      aggregation: mergeAggregationManyRuntime(expressions) as MergeAggregationTuple<Values>,
      source: mergeManySources(expressions) as TupleSource<Values>,
      sourceNullability: "propagate" as const,
      dependencies: mergeManyDependencies(expressions) as TupleDependencies<Values>
    }, {
      kind,
      values: expressions
    }) as VariadicBooleanExpression<Kind, Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>

    Object.defineProperty(expression, "pipe", {
      configurable: true,
      writable: true,
      value(this: Expression.Any) {
        if (arguments.length === 0) {
          return this
        }
        const operations = Array.from(arguments)
        if (operations.every((operation) => typeof operation !== "function")) {
          const appended = operations.map((operation) => toDialectExpression(operation as ExpressionInput)) as readonly Expression.Any[]
          return makeVariadicBooleanExpression(kind, [...expressions, ...appended] as const)
        }
        if (operations.every((operation) => typeof operation === "function")) {
          return pipeArguments(this, arguments)
        }
        throw new TypeError(`Cannot mix query expressions and pipe functions inside ${kind}(...).pipe(...)`)
      }
    })

    return expression
  }

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
    MergeAggregation<
      AggregationOf<DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      AggregationOf<DialectAsExpression<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
    >,
    SourceOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | SourceOfDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependencyRecord<
      RequiredFromDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> |
      RequiredFromDialectInput<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    >,
    ExpressionAst.BinaryNode<
      Kind,
      DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      DialectAsExpression<Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
    >,
    SourceNullability
  >

  type SubqueryPredicateExpression<
    Dialect extends string,
    Aggregation extends Expression.AggregationKind,
    Source,
    Dependencies extends Expression.SourceDependencies,
    Ast extends ExpressionAst.Any
  > = AstBackedExpression<
    boolean,
    BoolDb,
    "maybe",
    Dialect,
    Aggregation,
    Source,
    Dependencies,
    Ast
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
  ): any => {
    const leftExpression = toDialectExpression(left)
    const rightExpression = toDialectExpression(right)
    return (makeExpression as any)({
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
    } as any, {
      kind,
      left: leftExpression,
      right: rightExpression
    }) as any
  }

  const buildVariadicPredicate = (
    values: readonly ExpressionInput[],
    kind: ExpressionAst.VariadicKind
  ): Expression.Any => {
    const expressions = values.map((value) => toDialectExpression(value as any)) as readonly Expression.Any[]
    return makeExpression({
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: "maybe",
      dialect: (expressions.find((value) => value[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect) as Dialect,
      aggregation: mergeAggregationManyRuntime(expressions) as Expression.AggregationKind,
      source: mergeManySources(expressions),
      sourceNullability: "propagate" as const,
      dependencies: mergeManyDependencies(expressions)
    }, {
      kind,
      values: expressions
    })
  }

  const eq = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    ...args: ComparableArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "eq">
  ): BinaryPredicateExpression<Left, Right, "eq"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "eq")
  }

  const neq = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    ...args: ComparableArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "neq">
  ): BinaryPredicateExpression<Left, Right, "neq"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "neq")
  }

  const lt = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    ...args: ComparableArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "lt">
  ): BinaryPredicateExpression<Left, Right, "lt"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "lt")
  }

  const lte = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    ...args: ComparableArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "lte">
  ): BinaryPredicateExpression<Left, Right, "lte"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "lte")
  }

  const gt = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    ...args: ComparableArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "gt">
  ): BinaryPredicateExpression<Left, Right, "gt"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "gt")
  }

  const gte = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    ...args: ComparableArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "gte">
  ): BinaryPredicateExpression<Left, Right, "gte"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "gte")
  }

  const like = <
    Left extends StringExpressionInput,
    Right extends StringExpressionInput
  >(
    ...args: TextArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "like">
  ): BinaryPredicateExpression<Left, Right, "like"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "like")
  }

  const ilike = <
    Left extends StringExpressionInput,
    Right extends StringExpressionInput
  >(
    ...args: TextArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "ilike">
  ): BinaryPredicateExpression<Left, Right, "ilike"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "ilike")
  }

  const regexMatch = <
    Left extends StringExpressionInput,
    Right extends StringExpressionInput
  >(
    ...args: TextArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "regexMatch">
  ): BinaryPredicateExpression<Left, Right, "regexMatch"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "regexMatch")
  }

  const regexIMatch = <
    Left extends StringExpressionInput,
    Right extends StringExpressionInput
  >(
    ...args: TextArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "regexIMatch">
  ): BinaryPredicateExpression<Left, Right, "regexIMatch"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "regexIMatch")
  }

  const regexNotMatch = <
    Left extends StringExpressionInput,
    Right extends StringExpressionInput
  >(
    ...args: TextArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "regexNotMatch">
  ): BinaryPredicateExpression<Left, Right, "regexNotMatch"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "regexNotMatch")
  }

  const regexNotIMatch = <
    Left extends StringExpressionInput,
    Right extends StringExpressionInput
  >(
    ...args: TextArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "regexNotIMatch">
  ): BinaryPredicateExpression<Left, Right, "regexNotIMatch"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "regexNotIMatch")
  }

  const isDistinctFrom = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    ...args: ComparableArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "isDistinctFrom">
  ): BinaryPredicateExpression<Left, Right, "isDistinctFrom", "never", "resolved"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "isDistinctFrom", "never", "resolved")
  }

  const isNotDistinctFrom = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    ...args: ComparableArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "isNotDistinctFrom">
  ): BinaryPredicateExpression<Left, Right, "isNotDistinctFrom", "never", "resolved"> => {
    const [left, right] = args as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "isNotDistinctFrom", "never", "resolved")
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

  const upper = <Value extends ExpressionInput>(
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
    const expression = toDialectStringExpression(value as any)
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

  const lower = <Value extends ExpressionInput>(
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
    const expression = toDialectStringExpression(value as any)
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

  const cast = <
    Value extends ExpressionInput,
    Target extends CastTarget<Dialect, TextDb, NumericDb, BoolDb, TimestampDb>
  >(
    value: Value,
    target: Target
  ): CastResult<
    Value,
    Target,
    Dialect,
    TextDb,
    NumericDb,
    BoolDb,
    TimestampDb,
    NullDb
  > => {
    const expression = toDialectExpression(value as any)
    return makeExpression({
      runtime: undefined as unknown as RuntimeOfDbType<Target>,
      dbType: target as Target,
      runtimeSchema: undefined,
      nullability: expression[Expression.TypeId].nullability,
      dialect: expression[Expression.TypeId].dialect,
      aggregation: expression[Expression.TypeId].aggregation,
      source: expression[Expression.TypeId].source,
      sourceNullability: expression[Expression.TypeId].sourceNullability,
      dependencies: expression[Expression.TypeId].dependencies
    }, {
      kind: "cast",
      value: expression,
      target: target as Target
    }) as CastResult<Value, Target, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
  }

  const array = <Element extends Expression.DbType.Any>(
    element: Element
  ): Expression.DbType.Array<Dialect, Element, `${Element["kind"]}[]`> => ({
    dialect: profile.dialect,
    kind: `${element.kind}[]`,
    element
  })

  const range = <Kind extends string, Subtype extends Expression.DbType.Any>(
    kind: Kind,
    subtype: Subtype
  ): Expression.DbType.Range<Dialect, Subtype, Kind> => ({
    dialect: profile.dialect,
    kind,
    subtype
  })

  const multirange = <Kind extends string, Subtype extends Expression.DbType.Any>(
    kind: Kind,
    subtype: Subtype
  ): Expression.DbType.Multirange<Dialect, Subtype, Kind> => ({
    dialect: profile.dialect,
    kind,
    subtype
  })

  const record = <Kind extends string, Fields extends Record<string, Expression.DbType.Any>>(
    kind: Kind,
    fields: Fields
  ): Expression.DbType.Composite<Dialect, Fields, Kind> => ({
    dialect: profile.dialect,
    kind,
    fields
  })

  const domain = <Kind extends string, Base extends Expression.DbType.Any>(
    kind: Kind,
    base: Base
  ): Expression.DbType.Domain<Dialect, Base, Kind> => ({
    dialect: profile.dialect,
    kind,
    base
  })

  const enum_ = <Kind extends string>(
    kind: Kind
  ): Expression.DbType.Enum<Dialect, Kind> => ({
    dialect: profile.dialect,
    kind,
    variant: "enum"
  })

  const set = <Kind extends string>(
    kind: Kind
  ): Expression.DbType.Set<Dialect, Kind> => ({
    dialect: profile.dialect,
    kind,
    variant: "set"
  })

  const custom = <Kind extends string>(
    kind: Kind
  ): Expression.DbType.Base<Dialect, Kind> => ({
    dialect: profile.dialect,
    kind
  })

  const type = {
    ...profile.type,
    array,
    range,
    multirange,
    record,
    domain,
    enum: enum_,
    set,
    custom
  }

  const makeJsonDb = <Kind extends string>(
    kind: Kind
  ): JsonDb<Dialect, Kind> => ({
    dialect: profile.dialect,
    kind,
    variant: (kind === "jsonb" ? "jsonb" : "json") as Kind extends "jsonb" ? "jsonb" : "json"
  })

  const jsonDb = makeJsonDb("json")
  const jsonbDb = makeJsonDb("json" as JsonbKindForDialect<Dialect>)

  const isExpressionValue = (value: unknown): value is Expression.Any =>
    value !== null && typeof value === "object" && Expression.TypeId in value

  const isJsonExpressionValue = (value: unknown): value is JsonExpressionLike<any> =>
    isExpressionValue(value) && (() => {
      const dbType = value[Expression.TypeId].dbType as { readonly variant?: string; readonly kind?: string }
      return dbType.variant === "json" || dbType.kind === "json" || dbType.kind === "jsonb"
    })()

  const isJsonPathValue = (value: unknown): value is JsonPath.Path<any> =>
    value !== null && typeof value === "object" && JsonPath.TypeId in value

  const normalizeJsonPathInput = (value: JsonPathInput): readonly JsonPath.CanonicalSegment[] =>
    isJsonPathValue(value) ? value.segments : [value]

  const isExactJsonSegmentValue = (segment: JsonPath.CanonicalSegment): boolean =>
    segment.kind === "key" || segment.kind === "index"

  const isExactJsonPathValue = (segments: readonly JsonPath.CanonicalSegment[]): boolean =>
    segments.every(isExactJsonSegmentValue)

  const buildJsonNodeExpression = <
    Runtime,
    Db extends Expression.DbType.Any,
    Nullability extends Expression.Nullability,
    Ast extends ExpressionAst.Any,
    SourceNullability extends Expression.SourceNullabilityMode = "propagate"
  >(
    expressions: readonly Expression.Any[],
    state: {
      readonly runtime: Runtime
      readonly dbType: Db
      readonly nullability: Nullability
      readonly sourceNullability?: SourceNullability
    },
    ast: Ast
  ): AstBackedExpression<
    Runtime,
    Db,
    Nullability,
    TupleDialect<typeof expressions>,
    MergeAggregationTuple<typeof expressions>,
    TupleSource<typeof expressions>,
    TupleDependencies<typeof expressions>,
    Ast,
    SourceNullability
  > => makeExpression({
    runtime: state.runtime,
    dbType: state.dbType,
    nullability: state.nullability,
    dialect: (expressions.find((expression) => expression[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect) as TupleDialect<typeof expressions>,
    aggregation: mergeAggregationManyRuntime(expressions) as MergeAggregationTuple<typeof expressions>,
    source: mergeManySources(expressions) as TupleSource<typeof expressions>,
    sourceNullability: (state.sourceNullability ?? "propagate") as SourceNullability,
    dependencies: mergeManyDependencies(expressions) as TupleDependencies<typeof expressions>
  }, ast) as AstBackedExpression<
    Runtime,
    Db,
    Nullability,
    TupleDialect<typeof expressions>,
    MergeAggregationTuple<typeof expressions>,
    TupleSource<typeof expressions>,
    TupleDependencies<typeof expressions>,
    Ast,
    SourceNullability
  >

  const jsonDbTypeOf = <Base extends JsonExpressionLike<any>>(
    base: Base
  ): JsonDbOfExpression<Base> => base[Expression.TypeId].dbType as JsonDbOfExpression<Base>

  const resolveJsonMergeDbType = (
    ...values: readonly Expression.Any[]
  ): Expression.DbType.Json<any, any> =>
    values.some((value) => value[Expression.TypeId].dbType.kind === "jsonb")
      ? jsonbDb
      : jsonDb

  const makeJsonLiteralExpression = <Value extends JsonLiteralInput>(
    value: Value,
    dbType: Expression.DbType.Json<any, any> = jsonDb
  ) => makeExpression({
    runtime: value as JsonRuntime<Value>,
    dbType,
    nullability: (value === null ? "always" : "never") as JsonNullabilityOf<Value>,
    dialect: profile.dialect as Dialect,
    aggregation: "scalar",
    source: undefined as never,
    sourceNullability: "resolved" as const,
    dependencies: {}
  }, {
    kind: "literal",
    value
  })

  const wrapJsonExpression = (
    value: Expression.Any,
    kind: "jsonToJson" | "jsonToJsonb",
    dbType: Expression.DbType.Json<any, any>
  ) => buildJsonNodeExpression(
    [value],
    {
      runtime: undefined as unknown as JsonRuntime<Expression.RuntimeOf<typeof value>>,
      dbType,
      nullability: value[Expression.TypeId].nullability as JsonNullabilityOf<JsonRuntime<Expression.RuntimeOf<typeof value>>>,
      sourceNullability: value[Expression.TypeId].sourceNullability
    },
    {
      kind,
      value
    }
  )

  const toJsonValueExpression = (
    value: JsonValueInput,
    kind: "jsonToJson" | "jsonToJsonb" = "jsonToJson",
    dbType: Expression.DbType.Json<any, any> = jsonDb
  ): Expression.Any => {
    if (isJsonExpressionValue(value)) {
      return value
    }
    if (isExpressionValue(value)) {
      return wrapJsonExpression(value, kind, dbType)
    }
    return makeJsonLiteralExpression(value as JsonLiteralInput, dbType)
  }

  const jsonQueryExpression = (query: StringExpressionInput): Expression.Any =>
    toDialectStringExpression(query as any)

  const jsonGet = <
    Base extends JsonExpressionLike<any>,
    Target extends JsonPathInput
  >(
    base: Base,
    target: Target & JsonPathGuard<Expression.RuntimeOf<Base>, Target, "json.get">
  ): JsonExpression<
    JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.get">,
    JsonDbOfExpression<Base>,
    JsonNullabilityOf<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.get">>,
    DialectOf<Base>,
    AggregationOf<Base>,
    SourceOf<Base>,
    DependenciesOf<Base>,
    JsonNode
  > => {
    const segments = normalizeJsonPathInput(target)
    const kind = isJsonPathValue(target)
      ? isExactJsonPathValue(segments) ? "jsonPath" : "jsonTraverse"
      : isExactJsonSegmentValue(target) ? "jsonGet" : "jsonAccess"
    return buildJsonNodeExpression(
      [base],
      {
        runtime: undefined as unknown as JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.get">,
        dbType: jsonDbTypeOf(base),
        nullability: undefined as unknown as JsonNullabilityOf<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.get">>
      },
      {
        kind,
        base,
        segments
      }
    ) as JsonExpression<
      JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.get">,
      JsonDbOfExpression<Base>,
      JsonNullabilityOf<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.get">>,
      DialectOf<Base>,
      AggregationOf<Base>,
      SourceOf<Base>,
      DependenciesOf<Base>,
      JsonNode
    >
  }

  const jsonText = <
    Base extends JsonExpressionLike<any>,
    Target extends JsonPathInput
  >(
    base: Base,
    target: Target & JsonPathGuard<Expression.RuntimeOf<Base>, Target, "json.text">
  ): JsonExpression<
    JsonTextResult<Exclude<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.text">, JsonPathUsageError<any, any, any, any> | null>> |
      (null extends JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.text"> ? null : never),
    TextDb,
    JsonNullabilityOf<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.text">>,
    DialectOf<Base>,
    AggregationOf<Base>,
    SourceOf<Base>,
    DependenciesOf<Base>,
    JsonNode
  > => {
    const segments = normalizeJsonPathInput(target)
    const kind = isJsonPathValue(target)
      ? isExactJsonPathValue(segments) ? "jsonPathText" : "jsonTraverseText"
      : isExactJsonSegmentValue(target) ? "jsonGetText" : "jsonAccessText"
    return buildJsonNodeExpression(
      [base],
      {
        runtime: undefined as unknown as JsonTextResult<Exclude<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.text">, JsonPathUsageError<any, any, any, any> | null>> |
          (null extends JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.text"> ? null : never),
        dbType: profile.textDb as TextDb,
        nullability: undefined as unknown as JsonNullabilityOf<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.text">>
      },
      {
        kind,
        base,
        segments
      }
    ) as JsonExpression<
      JsonTextResult<Exclude<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.text">, JsonPathUsageError<any, any, any, any> | null>> |
        (null extends JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.text"> ? null : never),
      TextDb,
      JsonNullabilityOf<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.text">>,
      DialectOf<Base>,
      AggregationOf<Base>,
      SourceOf<Base>,
      DependenciesOf<Base>,
      JsonNode
    >
  }

  const jsonAccess = <
    Base extends JsonExpressionLike<any>,
    Target extends JsonPathInput
  >(
    base: Base,
    target: Target & JsonPathGuard<Expression.RuntimeOf<Base>, Target, "json.access">
  ) => {
    const segments = normalizeJsonPathInput(target)
    return buildJsonNodeExpression(
      [base],
      {
        runtime: undefined as unknown as JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.access">,
        dbType: jsonDbTypeOf(base),
        nullability: undefined as unknown as JsonNullabilityOf<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.access">>
      },
      {
        kind: isJsonPathValue(target) || segments.length > 1 ? "jsonTraverse" : "jsonAccess",
        base,
        segments
      }
    )
  }

  const jsonTraverse = <
    Base extends JsonExpressionLike<any>,
    Target extends JsonPathInput
  >(
    base: Base,
    target: Target & JsonPathGuard<Expression.RuntimeOf<Base>, Target, "json.traverse">
  ) => {
    const segments = normalizeJsonPathInput(target)
    return buildJsonNodeExpression(
      [base],
      {
        runtime: undefined as unknown as JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.traverse">,
        dbType: jsonDbTypeOf(base),
        nullability: undefined as unknown as JsonNullabilityOf<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.traverse">>
      },
      {
        kind: "jsonTraverse",
        base,
        segments
      }
    )
  }

  const jsonAccessText = <
    Base extends JsonExpressionLike<any>,
    Target extends JsonPathInput
  >(
    base: Base,
    target: Target & JsonPathGuard<Expression.RuntimeOf<Base>, Target, "json.accessText">
  ) => {
    const segments = normalizeJsonPathInput(target)
    return buildJsonNodeExpression(
      [base],
      {
        runtime: undefined as unknown as JsonTextResult<Exclude<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.accessText">, JsonPathUsageError<any, any, any, any> | null>> |
          (null extends JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.accessText"> ? null : never),
        dbType: profile.textDb as TextDb,
        nullability: undefined as unknown as JsonNullabilityOf<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.accessText">>
      },
      {
        kind: isJsonPathValue(target) || segments.length > 1 ? "jsonTraverseText" : "jsonAccessText",
        base,
        segments
      }
    )
  }

  const jsonTraverseText = <
    Base extends JsonExpressionLike<any>,
    Target extends JsonPathInput
  >(
    base: Base,
    target: Target & JsonPathGuard<Expression.RuntimeOf<Base>, Target, "json.traverseText">
  ) => {
    const segments = normalizeJsonPathInput(target)
    return buildJsonNodeExpression(
      [base],
      {
        runtime: undefined as unknown as JsonTextResult<Exclude<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.traverseText">, JsonPathUsageError<any, any, any, any> | null>> |
          (null extends JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.traverseText"> ? null : never),
        dbType: profile.textDb as TextDb,
        nullability: undefined as unknown as JsonNullabilityOf<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.traverseText">>
      },
      {
        kind: "jsonTraverseText",
        base,
        segments
      }
    )
  }

  const jsonContains = <
    Left extends JsonExpressionLike<any>,
    Right extends JsonValueInput
  >(
    left: Left,
    right: Right
  ) => buildBinaryPredicate(left, toJsonValueExpression(right), "contains")

  const jsonContainedBy = <
    Left extends JsonExpressionLike<any>,
    Right extends JsonValueInput
  >(
    left: Left,
    right: Right
  ) => buildBinaryPredicate(left, toJsonValueExpression(right), "containedBy")

  const jsonHasKey = <
    Base extends JsonExpressionLike<any>,
    Key extends string
  >(
    base: Base,
    key: Key
  ) => buildJsonNodeExpression(
    [base],
    {
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: "never" as const,
      sourceNullability: "resolved" as const
    },
    {
      kind: "jsonHasKey",
      base,
      keys: [key]
    }
  )

  const jsonHasAnyKeys = <
    Base extends JsonExpressionLike<any>,
    Keys extends readonly [string, ...string[]]
  >(
    base: Base,
    ...keys: Keys
  ) => buildJsonNodeExpression(
    [base],
    {
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: "never" as const,
      sourceNullability: "resolved" as const
    },
    {
      kind: "jsonHasAnyKeys",
      base,
      keys
    }
  )

  const jsonHasAllKeys = <
    Base extends JsonExpressionLike<any>,
    Keys extends readonly [string, ...string[]]
  >(
    base: Base,
    ...keys: Keys
  ) => buildJsonNodeExpression(
    [base],
    {
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: "never" as const,
      sourceNullability: "resolved" as const
    },
    {
      kind: "jsonHasAllKeys",
      base,
      keys
    }
  )

  const jsonDelete = <
    Base extends JsonExpressionLike<any>,
    Target extends JsonPathInput
  >(
    base: Base,
    target: Target & JsonDeleteGuard<Expression.RuntimeOf<Base>, Target, "json.delete">
  ): JsonExpression<
    JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.delete">,
    JsonDbOfExpression<Base>,
    JsonNullabilityOf<JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.delete">>,
    DialectOf<Base>,
    AggregationOf<Base>,
    SourceOf<Base>,
    DependenciesOf<Base>,
    JsonNode
  > => {
    const segments = normalizeJsonPathInput(target)
    return buildJsonNodeExpression(
      [base],
      {
        runtime: undefined as unknown as JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.delete">,
        dbType: jsonDbTypeOf(base),
        nullability: undefined as unknown as JsonNullabilityOf<JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.delete">>
      },
      {
        kind: isJsonPathValue(target) ? "jsonDeletePath" : "jsonDelete",
        base,
        segments
      }
    ) as JsonExpression<
      JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.delete">,
      JsonDbOfExpression<Base>,
      JsonNullabilityOf<JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.delete">>,
      DialectOf<Base>,
      AggregationOf<Base>,
      SourceOf<Base>,
      DependenciesOf<Base>,
      JsonNode
    >
  }

  const jsonRemove = <
    Base extends JsonExpressionLike<any>,
    Target extends JsonPathInput
  >(
    base: Base,
    target: Target & JsonDeleteGuard<Expression.RuntimeOf<Base>, Target, "json.remove">
  ): JsonExpression<
    JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.remove">,
    JsonDbOfExpression<Base>,
    JsonNullabilityOf<JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.remove">>,
    DialectOf<Base>,
    AggregationOf<Base>,
    SourceOf<Base>,
    DependenciesOf<Base>,
    JsonNode
  > => {
    const segments = normalizeJsonPathInput(target)
    return buildJsonNodeExpression(
      [base],
      {
        runtime: undefined as unknown as JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.remove">,
        dbType: jsonDbTypeOf(base),
        nullability: undefined as unknown as JsonNullabilityOf<JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.remove">>
      },
      {
        kind: "jsonRemove",
        base,
        segments
      }
    ) as JsonExpression<
      JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.remove">,
      JsonDbOfExpression<Base>,
      JsonNullabilityOf<JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.remove">>,
      DialectOf<Base>,
      AggregationOf<Base>,
      SourceOf<Base>,
      DependenciesOf<Base>,
      JsonNode
    >
  }

  const jsonSet = <
    Base extends JsonExpressionLike<any>,
    Target extends JsonPathInput,
    Next extends JsonValueInput
  >(
    base: Base,
    target: Target & JsonSetGuard<Expression.RuntimeOf<Base>, Target, Next, "json.set">,
    next: Next,
    options: {
      readonly createMissing?: boolean
    } = {}
  ): JsonExpression<
    JsonSetOutputOf<Expression.RuntimeOf<Base>, Target, Next, "json.set">,
    JsonDbOfExpression<Base>,
    JsonNullabilityOf<JsonSetOutputOf<Expression.RuntimeOf<Base>, Target, Next, "json.set">>,
    DialectOf<Base>,
    AggregationOf<Base>,
    SourceOf<Base>,
    DependenciesOf<Base>,
    JsonNode
  > => {
    const segments = normalizeJsonPathInput(target)
    const newValue = toJsonValueExpression(next)
    return buildJsonNodeExpression(
      [base, newValue],
      {
        runtime: undefined as unknown as JsonSetOutputOf<Expression.RuntimeOf<Base>, Target, Next, "json.set">,
        dbType: jsonDbTypeOf(base),
        nullability: undefined as unknown as JsonNullabilityOf<JsonSetOutputOf<Expression.RuntimeOf<Base>, Target, Next, "json.set">>
      },
      {
        kind: "jsonSet",
        base,
        segments,
        newValue,
        createMissing: options.createMissing ?? true
      }
    ) as JsonExpression<
      JsonSetOutputOf<Expression.RuntimeOf<Base>, Target, Next, "json.set">,
      JsonDbOfExpression<Base>,
      JsonNullabilityOf<JsonSetOutputOf<Expression.RuntimeOf<Base>, Target, Next, "json.set">>,
      DialectOf<Base>,
      AggregationOf<Base>,
      SourceOf<Base>,
      DependenciesOf<Base>,
      JsonNode
    >
  }

  const jsonInsert = <
    Base extends JsonExpressionLike<any>,
    Target extends JsonPathInput,
    Next extends JsonValueInput,
    InsertAfter extends boolean = false
  >(
    base: Base,
    target: Target & JsonInsertGuard<Expression.RuntimeOf<Base>, Target, Next, InsertAfter, "json.insert">,
    next: Next,
    options: {
      readonly insertAfter?: InsertAfter
    } = {}
  ): JsonExpression<
    JsonInsertOutputOf<Expression.RuntimeOf<Base>, Target, Next, InsertAfter, "json.insert">,
    JsonDbOfExpression<Base>,
    JsonNullabilityOf<JsonInsertOutputOf<Expression.RuntimeOf<Base>, Target, Next, InsertAfter, "json.insert">>,
    DialectOf<Base>,
    AggregationOf<Base>,
    SourceOf<Base>,
    DependenciesOf<Base>,
    JsonNode
  > => {
    const segments = normalizeJsonPathInput(target)
    const insert = toJsonValueExpression(next)
    const insertAfter = options.insertAfter ?? false
    return buildJsonNodeExpression(
      [base, insert],
      {
        runtime: undefined as unknown as JsonInsertOutputOf<Expression.RuntimeOf<Base>, Target, Next, InsertAfter, "json.insert">,
        dbType: jsonDbTypeOf(base),
        nullability: undefined as unknown as JsonNullabilityOf<JsonInsertOutputOf<Expression.RuntimeOf<Base>, Target, Next, InsertAfter, "json.insert">>
      },
      {
        kind: "jsonInsert",
        base,
        segments,
        insert,
        insertAfter
      }
    ) as JsonExpression<
      JsonInsertOutputOf<Expression.RuntimeOf<Base>, Target, Next, InsertAfter, "json.insert">,
      JsonDbOfExpression<Base>,
      JsonNullabilityOf<JsonInsertOutputOf<Expression.RuntimeOf<Base>, Target, Next, InsertAfter, "json.insert">>,
      DialectOf<Base>,
      AggregationOf<Base>,
      SourceOf<Base>,
      DependenciesOf<Base>,
      JsonNode
    >
  }

  const jsonConcatAs = <
    Db extends Expression.DbType.Json<any, any>
  >(
    dbType: Db
  ) => <
    Left extends JsonValueInput,
    Right extends JsonValueInput
  >(
    left: Left,
    right: Right
  ): JsonExpression<
    JsonConcatResult<JsonOutputOfInput<Left>, JsonOutputOfInput<Right>>,
    Db,
    "maybe",
    Dialect,
    Expression.AggregationKind,
    never,
    {},
    JsonNode
  > => {
    const leftExpression = toJsonValueExpression(left)
    const rightExpression = toJsonValueExpression(right)
    return buildJsonNodeExpression(
      [leftExpression, rightExpression],
      {
        runtime: undefined as unknown as JsonConcatResult<JsonOutputOfInput<Left>, JsonOutputOfInput<Right>>,
        dbType,
        nullability: "maybe" as const
      },
      {
        kind: "jsonConcat",
        left: leftExpression,
        right: rightExpression
      }
    ) as JsonExpression<
      JsonConcatResult<JsonOutputOfInput<Left>, JsonOutputOfInput<Right>>,
      Db,
      "maybe",
      Dialect,
      Expression.AggregationKind,
      never,
      {},
      JsonNode
    >
  }

  const jsonMergeAs = <
    Db extends Expression.DbType.Json<any, any>
  >(
    dbType: Db
  ) => <
    Left extends JsonValueInput,
    Right extends JsonValueInput
  >(
    left: Left,
    right: Right
  ) => {
    const leftExpression = toJsonValueExpression(left)
    const rightExpression = toJsonValueExpression(right)
    return buildJsonNodeExpression(
      [leftExpression, rightExpression],
      {
        runtime: undefined as unknown as JsonConcatResult<JsonOutputOfInput<Left>, JsonOutputOfInput<Right>>,
        dbType,
        nullability: "maybe" as const
      },
      {
        kind: "jsonMerge",
        left: leftExpression,
        right: rightExpression
      }
    )
  }

  const jsonConcat = jsonConcatAs(resolveJsonMergeDbType())
  const jsonMerge = jsonMergeAs(resolveJsonMergeDbType())

  const jsonKeyExists = <
    Base extends JsonExpressionLike<any>,
    Key extends string
  >(
    base: Base,
    key: Key
  ) => buildJsonNodeExpression(
    [base],
    {
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: "never" as const,
      sourceNullability: "resolved" as const
    },
    {
      kind: "jsonKeyExists",
      base,
      keys: [key]
    }
  )

  const jsonBuildObjectAs = <
    Db extends Expression.DbType.Json<any, any>
  >(
    dbType: Db
  ) => <
    Shape extends Record<string, JsonValueInput>
  >(
    shape: Shape
  ) => {
    const entries = Object.entries(shape).map(([key, value]) => ({
      key,
      value: toJsonValueExpression(value)
    }))
    return buildJsonNodeExpression(
      entries.map((entry) => entry.value),
      {
        runtime: {} as JsonObjectOutput<Shape>,
        dbType,
        nullability: "never" as const,
        sourceNullability: "resolved" as const
      },
      {
        kind: "jsonBuildObject",
        entries
      }
    )
  }

  const jsonBuildArrayAs = <
    Db extends Expression.DbType.Json<any, any>
  >(
    dbType: Db
  ) => <
    Values extends readonly JsonValueInput[]
  >(
    ...values: Values
  ) => {
    const expressions = values.map((value) => toJsonValueExpression(value))
    return buildJsonNodeExpression(
      expressions,
      {
        runtime: [] as JsonArrayOutput<Values>,
        dbType,
        nullability: "never" as const,
        sourceNullability: "resolved" as const
      },
      {
        kind: "jsonBuildArray",
        values: expressions
      }
    )
  }

  const jsonBuildObject = jsonBuildObjectAs(jsonDb)
  const jsonBuildArray = jsonBuildArrayAs(jsonDb)
  const jsonbBuildObject = jsonBuildObjectAs(jsonbDb)
  const jsonbBuildArray = jsonBuildArrayAs(jsonbDb)

  const jsonToJson = <Value extends JsonValueInput>(
    value: Value
  ) => toJsonValueExpression(value, "jsonToJson", jsonDb) as JsonExpression<
    JsonOutputOfInput<Value>,
    JsonDb<Dialect>,
    JsonNullabilityOf<JsonOutputOfInput<Value>>,
    string,
    Expression.AggregationKind,
    unknown,
    Expression.SourceDependencies,
    JsonNode
  >

  const jsonToJsonb = <Value extends JsonValueInput>(
    value: Value
  ) => toJsonValueExpression(value, "jsonToJsonb", jsonbDb) as JsonExpression<
    JsonOutputOfInput<Value>,
    JsonDb<Dialect, JsonbKindForDialect<Dialect>>,
    JsonNullabilityOf<JsonOutputOfInput<Value>>,
    string,
    Expression.AggregationKind,
    unknown,
    Expression.SourceDependencies,
    JsonNode
  >

  const jsonTypeOf = <Base extends JsonExpressionLike<any>>(
    base: Base
  ) => buildJsonNodeExpression(
    [base],
    {
      runtime: undefined as unknown as JsonTypeName<Expression.RuntimeOf<Base>>,
      dbType: profile.textDb as TextDb,
      nullability: base[Expression.TypeId].nullability
    },
    {
      kind: "jsonTypeOf",
      value: base
    }
  )

  const jsonLength = <Base extends JsonExpressionLike<any>>(
    base: Base
  ) => buildJsonNodeExpression(
    [base],
    {
      runtime: undefined as unknown as JsonLengthResult<Expression.RuntimeOf<Base>>,
      dbType: profile.numericDb as NumericDb,
      nullability: undefined as unknown as JsonNullabilityOf<JsonLengthResult<Expression.RuntimeOf<Base>>>
    },
    {
      kind: "jsonLength",
      value: base
    }
  )

  const jsonKeys = <Base extends JsonExpressionLike<any>>(
    base: Base
  ) => buildJsonNodeExpression(
    [base],
    {
      runtime: undefined as unknown as JsonKeysResult<Expression.RuntimeOf<Base>>,
      dbType: jsonDb,
      nullability: undefined as unknown as JsonNullabilityOf<JsonKeysResult<Expression.RuntimeOf<Base>>>
    },
    {
      kind: "jsonKeys",
      value: base
    }
  )

  const jsonPathExists = <Base extends JsonExpressionLike<any>>(
    base: Base,
    query: JsonQueryInput
  ) => {
    if (isJsonPathValue(query)) {
      return buildJsonNodeExpression(
        [base],
        {
          runtime: true as boolean,
          dbType: profile.boolDb as BoolDb,
          nullability: "never" as const,
          sourceNullability: "resolved" as const
        },
        {
          kind: "jsonPathExists",
          base,
          query
        }
      )
    }
    const queryExpression = jsonQueryExpression(query as StringExpressionInput)
    return buildJsonNodeExpression(
      [base, queryExpression] as const,
      {
        runtime: true as boolean,
        dbType: profile.boolDb as BoolDb,
        nullability: "never" as const,
        sourceNullability: "resolved" as const
      },
      {
        kind: "jsonPathExists",
        base,
        query: queryExpression
      }
    )
  }

  const jsonStripNulls = <Base extends JsonExpressionLike<any>>(
    base: Base
  ) => buildJsonNodeExpression(
    [base],
    {
      runtime: undefined as unknown as JsonStripNullsResult<Expression.RuntimeOf<Base>>,
      dbType: jsonDbTypeOf(base),
      nullability: undefined as unknown as JsonNullabilityOf<JsonStripNullsResult<Expression.RuntimeOf<Base>>>
    },
    {
      kind: "jsonStripNulls",
      value: base
    }
  )

  const jsonPathMatch = <Base extends JsonExpressionLike<any>>(
    base: Base,
    query: JsonQueryInput
  ) => {
    if (isJsonPathValue(query)) {
      return buildJsonNodeExpression(
        [base],
        {
          runtime: true as boolean,
          dbType: profile.boolDb as BoolDb,
          nullability: "never" as const,
          sourceNullability: "resolved" as const
        },
        {
          kind: "jsonPathMatch",
          base,
          query
        }
      )
    }
    const queryExpression = jsonQueryExpression(query as StringExpressionInput)
    return buildJsonNodeExpression(
      [base, queryExpression] as const,
      {
        runtime: true as boolean,
        dbType: profile.boolDb as BoolDb,
        nullability: "never" as const,
        sourceNullability: "resolved" as const
      },
      {
        kind: "jsonPathMatch",
        base,
        query: queryExpression
      }
    )
  }

  const json = {
    key: JsonPath.key,
    index: JsonPath.index,
    wildcard: JsonPath.wildcard,
    slice: JsonPath.slice,
    descend: JsonPath.descend,
    path: JsonPath.path,
    get: jsonGet,
    access: jsonAccess,
    traverse: jsonTraverse,
    text: jsonText,
    accessText: jsonAccessText,
    traverseText: jsonTraverseText,
    contains: jsonContains,
    containedBy: jsonContainedBy,
    hasKey: jsonHasKey,
    keyExists: jsonKeyExists,
    hasAnyKeys: jsonHasAnyKeys,
    hasAllKeys: jsonHasAllKeys,
    delete: jsonDelete,
    remove: jsonRemove,
    set: jsonSet,
    insert: jsonInsert,
    concat: jsonConcat,
    merge: jsonMerge,
    buildObject: jsonBuildObject,
    buildArray: jsonBuildArray,
    toJson: jsonToJson,
    toJsonb: jsonToJsonb,
    typeOf: jsonTypeOf,
    length: jsonLength,
    keys: jsonKeys,
    stripNulls: jsonStripNulls,
    pathExists: jsonPathExists,
    pathMatch: jsonPathMatch
  }

  const jsonb = {
    key: JsonPath.key,
    index: JsonPath.index,
    wildcard: JsonPath.wildcard,
    slice: JsonPath.slice,
    descend: JsonPath.descend,
    path: JsonPath.path,
    get: jsonGet,
    access: jsonAccess,
    traverse: jsonTraverse,
    text: jsonText,
    accessText: jsonAccessText,
    traverseText: jsonTraverseText,
    contains: jsonContains,
    containedBy: jsonContainedBy,
    hasKey: jsonHasKey,
    keyExists: jsonKeyExists,
    hasAnyKeys: jsonHasAnyKeys,
    hasAllKeys: jsonHasAllKeys,
    delete: jsonDelete,
    remove: jsonRemove,
    set: jsonSet,
    insert: jsonInsert,
    concat: jsonConcatAs(jsonbDb),
    merge: jsonMergeAs(jsonbDb),
    buildObject: jsonbBuildObject,
    buildArray: jsonbBuildArray,
    toJsonb: jsonToJsonb,
    typeOf: jsonTypeOf,
    length: jsonLength,
    keys: jsonKeys,
    stripNulls: jsonStripNulls,
    pathExists: jsonPathExists,
    pathMatch: jsonPathMatch
  }

  const and = <
    Values extends readonly [ExpressionInput, ...ExpressionInput[]]
  >(
    ...values: Values
  ): VariadicBooleanExpression<
    "and",
    { readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[],
    Dialect,
    TextDb,
    NumericDb,
    BoolDb,
    TimestampDb,
    NullDb
  > =>
    makeVariadicBooleanExpression(
      "and",
      values.map((value) => toDialectExpression(value)) as { readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]
    )

  const or = <
    Values extends readonly [ExpressionInput, ...ExpressionInput[]]
  >(
    ...values: Values
  ): VariadicBooleanExpression<
    "or",
    { readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[],
    Dialect,
    TextDb,
    NumericDb,
    BoolDb,
    TimestampDb,
    NullDb
  > =>
    makeVariadicBooleanExpression(
      "or",
      values.map((value) => toDialectExpression(value)) as { readonly [K in keyof Values]: DialectAsExpression<Values[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> } & readonly Expression.Any[]
    )

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
    Head extends ExpressionInput,
    Tail extends readonly [ExpressionInput, ...ExpressionInput[]]
  >(
    head: Head,
    ...tail: {
      readonly [K in keyof Tail]: Tail[K] & ComparableInput<
        Head,
        Tail[K],
        Dialect,
        TextDb,
        NumericDb,
        BoolDb,
        TimestampDb,
        NullDb,
        "in"
      >
    }
  ): VariadicPredicateExpression<[Head, ...Tail], "in"> =>
    buildVariadicPredicate([head, ...tail] as any, "in") as VariadicPredicateExpression<[Head, ...Tail], "in">

  const notIn = <
    Head extends ExpressionInput,
    Tail extends readonly [ExpressionInput, ...ExpressionInput[]]
  >(
    head: Head,
    ...tail: {
      readonly [K in keyof Tail]: Tail[K] & ComparableInput<
        Head,
        Tail[K],
        Dialect,
        TextDb,
        NumericDb,
        BoolDb,
        TimestampDb,
        NullDb,
        "notIn"
      >
    }
  ): VariadicPredicateExpression<[Head, ...Tail], "notIn"> =>
    buildVariadicPredicate([head, ...tail] as any, "notIn") as VariadicPredicateExpression<[Head, ...Tail], "notIn">

  const between = <
    Value extends ExpressionInput,
    Lower extends ExpressionInput,
    Upper extends ExpressionInput
  >(
    ...values: BetweenArgs<Value, Lower, Upper, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
  ): VariadicPredicateExpression<[Value, Lower, Upper], "between"> =>
    buildVariadicPredicate(values as any, "between") as VariadicPredicateExpression<[Value, Lower, Upper], "between">

  const contains = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    ...args: ContainmentArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "contains">
  ): BinaryPredicateExpression<Left, Right, "contains"> => {
    const [left, right] = args as unknown as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "contains")
  }

  const containedBy = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    ...args: ContainmentArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "containedBy">
  ): BinaryPredicateExpression<Left, Right, "containedBy"> => {
    const [left, right] = args as unknown as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "containedBy")
  }

  const overlaps = <
    Left extends ExpressionInput,
    Right extends ExpressionInput
  >(
    ...args: ContainmentArgs<Left, Right, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb, "overlaps">
  ): BinaryPredicateExpression<Left, Right, "overlaps"> => {
    const [left, right] = args as unknown as [Left, Right]
    return buildBinaryPredicate(left as ExpressionInput, right as ExpressionInput, "overlaps")
  }

  const concat = <
    Values extends readonly [ExpressionInput, ExpressionInput, ...ExpressionInput[]]
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
    const expressions = values.map((value) => toDialectStringExpression(value as any)) as readonly Expression.Any[]
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
    }) as AstBackedExpression<
      string,
      TextDb,
      MergeNullabilityTuple<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      TupleDialect<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      MergeAggregationTuple<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      TupleSource<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      TupleDependencies<DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      ExpressionAst.VariadicNode<"concat", DialectStringExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>
    >
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

  const scalar = <
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
  >(
    plan: ScalarSubqueryInput<PlanValue, Dialect>
  ): AstBackedExpression<
    Expression.RuntimeOf<ScalarOutputOfPlan<PlanValue>> | null,
    Expression.DbTypeOf<ScalarOutputOfPlan<PlanValue>>,
    "maybe",
    Dialect,
    "scalar",
    never,
    DependencyRecord<OutstandingOfPlan<PlanValue>>,
    ExpressionAst.ScalarSubqueryNode<PlanValue>,
    "resolved"
  > => {
    const dependencies = Object.fromEntries(
      currentRequiredList(plan[Plan.TypeId].required).map((name) => [name, true] as const)
    ) as DependencyRecord<OutstandingOfPlan<PlanValue>>
    const expression = extractSingleSelectedExpressionRuntime(plan[Plan.TypeId].selection as SelectionShape)
    return makeExpression({
      runtime: undefined as Expression.RuntimeOf<ScalarOutputOfPlan<PlanValue>> | null,
      dbType: expression[Expression.TypeId].dbType as Expression.DbTypeOf<ScalarOutputOfPlan<PlanValue>>,
      nullability: "maybe",
      dialect: profile.dialect as Dialect,
      aggregation: "scalar",
      source: undefined as never,
      sourceNullability: "resolved" as const,
      dependencies
    }, {
      kind: "scalarSubquery",
      plan
    })
  }

  const inSubquery = <
    Left extends ExpressionInput,
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
  >(
    left: Left,
    plan: ScalarSubqueryInput<PlanValue, Dialect> & (
      ComparableInput<
        Left,
        ScalarOutputOfPlan<PlanValue>,
        Dialect,
        TextDb,
        NumericDb,
        BoolDb,
        TimestampDb,
        NullDb,
        "in"
      > extends ExpressionInput ? unknown : ComparableInput<
        Left,
        ScalarOutputOfPlan<PlanValue>,
        Dialect,
        TextDb,
        NumericDb,
        BoolDb,
        TimestampDb,
        NullDb,
        "in"
      >
    )
  ): SubqueryPredicateExpression<
    Dialect,
    AggregationOf<DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
    SourceOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    DependencyRecord<RequiredFromDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | OutstandingOfPlan<PlanValue>>,
    ExpressionAst.InSubqueryNode<
      DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      PlanValue
    >
  > => {
    const leftExpression = toDialectExpression(left)
    const dependencies = Object.fromEntries(
      currentRequiredList(plan[Plan.TypeId].required).map((name) => [name, true] as const)
    ) as DependencyRecord<OutstandingOfPlan<PlanValue>>
    return makeExpression({
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: "maybe",
      dialect: (leftExpression[Expression.TypeId].dialect ?? profile.dialect) as Dialect,
      aggregation: leftExpression[Expression.TypeId].aggregation as AggregationOf<DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      source: leftExpression[Expression.TypeId].source as SourceOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      sourceNullability: "propagate" as const,
      dependencies: mergeDependencies(leftExpression[Expression.TypeId].dependencies, dependencies) as DependencyRecord<
        RequiredFromDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | OutstandingOfPlan<PlanValue>
      >
    }, {
      kind: "inSubquery",
      left: leftExpression,
      plan
    })
  }

  const quantifiedComparison = <
    Left extends ExpressionInput,
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    Operator extends QuantifiedComparisonOperator,
    Quantifier extends "any" | "all"
  >(
    left: Left,
    plan: ScalarSubqueryInput<PlanValue, Dialect>,
    operator: Operator,
    quantifier: Quantifier
  ): Expression.Any => {
    const leftExpression = toDialectExpression(left)
    const dependencies = Object.fromEntries(
      currentRequiredList(plan[Plan.TypeId].required).map((name) => [name, true] as const)
    ) as DependencyRecord<OutstandingOfPlan<PlanValue>>
    return makeExpression({
      runtime: true as boolean,
      dbType: profile.boolDb as BoolDb,
      nullability: "maybe",
      dialect: (leftExpression[Expression.TypeId].dialect ?? profile.dialect) as Dialect,
      aggregation: leftExpression[Expression.TypeId].aggregation as AggregationOf<DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      source: leftExpression[Expression.TypeId].source as SourceOfDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      sourceNullability: "propagate" as const,
      dependencies: mergeDependencies(leftExpression[Expression.TypeId].dependencies, dependencies) as DependencyRecord<
        RequiredFromDialectInput<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> | OutstandingOfPlan<PlanValue>
      >
    }, renderQuantifiedComparisonAst(leftExpression, plan, operator, quantifier) as ExpressionAst.QuantifiedComparisonNode<
      Quantifier extends "any" ? "comparisonAny" : "comparisonAll",
      Operator,
      DialectAsExpression<Left, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      PlanValue
    >) as Expression.Any
  }

  const compareAny = <
    Left extends ExpressionInput,
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    Operator extends QuantifiedComparisonOperator
  >(
    left: Left,
    plan: ScalarSubqueryInput<PlanValue, Dialect>,
    operator: Operator
  ): Expression.Any => quantifiedComparison(left, plan, operator, "any") as Expression.Any

  const compareAll = <
    Left extends ExpressionInput,
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    Operator extends QuantifiedComparisonOperator
  >(
    left: Left,
    plan: ScalarSubqueryInput<PlanValue, Dialect>,
    operator: Operator
  ): Expression.Any => quantifiedComparison(left, plan, operator, "all") as Expression.Any

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
    const expressions = values.map((value) => toDialectExpression(value)) as readonly Expression.Any[]
    const representative = expressions.find((value) =>
      value[Expression.TypeId].nullability !== "always") ?? expressions[0]!
    return (makeExpression as any)({
      runtime: undefined as any,
      dbType: representative[Expression.TypeId].dbType as any,
      nullability: resolveCoalesceNullabilityRuntime(expressions) as any,
      dialect: (expressions.find((value) => value[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect) as any,
      aggregation: mergeAggregationManyRuntime(expressions) as any,
      source: mergeManySources(expressions) as any,
      sourceNullability: "resolved" as const,
      dependencies: mergeManyDependencies(expressions) as any
    }, {
      kind: "coalesce",
      values: expressions
    }) as AstBackedExpression<
      CoalesceRuntimeTuple<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      Expression.DbTypeOf<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>[number]>,
      CoalesceNullabilityTuple<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      TupleDialect<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      MergeAggregationTuple<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      TupleSource<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      TupleDependencies<DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      ExpressionAst.VariadicNode<"coalesce", DialectExpressionTuple<Values, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>>,
      "resolved"
    >
  }

  const call = <
    Name extends string,
    Args extends readonly ExpressionInput[]
  >(
    name: Name,
    ...args: Args
  ): Expression.Any => {
    const expressions = args.map((value) => toDialectExpression(value)) as readonly Expression.Any[]
    return makeExpression({
      runtime: undefined as never,
      dbType: profile.textDb,
      nullability: "maybe",
      dialect: (expressions.find((value) => value[Expression.TypeId].dialect !== undefined)?.[Expression.TypeId].dialect ?? profile.dialect) as Dialect,
      aggregation: mergeAggregationManyRuntime(expressions),
      source: mergeManySources(expressions),
      sourceNullability: "resolved" as const,
      dependencies: mergeManyDependencies(expressions)
    }, {
      kind: "function",
      name,
      args: expressions
    }) as Expression.Any
  }

  const uuidGenerateV4 = (): Expression.Expression<
    string,
    Expression.DbType.PgUuid,
    "never",
    Dialect,
    "scalar",
    never,
    {},
    "resolved"
  > & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.FunctionCallNode<"uuid_generate_v4", readonly []>
  } => makeExpression({
    runtime: undefined as unknown as string,
    dbType: { dialect: "postgres", kind: "uuid" } as Expression.DbType.PgUuid,
    nullability: "never",
    dialect: profile.dialect as Dialect,
    aggregation: "scalar",
    source: undefined as never,
    sourceNullability: "resolved" as const,
    dependencies: {}
  }, {
    kind: "function",
    name: "uuid_generate_v4",
    args: []
  })

  const nextVal = <Value extends ExpressionInput>(
    value: Value
  ): Expression.Expression<
    Expression.RuntimeOfDbType<Expression.DbType.PgInt8>,
    Expression.DbType.PgInt8,
    "never",
    Dialect,
    "scalar",
    never,
    {},
    "resolved"
  > & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.FunctionCallNode<"nextval", readonly [Expression.Any]>
  } => makeExpression({
    runtime: undefined as unknown as Expression.RuntimeOfDbType<Expression.DbType.PgInt8>,
    dbType: { dialect: "postgres", kind: "int8" } as Expression.DbType.PgInt8,
    nullability: "never",
    dialect: profile.dialect as Dialect,
    aggregation: "scalar",
    source: undefined as never,
    sourceNullability: "resolved" as const,
    dependencies: {}
  }, {
    kind: "function",
    name: "nextval",
    args: [toDialectExpression(value as any)]
  })

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
    } as any
  }

  const match = <Value extends ExpressionInput>(
    value: Value
  ): MatchStarter<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> => {
    const subject = toDialectExpression(value)
    const build = (
      branches: readonly RuntimeCaseBranch[]
    ): {
      when(compare: ExpressionInput, result: ExpressionInput): unknown
      else: (fallback: ExpressionInput) => Expression.Any
    } => ({
      when(compare, result) {
        return build([
          ...branches,
          {
            when: buildBinaryPredicate(subject as ExpressionInput, compare as ExpressionInput, "eq"),
            then: toDialectExpression(result)
          }
        ])
      },
      else(fallback) {
        return finalizeCase(branches, toDialectExpression(fallback))
      }
    })

    return {
      when<Then extends ExpressionInput>(
        compare: ExpressionInput,
        result: Then
      ) {
        const predicate = buildBinaryPredicate(subject as ExpressionInput, compare as ExpressionInput, "eq")
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
    } as any
  }

  const excluded = <
    Value extends Expression.Expression<
      any,
      Expression.DbType.Any,
      Expression.Nullability,
      string,
      "scalar",
      any,
      Expression.SourceDependencies,
      Expression.SourceNullabilityMode
    >
  >(
    value: Value
  ): AstBackedExpression<
    Expression.RuntimeOf<Value>,
    Expression.DbTypeOf<Value>,
    Expression.NullabilityOf<Value>,
    Dialect,
    "scalar",
    never,
    {},
    ExpressionAst.ExcludedNode<AstOf<Value> extends ExpressionAst.ColumnNode<any, infer ColumnName extends string> ? ColumnName : string>,
    "resolved"
  > => {
    const ast = ((value as unknown) as Expression.Any & { readonly [ExpressionAst.TypeId]: ExpressionAst.Any })[ExpressionAst.TypeId]
    if (ast.kind !== "column") {
      throw new Error("excluded(...) only accepts bound table columns")
    }
    return makeExpression({
      runtime: undefined as Expression.RuntimeOf<Value>,
      dbType: value[Expression.TypeId].dbType as Expression.DbTypeOf<Value>,
      runtimeSchema: value[Expression.TypeId].runtimeSchema,
      nullability: value[Expression.TypeId].nullability as Expression.NullabilityOf<Value>,
      dialect: profile.dialect as Dialect,
      aggregation: "scalar",
      source: undefined as never,
      sourceNullability: "resolved" as const,
      dependencies: {}
    }, {
      kind: "excluded",
      columnName: ast.columnName
    }) as unknown as AstBackedExpression<
      Expression.RuntimeOf<Value>,
      Expression.DbTypeOf<Value>,
      Expression.NullabilityOf<Value>,
      Dialect,
      "scalar",
      never,
      {},
      ExpressionAst.ExcludedNode<AstOf<Value> extends ExpressionAst.ColumnNode<any, infer ColumnName extends string> ? ColumnName : string>,
      "resolved"
    >
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

  type QuantifiedComparisonOperator = "eq" | "neq" | "lt" | "lte" | "gt" | "gte"

  const renderQuantifiedComparisonAst = (
    left: Expression.Any,
    plan: QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    operator: QuantifiedComparisonOperator,
    quantifier: "any" | "all"
  ): ExpressionAst.QuantifiedComparisonNode<
    "comparisonAny" | "comparisonAll",
    QuantifiedComparisonOperator,
    Expression.Any,
    QueryPlan<any, any, any, any, any, any, any, any, any, any>
  > => ({
    kind: quantifier === "any" ? "comparisonAny" : "comparisonAll",
    operator,
    left,
    plan
  })

  const renderComparisonOperator = (operator: QuantifiedComparisonOperator): "=" | "<>" | "<" | "<=" | ">" | ">=" =>
    operator === "eq"
      ? "="
      : operator === "neq"
        ? "<>"
        : operator === "lt"
          ? "<"
          : operator === "lte"
            ? "<="
            : operator === "gt"
              ? ">"
              : ">="

  const targetSourceDetails = (table: MutationTargetLike | SchemaTableLike) => {
    const sourceName = (table as unknown as TableLike)[Table.TypeId].name
    const sourceBaseName = (table as unknown as TableLike)[Table.TypeId].baseName
    return {
      sourceName,
      sourceBaseName
    }
  }

  const sourceDetails = (source: SourceLike) => {
    if (Table.TypeId in (source as object)) {
      return targetSourceDetails(source as MutationTargetLike | SchemaTableLike)
    }
    const record = source as { readonly name: string; readonly baseName: string }
    return {
      sourceName: record.name,
      sourceBaseName: record.baseName
    }
  }

  const makeColumnReferenceSelection = <Alias extends string, Selection extends Record<string, Expression.Any>>(
    alias: Alias,
    selection: Selection
  ): DerivedSelectionOf<Selection, Alias> => {
    const columns: Record<string, unknown> = {}
    for (const [columnName, expression] of Object.entries(selection)) {
      const state = expression[Expression.TypeId]
      columns[columnName] = makeExpression({
        runtime: undefined as never,
        dbType: state.dbType,
        runtimeSchema: state.runtimeSchema,
        nullability: state.nullability,
        dialect: state.dialect,
        aggregation: "scalar",
        source: {
          tableName: alias,
          columnName,
          baseTableName: alias
        },
        sourceNullability: "propagate" as const,
        dependencies: {
          [alias]: true
        } as Record<Alias, true>
      }, {
        kind: "column",
        tableName: alias,
        columnName
      } as ExpressionAst.ColumnNode<Alias, string>)
    }
    return columns as DerivedSelectionOf<Selection, Alias>
  }

  const makeAliasedValuesSource = <
    Rows extends ValuesRowsInput,
    Alias extends string
  >(
    rows: readonly [Record<string, Expression.Any>, ...Record<string, Expression.Any>[]],
    selection: ValuesOutputShape<Rows[0], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    alias: Alias
  ): ValuesSource<
    Rows,
    ValuesOutputShape<Rows[0], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    Alias,
    Dialect
  > => {
    const columns = makeColumnReferenceSelection(alias, selection as Record<string, Expression.Any>) as unknown as ValuesOutputShape<
      Rows[0],
      Dialect,
      TextDb,
      NumericDb,
      BoolDb,
      TimestampDb,
      NullDb
    >
    const source = {
      kind: "values",
      name: alias,
      baseName: alias,
      dialect: profile.dialect,
      rows,
      columns
    }
    return Object.assign(source, columns) as unknown as ValuesSource<
      Rows,
      ValuesOutputShape<Rows[0], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      Alias,
      Dialect
    >
  }

  const normalizeValuesRow = (row: ValuesRowInput): Record<string, Expression.Any> =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, toDialectExpression(value)])
    ) as Record<string, Expression.Any>

  const normalizeUnnestColumns = (columns: UnnestColumnsInput): Record<string, readonly Expression.Any[]> =>
    Object.fromEntries(
      Object.entries(columns).map(([key, values]) => [key, values.map((value) => toDialectExpression(value))])
    ) as Record<string, readonly Expression.Any[]>

  const normalizeMutationTargets = (
    target: MutationTargetInput
  ): readonly MutationTargetLike[] =>
    Array.isArray(target)
      ? target as readonly MutationTargetLike[]
      : [target as MutationTargetLike]

  const mutationTargetClauses = (
    target: MutationTargetInput
  ): readonly QueryAst.FromClause[] =>
    normalizeMutationTargets(target).map((table) => {
      const { sourceName, sourceBaseName } = targetSourceDetails(table)
      return {
        kind: "from" as const,
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: table
      }
    })

  const mutationAvailableSources = <
    Target extends MutationTargetInput,
    Mode extends Plan.SourceMode = "required"
  >(
    target: Target,
    mode: Mode = "required" as Mode
  ) => Object.fromEntries(
    normalizeMutationTargets(target).map((table) => {
      const { sourceName, sourceBaseName } = targetSourceDetails(table)
      return [
        sourceName,
        {
          name: sourceName,
          mode,
          baseName: sourceBaseName
        }
      ] as const
    })
  ) as unknown as AddAvailableMany<{}, MutationTargetNamesOf<Target>, Mode>

  const buildMutationAssignments = <Target extends MutationTargetInput, Values>(
    target: Target,
    values: Values
  ): readonly QueryAst.AssignmentClause[] => {
    const targets = normalizeMutationTargets(target)
    if (targets.length === 1 && !Array.isArray(target)) {
      const columns = target as unknown as Record<string, Expression.Any>
      return Object.entries(values as Record<string, unknown>).map(([columnName, value]) => ({
        columnName,
        value: toMutationValueExpression(value, columns[columnName]!)
      }))
    }
    const valueMap = values as Record<string, Record<string, unknown> | undefined>
    return targets.flatMap((table) => {
      const targetName = (table as unknown as TableLike)[Table.TypeId].name
      const scopedValues = valueMap[targetName] ?? {}
      const columns = table as unknown as Record<string, Expression.Any>
      return Object.entries(scopedValues).map(([columnName, value]) => ({
        tableName: targetName,
        columnName,
        value: toMutationValueExpression(value, columns[columnName]!)
      }))
    })
  }

  const buildInsertValuesRows = <Target extends MutationTargetLike>(
    target: Target,
    rows: readonly [InsertRowInput<Target>, ...InsertRowInput<Target>[]]
  ): {
    readonly columns: readonly [string, ...string[]]
    readonly rows: readonly [QueryAst.InsertValuesRowClause, ...QueryAst.InsertValuesRowClause[]]
    readonly required: readonly string[]
  } => {
    const firstRow = rows[0]
    const firstColumns = Object.keys(firstRow)
    if (firstColumns.length === 0) {
      throw new Error("values(...) rows must specify at least one column; use insert(target) for default-only inserts instead")
    }
    const columns = firstColumns as [string, ...string[]]
    const normalizedRows = rows.map((row) => {
      const rowKeys = Object.keys(row)
      if (rowKeys.length !== columns.length || columns.some((column) => !(column in row))) {
        throw new Error("All values(...) rows must project the same columns in the same shape")
      }
      const assignments = buildMutationAssignments(target, row) as readonly QueryAst.AssignmentClause[]
      return {
        values: columns.map((columnName) => assignments.find((assignment) => assignment.columnName === columnName)!)
      } satisfies QueryAst.InsertValuesRowClause
    }) as unknown as [QueryAst.InsertValuesRowClause, ...QueryAst.InsertValuesRowClause[]]
    const required = normalizedRows.flatMap((row) =>
      row.values.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies))
    )
    return {
      columns,
      rows: normalizedRows,
      required: required.filter((name, index, list) => list.indexOf(name) === index)
    }
  }

  const normalizeInsertSelectColumns = (
    selection: Record<string, Expression.Any>
  ): readonly [string, ...string[]] => {
    const columns = Object.keys(selection)
    if (columns.length === 0) {
      throw new Error("insert(...).pipe(from(subquery)) requires at least one projected column")
    }
    return columns as [string, ...string[]]
  }

  const normalizeInsertUnnestValues = <Target extends MutationTargetLike>(
    target: Target,
    values: { readonly [K in keyof Table.InsertOf<Target>]?: readonly Table.InsertOf<Target>[K][] }
  ): {
    readonly columns: readonly [string, ...string[]]
    readonly values: readonly {
      readonly columnName: string
      readonly values: readonly unknown[]
    }[]
  } => {
    const entries = Object.entries(values)
    if (entries.length === 0) {
      throw new Error("unnest(...) requires at least one column array")
    }
    const columns = entries.map(([columnName]) => columnName) as [string, ...string[]]
    const normalized = entries.map(([columnName, items]) => {
      if (!Array.isArray(items)) {
        throw new Error("unnest(...) expects every value to be an array")
      }
      return {
        columnName,
        values: items
      }
    })
    const expectedLength = normalized[0]!.values.length
    if (normalized.some((entry) => entry.values.length !== expectedLength)) {
      throw new Error("unnest(...) expects every column array to have the same length")
    }
    const knownColumns = new Set(Object.keys(target[Table.TypeId].fields))
    if (columns.some((columnName) => !knownColumns.has(columnName))) {
      throw new Error("unnest(...) received a column that does not exist on the target table")
    }
    return {
      columns,
      values: normalized
    }
  }

  const buildConflictTarget = <Target extends MutationTargetLike>(
    target: Target,
    input: readonly string[] | { readonly columns: readonly string[]; readonly where?: PredicateInput } | { readonly constraint: string }
  ): QueryAst.ConflictTargetClause => {
    if (Array.isArray(input)) {
      return {
        kind: "columns",
        columns: normalizeColumnList(input) as readonly [string, ...string[]]
      }
    }
    if (!Array.isArray(input) && "constraint" in input) {
      return {
        kind: "constraint",
        name: input.constraint
      }
    }
    const columnTarget = input as {
      readonly columns: readonly string[]
      readonly where?: PredicateInput
    }
    return {
      kind: "columns",
      columns: normalizeColumnList(columnTarget.columns) as readonly [string, ...string[]],
      where: columnTarget.where === undefined ? undefined : toDialectExpression(columnTarget.where)
    }
  }

  const defaultIndexName = (
    tableName: string,
    columns: readonly string[],
    unique: boolean
  ): string => `${tableName}_${columns.join("_")}_${unique ? "uniq" : "idx"}`

type MutationStatement = "insert" | "update" | "delete"

type DdlStatement = "createTable" | "createIndex" | "dropIndex" | "dropTable"
type TransactionStatement = "transaction" | "commit" | "rollback" | "savepoint" | "rollbackTo" | "releaseSavepoint"

type DdlColumnInput = string | readonly string[]

type NormalizeDdlColumns<Columns extends DdlColumnInput> =
  Columns extends readonly [infer Head extends string, ...infer Tail extends string[]]
    ? readonly [Head, ...Tail]
    : Columns extends [infer Head extends string, ...infer Tail extends string[]]
      ? readonly [Head, ...Tail]
    : Columns extends readonly string[]
      ? Columns[number] extends never
        ? never
        : readonly [Columns[number], ...Columns[number][]]
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

type TruncateOptions = {
  readonly restartIdentity?: boolean
  readonly cascade?: boolean
}

type TransactionOptions = {
  readonly isolationLevel?: "read committed" | "repeatable read" | "serializable"
  readonly readOnly?: boolean
}

type LockOptions = {
  readonly nowait?: boolean
  readonly skipLocked?: boolean
}

type UpsertConflictOptions = {
  readonly update?: Record<string, unknown>
}

type RequiredKeys<Shape> = Extract<{
  [K in keyof Shape]-?: {} extends Pick<Shape, K> ? never : K
}[keyof Shape], string>

type InsertRowInput<Target extends MutationTargetLike> = MutationInputOf<Table.InsertOf<Target>>

type ValuesRowInput = Record<string, ExpressionInput>
type ValuesRowsInput = readonly [ValuesRowInput, ...ValuesRowInput[]]

type UnnestColumnsInput = Record<string, readonly [ExpressionInput, ...ExpressionInput[]]>

type UnnestRowShape<Shape extends Record<string, readonly unknown[]>> = {
  readonly [K in keyof Shape]: Shape[K] extends readonly (infer Item)[] ? Item : never
}

type ValuesOutputShape<
  Row extends ValuesRowInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = {
  readonly [K in keyof Row]: DialectAsExpression<Row[K], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
}

type UnnestOutputShape<
  Columns extends UnnestColumnsInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = {
  readonly [K in keyof Columns]: DialectAsExpression<Columns[K][number], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
}

type GenerateSeriesOutputShape<
  Start extends NumericExpressionInput,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = {
  readonly value: DialectAsNumericExpression<Start, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
}

type GenerateSeriesUnsupportedError<Dialect extends string> = {
  readonly __effect_qb_error__: "effect-qb: generateSeries(...) is only supported by the postgres dialect"
  readonly __effect_qb_dialect__: Dialect
  readonly __effect_qb_hint__: "Use postgres.Query.generateSeries(...) or emulate a series with a recursive CTE"
}

type DistinctOnUnsupportedError<Dialect extends string> = {
  readonly __effect_qb_error__: "effect-qb: distinctOn(...) is only supported by the postgres dialect"
  readonly __effect_qb_dialect__: Dialect
  readonly __effect_qb_hint__: "Use postgres.Query.distinctOn(...) or regular distinct()/grouping logic"
}

type DistinctOnApi<Dialect extends string> = Dialect extends "postgres"
  ? <Values extends readonly ExpressionInput[]>(
      ...values: Values
    ) => <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & RequireSelectStatement<PlanValue>
    ) => QueryPlan<
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
    >
  : DistinctOnUnsupportedError<Dialect>

type InsertPlanStatementError<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
> = PlanValue & {
  readonly __effect_qb_error__: "effect-qb: insert sources only accept select-like query plans"
  readonly __effect_qb_statement__: StatementOfPlan<PlanValue>
  readonly __effect_qb_hint__: "Use select(...), a set operator, or a CTE/subquery built from them"
}

type InsertPlanSelectionShapeError<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
> = PlanValue & {
  readonly __effect_qb_error__: "effect-qb: insert sources require a flat selection object"
  readonly __effect_qb_selection__: SelectionOfPlan<PlanValue>
  readonly __effect_qb_hint__: "Project a flat object like select({ id: ..., email: ... }) with column-name keys"
}

type MysqlConflictTargetError<Target> = Target & {
  readonly __effect_qb_error__: "effect-qb: mysql does not support named or predicate-scoped conflict targets"
  readonly __effect_qb_hint__: "Use a column tuple target, or rely on MySQL duplicate-key resolution without target predicates"
}

type MysqlConflictWhereError<Values> = Values & {
  readonly __effect_qb_error__: "effect-qb: mysql does not support conflict where(...) predicates"
  readonly __effect_qb_hint__: "Move the condition into the update assignment expressions or use the Postgres dialect"
}

type InsertShapeExtraKeys<TargetShape, SourceShape> = Exclude<Extract<keyof SourceShape, string>, Extract<keyof TargetShape, string>>
type InsertShapeMissingKeys<TargetShape, SourceShape> = Exclude<RequiredKeys<TargetShape>, Extract<keyof SourceShape, string>>
type InsertShapeMismatchedKeys<TargetShape, SourceShape> = Extract<{
  [K in Extract<keyof SourceShape, keyof TargetShape>]:
    SourceShape[K] extends TargetShape[K] ? never : K
}[Extract<keyof SourceShape, keyof TargetShape>], string>

type InsertShapeCompatibilityError<
  Target extends MutationTargetLike,
  SourceShape
> = {
  readonly __effect_qb_error__: "effect-qb: insert source is not compatible with the target table insert payload"
  readonly __effect_qb_target_insert_shape__: Table.InsertOf<Target>
  readonly __effect_qb_actual_source_shape__: SourceShape
  readonly __effect_qb_extra_columns__: InsertShapeExtraKeys<Table.InsertOf<Target>, SourceShape>
  readonly __effect_qb_missing_required_columns__: InsertShapeMissingKeys<Table.InsertOf<Target>, SourceShape>
  readonly __effect_qb_mismatched_columns__: InsertShapeMismatchedKeys<Table.InsertOf<Target>, SourceShape>
  readonly __effect_qb_hint__: "Project only known insert columns, include every required column, and make each projected value assignable to the target insert type"
}

type InsertUnnestSourceInput<
  Target extends MutationTargetLike,
  Source extends AnyUnnestSource
> = IsInsertShapeCompatible<
  Target,
  OutputOfSelection<Source["columns"], AddAvailable<{}, SourceNameOf<Source>>, TrueFormula>
> extends true ? Source : InsertShapeCompatibilityError<
  Target,
  OutputOfSelection<Source["columns"], AddAvailable<{}, SourceNameOf<Source>>, TrueFormula>
>

type IsInsertShapeCompatible<Target extends MutationTargetLike, SourceShape> =
  [InsertShapeExtraKeys<Table.InsertOf<Target>, SourceShape>] extends [never]
    ? [InsertShapeMissingKeys<Table.InsertOf<Target>, SourceShape>] extends [never]
      ? [InsertShapeMismatchedKeys<Table.InsertOf<Target>, SourceShape>] extends [never]
        ? true
        : false
      : false
    : false

type FlatSelectionKeys<Selection> = Extract<keyof Selection, string>

type IsFlatExpressionSelection<Selection> = Selection extends Record<string, any>
  ? Extract<{
      [K in keyof Selection]:
        Selection[K] extends Expression.Any ? never : K
    }[keyof Selection], string> extends never
    ? true
    : false
  : false

type InsertSelectSource<
  Target extends MutationTargetLike,
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Dialect extends string
> = StatementOfPlan<PlanValue> extends "select" | "set"
  ? IsFlatExpressionSelection<SelectionOfPlan<PlanValue>> extends true
    ? IsInsertShapeCompatible<Target, ResultRow<PlanValue>> extends true
      ? CompletePlan<PlanValue>
      : InsertShapeCompatibilityError<Target, ResultRow<PlanValue>>
    : InsertPlanSelectionShapeError<PlanValue>
  : InsertPlanStatementError<PlanValue>

type InsertSourceInput<
  Target extends MutationTargetLike,
  Dialect extends string,
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any> = QueryPlan<any, any, any, any, any, any, any, any, any, any>
> =
  | AnyValuesInput
  | AnyValuesSource
  | InsertUnnestSourceInput<Target, AnyUnnestSource>
  | InsertSelectSource<Target, PlanValue, Dialect>

type InsertSourceOfPlanInput<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Source,
  Dialect extends string
> = MutationTargetOfPlan<PlanValue> extends infer Target extends MutationTargetLike
  ? Source extends AnyValuesInput | AnyValuesSource
    ? Source
    : Source extends AnyUnnestSource
      ? InsertUnnestSourceInput<Target, Source>
      : Source extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
        ? InsertSelectSource<Target, Source, Dialect>
        : never
  : never

type InsertSourceRequired<Source> =
  Source extends AnyValuesInput | AnyValuesSource ? NestedMutationRequiredFromValues<Source["rows"][number]> :
    Source extends UnnestSource<any, any, any> ? never :
      Source extends QueryPlan<any, any, any, any, any, any, any, any, any, any> ? RequiredOfPlan<Source> :
        never

type ConflictColumnTarget<
  Target extends MutationTargetLike,
  Columns extends DdlColumnInput
> = ValidateTargetColumns<Target, NormalizeDdlColumns<Columns>>

type ConflictTargetInput<
  Target extends MutationTargetLike,
  Dialect extends string,
  Columns extends DdlColumnInput = DdlColumnInput
> =
  | ConflictColumnTarget<Target, Columns>
  | (Dialect extends "postgres"
      ? {
          readonly columns: ConflictColumnTarget<Target, Columns>
          readonly where?: PredicateInput
        } | {
          readonly constraint: string
        }
      : MysqlConflictTargetError<{
          readonly columns?: ConflictColumnTarget<Target, Columns>
          readonly where?: PredicateInput
          readonly constraint?: string
        }>)

type ConflictActionInput<
  Target extends MutationTargetLike,
  Dialect extends string,
  UpdateValues extends MutationInputOf<Table.UpdateOf<Target>> | undefined = MutationInputOf<Table.UpdateOf<Target>> | undefined
> = {
  readonly update?: UpdateValues
  readonly where?: Dialect extends "postgres" ? PredicateInput : MysqlConflictWhereError<PredicateInput>
}

type MergeWhenMatchedDelete<
  Predicate extends PredicateInput | undefined = undefined
> = {
  readonly delete: true
  readonly predicate?: Predicate
  readonly update?: never
}

type MergeWhenMatchedUpdate<
  Target extends MutationTargetLike,
  Values extends MutationInputOf<Table.UpdateOf<Target>>,
  Predicate extends PredicateInput | undefined = undefined
> = {
  readonly update: Values
  readonly predicate?: Predicate
  readonly delete?: never
}

type MergeWhenNotMatched<
  Target extends MutationTargetLike,
  Values extends MutationInputOf<Table.InsertOf<Target>>,
  Predicate extends PredicateInput | undefined = undefined
> = {
  readonly values: Values
  readonly predicate?: Predicate
}

type MergeOptions<
  Target extends MutationTargetLike,
  MatchedValues extends MutationInputOf<Table.UpdateOf<Target>>,
  InsertValues extends MutationInputOf<Table.InsertOf<Target>>,
  MatchedPredicate extends PredicateInput | undefined = undefined,
  NotMatchedPredicate extends PredicateInput | undefined = undefined
> = {
  readonly whenMatched?: MergeWhenMatchedDelete<MatchedPredicate> | MergeWhenMatchedUpdate<Target, MatchedValues, MatchedPredicate>
  readonly whenNotMatched?: MergeWhenNotMatched<Target, InsertValues, NotMatchedPredicate>
}

type RequireSelectStatement<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  StatementOfPlan<PlanValue> extends "select" ? unknown : never

type RequirePendingInsertStatement<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  StatementOfPlan<PlanValue> extends "insert"
    ? InsertSourceStateOfPlan<PlanValue> extends "missing" ? unknown : never
    : never

type RequireWhereStatement<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  StatementOfPlan<PlanValue> extends "select" | "update" | "delete" ? unknown : never

type RequireMutationStatement<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  StatementOfPlan<PlanValue> extends MutationStatement ? unknown : never

type RequireInsertStatement<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  StatementOfPlan<PlanValue> extends "insert" ? unknown : never

type RequireJoinStatement<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  StatementOfPlan<PlanValue> extends "select" | "update" | "delete" ? unknown : never

type RequireUpdateFromStatement<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  StatementOfPlan<PlanValue> extends "update" ? unknown : never

type MutationOrderLimitSupported<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>, Dialect extends string> =
  StatementOfPlan<PlanValue> extends "select"
    ? unknown
    : Dialect extends "mysql"
      ? StatementOfPlan<PlanValue> extends "update" | "delete" ? unknown : never
      : never

type MutationRequiredFromValues<Values extends Record<string, unknown>> = {
  [K in keyof Values]: Values[K] extends Expression.Any ? RequiredFromDependencies<DependenciesOf<Values[K]>> : never
}[keyof Values]

type NestedMutationRequiredFromValues<Values> =
  Values extends Expression.Any
    ? RequiredFromDependencies<DependenciesOf<Values>>
    : Values extends Record<string, unknown>
      ? {
          [K in keyof Values]: NestedMutationRequiredFromValues<Values[K]>
        }[keyof Values]
      : never

type MutationAssignments<Shape extends Record<string, unknown>> = {
  readonly [K in keyof Shape]: QueryAst.AssignmentClause
}

type AstOf<Value extends Expression.Any> =
  Value extends { readonly [ExpressionAst.TypeId]: infer Ast extends ExpressionAst.Any }
    ? Ast
    : never

type AvailableNames<Available extends Record<string, Plan.AnySource>> = Extract<keyof Available, string>

type RequiredFromInput<Value extends ExpressionInput> =
  Value extends Expression.Any
    ? RequiredFromDependencies<DependenciesOf<Value>>
    : never

type MutationLockModeForStatement<
  Statement extends QueryAst.QueryStatement,
  Dialect extends string
> = Statement extends "select"
  ? "update" | "share"
  : Dialect extends "mysql"
    ? Statement extends "update"
      ? "lowPriority" | "ignore"
      : Statement extends "delete"
        ? "lowPriority" | "quick" | "ignore"
          : never
      : never

type InsertDirectSource =
  | AnyValuesInput
  | QueryPlan<any, any, any, any, any, any, any, any, any, any>

type FromInput = SourceLike | InsertDirectSource

type SelectFromConstraint<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  CurrentSource extends SourceLike
> =
  RequireSelectStatement<PlanValue> &
  (SourceNameOf<CurrentSource> extends OutstandingOfPlan<PlanValue> ? unknown : never) &
  (SourceRequiredOf<CurrentSource> extends never ? unknown : SourceRequirementError<CurrentSource>)

type UpdateFromConstraint<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  CurrentSource extends SourceLike
> =
  RequireUpdateFromStatement<PlanValue> &
  (SourceNameOf<CurrentSource> extends ScopedNamesOfPlan<PlanValue> ? never : unknown) &
  (SourceRequiredOf<CurrentSource> extends never ? unknown : SourceRequirementError<CurrentSource>)

type InsertFromConstraint<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  CurrentSource,
  Dialect extends string
> =
  RequirePendingInsertStatement<PlanValue> &
  (InsertSourceOfPlanInput<PlanValue, CurrentSource, Dialect> extends CurrentSource
    ? unknown
    : InsertSourceOfPlanInput<PlanValue, CurrentSource, Dialect>)

type SelectFromResult<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  CurrentSource extends SourceLike
> = QueryPlan<
  SelectionOfPlan<PlanValue>,
  Exclude<RequiredOfPlan<PlanValue>, SourceNameOf<CurrentSource>>,
  AddAvailable<{}, SourceNameOf<CurrentSource>, "required", TrueFormula, PresenceWitnessKeysOfSource<CurrentSource>>,
  PlanDialectOf<PlanValue> | SourceDialectOf<CurrentSource>,
  GroupedOfPlan<PlanValue>,
  SourceNameOf<CurrentSource>,
  Exclude<OutstandingOfPlan<PlanValue>, SourceNameOf<CurrentSource>>,
  AssumptionsOfPlan<PlanValue>,
  MergeCapabilities<CapabilitiesOfPlan<PlanValue>, SourceCapabilitiesOf<CurrentSource>>,
  StatementOfPlan<PlanValue>
>

type UpdateFromResult<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  CurrentSource extends SourceLike
> = QueryPlan<
  SelectionOfPlan<PlanValue>,
  Exclude<RequiredOfPlan<PlanValue>, SourceNameOf<CurrentSource>>,
  AddAvailable<
    AvailableOfPlan<PlanValue>,
    SourceNameOf<CurrentSource>,
    "required",
    TrueFormula,
    PresenceWitnessKeysOfSource<CurrentSource>
  >,
  PlanDialectOf<PlanValue> | SourceDialectOf<CurrentSource>,
  GroupedOfPlan<PlanValue>,
  ScopedNamesOfPlan<PlanValue> | SourceNameOf<CurrentSource>,
  Exclude<OutstandingOfPlan<PlanValue>, SourceNameOf<CurrentSource>>,
  AssumptionsOfPlan<PlanValue>,
  MergeCapabilities<CapabilitiesOfPlan<PlanValue>, SourceCapabilitiesOf<CurrentSource>>,
  StatementOfPlan<PlanValue>
>

type InsertFromResult<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  CurrentSource,
  Dialect extends string
> = QueryPlan<
  SelectionOfPlan<PlanValue>,
  Exclude<InsertSourceRequired<CurrentSource>, AvailableNames<AvailableOfPlan<PlanValue>>>,
  AvailableOfPlan<PlanValue>,
  PlanDialectOf<PlanValue>,
  GroupedOfPlan<PlanValue>,
  ScopedNamesOfPlan<PlanValue>,
  Exclude<InsertSourceRequired<CurrentSource>, AvailableNames<AvailableOfPlan<PlanValue>>>,
  AssumptionsOfPlan<PlanValue>,
  CurrentSource extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
    ? MergeCapabilities<CapabilitiesOfPlan<PlanValue>, CapabilitiesOfPlan<CurrentSource>>
    : CapabilitiesOfPlan<PlanValue>,
  StatementOfPlan<PlanValue>,
  MutationTargetOfPlan<PlanValue>,
  "ready"
>

type FromPlanConstraint<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  CurrentSource extends FromInput,
  Dialect extends string
> =
  CurrentSource extends SourceLike
    ? StatementOfPlan<PlanValue> extends "select"
      ? SelectFromConstraint<PlanValue, CurrentSource>
      : StatementOfPlan<PlanValue> extends "update"
        ? UpdateFromConstraint<PlanValue, CurrentSource>
        : StatementOfPlan<PlanValue> extends "insert"
          ? CurrentSource extends AnyValuesSource | AnyUnnestSource
            ? InsertFromConstraint<PlanValue, CurrentSource, Dialect>
            : never
          : never
    : CurrentSource extends InsertDirectSource
      ? StatementOfPlan<PlanValue> extends "insert"
        ? InsertFromConstraint<PlanValue, CurrentSource, Dialect>
        : never
      : never

type FromPlanResult<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  CurrentSource extends FromInput,
  Dialect extends string
> =
  CurrentSource extends SourceLike
    ? StatementOfPlan<PlanValue> extends "select"
      ? SelectFromResult<PlanValue, CurrentSource>
      : StatementOfPlan<PlanValue> extends "update"
        ? UpdateFromResult<PlanValue, CurrentSource>
        : StatementOfPlan<PlanValue> extends "insert"
          ? CurrentSource extends AnyValuesSource | AnyUnnestSource
            ? InsertFromResult<PlanValue, CurrentSource, Dialect>
            : never
          : never
    : CurrentSource extends InsertDirectSource
      ? StatementOfPlan<PlanValue> extends "insert"
        ? InsertFromResult<PlanValue, CurrentSource, Dialect>
        : never
      : never

type MergeRequiredFromPredicate<
  Predicate extends PredicateInput | undefined,
  Available extends Record<string, Plan.AnySource>
> = Predicate extends PredicateInput ? AddExpressionRequired<never, Available, Predicate> : never

type AsCurriedInput<Dialect extends string> =
  | ExpressionInput
  | ValuesInput<any, any, Dialect>
  | CompletePlan<QueryPlan<any, any, any, any, any, any, any, any, any, any>>

type AsCurriedResult<
  Value,
  Alias extends string,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> =
  Value extends ValuesInput<
    infer Rows extends ValuesRowsInput,
    infer Selection extends SelectionShape,
    Dialect
  > ? ValuesSource<Rows, Selection, Alias, Dialect>
    : Value extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
      ? DerivedSource<Value, Alias>
      : Value extends ExpressionInput
        ? DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
        : never

  function as<
    Alias extends string
  >(
    alias: Alias
  ): <Value extends AsCurriedInput<Dialect>>(
    value: Value
  ) => AsCurriedResult<Value, Alias, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
  function as<
    Value extends ExpressionInput,
    Alias extends string
  >(
    value: Value,
    alias: Alias
  ): DialectAsExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>
  function as<
    Rows extends ValuesRowsInput,
    Alias extends string
  >(
    value: ValuesInput<
      Rows,
      ValuesOutputShape<Rows[0], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      Dialect
    >,
    alias: Alias
  ): ValuesSource<
    Rows,
    ValuesOutputShape<Rows[0], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    Alias,
    Dialect
  >
  function as<
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    Alias extends string
  >(
    value: CompletePlan<PlanValue>,
    alias: Alias
  ): DerivedSource<PlanValue, Alias>
  function as(valueOrAlias: unknown, alias?: string): unknown {
    if (alias === undefined) {
      return (value: unknown) => as(value as any, valueOrAlias as string)
    }
    const resolvedAlias = alias
    const value = valueOrAlias
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
        alias: resolvedAlias
      } satisfies ProjectionAlias.State<string>
      return projected
    }
    if ("kind" in value && value.kind === "values" && !("name" in value)) {
      const valuesInput = value as AnyValuesInput
      return makeAliasedValuesSource(
        valuesInput.rows as readonly [Record<string, Expression.Any>, ...Record<string, Expression.Any>[]],
        valuesInput.selection as any,
        resolvedAlias
      ) as unknown
    }
    return makeDerivedSource(value as CompletePlan<QueryPlan<any, any, any, any, any, any, any, any, any, any>>, resolvedAlias)
  }

  function with_<
    Alias extends string
  >(
    alias: Alias
  ): <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    value: CompletePlan<PlanValue>
  ) => import("./query.js").CteSource<PlanValue, Alias>
  function with_<
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    Alias extends string
  >(
    value: CompletePlan<PlanValue>,
    alias: Alias
  ): import("./query.js").CteSource<PlanValue, Alias>
  function with_(valueOrAlias: unknown, alias?: string): unknown {
    if (alias === undefined) {
      return (value: unknown) => with_(value as any, valueOrAlias as string)
    }
    return makeCteSource(
      valueOrAlias as CompletePlan<QueryPlan<any, any, any, any, any, any, any, any, any, any>>,
      alias
    )
  }

  function withRecursive_<
    Alias extends string
  >(
    alias: Alias
  ): <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    value: CompletePlan<PlanValue>
  ) => import("./query.js").CteSource<PlanValue, Alias>
  function withRecursive_<
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    Alias extends string
  >(
    value: CompletePlan<PlanValue>,
    alias: Alias
  ): import("./query.js").CteSource<PlanValue, Alias>
  function withRecursive_(valueOrAlias: unknown, alias?: string): unknown {
    if (alias === undefined) {
      return (value: unknown) => withRecursive_(value as any, valueOrAlias as string)
    }
    return makeCteSource(
      valueOrAlias as CompletePlan<QueryPlan<any, any, any, any, any, any, any, any, any, any>>,
      alias,
      true
    )
  }

  function lateral<
    Alias extends string
  >(
    alias: Alias
  ): <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    value: PlanValue
  ) => import("./query.js").LateralSource<PlanValue, Alias>
  function lateral<
    PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
    Alias extends string
  >(
    value: PlanValue,
    alias: Alias
  ): import("./query.js").LateralSource<PlanValue, Alias>
  function lateral(valueOrAlias: unknown, alias?: string): unknown {
    if (alias === undefined) {
      return (value: unknown) => lateral(value as any, valueOrAlias as string)
    }
    return makeLateralSource(
      valueOrAlias as QueryPlan<any, any, any, any, any, any, any, any, any, any>,
      alias
    )
  }

  const values = <
    Rows extends ValuesRowsInput
  >(
    rows: Rows
  ): ValuesInput<
    Rows,
    ValuesOutputShape<Rows[0], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    Dialect
  > => {
    if (rows.length === 0) {
      throw new Error("values(...) requires at least one row")
    }
    const normalizedRows: readonly [
      Record<string, Expression.Any>,
      ...Record<string, Expression.Any>[]
    ] = rows.map((row) => normalizeValuesRow(row)) as any
    const columnNames = Object.keys(normalizedRows[0]!)
    for (const row of normalizedRows) {
      const rowKeys = Object.keys(row)
      if (rowKeys.length !== columnNames.length || !rowKeys.every((key, index) => key === columnNames[index])) {
        throw new Error("values(...) rows must project the same columns in the same order")
      }
    }
    return Object.assign(Object.create(ValuesInputProto), {
      kind: "values",
      dialect: profile.dialect,
      rows: normalizedRows,
      selection: normalizedRows[0]! as ValuesOutputShape<
        Rows[0],
        Dialect,
        TextDb,
        NumericDb,
        BoolDb,
        TimestampDb,
        NullDb
      >
    }) as ValuesInput<
      Rows,
      ValuesOutputShape<Rows[0], Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      Dialect
    >
  }

  const unnest = <
    Columns extends UnnestColumnsInput,
    Alias extends string
  >(
    columns: Columns,
    alias: Alias
  ): UnnestSource<
    UnnestOutputShape<Columns, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    Alias,
    Dialect
  > => {
    const normalizedColumns = normalizeUnnestColumns(columns)
    const columnNames = Object.keys(normalizedColumns)
    if (columnNames.length === 0) {
      throw new Error("unnest(...) requires at least one column array")
    }
    const firstColumn = normalizedColumns[columnNames[0] as keyof typeof normalizedColumns]
    const rowCount = firstColumn?.length ?? 0
    if (rowCount === 0) {
      throw new Error("unnest(...) requires at least one row")
    }
    for (const columnName of columnNames) {
      const values = normalizedColumns[columnName]!
      if (values.length !== rowCount) {
        throw new Error("unnest(...) column arrays must have the same length")
      }
    }
    const firstRow = Object.fromEntries(
      columnNames.map((columnName) => [columnName, normalizedColumns[columnName]![0]!])
    ) as Record<string, Expression.Any>
    const columnsSelection = makeColumnReferenceSelection(alias, firstRow) as any as UnnestOutputShape<
      Columns,
      Dialect,
      TextDb,
      NumericDb,
      BoolDb,
      TimestampDb,
      NullDb
    >
    const source = {
      kind: "unnest",
      name: alias,
      baseName: alias,
      dialect: profile.dialect,
      values: columns,
      arrays: normalizedColumns,
      columns: columnsSelection
    }
    return Object.assign(source, columnsSelection) as unknown as UnnestSource<
      UnnestOutputShape<Columns, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      Alias,
      Dialect
    >
  }

  const generateSeries = <
    Start extends NumericExpressionInput,
    Stop extends NumericExpressionInput,
    Step extends NumericExpressionInput | undefined = undefined,
    Alias extends string = "series"
  >(
    start: Start,
    stop: Stop,
    step?: Step,
    alias: Alias = "series" as Alias
  ): Dialect extends "postgres"
    ? TableFunctionSource<
        GenerateSeriesOutputShape<Start, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
        Alias,
        Dialect,
        "generate_series"
      >
    : GenerateSeriesUnsupportedError<Dialect> => {
    const startExpression = toDialectNumericExpression(start)
    const stopExpression = toDialectNumericExpression(stop)
    const stepExpression = step === undefined ? undefined : toDialectNumericExpression(step)
    const valueSelection = {
      value: startExpression
    } as Record<string, Expression.Any>
    const columns = makeColumnReferenceSelection(alias, valueSelection) as any as GenerateSeriesOutputShape<
      Start,
      Dialect,
      TextDb,
      NumericDb,
      BoolDb,
      TimestampDb,
      NullDb
    >
    const source = {
      kind: "tableFunction",
      name: alias,
      baseName: alias,
      dialect: profile.dialect,
      functionName: "generate_series",
      args: stepExpression === undefined
        ? [startExpression, stopExpression] as readonly Expression.Any[]
        : [startExpression, stopExpression, stepExpression] as readonly Expression.Any[],
      columns
    }
    return Object.assign(source, columns) as unknown as Dialect extends "postgres"
      ? TableFunctionSource<
          GenerateSeriesOutputShape<Start, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
          Alias,
          Dialect,
          "generate_series"
        >
      : GenerateSeriesUnsupportedError<Dialect>
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
    all: boolean,
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
          all,
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
  > => buildSetOperation("union", false, left as never, right as never) as QueryPlan<
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

  const unionAll = <
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
  > => buildSetOperation("union", true, left as never, right as never) as QueryPlan<
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
  > => buildSetOperation("intersect", false, left as never, right as never) as QueryPlan<
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

  const intersectAll = <
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
  > => buildSetOperation("intersect", true, left as never, right as never) as QueryPlan<
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
  > => buildSetOperation("except", false, left as never, right as never) as QueryPlan<
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

  const exceptAll = <
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
  > => buildSetOperation("except", true, left as never, right as never) as QueryPlan<
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
      assumeFormulaTrue(
        currentQuery.assumptions,
        formulaOfExpressionRuntime(predicateExpression)
      ) as PlanAssumptionsAfterWhere<PlanValue, Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      currentQuery.capabilities,
      currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const from = <CurrentSource extends FromInput>(
    source: CurrentSource
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & FromPlanConstraint<PlanValue, CurrentSource, Dialect>
    ): FromPlanResult<PlanValue, CurrentSource, Dialect> => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)

      if (currentQuery.statement === "insert") {
        return attachInsertSource(
          plan as QueryPlan<any, any, any, any, any, any, any, any, any, "insert", MutationTargetLike, "missing">,
          source as AnyValuesInput | AnyValuesSource | AnyUnnestSource | CompletePlan<QueryPlan<any, any, any, any, any, any, any, any, any, any>>
        ) as FromPlanResult<PlanValue, CurrentSource, Dialect>
      }

      if (
        typeof source !== "object" ||
        source === null ||
        ("kind" in source && source.kind === "values" && !("name" in source)) ||
        (!(Table.TypeId in source) && !("name" in source && "baseName" in source))
      ) {
        throw new Error("from(...) requires an aliased source in select/update statements")
      }

      const sourceLike = source as SourceLike
      const { sourceName, sourceBaseName } = sourceDetails(sourceLike)
      const presenceWitnesses = presenceWitnessesOfSourceLike(sourceLike)

      if (currentQuery.statement === "select") {
        const nextAst = {
          ...currentAst,
          from: {
            kind: "from",
            tableName: sourceName,
            baseTableName: sourceBaseName,
            source: sourceLike
          }
        } as QueryAst.Ast<Record<string, unknown>, any, "select">
        return makePlan({
          selection: current.selection,
          required: currentRequiredList(current.required).filter((name) =>
            name !== sourceName),
          available: {
            [sourceName]: {
              name: sourceName,
              mode: "required",
              baseName: sourceBaseName,
              _presentFormula: trueFormula(),
              _presenceWitnesses: presenceWitnesses
            }
          } as AddAvailable<{}, string, "required", TrueFormula, PresenceWitnessKeysOfSource<Extract<CurrentSource, SourceLike>>>,
          dialect: current.dialect
        }, nextAst, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement) as FromPlanResult<PlanValue, CurrentSource, Dialect>
      }

      if (currentQuery.statement === "update") {
        const nextAvailable = {
          ...current.available,
          [sourceName]: {
            name: sourceName,
            mode: "required" as const,
            baseName: sourceBaseName,
            _presentFormula: trueFormula(),
            _presenceWitnesses: presenceWitnesses
          }
        }
        const nextAst = {
          ...currentAst,
          fromSources: [
            ...(currentAst.fromSources ?? []),
            {
              kind: "from" as const,
              tableName: sourceName,
              baseTableName: sourceBaseName,
              source: sourceLike
            }
          ]
        } as QueryAst.Ast<Record<string, unknown>, any, "update">
        return makePlan({
          selection: current.selection,
          required: currentRequiredList(current.required).filter((name) =>
            !(name in nextAvailable)),
          available: nextAvailable,
          dialect: current.dialect
        }, nextAst, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement) as FromPlanResult<PlanValue, CurrentSource, Dialect>
      }

      throw new Error(`from(...) is not supported for ${currentQuery.statement} statements`)
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
      PlanAssumptionsAfterHaving<PlanValue, Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
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
      }, assumeFormulaTrue(
        currentQuery.assumptions,
        formulaOfExpressionRuntime(predicateExpression)
      ) as PlanAssumptionsAfterHaving<PlanValue, Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      currentQuery.capabilities,
      currentQuery.statement as StatementOfPlan<PlanValue>)
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
      plan: PlanValue & RequireJoinStatement<PlanValue> & (
        keyof AvailableOfPlan<PlanValue> extends never ? never : unknown
      ) & (
        SourceNameOf<CurrentTable> extends ScopedNamesOfPlan<PlanValue> ? never : unknown
      )
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddJoinRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, SourceNameOf<CurrentTable>, never, "cross">,
      AddAvailable<
        AvailableOfPlan<PlanValue>,
        SourceNameOf<CurrentTable>,
        "required",
        TrueFormula,
        PresenceWitnessKeysOfSource<CurrentTable>
      >,
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
      const { sourceName, sourceBaseName } = sourceDetails(table)
      const presenceWitnesses = presenceWitnessesOfSourceLike(table)
      const nextAvailable = Object.assign(
        {},
        current.available as AvailableOfPlan<PlanValue>,
        {
          [sourceName]: {
            name: sourceName,
            mode: "required",
            baseName: sourceBaseName,
            _presentFormula: trueFormula(),
            _presenceWitnesses: presenceWitnesses
          }
        }
      ) as AddAvailable<
        AvailableOfPlan<PlanValue>,
        SourceNameOf<CurrentTable>,
        "required",
        TrueFormula,
        PresenceWitnessKeysOfSource<CurrentTable>
      >
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
      plan: PlanValue & RequireJoinStatement<PlanValue> & (
        keyof AvailableOfPlan<PlanValue> extends never ? never : unknown
      ) & (
        SourceNameOf<CurrentTable> extends ScopedNamesOfPlan<PlanValue> ? never : unknown
      )
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      AddJoinRequired<RequiredOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, SourceNameOf<CurrentTable>, Predicate, Kind>,
      AvailableAfterJoin<
        AvailableOfPlan<PlanValue>,
        SourceNameOf<CurrentTable>,
        Kind,
        JoinPresenceFormula<Kind, Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
        PresenceWitnessKeysOfSource<CurrentTable>
      >,
      PlanDialectOf<PlanValue> | SourceDialectOf<CurrentTable> | DialectOfDialectInput<Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue> | SourceNameOf<CurrentTable>,
      AddJoinRequired<OutstandingOfPlan<PlanValue>, AvailableOfPlan<PlanValue>, SourceNameOf<CurrentTable>, Predicate, Kind>,
      PlanAssumptionsAfterJoin<PlanValue, Predicate, Kind, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      MergeCapabilities<CapabilitiesOfPlan<PlanValue>, SourceCapabilitiesOf<CurrentTable>>,
      StatementOfPlan<PlanValue>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const onExpression = toDialectExpression(on)
      const onFormula = formulaOfExpressionRuntime(onExpression)
      const { sourceName, sourceBaseName } = sourceDetails(table)
      const presenceWitnesses = presenceWitnessesOfSourceLike(table)
      const baseAvailable = (kind === "right" || kind === "full"
        ? Object.fromEntries(
          Object.entries(current.available as Record<string, Plan.AnySource>).map(([name, source]) => [name, {
            name: source.name,
            mode: "optional" as const,
            baseName: source.baseName,
            _presentFormula: source._presentFormula,
            _presenceWitnesses: source._presenceWitnesses
          }])
        )
        : current.available) as AvailableOfPlan<PlanValue>
      const nextAvailable = {
        ...baseAvailable,
        [sourceName]: {
          name: sourceName,
          mode: (kind === "left" || kind === "full" ? "optional" : "required") as JoinSourceMode<Kind>,
          baseName: sourceBaseName,
          _presentFormula: (kind === "inner" || kind === "left") ? onFormula : trueFormula(),
          _presenceWitnesses: presenceWitnesses
        }
      } as AvailableAfterJoin<
        AvailableOfPlan<PlanValue>,
        SourceNameOf<CurrentTable>,
        Kind,
        JoinPresenceFormula<Kind, Predicate, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
        PresenceWitnessKeysOfSource<CurrentTable>
      >
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
      }, (
        kind === "inner"
          ? assumeFormulaTrue(currentQuery.assumptions, onFormula)
          : currentQuery.assumptions
      ) as PlanAssumptionsAfterJoin<PlanValue, Predicate, Kind, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
      currentQuery.capabilities as MergeCapabilities<CapabilitiesOfPlan<PlanValue>, SourceCapabilitiesOf<CurrentTable>>,
      currentQuery.statement as StatementOfPlan<PlanValue>)
    }

  const orderBy = <Value extends ExpressionInput>(
    value: Value,
    direction: OrderDirection = "asc"
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & MutationOrderLimitSupported<PlanValue, Dialect>
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

  function lock(
    mode: "update" | "share",
    options?: LockOptions
  ): <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: PlanValue & (StatementOfPlan<PlanValue> extends "select" ? unknown : never)
  ) => QueryPlan<
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
  >
  function lock<
    Mode extends Dialect extends "mysql" ? "lowPriority" | "ignore" | "quick" : never
  >(
    mode: Mode,
    options?: LockOptions
  ): <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: PlanValue & (
      Dialect extends "mysql"
        ? StatementOfPlan<PlanValue> extends "update"
          ? Mode extends MutationLockModeForStatement<"update", Dialect> ? unknown : never
          : StatementOfPlan<PlanValue> extends "delete"
            ? Mode extends MutationLockModeForStatement<"delete", Dialect> ? unknown : never
            : never
        : never
    )
  ) => QueryPlan<
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
  >
  function lock(
    mode: QueryAst.LockClause["mode"],
    options: LockOptions = {}
  ) {
    return <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue
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

  const distinctOn = {
    __effect_qb_error__: "effect-qb: distinctOn(...) is only supported by the postgres dialect",
    __effect_qb_dialect__: profile.dialect,
    __effect_qb_hint__: "Use postgres.Query.distinctOn(...) or regular distinct()/grouping logic"
  } as DistinctOnApi<Dialect>

  const limit = <Value extends NumericExpressionInput>(
    value: Value
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & MutationOrderLimitSupported<PlanValue, Dialect>
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
      StatementOfPlan<PlanValue>,
      MutationTargetOfPlan<PlanValue>,
      InsertSourceStateOfPlan<PlanValue>
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
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement as StatementOfPlan<PlanValue>, currentQuery.target, currentQuery.insertSource)
    }

  function insert<
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
    "insert",
    Target,
    "missing"
  >
  function insert<
    Target extends MutationTargetLike,
    Values extends Record<string, unknown>
  >(
    target: Target,
    values: MutationValuesInput<"insert", Target, Values>
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
    "insert",
    Target,
    "ready"
  >
  function insert(
    target: MutationTargetLike,
    values?: Record<string, unknown>
  ): QueryPlan<any, any, any, any, any, any, any, any, any, "insert", MutationTargetLike, "missing" | "ready"> {
    const { sourceName, sourceBaseName } = targetSourceDetails(target)
    const assignments = values === undefined
      ? []
      : buildMutationAssignments(target, values)
    const required = assignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies))
    const insertState = values === undefined ? "missing" : "ready"
    return makePlan({
      selection: {},
      required: required.filter((name, index, list) => name !== sourceName && list.indexOf(name) === index),
      available: {
        [sourceName]: {
          name: sourceName,
          mode: "required",
          baseName: sourceBaseName
        }
      } as AddAvailable<{}, string>,
      dialect: target[Plan.TypeId].dialect
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
    }, undefined as unknown as TrueFormula, "write", "insert", target, insertState)
  }

  const attachInsertSource = (
    plan: QueryPlan<any, any, any, any, any, any, any, any, any, "insert", MutationTargetLike, "missing">,
    source: AnyValuesInput | AnyValuesSource | AnyUnnestSource | CompletePlan<QueryPlan<any, any, any, any, any, any, any, any, any, any>>
  ): QueryPlan<any, any, any, any, any, any, any, any, any, "insert", MutationTargetLike, "ready"> => {
    const current = plan[Plan.TypeId]
    const currentAst = getAst(plan)
    const currentQuery = getQueryState(plan)
    const target = currentQuery.target as MutationTargetLike
    const targetSource = currentAst.into!
    const sourceName = targetSource.tableName

    if (typeof source === "object" && source !== null && "kind" in source && source.kind === "values") {
      const valuesSource = source as AnyValuesInput | AnyValuesSource
      const normalized = buildInsertValuesRows(target, valuesSource.rows as readonly [InsertRowInput<MutationTargetLike>, ...InsertRowInput<MutationTargetLike>[]])
      return makePlan({
        selection: current.selection,
        required: normalized.required.filter((name) => name !== sourceName),
        available: current.available,
        dialect: current.dialect
      }, {
        ...currentAst,
        values: [],
        insertSource: {
          kind: "values",
          columns: normalized.columns,
          rows: normalized.rows
        }
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement, currentQuery.target, "ready")
    }

    if (typeof source === "object" && source !== null && "kind" in source && source.kind === "unnest") {
      const unnestSource = source as AnyUnnestSource
      const normalized = normalizeInsertUnnestValues(target, unnestSource.values as any)
      return makePlan({
        selection: current.selection,
        required: [] as never,
        available: current.available,
        dialect: current.dialect
      }, {
        ...currentAst,
        values: [],
        insertSource: {
          kind: "unnest",
          columns: normalized.columns,
          values: normalized.values
        }
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement, currentQuery.target, "ready")
    }

    const sourcePlan = source as CompletePlan<QueryPlan<any, any, any, any, any, any, any, any, any, any>>
    const selection = sourcePlan[Plan.TypeId].selection as Record<string, Expression.Any>
    const columns = normalizeInsertSelectColumns(selection)
    return makePlan({
      selection: current.selection,
      required: currentRequiredList(sourcePlan[Plan.TypeId].required).filter((name) => name !== sourceName),
      available: current.available,
      dialect: current.dialect
      }, {
        ...currentAst,
        values: [],
        insertSource: {
          kind: "query",
          columns,
          query: sourcePlan
        }
      }, currentQuery.assumptions, currentQuery.capabilities as MergeCapabilities<typeof currentQuery.capabilities, CapabilitiesOfPlan<typeof sourcePlan>>, currentQuery.statement, currentQuery.target, "ready")
  }

  const onConflict = <
    Target extends MutationTargetLike,
    const Columns extends DdlColumnInput,
    UpdateValues extends MutationInputOf<Table.UpdateOf<Target>> | undefined = MutationInputOf<Table.UpdateOf<Target>> | undefined,
    Options extends ConflictActionInput<Target, Dialect, UpdateValues> = ConflictActionInput<Target, Dialect, UpdateValues>
  >(
    target: ConflictTargetInput<Target, Dialect, Columns>,
    options: Options = {} as Options
  ) =>
    <PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
      plan: PlanValue & RequireInsertStatement<PlanValue>
    ): QueryPlan<
      SelectionOfPlan<PlanValue>,
      Exclude<RequiredOfPlan<PlanValue> | MutationRequiredFromValues<Exclude<UpdateValues, undefined>> | RequiredFromInput<Extract<Options["where"], PredicateInput>>, AvailableNames<AvailableOfPlan<PlanValue>>>,
      AvailableOfPlan<PlanValue>,
      PlanDialectOf<PlanValue>,
      GroupedOfPlan<PlanValue>,
      ScopedNamesOfPlan<PlanValue>,
      Exclude<OutstandingOfPlan<PlanValue> | MutationRequiredFromValues<Exclude<UpdateValues, undefined>> | RequiredFromInput<Extract<Options["where"], PredicateInput>>, AvailableNames<AvailableOfPlan<PlanValue>>>,
      AssumptionsOfPlan<PlanValue>,
      CapabilitiesOfPlan<PlanValue>,
      StatementOfPlan<PlanValue>,
      MutationTargetOfPlan<PlanValue>,
      InsertSourceStateOfPlan<PlanValue>
    > => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const insertTarget = currentAst.into!.source as Target
      const conflictTarget = buildConflictTarget(insertTarget, target as readonly string[] | { readonly columns: readonly string[]; readonly where?: PredicateInput } | { readonly constraint: string })
      const updateAssignments = options.update
        ? buildMutationAssignments(insertTarget, options.update)
        : []
      const updateWhere = options.where === undefined
        ? undefined
        : toDialectExpression(options.where as PredicateInput)
      const required = [
        ...currentRequiredList(current.required),
        ...updateAssignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies)),
        ...(updateWhere ? Object.keys(updateWhere[Expression.TypeId].dependencies) : [])
      ].filter((name, index, list) =>
        !(name in current.available) && list.indexOf(name) === index)
      return makePlan({
        selection: current.selection,
        required: required as Exclude<RequiredOfPlan<PlanValue> | MutationRequiredFromValues<Exclude<UpdateValues, undefined>> | RequiredFromInput<Extract<Options["where"], PredicateInput>>, AvailableNames<AvailableOfPlan<PlanValue>>>,
        available: current.available,
        dialect: current.dialect as PlanDialectOf<PlanValue>
      }, {
        ...currentAst,
        conflict: {
          kind: "conflict",
          target: conflictTarget,
          action: updateAssignments.length === 0 ? "doNothing" : "doUpdate",
          values: updateAssignments.length === 0 ? undefined : updateAssignments,
          where: updateWhere
        }
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement as StatementOfPlan<PlanValue>, currentQuery.target, currentQuery.insertSource)
    }

  function update<
    Targets extends MutationTargetTuple,
    Values extends UpdateInputOfTarget<Targets>
  >(
    target: Dialect extends "mysql" ? Targets : never,
    values: Values
  ): QueryPlan<
    {},
    Exclude<NestedMutationRequiredFromValues<Values>, MutationTargetNamesOf<Targets>>,
    AddAvailableMany<{}, MutationTargetNamesOf<Targets>>,
    TableDialectOf<Targets[0]>,
    never,
    MutationTargetNamesOf<Targets>,
    Exclude<NestedMutationRequiredFromValues<Values>, MutationTargetNamesOf<Targets>>,
    TrueFormula,
    "write",
    "update"
  >
  function update<
    Target extends MutationTargetLike,
    Values extends Record<string, unknown>
  >(
    target: Target,
    values: MutationValuesInput<"update", Target, Values>
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
  >
  function update(
    target: MutationTargetInput,
    values: Record<string, unknown>
  ): QueryPlan<any, any, any, any, any, any, any, any, any, "update"> {
    const targets = mutationTargetClauses(target)
    const primaryTarget = targets[0]!
    const assignments = buildMutationAssignments(target, values)
    const targetNames = new Set(targets.map((entry) => entry.tableName))
    const required = assignments
      .flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies))
      .filter((name, index, list) => !targetNames.has(name) && list.indexOf(name) === index)
    return makePlan({
      selection: {},
      required,
      available: mutationAvailableSources(target),
      dialect: (primaryTarget.source as MutationTargetLike)[Plan.TypeId].dialect
    }, {
      kind: "update",
      select: {},
      target: primaryTarget,
      targets,
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
    const Columns extends DdlColumnInput,
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
    "insert",
    Target,
    "ready"
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
        target: {
          kind: "columns",
          columns: normalizeColumnList(conflictColumns as string | readonly string[]) as readonly [string, ...string[]]
        },
        action: updateAssignments.length > 0 ? "doUpdate" : "doNothing",
        values: updateAssignments.length > 0 ? updateAssignments : undefined
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "write", "insert", target, "ready")
  }

  function delete_<
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
  >
  function delete_<
    Targets extends MutationTargetTuple
  >(
    target: Dialect extends "mysql" ? Targets : never
  ): QueryPlan<
    {},
    never,
    AddAvailableMany<{}, MutationTargetNamesOf<Targets>>,
    TableDialectOf<Targets[0]>,
    never,
    MutationTargetNamesOf<Targets>,
    never,
    TrueFormula,
    "write",
    "delete"
  >
  function delete_(
    target: MutationTargetInput
  ): QueryPlan<any, any, any, any, any, any, any, any, any, "delete"> {
    const targets = mutationTargetClauses(target)
    const primaryTarget = targets[0]!
    return makePlan({
      selection: {},
      required: [] as never,
      available: mutationAvailableSources(target),
      dialect: (primaryTarget.source as MutationTargetLike)[Plan.TypeId].dialect
    }, {
      kind: "delete",
      select: {},
      target: primaryTarget,
      targets,
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "write", "delete")
  }

  const truncate = <
    Target extends MutationTargetLike
  >(
    target: Target,
    options: TruncateOptions = {}
  ): QueryPlan<
    {},
    never,
    {},
    TableDialectOf<Target>,
    never,
    never,
    never,
    TrueFormula,
    "write",
    "truncate"
  > => {
    const { sourceName, sourceBaseName } = targetSourceDetails(target)
    return makePlan({
      selection: {},
      required: [] as never,
      available: {},
      dialect: target[Plan.TypeId].dialect as TableDialectOf<Target>
    }, {
      kind: "truncate",
      select: {},
      target: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      truncate: {
        kind: "truncate",
        restartIdentity: options.restartIdentity ?? false,
        cascade: options.cascade ?? false
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "write", "truncate")
  }

  const merge = <
    Target extends MutationTargetLike,
    Source extends SourceLike,
    On extends PredicateInput,
    MatchedValues extends MutationInputOf<Table.UpdateOf<Target>> = MutationInputOf<Table.UpdateOf<Target>>,
    InsertValues extends MutationInputOf<Table.InsertOf<Target>> = MutationInputOf<Table.InsertOf<Target>>,
    MatchedPredicate extends PredicateInput | undefined = undefined,
    NotMatchedPredicate extends PredicateInput | undefined = undefined
  >(
    target: Target,
    source: Source & (
      SourceRequiredOf<Source> extends never ? unknown : SourceRequirementError<Source>
    ),
    on: On,
    options: MergeOptions<Target, MatchedValues, InsertValues, MatchedPredicate, NotMatchedPredicate> = {}
  ): QueryPlan<
    {},
    Exclude<
      AddExpressionRequired<
        MergeRequiredFromPredicate<
          MatchedPredicate,
          AddAvailable<AddAvailable<{}, SourceNameOf<Target>>, SourceNameOf<Source>>
        > | MergeRequiredFromPredicate<
          NotMatchedPredicate,
          AddAvailable<AddAvailable<{}, SourceNameOf<Target>>, SourceNameOf<Source>>
        > | MutationRequiredFromValues<MatchedValues> | MutationRequiredFromValues<InsertValues>,
        AddAvailable<AddAvailable<{}, SourceNameOf<Target>>, SourceNameOf<Source>>,
        On
      >,
      SourceNameOf<Target> | SourceNameOf<Source>
    >,
    AddAvailable<AddAvailable<{}, SourceNameOf<Target>>, SourceNameOf<Source>>,
    TableDialectOf<Target> | SourceDialectOf<Source>,
    never,
    SourceNameOf<Target> | SourceNameOf<Source>,
    Exclude<
      AddExpressionRequired<
        MergeRequiredFromPredicate<
          MatchedPredicate,
          AddAvailable<AddAvailable<{}, SourceNameOf<Target>>, SourceNameOf<Source>>
        > | MergeRequiredFromPredicate<
          NotMatchedPredicate,
          AddAvailable<AddAvailable<{}, SourceNameOf<Target>>, SourceNameOf<Source>>
        > | MutationRequiredFromValues<MatchedValues> | MutationRequiredFromValues<InsertValues>,
        AddAvailable<AddAvailable<{}, SourceNameOf<Target>>, SourceNameOf<Source>>,
        On
      >,
      SourceNameOf<Target> | SourceNameOf<Source>
    >,
    TrueFormula,
    MergeCapabilities<"write", SourceCapabilitiesOf<Source>>,
    "merge"
  > => {
    const { sourceName: targetName, sourceBaseName: targetBaseName } = targetSourceDetails(target)
    const { sourceName: usingName, sourceBaseName: usingBaseName } = sourceDetails(source)
    const onExpression = toDialectExpression(on)
    const matched = options.whenMatched
    const notMatched = options.whenNotMatched
    if (matched && "delete" in matched && "update" in matched) {
      throw new Error("merge whenMatched cannot specify both update and delete")
    }
    const matchedPredicate = matched?.predicate ? toDialectExpression(matched.predicate) : undefined
    const matchedAssignments = matched && "update" in matched && matched.update
      ? buildMutationAssignments(target, matched.update)
      : []
    const notMatchedPredicate = notMatched?.predicate ? toDialectExpression(notMatched.predicate) : undefined
    const notMatchedAssignments = notMatched
      ? buildMutationAssignments(target, notMatched.values)
      : []
    const required = [
      ...Object.keys(onExpression[Expression.TypeId].dependencies),
      ...matchedAssignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies)),
      ...notMatchedAssignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies)),
      ...(matchedPredicate ? Object.keys(matchedPredicate[Expression.TypeId].dependencies) : []),
      ...(notMatchedPredicate ? Object.keys(notMatchedPredicate[Expression.TypeId].dependencies) : [])
    ].filter((name, index, values) =>
      name !== targetName && name !== usingName && values.indexOf(name) === index)
    return makePlan({
      selection: {},
      required: required as unknown as Exclude<
        AddExpressionRequired<
          MergeRequiredFromPredicate<
            MatchedPredicate,
            AddAvailable<AddAvailable<{}, SourceNameOf<Target>>, SourceNameOf<Source>>
          > | MergeRequiredFromPredicate<
            NotMatchedPredicate,
            AddAvailable<AddAvailable<{}, SourceNameOf<Target>>, SourceNameOf<Source>>
          > | MutationRequiredFromValues<MatchedValues> | MutationRequiredFromValues<InsertValues>,
          AddAvailable<AddAvailable<{}, SourceNameOf<Target>>, SourceNameOf<Source>>,
          On
        >,
        SourceNameOf<Target> | SourceNameOf<Source>
      >,
      available: {
        [targetName]: {
          name: targetName,
          mode: "required",
          baseName: targetBaseName
        },
        [usingName]: {
          name: usingName,
          mode: "required",
          baseName: usingBaseName
        }
      } as AddAvailable<AddAvailable<{}, SourceNameOf<Target>>, SourceNameOf<Source>>,
      dialect: target[Plan.TypeId].dialect as TableDialectOf<Target> | SourceDialectOf<Source>
    }, {
      kind: "merge",
      select: {},
      target: {
        kind: "from",
        tableName: targetName,
        baseTableName: targetBaseName,
        source: target
      },
      using: {
        kind: "from",
        tableName: usingName,
        baseTableName: usingBaseName,
        source
      },
      merge: {
        kind: "merge",
        on: onExpression,
        whenMatched: matched
          ? ("delete" in matched && matched.delete
            ? {
                kind: "delete",
                predicate: matchedPredicate
              }
            : {
                kind: "update",
                values: matchedAssignments,
                predicate: matchedPredicate
              })
          : undefined,
        whenNotMatched: notMatched
          ? {
              kind: "insert",
              values: notMatchedAssignments,
              predicate: notMatchedPredicate
            }
          : undefined
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "write" as MergeCapabilities<"write", SourceCapabilitiesOf<Source>>, "merge")
  }

  const transaction = (
    options: TransactionOptions = {}
  ): QueryPlan<
    {},
    never,
    {},
    Dialect,
    never,
    never,
    never,
    TrueFormula,
    "transaction",
    "transaction"
  > =>
    makePlan({
      selection: {},
      required: [] as never,
      available: {},
      dialect: profile.dialect as Dialect
    }, {
      kind: "transaction",
      select: {},
      transaction: {
        kind: "transaction",
        isolationLevel: options.isolationLevel,
        readOnly: options.readOnly
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "transaction", "transaction")

  const commit = (): QueryPlan<
    {},
    never,
    {},
    Dialect,
    never,
    never,
    never,
    TrueFormula,
    "transaction",
    "commit"
  > =>
    makePlan({
      selection: {},
      required: [] as never,
      available: {},
      dialect: profile.dialect as Dialect
    }, {
      kind: "commit",
      select: {},
      transaction: {
        kind: "commit"
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "transaction", "commit")

  const rollback = (): QueryPlan<
    {},
    never,
    {},
    Dialect,
    never,
    never,
    never,
    TrueFormula,
    "transaction",
    "rollback"
  > =>
    makePlan({
      selection: {},
      required: [] as never,
      available: {},
      dialect: profile.dialect as Dialect
    }, {
      kind: "rollback",
      select: {},
      transaction: {
        kind: "rollback"
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "transaction", "rollback")

  const savepoint = <Name extends string>(
    name: Name
  ): QueryPlan<
    {},
    never,
    {},
    Dialect,
    never,
    never,
    never,
    TrueFormula,
    "transaction",
    "savepoint"
  > =>
    makePlan({
      selection: {},
      required: [] as never,
      available: {},
      dialect: profile.dialect as Dialect
    }, {
      kind: "savepoint",
      select: {},
      transaction: {
        kind: "savepoint",
        name
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "transaction", "savepoint")

  const rollbackTo = <Name extends string>(
    name: Name
  ): QueryPlan<
    {},
    never,
    {},
    Dialect,
    never,
    never,
    never,
    TrueFormula,
    "transaction",
    "rollbackTo"
  > =>
    makePlan({
      selection: {},
      required: [] as never,
      available: {},
      dialect: profile.dialect as Dialect
    }, {
      kind: "rollbackTo",
      select: {},
      transaction: {
        kind: "rollbackTo",
        name
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "transaction", "rollbackTo")

  const releaseSavepoint = <Name extends string>(
    name: Name
  ): QueryPlan<
    {},
    never,
    {},
    Dialect,
    never,
    never,
    never,
    TrueFormula,
    "transaction",
    "releaseSavepoint"
  > =>
    makePlan({
      selection: {},
      required: [] as never,
      available: {},
      dialect: profile.dialect as Dialect
    }, {
      kind: "releaseSavepoint",
      select: {},
      transaction: {
        kind: "releaseSavepoint",
        name
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined as unknown as TrueFormula, "transaction", "releaseSavepoint")

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
    const Columns extends DdlColumnInput
  >(
    target: Target,
    columns: Columns & ValidateDdlColumns<Target, NormalizeDdlColumns<Columns>>,
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
    const Columns extends DdlColumnInput
  >(
    target: Target,
    columns: Columns & ValidateDdlColumns<Target, NormalizeDdlColumns<Columns>>,
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
    column,
    cast,
    type,
    json,
    jsonb,
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
    regexMatch,
    regexIMatch,
    regexNotMatch,
    regexNotIMatch,
    and,
    or,
    not,
    all: all_,
    any: any_,
    case: case_,
    match,
    coalesce,
    call,
    uuidGenerateV4,
    nextVal,
    in: in_,
    notIn,
    between,
    contains,
    containedBy,
    overlaps,
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
    excluded,
    as,
    with: with_,
    withRecursive: withRecursive_,
    lateral,
    scalar,
    inSubquery,
    compareAny,
    compareAll,
    values,
    unnest,
    generateSeries,
    returning,
    onConflict,
    insert,
    update,
    upsert,
    delete: delete_,
    truncate,
    merge,
    transaction,
    commit,
    rollback,
    savepoint,
    rollbackTo,
    releaseSavepoint,
    createTable,
    dropTable,
    createIndex,
    dropIndex,
    union,
    unionAll,
    intersect,
    intersectAll,
    except,
    exceptAll,
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
    distinctOn,
    limit,
    offset,
    lock,
    orderBy,
    groupBy
  }

return api
})()
