import { pipeArguments, type Pipeable } from "effect/Pipeable"

import * as Expression from "./expression.js"
import * as Plan from "./plan.js"
import * as Table from "./table.js"
import * as ExpressionAst from "./expression-ast.js"
import * as QueryAst from "./query-ast.js"
import type { JsonNode } from "./json/ast.js"
import type * as JsonPath from "./json/path.js"
import type { QueryCapability } from "./query-requirements.js"
import type { CaseBranchAssumeFalse, CaseBranchAssumeTrue, CaseBranchDecision } from "./case-analysis.js"
import type { ContradictsFormula, GuaranteedNonNullKeys, GuaranteedNullKeys, GuaranteedSourceNames } from "./predicate-analysis.js"
import type { ColumnKeyOfExpression } from "./predicate-key.js"
import type { PredicateFormula, TrueFormula } from "./predicate-formula.js"
import { trueFormula } from "./predicate-runtime.js"

export type {
  MergeCapabilities,
  MergeCapabilityTuple,
  QueryCapability,
  QueryRequirement
} from "./query-requirements.js"
export type {
  ComparableDbType,
  RuntimeOfDbType,
  TextCompatibleDbType,
  CastableDbType
} from "./coercion-analysis.js"
export type {
  CanonicalSegment as JsonPathSegment,
  DescendSegment as JsonPathDescendSegment,
  ExactSegment as JsonExactPathSegment,
  IndexSegment as JsonPathIndexSegment,
  IsExactPath as IsExactJsonPath,
  IsExactSegment as IsExactJsonPathSegment,
  KeySegment as JsonPathKeySegment,
  Path as JsonPath,
  SegmentsOf as JsonPathSegments,
  SliceSegment as JsonPathSliceSegment,
  WildcardSegment as JsonPathWildcardSegment
} from "./json/path.js"
export type {
  JsonPathUsageError
} from "./json/errors.js"
export type {
  JsonConcatResult,
  JsonDeleteAtPath,
  JsonInsertAtPath,
  JsonKeysResult,
  JsonLengthResult,
  JsonLiteralInput,
  JsonPrimitive,
  JsonSetAtPath,
  JsonTextResult,
  JsonTypeName,
  JsonValue,
  JsonValueAtPath,
  NormalizeJsonLiteral
} from "./json/types.js"
export type {
  CoercionKind,
  CoercionKindOf
} from "./coercion-kind.js"
export type {
  CanCastDbType,
  CanCompareDbTypes,
  CanContainDbTypes
} from "./coercion-rules.js"
export type {
  ConflictClause,
  LockClause,
  QueryStatement,
  SetOperatorKind as SetOperator
} from "./query-ast.js"
export { union_query_capabilities } from "./query-requirements.js"

/**
 * Shared prototype for runtime expression values created by query helpers.
 *
 * These objects are intentionally minimal. They only need to support
 * `Pipeable.pipe(...)` plus the metadata stored under `Expression.TypeId`.
 */
const ExpressionProto = {
  pipe(this: unknown) {
    return pipeArguments(this, arguments)
  }
}

/**
 * Shared prototype for runtime plan values created by query helpers.
 *
 * Query plans behave like other Effect-style pipeable values so builders can be
 * chained through `.pipe(...)`.
 */
const PlanProto = {
  pipe(this: unknown) {
    return pipeArguments(this, arguments)
  }
}

/** Internal symbol used to preserve query-only phantom metadata through inference. */
const QueryTypeId: unique symbol = Symbol.for("effect-qb/Query/internal")

type InsertSourceState = "ready" | "missing"

/** Internal phantom state tracked on query plans. */
interface QueryState<
  Outstanding extends string,
  AvailableNames extends string,
  Grouped extends string,
  Assumptions extends PredicateFormula,
  Capabilities extends QueryCapability,
  Statement extends QueryAst.QueryStatement,
  Target,
  InsertState extends InsertSourceState
> {
  readonly required: Outstanding
  readonly availableNames: AvailableNames
  readonly grouped: Grouped
  readonly assumptions: Assumptions
  readonly capabilities: Capabilities
  readonly statement: Statement
  readonly target: Target
  readonly insertSource: InsertState
}

/** Source provenance attached to an expression. */
export type SourceOf<Value extends Expression.Any> = Value[typeof Expression.TypeId]["source"]
/** Effective SQL dialect carried by an expression. */
export type DialectOf<Value extends Expression.Any> = Value[typeof Expression.TypeId]["dialect"]
/** Source dependency map carried by an expression. */
export type DependenciesOf<Value extends Expression.Any> = Expression.DependenciesOf<Value>
/** Aggregation kind carried by an expression. */
export type AggregationOf<Value extends Expression.Any> = Value[typeof Expression.TypeId]["aggregation"]
type AstOf<Value extends Expression.Any> = Value extends { readonly [ExpressionAst.TypeId]: infer Ast extends ExpressionAst.Any } ? Ast : never

/**
 * Primitive values that can be lifted directly into constant SQL expressions.
 *
 * This is the explicit surface today. Later coercion helpers can accept these
 * primitives and normalize them through `literal(...)`.
 */
export type LiteralValue = string | number | boolean | null | Date

/** Runtime expression type produced by `literal(...)` for a primitive value. */
type LiteralExpression<Value extends LiteralValue> = Expression.Expression<
  Value,
  LiteralDbType<Value>,
  LiteralNullability<Value>,
  "postgres",
  "scalar",
  never
>

/**
 * Values accepted by scalar query operators.
 *
 * Raw primitives are automatically lifted into constant SQL expressions at the
 * operator boundary.
 */
export type ExpressionInput = Expression.Any | LiteralValue

/** Input accepted by numeric clauses such as `limit(...)` and `offset(...)`. */
export type NumericExpressionInput = Expression.Expression<
  number,
  Expression.DbType.Any,
  Expression.Nullability,
  string,
  "scalar",
  any,
  Expression.SourceDependencies,
  Expression.SourceNullabilityMode
> | number

/** Values accepted by mutation payload fields. */
export type MutationValueInput<Value> =
  | Value
  | Expression.Expression<Value, Expression.DbType.Any, Expression.Nullability, string, Expression.AggregationKind, any, any, any>

/** Maps a payload shape to values or expressions of the same runtime type. */
export type MutationInputOf<Shape> = {
  readonly [K in keyof Shape]: MutationValueInput<Shape[K]>
}

type Simplify<T> = { readonly [K in keyof T]: T[K] } & {}

/** Input accepted by boolean plan clauses such as `where(...)` and joins. */
export type PredicateInput = Expression.Expression<
  boolean,
  Expression.DbType.Any,
  Expression.Nullability,
  string,
  "scalar",
  any,
  Expression.SourceDependencies,
  Expression.SourceNullabilityMode
> | boolean

/** Input accepted by `having(...)`. */
export type HavingPredicateInput = Expression.Expression<
  boolean,
  Expression.DbType.Any,
  Expression.Nullability,
  string,
  "scalar" | "aggregate",
  any,
  Expression.SourceDependencies,
  Expression.SourceNullabilityMode
> | boolean

/** Input accepted by `GROUP BY`. */
export type GroupByInput = Expression.Expression<
  any,
  Expression.DbType.Any,
  Expression.Nullability,
  string,
  "scalar",
  any
>

/** Maps a literal runtime value to its SQL-level DB type descriptor. */
type LiteralDbType<Value extends LiteralValue> =
  Value extends string ? Expression.DbType.PgText :
    Value extends number ? Expression.DbType.PgNumeric :
      Value extends boolean ? Expression.DbType.PgBool :
        Value extends Date ? Expression.DbType.PgTimestamp :
          Expression.DbType.Base<"postgres", "null">

/** Maps a literal runtime value to its static nullability state. */
type LiteralNullability<Value extends LiteralValue> = Value extends null ? "always" : "never"
/** Converts a supported input into its canonical expression type. */
type AsExpression<Value extends ExpressionInput> = Value extends Expression.Any ? Value : LiteralExpression<Extract<Value, LiteralValue>>
/** Extracts provenance from an operator input after coercion. */
type SourceOfInput<Value extends ExpressionInput> = SourceOf<AsExpression<Value>>
/** Extracts dialect from an operator input after coercion. */
type DialectOfInput<Value extends ExpressionInput> = DialectOf<AsExpression<Value>>
/** Extracts dependencies from an operator input after coercion. */
type DependenciesOfInput<Value extends ExpressionInput> = DependenciesOf<AsExpression<Value>>
/** Extracts required sources from an operator input after coercion. */
type RequiredFromInput<Value extends ExpressionInput> = RequiredFromDependencies<DependenciesOfInput<Value>>
/** String-valued expressions accepted by text operators. */
export type StringExpressionInput = Expression.Expression<
  string | null,
  Expression.DbType.Any,
  Expression.Nullability,
  string,
  Expression.AggregationKind,
  any,
  Expression.SourceDependencies,
  Expression.SourceNullabilityMode
> | string
/** Converts a string operator input into its canonical expression type. */
type AsStringExpression<Value extends StringExpressionInput> = Value extends Expression.Any ? Value : LiteralExpression<Extract<Value, string>>
/** Extracts provenance from a string operator input after coercion. */
type SourceOfStringInput<Value extends StringExpressionInput> = SourceOf<AsStringExpression<Value>>
/** Extracts dialect from a string operator input after coercion. */
type DialectOfStringInput<Value extends StringExpressionInput> = DialectOf<AsStringExpression<Value>>
/** Extracts dependencies from a string operator input after coercion. */
type DependenciesOfStringInput<Value extends StringExpressionInput> = DependenciesOf<AsStringExpression<Value>>
/** Extracts intrinsic nullability from a string operator input after coercion. */
type NullabilityOfStringInput<Value extends StringExpressionInput> = Expression.NullabilityOf<AsStringExpression<Value>>

/** Extracts a required table name from expression provenance. */
type RequiredFromSource<Source> = Source extends { readonly tableName: infer Name extends string } ? Name : never
/** Extracts required table names from an expression dependency map. */
export type RequiredFromDependencies<Dependencies extends Expression.SourceDependencies> = Extract<keyof Dependencies, string>

type LiteralGroupingKey<Value> =
  Value extends string ? `string:${Value}` :
    Value extends number ? `number:${Value}` :
      Value extends boolean ? `boolean:${Value}` :
        Value extends null ? "null" :
          Value extends Date ? `date:${string}` :
            "unknown"

type JoinGroupingKeys<Keys extends readonly string[]> = Keys extends readonly []
  ? ""
  : Keys extends readonly [infer Head extends string]
    ? Head
    : Keys extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
      ? `${Head},${JoinGroupingKeys<Tail>}`
      : string

type JsonSegmentGroupingKey<Segment> =
  Segment extends JsonPath.KeySegment<infer Key extends string> ? `key:${Key}` :
    Segment extends JsonPath.IndexSegment<infer Index extends number> ? `index:${Index}` :
      Segment extends JsonPath.WildcardSegment ? "wildcard" :
        Segment extends JsonPath.SliceSegment<infer Start extends number | undefined, infer End extends number | undefined>
          ? `slice:${Start extends number ? Start : ""}:${End extends number ? End : ""}`
          : Segment extends JsonPath.DescendSegment
            ? "descend"
            : Segment extends string
              ? `key:${Segment}`
              : Segment extends number
                ? `index:${Segment}`
                : "unknown"

type JsonPathGroupingKey<Segments extends readonly any[]> = Segments extends readonly []
  ? ""
  : Segments extends readonly [infer Head]
    ? JsonSegmentGroupingKey<Head>
    : Segments extends readonly [infer Head, ...infer Tail extends readonly any[]]
      ? `${JsonSegmentGroupingKey<Head>},${JsonPathGroupingKey<Tail>}`
      : string

type JsonOpaquePathGroupingKey<Value> =
  Value extends JsonPath.Path<infer Segments extends readonly JsonPath.CanonicalSegment[]>
    ? `jsonpath:${JsonPathGroupingKey<Segments>}` :
  Value extends string ? `jsonpath:${Value}` :
    Value extends Expression.Any ? `jsonpath:${GroupingKeyOfExpression<Value>}` :
      "jsonpath:unknown"

type JsonEntryGroupingKey<Entry> =
  Entry extends { readonly key: infer Key extends string; readonly value: infer Value extends Expression.Any }
    ? `${Key}=>${GroupingKeyOfExpression<Value>}`
    : "entry:unknown"

type JsonEntriesGroupingKey<Entries extends readonly { readonly key: string; readonly value: Expression.Any }[]> = Entries extends readonly []
  ? ""
  : Entries extends readonly [infer Head]
    ? JsonEntryGroupingKey<Head>
    : Entries extends readonly [infer Head, ...infer Tail extends readonly { readonly key: string; readonly value: Expression.Any }[]]
      ? `${JsonEntryGroupingKey<Head>}|${JsonEntriesGroupingKey<Tail>}`
      : string

type BranchGroupingKeys<
  Branches extends readonly ExpressionAst.CaseBranchNode[]
> = Branches extends readonly []
  ? ""
  : Branches extends readonly [infer Head extends ExpressionAst.CaseBranchNode]
    ? `when:${GroupingKeyOfExpression<Head["when"]>}=>${GroupingKeyOfExpression<Head["then"]>}`
    : Branches extends readonly [
        infer Head extends ExpressionAst.CaseBranchNode,
        ...infer Tail extends readonly ExpressionAst.CaseBranchNode[]
      ]
      ? `when:${GroupingKeyOfExpression<Head["when"]>}=>${GroupingKeyOfExpression<Head["then"]>}|${BranchGroupingKeys<Tail>}`
      : string

type GroupingKeyOfAst<Ast extends ExpressionAst.Any> =
  Ast extends ExpressionAst.ColumnNode<infer TableName extends string, infer ColumnName extends string>
    ? `column:${TableName}.${ColumnName}`
    : Ast extends ExpressionAst.LiteralNode<infer Value>
      ? `literal:${LiteralGroupingKey<Value>}`
    : Ast extends ExpressionAst.ExcludedNode<infer ColumnName extends string>
      ? `excluded:${ColumnName}`
    : Ast extends ExpressionAst.CastNode<infer Value extends Expression.Any, infer Target extends Expression.DbType.Any>
      ? `cast(${GroupingKeyOfExpression<Value>} as ${Target["dialect"]}:${Target["kind"]})`
    : Ast extends ExpressionAst.UnaryNode<infer Kind extends ExpressionAst.UnaryKind, infer Value extends Expression.Any>
      ? `${Kind}(${GroupingKeyOfExpression<Value>})`
    : Ast extends ExpressionAst.BinaryNode<infer Kind extends ExpressionAst.BinaryKind, infer Left extends Expression.Any, infer Right extends Expression.Any>
      ? `${Kind}(${GroupingKeyOfExpression<Left>},${GroupingKeyOfExpression<Right>})`
      : Ast extends ExpressionAst.VariadicNode<infer Kind extends ExpressionAst.VariadicKind, infer Values extends readonly Expression.Any[]>
        ? `${Kind}(${JoinGroupingKeys<{
            readonly [K in keyof Values]: Values[K] extends Expression.Any ? GroupingKeyOfExpression<Values[K]> : never
          } & readonly string[]>})`
        : Ast extends JsonNode<infer Kind>
          ? Kind extends "jsonGet" | "jsonPath" | "jsonAccess" | "jsonTraverse" | "jsonGetText" | "jsonPathText" | "jsonAccessText" | "jsonTraverseText"
            ? `json(${Kind},${GroupingKeyOfExpression<Extract<Ast["value"] | Ast["base"] | Ast["left"], Expression.Any>>},${JsonPathGroupingKey<Extract<Ast["segments"] | Ast["path"], readonly any[]>>})`
            : Kind extends "jsonHasKey" | "jsonKeyExists" | "jsonHasAnyKeys" | "jsonHasAllKeys"
              ? `json(${Kind},${GroupingKeyOfExpression<Extract<Ast["value"] | Ast["base"] | Ast["left"], Expression.Any>>},${JoinGroupingKeys<Extract<Ast["keys"], readonly string[]> & readonly string[]>})`
              : Kind extends "jsonConcat" | "jsonMerge" | "jsonDelete" | "jsonDeletePath" | "jsonRemove" | "jsonSet" | "jsonInsert"
                ? `json(${Kind},${GroupingKeyOfExpression<Extract<Ast["left"] | Ast["base"] | Ast["value"], Expression.Any>>},${GroupingKeyOfExpression<Extract<Ast["right"] | Ast["newValue"] | Ast["insert"], Expression.Any>>},${JsonPathGroupingKey<Extract<Ast["segments"] | Ast["path"], readonly any[]>>})`
                : Kind extends "jsonPathExists" | "jsonPathMatch"
                  ? `json(${Kind},${GroupingKeyOfExpression<Extract<Ast["value"] | Ast["base"], Expression.Any>>},${JsonOpaquePathGroupingKey<Ast["query"] | Ast["path"]>})`
                  : Kind extends "jsonBuildObject"
                    ? `json(${Kind},${JsonEntriesGroupingKey<Extract<Ast["entries"], readonly { readonly key: string; readonly value: Expression.Any }[]>>})`
                    : Kind extends "jsonBuildArray"
                      ? `json(${Kind},${JoinGroupingKeys<{
                          readonly [K in keyof Extract<Ast["values"], readonly Expression.Any[]>]:
                            Extract<Ast["values"], readonly Expression.Any[]>[K] extends Expression.Any ? GroupingKeyOfExpression<Extract<Ast["values"], readonly Expression.Any[]>[K]> : never
                        } & readonly string[]>})`
                      : Kind extends "jsonToJson" | "jsonToJsonb" | "jsonTypeOf" | "jsonLength" | "jsonKeys" | "jsonStripNulls"
                        ? `json(${Kind},${GroupingKeyOfExpression<Extract<Ast["value"], Expression.Any>>})`
                    : never
        : Ast extends ExpressionAst.CaseNode<infer Branches extends readonly ExpressionAst.CaseBranchNode[], infer Else extends Expression.Any>
          ? `case(${BranchGroupingKeys<Branches>};else:${GroupingKeyOfExpression<Else>})`
          : Ast extends ExpressionAst.ExistsNode
            ? "exists(subquery)"
          : never

/** Canonical grouping identity for an expression AST. */
export type GroupingKeyOfExpression<Value extends Expression.Any> = GroupingKeyOfAst<AstOf<Value>>

/**
 * Recursive selection tree accepted by `select(...)`.
 *
 * A selection can be either:
 * - a leaf SQL expression
 * - a nested object whose leaves are expressions
 */
export type SelectionShape =
  | Expression.Any
  | {
      readonly [key: string]: SelectionShape
    }

/** Walks a selection tree and unions the table names referenced by its leaves. */
export type ExtractRequired<Selection> = Selection extends Expression.Any
  ? RequiredFromDependencies<DependenciesOf<Selection>>
  : Selection extends Record<string, any>
    ? {
        [K in keyof Selection]: ExtractRequired<Selection[K]>
      }[keyof Selection]
    : never

/** Walks a selection tree and unions the dialects referenced by its leaves. */
export type ExtractDialect<Selection> = Selection extends Expression.Any
  ? DialectOf<Selection>
  : Selection extends Record<string, any>
    ? {
        [K in keyof Selection]: ExtractDialect<Selection[K]>
      }[keyof Selection]
    : never

/**
 * Minimal table-like shape required by `from(...)` and joins.
 *
 * The query layer only needs the plan metadata and the static table name. It
 * deliberately avoids depending on the full table-definition surface.
 */
export type TableLike<Name extends string = string, Dialect extends string = string> = Plan.Plan<any, any, Record<string, Plan.AnySource>, Dialect> & {
  readonly [Table.TypeId]: {
    readonly name: Name
    readonly baseName: string
    readonly schemaName?: string
  }
}

/** Concrete schema table accepted by DDL builders. */
export type SchemaTableLike =
  | Table.TableDefinition<any, any, any, "schema", any>
  | Table.TableClassStatic<any, any, any, any>

/**
 * Wrapper returned by `as(subquery, alias)` for derived-table composition.
 *
 * The derived source exposes the subquery output under the new alias and can
 * be passed to `from(...)` or join builders.
 */
export type DerivedSource<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Alias extends string
> = DerivedSelectionOf<SelectionOfPlan<PlanValue>, Alias> & {
  readonly kind: "derived"
  readonly name: Alias
  readonly baseName: Alias
  readonly dialect: PlanDialectOf<PlanValue>
  readonly plan: CompletePlan<PlanValue>
  readonly required?: never
  readonly columns: DerivedSelectionOf<SelectionOfPlan<PlanValue>, Alias>
}

/** Wrapper returned by `with(subquery, alias)` for common table expression composition. */
export type CteSource<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Alias extends string
> = DerivedSelectionOf<SelectionOfPlan<PlanValue>, Alias> & {
  readonly kind: "cte"
  readonly name: Alias
  readonly baseName: Alias
  readonly dialect: PlanDialectOf<PlanValue>
  readonly plan: CompletePlan<PlanValue>
  readonly recursive?: boolean
  readonly columns: DerivedSelectionOf<SelectionOfPlan<PlanValue>, Alias>
}

/** Wrapper returned by `lateral(subquery, alias)` for correlated derived sources. */
export type LateralSource<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Alias extends string
> = DerivedSelectionOf<SelectionOfPlan<PlanValue>, Alias> & {
  readonly kind: "lateral"
  readonly name: Alias
  readonly baseName: Alias
  readonly dialect: PlanDialectOf<PlanValue>
  readonly plan: PlanValue
  readonly required: RequiredOfPlan<PlanValue>
  readonly columns: DerivedSelectionOf<SelectionOfPlan<PlanValue>, Alias>
}

type ValuesRowInput = Record<string, ExpressionInput>

/** Anonymous `values(...)` input that must be aliased through `as(...)` before use as a source. */
export type ValuesInput<
  Rows extends readonly [ValuesRowInput, ...ValuesRowInput[]],
  Selection extends SelectionShape,
  Dialect extends string
> = Pipeable & {
  readonly kind: "values"
  readonly dialect: Dialect
  readonly rows: readonly [Record<string, Expression.Any>, ...Record<string, Expression.Any>[]]
  readonly selection: Selection
}

/** Wrapper returned by `as(values(rows), alias)` for standalone row sources and insert sources. */
export type ValuesSource<
  Rows extends readonly [ValuesRowInput, ...ValuesRowInput[]],
  Selection extends SelectionShape,
  Alias extends string,
  Dialect extends string
> = DerivedSelectionOf<Selection, Alias> & {
  readonly kind: "values"
  readonly name: Alias
  readonly baseName: Alias
  readonly dialect: Dialect
  readonly rows: readonly [Record<string, Expression.Any>, ...Record<string, Expression.Any>[]]
  readonly columns: DerivedSelectionOf<Selection, Alias>
}

/** Broad structural shape for anonymous `values(...)` inputs before aliasing. */
export type AnyValuesInput = {
  readonly kind: "values"
  readonly dialect: string
  readonly rows: readonly Record<string, Expression.Any>[]
  readonly selection: Record<string, Expression.Any>
}

/** Broad structural shape for `values(...)` sources when used as composable inputs. */
export type AnyValuesSource = {
  readonly kind: "values"
  readonly name: string
  readonly baseName: string
  readonly dialect: string
  readonly rows: readonly Record<string, Expression.Any>[]
  readonly columns: Record<string, Expression.Any>
}

/** Wrapper returned by `unnest(columns, alias)` for standalone array sources. */
export type UnnestSource<
  Selection extends SelectionShape,
  Alias extends string,
  Dialect extends string
> = DerivedSelectionOf<Selection, Alias> & {
  readonly kind: "unnest"
  readonly name: Alias
  readonly baseName: Alias
  readonly dialect: Dialect
  readonly values: Readonly<Record<string, readonly ExpressionInput[]>>
  readonly arrays: Readonly<Record<string, readonly Expression.Any[]>>
  readonly columns: DerivedSelectionOf<Selection, Alias>
}

/** Wrapper returned by `generateSeries(...)` and similar table functions. */
export type TableFunctionSource<
  Selection extends SelectionShape,
  Alias extends string,
  Dialect extends string,
  FunctionName extends string = string
> = DerivedSelectionOf<Selection, Alias> & {
  readonly kind: "tableFunction"
  readonly name: Alias
  readonly baseName: Alias
  readonly dialect: Dialect
  readonly functionName: FunctionName
  readonly args: readonly Expression.Any[]
  readonly columns: DerivedSelectionOf<Selection, Alias>
}

/** Accepts either a physical table or a derived table source. */
type DerivedSourceShape = {
  readonly kind: "derived"
  readonly name: string
  readonly baseName: string
  readonly dialect: string
  readonly plan: QueryPlan<any, any, any, any, any, any, any, any, any, any>
  readonly columns: Record<string, unknown>
}

type CteSourceShape = {
  readonly kind: "cte"
  readonly name: string
  readonly baseName: string
  readonly dialect: string
  readonly plan: QueryPlan<any, any, any, any, any, any, any, any, any, any>
  readonly recursive?: boolean
  readonly required?: never
  readonly columns: Record<string, unknown>
}

type LateralSourceShape = {
  readonly kind: "lateral"
  readonly name: string
  readonly baseName: string
  readonly dialect: string
  readonly plan: QueryPlan<any, any, any, any, any, any, any, any, any, any>
  readonly required: string
  readonly columns: Record<string, unknown>
}

type ValuesSourceShape = {
  readonly kind: "values"
  readonly name: string
  readonly baseName: string
  readonly dialect: string
  readonly rows: readonly Record<string, Expression.Any>[]
  readonly columns: Record<string, unknown>
}

type UnnestSourceShape = {
  readonly kind: "unnest"
  readonly name: string
  readonly baseName: string
  readonly dialect: string
  readonly values: Readonly<Record<string, readonly ExpressionInput[]>>
  readonly arrays: Readonly<Record<string, readonly Expression.Any[]>>
  readonly columns: Record<string, unknown>
}

/** Broad structural shape for `unnest(...)` sources when used as composable inputs. */
export type AnyUnnestSource = {
  readonly kind: "unnest"
  readonly name: string
  readonly baseName: string
  readonly dialect: string
  readonly values: Readonly<Record<string, readonly ExpressionInput[]>>
  readonly arrays: Readonly<Record<string, readonly Expression.Any[]>>
  readonly columns: Record<string, Expression.Any>
}

type TableFunctionSourceShape = {
  readonly kind: "tableFunction"
  readonly name: string
  readonly baseName: string
  readonly dialect: string
  readonly functionName: string
  readonly args: readonly Expression.Any[]
  readonly columns: Record<string, unknown>
}

type DerivedSourceAliasError = DerivedSourceRequiredError<QueryPlan<any, any, any, any, any, any, any, any, any, any>>

export type SourceLike =
  | TableLike<any, any>
  | DerivedSourceShape
  | CteSourceShape
  | LateralSourceShape
  | ValuesSourceShape
  | UnnestSourceShape
  | TableFunctionSourceShape
  | DerivedSourceAliasError

/** Concrete table sources that can be targeted by mutation statements. */
export type MutationTargetLike = Table.AnyTable
export type MutationTargetTuple = readonly [MutationTargetLike, MutationTargetLike, ...MutationTargetLike[]]
export type MutationTargetInput = MutationTargetLike | MutationTargetTuple

type JsonMutationDbKindError<
  ColumnName extends string,
  ExpectedKind extends string,
  ReceivedKind extends string
> = {
  readonly __effect_qb_error__: "effect-qb: incompatible postgres json mutation value"
  readonly __effect_qb_column__: ColumnName
  readonly __effect_qb_reason__: "postgres json/jsonb kinds do not match"
  readonly __effect_qb_expected_json_kind__: ExpectedKind
  readonly __effect_qb_received_json_kind__: ReceivedKind
  readonly __effect_qb_hint__: "Use postgres.Function.json for json columns and postgres.Function.jsonb for jsonb columns"
}

type JsonMutationShapeError<
  ColumnName extends string,
  Expected,
  Received
> = {
  readonly __effect_qb_error__: "effect-qb: incompatible postgres json mutation value"
  readonly __effect_qb_column__: ColumnName
  readonly __effect_qb_reason__: "json value is not assignable to the target column schema"
  readonly __effect_qb_json_issues__: JsonShapeIssues<Expected, Received>
  readonly __effect_qb_hint__: "Inspect __effect_qb_json_issues__ or the __effect_qb_json_issue__... sentinel keys to find the failing nested paths"
} & JsonIssueSentinels<Expected, Received>

type MutationValueShapeError<
  ColumnName extends string,
  Expected,
  Received
> = {
  readonly __effect_qb_error__: "effect-qb: incompatible mutation value"
  readonly __effect_qb_column__: ColumnName
  readonly __effect_qb_reason__: "value is not assignable to the target column schema"
  readonly __effect_qb_expected_type__: Expected
  readonly __effect_qb_received_type__: Received
}

type MutationUnknownColumnError<ColumnName extends string> = {
  readonly __effect_qb_error__: "effect-qb: unknown mutation column"
  readonly __effect_qb_column__: ColumnName
  readonly __effect_qb_hint__: "Use only columns that exist on the target table"
}

type MutationRequiredKeys<Shape> = Extract<{
  [K in keyof Shape]-?: {} extends Pick<Shape, K> ? never : K
}[keyof Shape], string>

type MutationExtraKeys<TargetShape, SourceShape> = Exclude<Extract<keyof SourceShape, string>, Extract<keyof TargetShape, string>>

type MutationMissingKeys<TargetShape, SourceShape> = Exclude<MutationRequiredKeys<TargetShape>, Extract<keyof SourceShape, string>>

type JsonPathDisplay<Path extends string> = Path extends "" ? "(root)" : Path

type JsonObjectKeyPath<Path extends string, Key extends string> = Path extends ""
  ? Key
  : `${Path}.${Key}`

type JsonArrayPath<Path extends string> = Path extends ""
  ? "[number]"
  : `${Path}[number]`

type JsonIssueKeyPath<Path extends string> = Path extends ""
  ? "root"
  : Path

type JsonShapeIssue<
  Path extends string,
  Kind extends string,
  Expected,
  Received
> = {
  readonly path: JsonPathDisplay<Path>
  readonly issue: Kind
  readonly expected: Expected
  readonly received: Received
}

type JsonSharedKeys<Expected, Received> = Extract<Extract<keyof Expected, keyof Received>, string>

type JsonIssueSentinelKeys<Issues> = Issues extends {
  readonly path: infer Path extends string
  readonly issue: infer Kind extends string
}
  ? `__effect_qb_json_issue__${JsonIssueKeyPath<Path>}__${Kind}`
  : never

type JsonIssueSentinels<
  Expected,
  Received
> = {
  readonly [K in JsonIssueSentinelKeys<JsonShapeIssues<Expected, Received>>]: true
}

type JsonObjectShapeIssues<
  Expected extends object,
  Received extends object,
  Path extends string
> =
  | {
      readonly [K in MutationMissingKeys<Expected, Received>]:
        JsonShapeIssue<JsonObjectKeyPath<Path, K>, "missing_required_property", Expected[K], undefined>
    }[MutationMissingKeys<Expected, Received>]
  | {
      readonly [K in JsonSharedKeys<Expected, Received>]:
        JsonShapeIssues<Expected[K], Received[K], JsonObjectKeyPath<Path, K>>
    }[JsonSharedKeys<Expected, Received>]

type JsonShapeIssues<
  Expected,
  Received,
  Path extends string = ""
> = [Received] extends [Expected]
  ? never
  : [Expected] extends [readonly (infer ExpectedElement)[]]
    ? [Received] extends [readonly (infer ReceivedElement)[]]
      ? JsonShapeIssues<ExpectedElement, ReceivedElement, JsonArrayPath<Path>>
      : JsonShapeIssue<Path, "type_mismatch", Expected, Received>
    : [Expected] extends [object]
      ? [Expected] extends [Function]
        ? JsonShapeIssue<Path, "type_mismatch", Expected, Received>
        : [Received] extends [object]
          ? [Received] extends [Function]
            ? JsonShapeIssue<Path, "type_mismatch", Expected, Received>
            : JsonObjectShapeIssues<Expected & object, Received & object, Path> extends infer Issues
              ? [Issues] extends [never]
                ? JsonShapeIssue<Path, "type_mismatch", Expected, Received>
                : Issues
              : never
          : JsonShapeIssue<Path, "type_mismatch", Expected, Received>
      : JsonShapeIssue<Path, "type_mismatch", Expected, Received>

type MutationAcceptedInput<Column> =
  Column extends Expression.Expression<infer Runtime, any, any, any, any, any, any, any>
    ? MutationValueInput<Runtime>
    : never

type MutationValueCompatibilityIssue<
  Column,
  Value,
  ColumnName extends string
> = Column extends Expression.Expression<any, infer ColumnDb extends Expression.DbType.Any, any, any, any, any, any, any>
  ? ColumnDb extends Expression.DbType.Json<"postgres", infer ExpectedKind>
    ? Value extends Expression.Expression<any, infer ValueDb extends Expression.DbType.Any, any, any, any, any, any, any>
      ? ValueDb extends Expression.DbType.Json<"postgres", infer ReceivedKind>
        ? [ExpectedKind] extends [ReceivedKind]
          ? [ReceivedKind] extends [ExpectedKind]
            ? Value extends Expression.Expression<infer ReceivedRuntime, any, any, any, any, any, any, any>
              ? Column extends Expression.Expression<infer ExpectedRuntime, any, any, any, any, any, any, any>
                ? [ReceivedRuntime] extends [ExpectedRuntime]
                  ? never
                  : JsonMutationShapeError<ColumnName, ExpectedRuntime, ReceivedRuntime>
                : never
              : never
            : JsonMutationDbKindError<ColumnName, ExpectedKind, ReceivedKind>
          : JsonMutationDbKindError<ColumnName, ExpectedKind, ReceivedKind>
        : Value extends Expression.Expression<infer ReceivedRuntime, any, any, any, any, any, any, any>
          ? Column extends Expression.Expression<infer ExpectedRuntime, any, any, any, any, any, any, any>
            ? [ReceivedRuntime] extends [ExpectedRuntime]
              ? never
              : JsonMutationShapeError<ColumnName, ExpectedRuntime, ReceivedRuntime>
            : never
          : Column extends Expression.Expression<infer ExpectedRuntime, any, any, any, any, any, any, any>
            ? [Value] extends [ExpectedRuntime]
              ? never
              : JsonMutationShapeError<ColumnName, ExpectedRuntime, Value>
            : never
      : Column extends Expression.Expression<infer ExpectedRuntime, any, any, any, any, any, any, any>
        ? [Value] extends [ExpectedRuntime]
          ? never
          : JsonMutationShapeError<ColumnName, ExpectedRuntime, Value>
        : never
    : Value extends Expression.Expression<infer ReceivedRuntime, any, any, any, any, any, any, any>
      ? Column extends Expression.Expression<infer ExpectedRuntime, any, any, any, any, any, any, any>
        ? [ReceivedRuntime] extends [ExpectedRuntime]
          ? never
          : MutationValueShapeError<ColumnName, ExpectedRuntime, ReceivedRuntime>
        : never
      : Column extends Expression.Expression<infer ExpectedRuntime, any, any, any, any, any, any, any>
        ? [Value] extends [ExpectedRuntime]
          ? never
          : MutationValueShapeError<ColumnName, ExpectedRuntime, Value>
        : never
  : unknown

type MutationExpectedValue<
  Column,
  Value,
  ColumnName extends string
> = [MutationValueCompatibilityIssue<Column, Value, ColumnName>] extends [never]
  ? MutationAcceptedInput<Column>
  : MutationValueCompatibilityIssue<Column, Value, ColumnName>

type MutationShapeOf<
  Statement extends "insert" | "update",
  Target extends MutationTargetLike
> = Statement extends "insert" ? Table.InsertOf<Target> : Table.UpdateOf<Target>

type MutationColumnAt<
  Target extends MutationTargetLike,
  Key extends string
> = Target extends {
  readonly [Table.TypeId]: {
    readonly fields: Record<Key, infer Column>
  }
}
  ? Column
  : never

type MutationValueShape<
  Shape,
  Target extends MutationTargetLike,
  Values extends Record<string, unknown>
> = {
  readonly [K in Extract<keyof Values, string>]:
    K extends Extract<keyof Shape, string>
      ? MutationExpectedValue<MutationColumnAt<Target, K>, Values[K], K>
      : MutationUnknownColumnError<K>
}

type MutationKeyShape<Shape> = {
  readonly [K in keyof Shape]: unknown
}

export type MutationValuesInput<
  Statement extends "insert" | "update",
  Target extends MutationTargetLike,
  Values extends Record<string, unknown>,
  Shape = MutationShapeOf<Statement, Target>
> = Simplify<
  Values &
  MutationKeyShape<Shape> &
  MutationValueShape<Shape, Target, Values>
>

/** Extracts a source name from either a table or a derived source. */
export type SourceNameOf<Source extends SourceLike> =
  Source extends TableLike<infer Name, any> ? Name :
    Source extends { readonly kind: "derived"; readonly name: infer Alias extends string } ? Alias :
      Source extends { readonly kind: "cte"; readonly name: infer Alias extends string } ? Alias :
        Source extends { readonly kind: "lateral"; readonly name: infer Alias extends string } ? Alias :
          Source extends { readonly kind: "values"; readonly name: infer Alias extends string } ? Alias :
            Source extends { readonly kind: "unnest"; readonly name: infer Alias extends string } ? Alias :
              Source extends { readonly kind: "tableFunction"; readonly name: infer Alias extends string } ? Alias :
      never

type MutationTargetByName<
  Targets extends MutationTargetTuple,
  Name extends string
> = Extract<Targets[number], { readonly [Table.TypeId]: { readonly name: Name } }>

export type MutationTargetNamesOf<Target extends MutationTargetInput> =
  Target extends MutationTargetLike
    ? SourceNameOf<Target>
    : Target extends MutationTargetTuple
      ? SourceNameOf<Target[number]>
      : never

export type UpdateInputOfTarget<Target extends MutationTargetInput> =
  Target extends MutationTargetLike
    ? MutationInputOf<Table.UpdateOf<Target>>
    : Target extends MutationTargetTuple
      ? Simplify<{
          readonly [K in MutationTargetNamesOf<Target>]?: MutationInputOf<Table.UpdateOf<MutationTargetByName<Target, K>>>
        }>
      : never

/** Extracts the effective dialect from a source. */
export type SourceDialectOf<Source extends SourceLike> =
  Source extends TableLike<any, infer Dialect> ? Dialect :
    Source extends { readonly kind: "derived"; readonly plan: infer PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any> } ? PlanDialectOf<PlanValue> :
      Source extends { readonly kind: "cte"; readonly plan: infer PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any> } ? PlanDialectOf<PlanValue> :
        Source extends { readonly kind: "lateral"; readonly plan: infer PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any> } ? PlanDialectOf<PlanValue> :
          Source extends { readonly dialect: infer Dialect extends string } ? Dialect :
      never

/** Extracts the base table name from a source. */
export type SourceBaseNameOf<Source extends SourceLike> =
  Source extends TableLike<any, any> ? Source[typeof Table.TypeId]["baseName"] :
    Source extends { readonly kind: "derived"; readonly baseName: infer BaseName extends string } ? BaseName :
      Source extends { readonly kind: "cte"; readonly baseName: infer BaseName extends string } ? BaseName :
        Source extends { readonly kind: "lateral"; readonly baseName: infer BaseName extends string } ? BaseName :
          Source extends { readonly baseName: infer BaseName extends string } ? BaseName :
      never

/** Extracts the outer-scope requirements carried by a source. */
export type SourceRequiredOf<Source extends SourceLike> =
  Source extends TableLike<any, any> ? never :
    Source extends { readonly kind: "derived" } ? never :
      Source extends { readonly kind: "cte" } ? never :
        Source extends { readonly kind: "lateral"; readonly required: infer Required extends string } ? Required :
          never

/** Helper type used when a correlated source is used before its outer dependencies are in scope. */
export type SourceRequirementError<
  Source extends SourceLike
> = Source & {
  readonly __effect_qb_error__: "effect-qb: correlated source requires outer-scope tables to be in scope first"
  readonly __effect_qb_required_sources__: SourceRequiredOf<Source>
  readonly __effect_qb_hint__: "Join the outer tables first, then wrap the correlated plan in lateral(...)"
}

/** Helper type used when a raw plan is passed where `as(...)` is required. */
export type DerivedSourceRequiredError<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
> = PlanValue & {
  readonly __effect_qb_error__: "effect-qb: subqueries must be aliased before they can be used as a source"
  readonly __effect_qb_hint__: "Wrap the nested plan in as(subquery, alias) before passing it to from(...) or a join"
}

type JoinPath<Segments extends readonly string[]> = Segments extends readonly []
  ? ""
  : Segments extends readonly [infer Head extends string]
    ? Head
    : Segments extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
      ? `${Head}__${JoinPath<Tail>}`
      : string

type DerivedLeafExpression<
  Value extends Expression.Any,
  Alias extends string,
  ColumnName extends string
> = Expression.Expression<
  Expression.RuntimeOf<Value>,
  Expression.DbTypeOf<Value>,
  Expression.NullabilityOf<Value>,
  DialectOf<Value>,
  "scalar",
  Expression.ColumnSource<Alias, ColumnName, Alias>,
  Record<Alias, true>,
  "propagate"
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.ColumnNode<Alias, ColumnName>
}

/** Rebinds a nested selection tree to a derived-table alias. */
export type DerivedSelectionOf<
  Selection,
  Alias extends string,
  Path extends readonly string[] = []
> = Selection extends Expression.Any
  ? DerivedLeafExpression<Selection, Alias, JoinPath<Path>>
  : Selection extends Record<string, any>
    ? {
        readonly [K in keyof Selection]: DerivedSelectionOf<Selection[K], Alias, [...Path, Extract<K, string>]>
      }
    : never

/** Extracts the static SQL table name from a table-like value. */
export type TableNameOf<T extends TableLike> = T[typeof Table.TypeId]["name"]
/** Extracts the effective dialect from a table-like value. */
export type TableDialectOf<T extends TableLike> = T[typeof Plan.TypeId]["dialect"]
/** Names of sources already available to a plan. */
type AvailableNames<Available extends Record<string, Plan.AnySource>> = Extract<keyof Available, string>
/** Availability mode of a named source within the current plan scope. */
type SourceModeOf<
  Available extends Record<string, Plan.AnySource>,
  Name extends string
> = Name extends keyof Available ? Available[Name]["mode"] : never
type TrueAssumptions = TrueFormula

/** Extracts the selection carried by a query plan. */
export type SelectionOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  PlanValue[typeof Plan.TypeId]["selection"]
/** Extracts the public required-source state carried by a query plan. */
export type RequiredOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  PlanValue[typeof Plan.TypeId]["required"]
/** Extracts the available-source scope carried by a query plan. */
export type AvailableOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  PlanValue[typeof Plan.TypeId]["available"]
/** Extracts the effective dialect carried by a query plan. */
export type PlanDialectOf<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  PlanValue[typeof Plan.TypeId]["dialect"]
/** Extracts the grouped-source phantom carried by a query plan. */
export type GroupedOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<any, any, any, any, infer Grouped, any, any, any, any, any> ? Grouped : never
/** Extracts the available-name phantom carried by a query plan. */
export type ScopedNamesOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<any, any, any, any, any, infer ScopedNames, any, any, any, any> ? ScopedNames : never
/** Extracts the outstanding-required-source phantom carried by a query plan. */
export type OutstandingOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<any, any, any, any, any, any, infer Outstanding, any, any, any> ? Outstanding : never
export type AssumptionsOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, infer Assumptions, any, any> ? Assumptions : TrueAssumptions
export type CapabilitiesOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, infer Capabilities, any> ? Capabilities : never
/** Extracts capabilities contributed by a source wrapper. */
export type SourceCapabilitiesOf<Source extends SourceLike> =
  Source extends TableLike<any, any> ? never :
    Source extends { readonly kind: "derived"; readonly plan: infer PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any> } ? CapabilitiesOfPlan<PlanValue> :
      Source extends { readonly kind: "cte"; readonly plan: infer PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any> } ? CapabilitiesOfPlan<PlanValue> :
        Source extends { readonly kind: "lateral"; readonly plan: infer PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any> } ? CapabilitiesOfPlan<PlanValue> :
          never
/** Extracts the statement kind carried by a query plan. */
export type StatementOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, infer Statement> ? Statement : never
/** Extracts the mutation target phantom carried by a query plan. */
export type MutationTargetOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any, infer Target> ? Target : never
/** Extracts whether an insert plan still needs a source attached. */
export type InsertSourceStateOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any, any, infer InsertState> ? InsertState : "ready"

type PresenceWitnessKeysOfSelection<Selection> = Selection extends Expression.Any
  ? AstOf<Selection> extends ExpressionAst.ColumnNode<any, any>
    ? Expression.NullabilityOf<Selection> extends "never"
      ? ColumnKeyOfExpression<Selection>
      : never
    : never
  : Selection extends Record<string, any>
    ? {
        readonly [K in keyof Selection]: PresenceWitnessKeysOfSelection<Selection[K]>
      }[keyof Selection]
    : never

export type PresenceWitnessKeysOfSource<Source extends SourceLike> =
  Source extends TableLike<any, any>
    ? PresenceWitnessKeysOfSelection<Source[typeof Plan.TypeId]["selection"]>
    : Source extends { readonly columns: infer Columns }
      ? PresenceWitnessKeysOfSelection<Columns>
      : never

/**
 * Adds a single source entry to the set of available sources.
 *
 * This is used by `from(...)` and the join builders.
 */
export type AddAvailable<
  Available extends Record<string, Plan.AnySource>,
  Name extends string,
  Mode extends Plan.SourceMode = "required",
  PresentFormula extends PredicateFormula = TrueFormula,
  PresenceWitness extends string = never
> = Available & Record<Name, Plan.Source<Name, Mode, PresentFormula, PresenceWitness>>

export type AddAvailableMany<
  Available extends Record<string, Plan.AnySource>,
  Names extends string,
  Mode extends Plan.SourceMode = "required",
  PresentFormula extends PredicateFormula = TrueFormula,
  PresenceWitness extends string = never
> = Available & {
  readonly [K in Names]: Plan.Source<K, Mode, PresentFormula, PresenceWitness>
}

/** Join mode projected into the plan's source-scope mode lattice. */
export type JoinSourceMode<Kind extends QueryAst.JoinKind> = Kind extends "left" | "full"
  ? "optional"
  : "required"

type DemoteAllAvailable<
  Available extends Record<string, Plan.AnySource>
> = {
  readonly [K in keyof Available]: Available[K] extends Plan.Source<
    infer Name extends string,
    any,
    infer PresentFormula extends PredicateFormula,
    infer PresenceWitness extends string
  >
    ? Plan.Source<Name, "optional", PresentFormula, PresenceWitness>
    : never
}

export type ExistingAvailableAfterJoin<
  Available extends Record<string, Plan.AnySource>,
  Kind extends QueryAst.JoinKind
> = Kind extends "right" | "full"
  ? DemoteAllAvailable<Available>
  : Available

export type AvailableAfterJoin<
  Available extends Record<string, Plan.AnySource>,
  JoinedName extends string,
  Kind extends QueryAst.JoinKind,
  PresentFormula extends PredicateFormula = TrueFormula,
  PresenceWitness extends string = never
> = AddAvailable<
  ExistingAvailableAfterJoin<Available, Kind>,
  JoinedName,
  JoinSourceMode<Kind>,
  PresentFormula,
  PresenceWitness
>

/**
 * Computes the next `required` set after introducing an additional expression.
 *
 * Any sources already present in `available` are considered satisfied.
 */
export type AddExpressionRequired<
  Required,
  Available extends Record<string, Plan.AnySource>,
  Value extends ExpressionInput
> = Exclude<Required | RequiredFromInput<Value>, AvailableNames<Available>>

/**
 * Computes the next `required` set after a join is applied.
 *
 * The joined table becomes available immediately, so references to it are
 * removed from the outstanding requirement set.
 */
export type AddJoinRequired<
  Required,
  Available extends Record<string, Plan.AnySource>,
  JoinedName extends string,
  Predicate extends PredicateInput | never,
  Kind extends QueryAst.JoinKind = "inner"
> = Exclude<
  Required | (Predicate extends never ? never : RequiredFromInput<Predicate>),
  AvailableNames<AvailableAfterJoin<Available, JoinedName, Kind>>
>

/** Merges two aggregation kinds through a derived expression. */
export type MergeAggregation<
  Left extends Expression.AggregationKind,
  Right extends Expression.AggregationKind
> = Left extends "window"
  ? "window"
  : Right extends "window"
    ? "window"
    : Left extends "aggregate"
      ? "aggregate"
      : Right extends "aggregate"
        ? "aggregate"
        : "scalar"

/** Folds aggregation kinds across a tuple of expressions. */
type MergeAggregationTuple<
  Values extends readonly Expression.Any[],
  Current extends Expression.AggregationKind = "scalar"
> = Values extends readonly [infer Head extends Expression.Any, ...infer Tail extends readonly Expression.Any[]]
  ? MergeAggregationTuple<Tail, MergeAggregation<Current, AggregationOf<Head>>>
  : Current

/** Merges two nullability states for null-propagating scalar operators. */
type MergeNullability<
  Left extends Expression.Nullability,
  Right extends Expression.Nullability
> = Left extends "always"
  ? "always"
  : Right extends "always"
    ? "always"
    : Left extends "maybe"
      ? "maybe"
      : Right extends "maybe"
        ? "maybe"
        : "never"

/** Folds nullability across a tuple for null-propagating scalar operators. */
export type MergeNullabilityTuple<
  Values extends readonly Expression.Any[],
  Current extends Expression.Nullability = "never"
> = Values extends readonly [infer Head extends Expression.Any, ...infer Tail extends readonly Expression.Any[]]
  ? MergeNullabilityTuple<Tail, MergeNullability<Current, Expression.NullabilityOf<Head>>>
  : Current

/** Dialect union across a tuple of expressions. */
export type TupleDialect<
  Values extends readonly Expression.Any[]
> = Values[number] extends never ? never : DialectOf<Values[number]>

/** Source union across a tuple of expressions. */
export type TupleSource<
  Values extends readonly Expression.Any[]
> = Values[number] extends never ? never : SourceOf<Values[number]>

/** Converts a union into an intersection. */
type UnionToIntersection<Union> = (
  Union extends any ? (value: Union) => void : never
) extends (value: infer Intersection) => void ? Intersection : never

/** Dependency-map intersection suitable for provenance unions across a tuple. */
export type TupleDependencies<
  Values extends readonly Expression.Any[]
> = DependencyRecord<Values[number] extends never ? never : Extract<keyof DependenciesOf<Values[number]>, string>>

/** Builds a canonical dependency map from a string union of table names. */
export type DependencyRecord<Keys extends string> = [Keys] extends [never] ? {} : Record<Keys, true>

/** Grouped expression identities carried by a tuple of scalar expressions. */
export type GroupedKeysFromValues<
  Values extends readonly Expression.Any[]
> = Values[number] extends never ? never : {
  [K in keyof Values]: Values[K] extends Expression.Any ? GroupingKeyOfExpression<Values[K]> : never
}[number]

/** Whether a selection contains any aggregate expressions. */
type SelectionHasAggregate<Selection> = Selection extends Expression.Any
  ? AggregationOf<Selection> extends "aggregate" ? true : false
  : Selection extends Record<string, any>
    ? Extract<{
        [K in keyof Selection]: SelectionHasAggregate<Selection[K]>
      }[keyof Selection], true> extends never ? false : true
    : false

/** Whether a selection is valid for a specific grouped-column set. */
type IsGroupedSelectionValid<
  Selection,
  Grouped extends string
> = Selection extends Expression.Any
  ? AggregationOf<Selection> extends "aggregate"
    ? true
    : AggregationOf<Selection> extends "window"
      ? false
      : RequiredFromDependencies<DependenciesOf<Selection>> extends never
        ? true
        : [GroupingKeyOfExpression<Selection>] extends [Grouped] ? true : false
  : Selection extends Record<string, any>
    ? Extract<{
        [K in keyof Selection]: IsGroupedSelectionValid<Selection[K], Grouped> extends true ? never : true
      }[keyof Selection], true> extends never ? true : false
    : false

/** Whether a selection is aggregation-safe for the current grouping state. */
type IsAggregationCompatibleSelection<
  Selection,
  Grouped extends string
> = SelectionHasAggregate<Selection> extends true
  ? IsGroupedSelectionValid<Selection, Grouped>
  : [Grouped] extends [never]
    ? true
    : IsGroupedSelectionValid<Selection, Grouped>

type MergeNullabilityStates<
  Left extends Expression.Nullability,
  Right extends Expression.Nullability
> = Left extends "always"
  ? "always"
  : Right extends "always"
    ? "always"
    : Left extends "maybe"
      ? "maybe"
      : Right extends "maybe"
        ? "maybe"
        : "never"

type FoldEffectiveNullability<
  Values extends readonly Expression.Any[],
  Available extends Record<string, Plan.AnySource>,
  Assumptions extends PredicateFormula
> = Extract<{
  [K in keyof Values]: Values[K] extends Expression.Any ? EffectiveNullability<Values[K], Available, Assumptions> : never
}[number], "always"> extends never
  ? Extract<{
      [K in keyof Values]: Values[K] extends Expression.Any ? EffectiveNullability<Values[K], Available, Assumptions> : never
    }[number], "maybe"> extends never
    ? "never"
    : "maybe"
  : "always"

type CoalesceEffectiveNullability<
  Values extends readonly Expression.Any[],
  Available extends Record<string, Plan.AnySource>,
  Assumptions extends PredicateFormula
> = Extract<{
  [K in keyof Values]: Values[K] extends Expression.Any ? EffectiveNullability<Values[K], Available, Assumptions> : never
}[number], "never"> extends never
  ? Extract<{
      [K in keyof Values]: Values[K] extends Expression.Any ? EffectiveNullability<Values[K], Available, Assumptions> : never
    }[number], "maybe"> extends never
    ? "always"
    : "maybe"
  : "never"

type NullabilityOfOutput<Output> =
  null extends Output
    ? Exclude<Output, null> extends never ? "always" : "maybe"
    : "never"

type PreciseFactSet<Value extends string> = string extends Value ? never : Value

type KnownGuaranteedNullKeys<
  Assumptions extends PredicateFormula
> = PreciseFactSet<GuaranteedNullKeys<Assumptions>>

type KnownGuaranteedNonNullKeys<
  Assumptions extends PredicateFormula
> = PreciseFactSet<GuaranteedNonNullKeys<Assumptions>>

type KnownGuaranteedSourceNames<
  Assumptions extends PredicateFormula
> = PreciseFactSet<GuaranteedSourceNames<Assumptions>>

type ExplicitlyRequiredSourceNames<
  Available extends Record<string, Plan.AnySource>
> = Extract<{
  readonly [K in keyof Available]:
    Available[K] extends Plan.Source<any, infer Mode extends Plan.SourceMode>
      ? Mode extends "required" ? K : never
      : never
}[keyof Available], string>

type PresentFormulaOfSource<Source extends Plan.AnySource> =
  Source extends Plan.Source<any, any, infer PresentFormula extends PredicateFormula, any>
    ? PresentFormula
    : TrueFormula

type PresenceWitnessesOfSource<Source extends Plan.AnySource> =
  Source extends Plan.Source<any, any, any, infer PresenceWitness extends string>
    ? PresenceWitness
    : never

type ImpliedSourceNamesFromRequired<
  Available extends Record<string, Plan.AnySource>,
  Required extends string
> = Extract<{
  readonly [K in Extract<keyof Available, string>]:
    K extends Required
      ? PreciseFactSet<GuaranteedSourceNames<PresentFormulaOfSource<Available[K]>>>
      : never
}[Extract<keyof Available, string>], string>

type ExpandRequiredSourceNames<
  Available extends Record<string, Plan.AnySource>,
  Required extends string
> = ExpandRequiredSourceNamesStep<
  Available,
  Required,
  Required | ImpliedSourceNamesFromRequired<Available, Required>
>

type ExpandRequiredSourceNamesStep<
  Available extends Record<string, Plan.AnySource>,
  Current extends string,
  Next extends string
> = [Exclude<Next, Current>] extends [never]
  ? Current
  : ExpandRequiredSourceNames<Available, Next>

type DirectlyAbsentSourceNames<
  Available extends Record<string, Plan.AnySource>,
  Assumptions extends PredicateFormula
> = Extract<{
  readonly [K in Extract<keyof Available, string>]:
    K extends string
      ? PresenceWitnessesOfSource<Available[K]> extends infer Witnesses extends string
        ? Extract<Witnesses, KnownGuaranteedNullKeys<Assumptions>> extends never
          ? ContradictsFormula<Assumptions, PresentFormulaOfSource<Available[K]>> extends true
            ? K
            : never
          : K
        : never
      : never
}[Extract<keyof Available, string>], string>

type ImpliedAbsentSourceNames<
  Available extends Record<string, Plan.AnySource>,
  Absent extends string
> = Extract<{
  readonly [K in Extract<keyof Available, string>]:
    Extract<PreciseFactSet<GuaranteedSourceNames<PresentFormulaOfSource<Available[K]>>>, Absent> extends never
      ? never
      : K
}[Extract<keyof Available, string>], string>

type ExpandAbsentSourceNames<
  Available extends Record<string, Plan.AnySource>,
  Current extends string
> = ExpandAbsentSourceNamesStep<
  Available,
  Current,
  Current | ImpliedAbsentSourceNames<Available, Current>
>

type ExpandAbsentSourceNamesStep<
  Available extends Record<string, Plan.AnySource>,
  Current extends string,
  Next extends string
> = [Exclude<Next, Current>] extends [never]
  ? Current
  : ExpandAbsentSourceNames<Available, Next>

type AbsentSourceNamesInScope<
  Available extends Record<string, Plan.AnySource>,
  Assumptions extends PredicateFormula
> = ExpandAbsentSourceNames<Available, DirectlyAbsentSourceNames<Available, Assumptions>>

type RequiredSourceNamesInScope<
  Available extends Record<string, Plan.AnySource>,
  Assumptions extends PredicateFormula
> = Exclude<
  ExpandRequiredSourceNames<
    Available,
    ExplicitlyRequiredSourceNames<Available> | KnownGuaranteedSourceNames<Assumptions>
  >,
  AbsentSourceNamesInScope<Available, Assumptions>
>

type EffectiveAvailable<
  Available extends Record<string, Plan.AnySource>,
  Assumptions extends PredicateFormula
> = {
  readonly [K in keyof Available]:
    Available[K] extends Plan.Source<
      infer Name extends string,
      infer Mode extends Plan.SourceMode,
      infer PresentFormula extends PredicateFormula,
      infer PresenceWitness extends string
    >
      ? Plan.Source<
          Name,
          K extends RequiredSourceNamesInScope<Available, Assumptions> ? "required" : Mode,
          PresentFormula,
          PresenceWitness
        > & {
          readonly baseName?: Available[K]["baseName"]
        }
      : never
}

type HasAbsentSource<
  Dependencies extends Expression.SourceDependencies,
  Available extends Record<string, Plan.AnySource>,
  Assumptions extends PredicateFormula
> = Extract<{
  [K in keyof Dependencies & string]:
    K extends AbsentSourceNamesInScope<Available, Assumptions> ? true : never
}[keyof Dependencies & string], true> extends never ? false : true

type BaseEffectiveNullability<
  Value extends Expression.Any,
  Available extends Record<string, Plan.AnySource>,
  Assumptions extends PredicateFormula
> = AstOf<Value> extends ExpressionAst.ColumnNode<infer TableName extends string, infer ColumnName extends string>
  ? TableName extends AbsentSourceNamesInScope<Available, Assumptions>
    ? "always"
    : `${TableName}.${ColumnName}` extends KnownGuaranteedNullKeys<Assumptions>
    ? "always"
    : `${TableName}.${ColumnName}` extends KnownGuaranteedNonNullKeys<Assumptions>
      ? "never"
      : Expression.NullabilityOf<Value> extends "always" ? "always"
        : Expression.SourceNullabilityOf<Value> extends "resolved"
          ? Expression.NullabilityOf<Value>
        : HasAbsentSource<DependenciesOf<Value>, Available, Assumptions> extends true ? "always"
        : HasOptionalSource<DependenciesOf<Value>, Available> extends true ? "maybe"
        : Expression.NullabilityOf<Value>
  : Expression.NullabilityOf<Value> extends "always" ? "always"
    : Expression.SourceNullabilityOf<Value> extends "resolved"
      ? Expression.NullabilityOf<Value>
      : HasAbsentSource<DependenciesOf<Value>, Available, Assumptions> extends true ? "always"
      : HasOptionalSource<DependenciesOf<Value>, Available> extends true ? "maybe"
      : Expression.NullabilityOf<Value>

type CaseOutputOf<
  Branches extends readonly ExpressionAst.CaseBranchNode[],
  Else extends Expression.Any,
  Available extends Record<string, Plan.AnySource>,
  Assumptions extends PredicateFormula
> = Branches extends readonly [
  infer Head extends ExpressionAst.CaseBranchNode,
  ...infer Tail extends readonly ExpressionAst.CaseBranchNode[]
]
  ? Head extends ExpressionAst.CaseBranchNode<infer Predicate extends Expression.Any, infer Then extends Expression.Any>
    ? CaseBranchDecision<Assumptions, Predicate> extends "skip"
      ? CaseOutputOf<Tail, Else, Available, Assumptions>
      : CaseBranchDecision<Assumptions, Predicate> extends "take"
        ? ExpressionOutput<Then, EffectiveAvailable<Available, CaseBranchAssumeTrue<Assumptions, Predicate>>, CaseBranchAssumeTrue<Assumptions, Predicate>>
        : ExpressionOutput<Then, EffectiveAvailable<Available, CaseBranchAssumeTrue<Assumptions, Predicate>>, CaseBranchAssumeTrue<Assumptions, Predicate>> |
          CaseOutputOf<Tail, Else, Available, CaseBranchAssumeFalse<Assumptions, Predicate>>
    : never
  : ExpressionOutput<Else, EffectiveAvailable<Available, Assumptions>, Assumptions>

/** Effective nullability of an expression after source-scope nullability is applied. */
export type EffectiveNullability<
  Value extends Expression.Any,
  Available extends Record<string, Plan.AnySource>,
  Assumptions extends PredicateFormula = TrueAssumptions
> =
  AstOf<Value> extends infer Ast extends ExpressionAst.Any
    ? Ast extends ExpressionAst.ColumnNode<any, any>
      ? BaseEffectiveNullability<Value, Available, Assumptions>
      : Ast extends ExpressionAst.LiteralNode<any>
        ? Expression.NullabilityOf<Value>
        : Ast extends ExpressionAst.UnaryNode<infer Kind, infer UnaryValue extends Expression.Any>
          ? Kind extends "upper" | "lower" | "not"
            ? EffectiveNullability<UnaryValue, Available, Assumptions>
            : Kind extends "isNull" | "isNotNull" | "count"
              ? "never"
              : Expression.NullabilityOf<Value>
          : Ast extends ExpressionAst.BinaryNode<"eq", infer Left extends Expression.Any, infer Right extends Expression.Any>
            ? EffectiveNullability<Left, Available, Assumptions> extends "never"
              ? EffectiveNullability<Right, Available, Assumptions> extends "never" ? "never" : "maybe"
              : "maybe"
            : Ast extends ExpressionAst.VariadicNode<infer Kind, infer Values extends readonly Expression.Any[]>
              ? Kind extends "coalesce"
                ? CoalesceEffectiveNullability<Values, Available, Assumptions>
                : Kind extends "and" | "or" | "concat"
                  ? FoldEffectiveNullability<Values, Available, Assumptions>
                  : BaseEffectiveNullability<Value, Available, Assumptions>
              : Ast extends ExpressionAst.CaseNode<infer Branches extends readonly ExpressionAst.CaseBranchNode[], infer Else extends Expression.Any>
                ? NullabilityOfOutput<CaseOutputOf<Branches, Else, Available, Assumptions>>
              : BaseEffectiveNullability<Value, Available, Assumptions>
    : BaseEffectiveNullability<Value, Available, Assumptions>

/** Result runtime type of an expression after effective nullability is resolved. */
export type ExpressionOutput<
  Value extends Expression.Any,
  Available extends Record<string, Plan.AnySource>,
  Assumptions extends PredicateFormula = TrueAssumptions
> = AstOf<Value> extends ExpressionAst.CaseNode<infer Branches extends readonly ExpressionAst.CaseBranchNode[], infer Else extends Expression.Any>
  ? CaseOutputOf<Branches, Else, Available, Assumptions>
  : EffectiveNullability<Value, Available, Assumptions> extends "never"
    ? Expression.NullabilityOf<Value> extends "never"
      ? Expression.RuntimeOf<Value>
      : NonNullable<Expression.RuntimeOf<Value>>
    : EffectiveNullability<Value, Available, Assumptions> extends "always"
      ? null
      : Expression.RuntimeOf<Value> | null

/** Result runtime type of a nested selection after source-scope nullability is resolved. */
export type OutputOfSelection<
  Selection,
  Available extends Record<string, Plan.AnySource>,
  Assumptions extends PredicateFormula = TrueAssumptions
> = Selection extends Expression.Any
  ? ExpressionOutput<Selection, Available, Assumptions>
  : Selection extends Record<string, any>
    ? {
        readonly [K in keyof Selection]: OutputOfSelection<Selection[K], Available, Assumptions>
      }
    : never

/** Resolved row type produced by a concrete query plan. */
export type ResultRow<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> = OutputOfSelection<
  PlanValue[typeof Plan.TypeId]["selection"],
  EffectiveAvailable<PlanValue[typeof Plan.TypeId]["available"], AssumptionsOfPlan<PlanValue>>,
  AssumptionsOfPlan<PlanValue>
>

/** Resolved row collection type produced by a concrete query plan. */
export type ResultRows<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> = ReadonlyArray<ResultRow<PlanValue>>

/** Conservative runtime row shape produced by remapping projection aliases. */
export type RuntimeResultRow<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> = OutputOfSelection<
  PlanValue[typeof Plan.TypeId]["selection"],
  PlanValue[typeof Plan.TypeId]["available"],
  TrueAssumptions
>

/** Conservative runtime row collection type. */
export type RuntimeResultRows<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> = ReadonlyArray<RuntimeResultRow<PlanValue>>

/** Narrows a query plan to aggregate-compatible selections. */
type HasKnownOutstanding<Required> = [Required] extends [never]
  ? false
  : string extends Required
    ? false
    : true

type SourceCompletenessError<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  MissingSources extends string
> = PlanValue & {
  readonly __effect_qb_error__: "effect-qb: query references sources that are not yet in scope"
  readonly __effect_qb_missing_sources__: MissingSources
  readonly __effect_qb_hint__: "Add from(...) or a join for each referenced source before render or execute"
}

type AggregationCompatibilityError<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
> = PlanValue & {
  readonly __effect_qb_error__: "effect-qb: invalid grouped selection"
  readonly __effect_qb_hint__: "Scalar selections must be covered by groupBy(...) when aggregates are present"
}

type DialectCompatibilityError<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  EngineDialect extends string
> = PlanValue & {
  readonly __effect_qb_error__: "effect-qb: plan dialect is not compatible with the target renderer or executor"
  readonly __effect_qb_plan_dialect__: PlanValue[typeof Plan.TypeId]["dialect"]
  readonly __effect_qb_target_dialect__: EngineDialect
  readonly __effect_qb_hint__: "Use the matching dialect module or renderer/executor"
}

type InsertSourceCompletenessError<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
> = PlanValue & {
  readonly __effect_qb_error__: "effect-qb: insert plan is missing inline values or a source"
  readonly __effect_qb_hint__: "Pass values directly to insert(...), or pipe the insert plan into from(...)"
}

type RequiredKeys<Shape> = Extract<{
  [K in keyof Shape]-?: {} extends Pick<Shape, K> ? never : K
}[keyof Shape], string>

type InsertHasOptionalDefaults<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
> = MutationTargetOfPlan<PlanValue> extends infer Target extends MutationTargetLike
  ? RequiredKeys<Table.InsertOf<Target>> extends never
    ? true
    : false
  : false

/** Narrows a query plan to aggregate-compatible selections. */
export type AggregationCompatiblePlan<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
> = PlanValue extends QueryPlan<infer Selection, any, any, any, infer Grouped, any, any, any, any, any>
  ? IsAggregationCompatibleSelection<Selection, Grouped> extends true ? PlanValue : AggregationCompatibilityError<PlanValue>
  : never

/** Narrows a query plan to aggregate-compatible, source-complete plans. */
export type CompletePlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<infer Selection, infer Required, any, any, infer Grouped, any, any, any, any, infer Statement, any, infer InsertState>
    ? Statement extends "insert"
      ? InsertState extends "missing"
        ? InsertHasOptionalDefaults<PlanValue> extends true
          ? PlanValue
          : InsertSourceCompletenessError<PlanValue>
        : HasKnownOutstanding<Required> extends true
          ? SourceCompletenessError<PlanValue, Extract<Required, string>>
          : IsAggregationCompatibleSelection<Selection, Grouped> extends true ? PlanValue : AggregationCompatibilityError<PlanValue>
      : HasKnownOutstanding<Required> extends true
        ? SourceCompletenessError<PlanValue, Extract<Required, string>>
        : IsAggregationCompatibleSelection<Selection, Grouped> extends true ? PlanValue : AggregationCompatibilityError<PlanValue>
    : never

/** Whether a plan dialect is compatible with a target engine dialect. */
type IsDialectCompatible<
  PlanDialect extends string,
  EngineDialect extends string
> = [PlanDialect] extends [never]
  ? true
  : Extract<PlanDialect, EngineDialect> extends never
    ? false
    : true

/** Narrows a complete plan to those compatible with a target engine dialect. */
export type DialectCompatiblePlan<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  EngineDialect extends string
> = IsDialectCompatible<PlanValue[typeof Plan.TypeId]["dialect"], EngineDialect> extends true
  ? CompletePlan<PlanValue>
  : DialectCompatibilityError<PlanValue, EngineDialect>

/** Nested-plan compatibility used by subquery expressions such as `exists(...)`. */
export type DialectCompatibleNestedPlan<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  EngineDialect extends string
> = IsDialectCompatible<PlanValue[typeof Plan.TypeId]["dialect"], EngineDialect> extends true
  ? AggregationCompatiblePlan<PlanValue>
  : DialectCompatibilityError<PlanValue, EngineDialect>

type SetOperandStatement = "select" | "set"
type IsUnion<Value, All = Value> = Value extends any ? ([All] extends [Value] ? false : true) : never

type SingleSelectedExpressionError<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
> = PlanValue & {
  readonly __effect_qb_error__: "effect-qb: scalar and quantified subqueries must project exactly one top-level expression"
  readonly __effect_qb_hint__: "Project exactly one scalar expression like select({ value: expr }) before using this subquery as a scalar operand"
}

type SingleSelectedExpression<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
> = SelectionOfPlan<PlanValue> extends Record<string, infer Value>
  ? IsUnion<Extract<keyof SelectionOfPlan<PlanValue>, string>> extends true
    ? SingleSelectedExpressionError<PlanValue>
    : Value extends Expression.Any
      ? Value
      : SingleSelectedExpressionError<PlanValue>
  : SingleSelectedExpressionError<PlanValue>

export type ScalarSubqueryPlan<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  EngineDialect extends string
> = DialectCompatibleNestedPlan<PlanValue, EngineDialect> extends infer Compatible
  ? Compatible extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
    ? SingleSelectedExpression<Compatible> extends Expression.Any ? Compatible : SingleSelectedExpression<Compatible>
    : Compatible
  : never

export type ScalarOutputOfPlan<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
> = SingleSelectedExpression<PlanValue> extends infer Value
  ? Value extends Expression.Any ? Value : never
  : never

type SetOperandStatementError<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
> = PlanValue & {
  readonly __effect_qb_error__: "effect-qb: set operators only accept select-like query plans"
  readonly __effect_qb_statement__: StatementOfPlan<PlanValue>
  readonly __effect_qb_hint__: "Use select(...) or another set operator as each operand"
}

type SetOperandShapeError<
  Left extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Right extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
> = Right & {
  readonly __effect_qb_error__: "effect-qb: set operator operands must have matching result rows"
  readonly __effect_qb_expected_selection__: SelectionOfPlan<Left>
  readonly __effect_qb_actual_selection__: SelectionOfPlan<Right>
  readonly __effect_qb_hint__: "Project the same nested object shape and compatible nullability from each operand"
}

type IsSameSelection<
  Left extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Right extends QueryPlan<any, any, any, any, any, any, any, any, any, any>
> = [SelectionOfPlan<Left>] extends [SelectionOfPlan<Right>]
  ? [SelectionOfPlan<Right>] extends [SelectionOfPlan<Left>] ? true : false
  : false

/** Set-operator compatibility used by `union(...)`, `intersect(...)`, and `except(...)`. */
export type SetCompatiblePlan<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  EngineDialect extends string
> = StatementOfPlan<PlanValue> extends SetOperandStatement
  ? DialectCompatiblePlan<PlanValue, EngineDialect>
  : SetOperandStatementError<PlanValue>

/** Right-hand operand compatibility for set operators. */
export type SetCompatibleRightPlan<
  Left extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Right extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  EngineDialect extends string
> = StatementOfPlan<Right> extends SetOperandStatement
  ? IsSameSelection<Left, Right> extends true
    ? DialectCompatiblePlan<Right, EngineDialect>
    : SetOperandShapeError<Left, Right>
  : SetOperandStatementError<Right>

/** True when any of an expression's dependencies are optional in the current scope. */
type HasOptionalSource<
  Dependencies extends Expression.SourceDependencies,
  Available extends Record<string, Plan.AnySource>
> = Extract<{
  [K in keyof Dependencies & string]: SourceModeOf<Available, K> extends "optional" ? true : never
}[keyof Dependencies & string], true> extends never ? false : true

/**
 * Concrete query-plan value produced by the query DSL.
 *
 * `Selection` is the output shape being built, `Required` tracks referenced
 * sources that are not yet in scope, `Available` tracks sources already in
 * scope, and `Dialect` tracks the effective SQL dialect for the plan.
 */
export type QueryPlan<
  Selection,
  Required = never,
  Available extends Record<string, Plan.AnySource> = {},
  Dialect extends string = never,
  Grouped extends string = never,
  ScopedNames extends string = Extract<keyof Available, string>,
  Outstanding extends string = Extract<Required, string>,
  Assumptions extends PredicateFormula = TrueAssumptions,
  Capabilities extends QueryCapability = "read",
  Statement extends QueryAst.QueryStatement = "select",
  Target = unknown,
  InsertState extends InsertSourceState = InsertSourceState
> = Plan.Plan<Selection, Required, Available, Dialect> & {
  readonly [Plan.TypeId]: Plan.State<Selection, Required, Available, Dialect>
  readonly [QueryAst.TypeId]: QueryAst.Ast<Selection, Grouped, Statement>
  readonly [QueryTypeId]: QueryState<Outstanding, ScopedNames, Grouped, Assumptions, Capabilities, Statement, Target, InsertState>
}

/**
 * Normalizes expression provenance into a flat list.
 *
 * Single-source expressions store one provenance object, while derived
 * operators may carry multiple sources. This helper hides that shape
 * difference.
 */
const normalizeSources = (source: unknown): readonly unknown[] =>
  source === undefined ? [] : Array.isArray(source) ? source : [source]

/**
 * Merges the provenance of two expressions into one normalized runtime value.
 *
 * The result is:
 * - `undefined` when neither side is sourced
 * - a single provenance object when exactly one source exists
 * - an array when multiple sources are involved
 */
export const mergeSources = (left: unknown, right?: unknown): unknown => {
  const values = [...normalizeSources(left), ...normalizeSources(right)]
  if (values.length === 0) {
    return undefined
  }
  if (values.length === 1) {
    return values[0]
  }
  return values
}

/** Merges two expression dependency maps into a single normalized record. */
export const mergeDependencies = (
  left: Expression.SourceDependencies,
  right: Expression.SourceDependencies = {}
): Expression.SourceDependencies => ({
  ...left,
  ...right
})

/** Merges expression aggregation kinds at runtime. */
export const mergeAggregationRuntime = (
  left: Expression.AggregationKind,
  right: Expression.AggregationKind = "scalar"
): Expression.AggregationKind =>
  left === "window" || right === "window"
    ? "window"
    : left === "aggregate" || right === "aggregate"
      ? "aggregate"
      : "scalar"

/** Folds runtime aggregation across a list of expressions. */
export const mergeAggregationManyRuntime = (
  values: readonly Expression.Any[]
): Expression.AggregationKind =>
  values.reduce(
    (current, value) => mergeAggregationRuntime(current, value[Expression.TypeId].aggregation),
    "scalar" as Expression.AggregationKind
  )

/** Merges expression nullability for null-propagating scalar operators. */
const mergeNullabilityRuntime = (
  left: Expression.Nullability,
  right: Expression.Nullability = "never"
): Expression.Nullability =>
  left === "always" || right === "always"
    ? "always"
    : left === "maybe" || right === "maybe"
      ? "maybe"
      : "never"

/** Folds runtime nullability across a list of expressions. */
export const mergeNullabilityManyRuntime = (
  values: readonly Expression.Any[]
): Expression.Nullability =>
  values.reduce(
    (current, value) => mergeNullabilityRuntime(current, value[Expression.TypeId].nullability),
    "never" as Expression.Nullability
  )

/** Merges provenance across a variadic expression input list. */
export const mergeManySources = (values: readonly Expression.Any[]): unknown =>
  values.reduce<unknown>(
    (current, value) => mergeSources(current, value[Expression.TypeId].source),
    undefined
  )

/** Merges dependency maps across a variadic expression input list. */
export const mergeManyDependencies = (values: readonly Expression.Any[]): Expression.SourceDependencies =>
  values.reduce(
    (current, value) => mergeDependencies(current, value[Expression.TypeId].dependencies),
    {} as Expression.SourceDependencies
  )

/**
 * Creates a runtime expression object from fully computed static metadata.
 *
 * The query helpers use this instead of exposing ad hoc object shapes, so every
 * produced expression has the same structural contract as bound columns.
 */
export const makeExpression = <
  Runtime,
  Db extends Expression.DbType.Any,
  Nullable extends Expression.Nullability,
  Dialect extends string,
  Aggregation extends Expression.AggregationKind,
  Source,
  Dependencies extends Expression.SourceDependencies = {},
  SourceNullability extends Expression.SourceNullabilityMode = "propagate",
  Ast extends ExpressionAst.Any = ExpressionAst.Any
>(
  state: Expression.State<Runtime, Db, Nullable, Dialect, Aggregation, Source, Dependencies, SourceNullability>,
  ast: Ast
): Expression.Expression<Runtime, Db, Nullable, Dialect, Aggregation, Source, Dependencies, SourceNullability> & {
  readonly [ExpressionAst.TypeId]: Ast
} => {
  const expression = Object.create(ExpressionProto)
  expression[Expression.TypeId] = state
  expression[ExpressionAst.TypeId] = ast
  return expression
}

/**
 * Creates a runtime query-plan value from public plan metadata plus the
 * internal clause AST.
 */
export const makePlan = <
  Selection,
  Required,
  Available extends Record<string, Plan.AnySource>,
  Dialect extends string,
  Grouped extends string = never,
  ScopedNames extends string = Extract<keyof Available, string>,
  Outstanding extends string = Extract<Required, string>,
  Assumptions extends PredicateFormula = TrueAssumptions,
  Capabilities extends QueryCapability = "read",
  Statement extends QueryAst.QueryStatement = "select",
  Target = never,
  InsertState extends InsertSourceState = "ready"
>(
  state: Plan.State<Selection, Required, Available, Dialect>,
  ast: QueryAst.Ast<Selection, Grouped, Statement>,
  _assumptions?: Assumptions,
  _capabilities?: Capabilities,
  _statement?: Statement,
  _target?: Target,
  _insertState?: InsertState
): QueryPlan<Selection, Required, Available, Dialect, Grouped, ScopedNames, Outstanding, Assumptions, Capabilities, Statement, Target, InsertState> => {
  const plan = Object.create(PlanProto)
  plan[Plan.TypeId] = state
  plan[QueryAst.TypeId] = ast
  plan[QueryTypeId] = {
    required: undefined as unknown as Outstanding,
    availableNames: undefined as unknown as ScopedNames,
    grouped: undefined as unknown as Grouped,
    assumptions: ((_assumptions ?? trueFormula()) as Assumptions),
    capabilities: undefined as unknown as Capabilities,
    statement: (_statement ?? ("select" as Statement)) as Statement,
    target: (_target ?? (undefined as unknown as Target)) as Target,
    insertSource: (_insertState ?? ("ready" as InsertState)) as InsertState
  }
  return plan
}

/** Returns the internal AST carried by a query plan. */
export const getAst = <
  Selection,
  Grouped extends string,
  Statement extends QueryAst.QueryStatement
>(
  plan: QueryPlan<Selection, any, any, any, Grouped, any, any, any, any, Statement>
): QueryAst.Ast<Selection, Grouped, Statement> => plan[QueryAst.TypeId]

/** Returns the internal phantom query state carried by a query plan. */
export const getQueryState = (
  plan: QueryPlan<any, any, any, any, any, any, any, any, any, any>
): QueryState<any, any, any, any, any, any, any, any> => plan[QueryTypeId]

/**
 * Collects the required table names referenced by a runtime selection object.
 *
 * This mirrors the `ExtractRequired<...>` type-level computation so runtime plan
 * metadata stays aligned with the static model.
 */
export const extractRequiredRuntime = (selection: SelectionShape): readonly string[] => {
  const required = new Set<string>()
  const visit = (value: SelectionShape): void => {
    if (Expression.TypeId in value) {
      for (const tableName of Object.keys(value[Expression.TypeId].dependencies)) {
        required.add(tableName)
      }
      return
    }
    for (const nested of Object.values(value)) {
      visit(nested)
    }
  }
  visit(selection)
  return [...required]
}

/** Extracts the single top-level expression from a scalar subquery selection. */
export const extractSingleSelectedExpressionRuntime = (selection: SelectionShape): Expression.Any => {
  const keys = Object.keys(selection)
  if (keys.length !== 1) {
    throw new Error("scalar subqueries must select exactly one top-level expression")
  }
  const record = selection as Record<string, unknown>
  const value = record[keys[0]!]
  if (value === null || typeof value !== "object" || !(Expression.TypeId in (value as object))) {
    throw new Error("scalar subqueries must select a scalar expression")
  }
  return value as unknown as Expression.Any
}

/** Converts the plan's runtime `required` metadata into a mutable string list. */
export const currentRequiredList = (required: unknown): string[] =>
  Array.isArray(required) ? [...required] : required === undefined ? [] : [required as string]

/** Sort direction accepted by `orderBy(...)`. */
export type OrderDirection = QueryAst.OrderDirection
