import { pipeArguments } from "effect/Pipeable"

import * as Expression from "./expression.ts"
import * as Plan from "./plan.ts"
import * as Table from "./table.ts"
import * as ExpressionAst from "./internal/expression-ast.ts"
import * as QueryAst from "./internal/query-ast.ts"
import type { CaseBranchAssumeFalse, CaseBranchAssumeTrue, CaseBranchDecision } from "./internal/case-analysis.ts"
import type { GuaranteedNonNullKeys, GuaranteedNullKeys } from "./internal/predicate-analysis.ts"
import type { PredicateFormula, TrueFormula } from "./internal/predicate-formula.ts"

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

/** Internal phantom state tracked on query plans. */
interface QueryState<
  Outstanding extends string,
  AvailableNames extends string,
  Grouped extends string,
  Assumptions extends PredicateFormula
> {
  readonly required: Outstanding
  readonly availableNames: AvailableNames
  readonly grouped: Grouped
  readonly assumptions: Assumptions
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
      : Ast extends ExpressionAst.UnaryNode<infer Kind extends ExpressionAst.UnaryKind, infer Value extends Expression.Any>
        ? `${Kind}(${GroupingKeyOfExpression<Value>})`
        : Ast extends ExpressionAst.BinaryNode<infer Kind extends ExpressionAst.BinaryKind, infer Left extends Expression.Any, infer Right extends Expression.Any>
          ? `${Kind}(${GroupingKeyOfExpression<Left>},${GroupingKeyOfExpression<Right>})`
          : Ast extends ExpressionAst.VariadicNode<infer Kind extends ExpressionAst.VariadicKind, infer Values extends readonly Expression.Any[]>
            ? `${Kind}(${JoinGroupingKeys<{
                readonly [K in keyof Values]: Values[K] extends Expression.Any ? GroupingKeyOfExpression<Values[K]> : never
              } & readonly string[]>})`
            : Ast extends ExpressionAst.CaseNode<infer Branches extends readonly ExpressionAst.CaseBranchNode[], infer Else extends Expression.Any>
              ? `case(${BranchGroupingKeys<Branches>};else:${GroupingKeyOfExpression<Else>})`
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
export type TableLike<Name extends string = string, Dialect extends string = string> = Plan.Plan<any, any, Record<string, Plan.Source>, Dialect> & {
  readonly [Table.TypeId]: {
    readonly name: Name
    readonly baseName: string
  }
}

/** Extracts the static SQL table name from a table-like value. */
export type TableNameOf<T extends TableLike> = T[typeof Table.TypeId]["name"]
/** Extracts the effective dialect from a table-like value. */
export type TableDialectOf<T extends TableLike> = T[typeof Plan.TypeId]["dialect"]
/** Names of sources already available to a plan. */
type AvailableNames<Available extends Record<string, Plan.Source>> = Extract<keyof Available, string>
/** Availability mode of a named source within the current plan scope. */
type SourceModeOf<
  Available extends Record<string, Plan.Source>,
  Name extends string
> = Name extends keyof Available ? Available[Name]["mode"] : never
type TrueAssumptions = TrueFormula

/** Extracts the selection carried by a query plan. */
export type SelectionOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>> =
  PlanValue[typeof Plan.TypeId]["selection"]
/** Extracts the public required-source state carried by a query plan. */
export type RequiredOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>> =
  PlanValue[typeof Plan.TypeId]["required"]
/** Extracts the available-source scope carried by a query plan. */
export type AvailableOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>> =
  PlanValue[typeof Plan.TypeId]["available"]
/** Extracts the effective dialect carried by a query plan. */
export type PlanDialectOf<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>> =
  PlanValue[typeof Plan.TypeId]["dialect"]
/** Extracts the grouped-source phantom carried by a query plan. */
export type GroupedOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<any, any, any, any, infer Grouped, any, any, any> ? Grouped : never
/** Extracts the available-name phantom carried by a query plan. */
export type ScopedNamesOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<any, any, any, any, any, infer ScopedNames, any, any> ? ScopedNames : never
/** Extracts the outstanding-required-source phantom carried by a query plan. */
export type OutstandingOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<any, any, any, any, any, any, infer Outstanding, any> ? Outstanding : never
export type AssumptionsOfPlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, infer Assumptions> ? Assumptions : TrueAssumptions

/**
 * Adds a single source entry to the set of available sources.
 *
 * This is used by `from(...)` and the join builders.
 */
export type AddAvailable<
  Available extends Record<string, Plan.Source>,
  Name extends string,
  Mode extends Plan.SourceMode = "required"
> = Available & Record<Name, Plan.Source<Name, Mode>>

/** Join mode projected into the plan's source-scope mode lattice. */
export type JoinSourceMode<Kind extends QueryAst.JoinKind> = Kind extends "left" ? "optional" : "required"

/**
 * Computes the next `required` set after introducing an additional expression.
 *
 * Any sources already present in `available` are considered satisfied.
 */
export type AddExpressionRequired<
  Required,
  Available extends Record<string, Plan.Source>,
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
  Available extends Record<string, Plan.Source>,
  JoinedName extends string,
  Predicate extends PredicateInput
> = Exclude<
  Required | RequiredFromInput<Predicate>,
  AvailableNames<AddAvailable<Available, JoinedName, "required">>
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
  Available extends Record<string, Plan.Source>,
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
  Available extends Record<string, Plan.Source>,
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

type RequiredTablesFromAssumptions<Assumptions extends PredicateFormula> =
  GuaranteedNonNullKeys<Assumptions> extends `${infer TableName}.${string}` ? TableName : never

type EffectiveAvailable<
  Available extends Record<string, Plan.Source>,
  Assumptions extends PredicateFormula
> = {
  readonly [K in keyof Available]: Available[K] & {
    readonly mode: K extends RequiredTablesFromAssumptions<Assumptions> ? "required" : Available[K]["mode"]
  }
}

type BaseEffectiveNullability<
  Value extends Expression.Any,
  Available extends Record<string, Plan.Source>,
  Assumptions extends PredicateFormula
> = AstOf<Value> extends ExpressionAst.ColumnNode<infer TableName extends string, infer ColumnName extends string>
  ? `${TableName}.${ColumnName}` extends GuaranteedNullKeys<Assumptions>
    ? "always"
    : `${TableName}.${ColumnName}` extends GuaranteedNonNullKeys<Assumptions>
      ? "never"
      : Expression.NullabilityOf<Value> extends "always" ? "always"
        : Expression.SourceNullabilityOf<Value> extends "resolved"
          ? Expression.NullabilityOf<Value>
        : HasOptionalSource<DependenciesOf<Value>, Available> extends true ? "maybe"
        : Expression.NullabilityOf<Value>
  : Expression.NullabilityOf<Value> extends "always" ? "always"
    : Expression.SourceNullabilityOf<Value> extends "resolved"
      ? Expression.NullabilityOf<Value>
      : HasOptionalSource<DependenciesOf<Value>, Available> extends true ? "maybe"
      : Expression.NullabilityOf<Value>

type CaseOutputOf<
  Branches extends readonly ExpressionAst.CaseBranchNode[],
  Else extends Expression.Any,
  Available extends Record<string, Plan.Source>,
  Assumptions extends PredicateFormula
> = Branches extends readonly [
  infer Head extends ExpressionAst.CaseBranchNode,
  ...infer Tail extends readonly ExpressionAst.CaseBranchNode[]
]
  ? Head extends ExpressionAst.CaseBranchNode<infer Predicate extends Expression.Any, infer Then extends Expression.Any>
    ? CaseBranchDecision<Assumptions, Predicate> extends "skip"
      ? CaseOutputOf<Tail, Else, Available, Assumptions>
      : CaseBranchDecision<Assumptions, Predicate> extends "take"
        ? OutputOfExpression<Then, EffectiveAvailable<Available, CaseBranchAssumeTrue<Assumptions, Predicate>>, CaseBranchAssumeTrue<Assumptions, Predicate>>
        : OutputOfExpression<Then, EffectiveAvailable<Available, CaseBranchAssumeTrue<Assumptions, Predicate>>, CaseBranchAssumeTrue<Assumptions, Predicate>> |
          CaseOutputOf<Tail, Else, Available, CaseBranchAssumeFalse<Assumptions, Predicate>>
    : never
  : OutputOfExpression<Else, EffectiveAvailable<Available, Assumptions>, Assumptions>

/** Effective nullability of an expression after source-scope nullability is applied. */
export type EffectiveNullability<
  Value extends Expression.Any,
  Available extends Record<string, Plan.Source>,
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
export type OutputOfExpression<
  Value extends Expression.Any,
  Available extends Record<string, Plan.Source>,
  Assumptions extends PredicateFormula = TrueAssumptions
> = AstOf<Value> extends ExpressionAst.CaseNode<infer Branches extends readonly ExpressionAst.CaseBranchNode[], infer Else extends Expression.Any>
  ? CaseOutputOf<Branches, Else, Available, Assumptions>
  : EffectiveNullability<Value, Available, Assumptions> extends "never"
    ? Expression.RuntimeOf<Value>
    : EffectiveNullability<Value, Available, Assumptions> extends "always"
      ? null
      : Expression.RuntimeOf<Value> | null

/** Result runtime type of a nested selection after source-scope nullability is resolved. */
export type OutputOfSelection<
  Selection,
  Available extends Record<string, Plan.Source>,
  Assumptions extends PredicateFormula = TrueAssumptions
> = Selection extends Expression.Any
  ? OutputOfExpression<Selection, Available, Assumptions>
  : Selection extends Record<string, any>
    ? {
        readonly [K in keyof Selection]: OutputOfSelection<Selection[K], Available, Assumptions>
      }
    : never

/** Resolved row type produced by a concrete query plan. */
export type ResultRow<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>> = OutputOfSelection<
  PlanValue[typeof Plan.TypeId]["selection"],
  EffectiveAvailable<PlanValue[typeof Plan.TypeId]["available"], AssumptionsOfPlan<PlanValue>>,
  AssumptionsOfPlan<PlanValue>
>

/** Resolved row collection type produced by a concrete query plan. */
export type ResultRows<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>> = ReadonlyArray<ResultRow<PlanValue>>

/** Conservative runtime row shape produced by remapping projection aliases. */
export type RuntimeResultRow<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>> = OutputOfSelection<
  PlanValue[typeof Plan.TypeId]["selection"],
  PlanValue[typeof Plan.TypeId]["available"],
  TrueAssumptions
>

/** Conservative runtime row collection type. */
export type RuntimeResultRows<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>> = ReadonlyArray<RuntimeResultRow<PlanValue>>

/** Narrows a query plan to aggregate-compatible selections. */
type HasKnownOutstanding<Required> = [Required] extends [never]
  ? false
  : string extends Required
    ? false
    : true

type SourceCompletenessError<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>,
  MissingSources extends string
> = PlanValue & {
  readonly __effect_qb_error__: "effect-qb: query references sources that are not yet in scope"
  readonly __effect_qb_missing_sources__: MissingSources
  readonly __effect_qb_hint__: "Add from(...) or a join for each referenced source before render or execute"
}

type AggregationCompatibilityError<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>
> = PlanValue & {
  readonly __effect_qb_error__: "effect-qb: invalid grouped selection"
  readonly __effect_qb_hint__: "Scalar selections must be covered by groupBy(...) when aggregates are present"
}

type DialectCompatibilityError<
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>,
  EngineDialect extends string
> = PlanValue & {
  readonly __effect_qb_error__: "effect-qb: plan dialect is not compatible with the target renderer or executor"
  readonly __effect_qb_plan_dialect__: PlanValue[typeof Plan.TypeId]["dialect"]
  readonly __effect_qb_target_dialect__: EngineDialect
  readonly __effect_qb_hint__: "Use the matching dialect module or renderer/executor"
}

/** Narrows a query plan to aggregate-compatible, source-complete plans. */
export type CompletePlan<PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>> =
  PlanValue extends QueryPlan<infer Selection, infer Required, any, any, infer Grouped, any, any, any>
    ? HasKnownOutstanding<Required> extends true
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
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any>,
  EngineDialect extends string
> = IsDialectCompatible<PlanValue[typeof Plan.TypeId]["dialect"], EngineDialect> extends true
  ? CompletePlan<PlanValue>
  : DialectCompatibilityError<PlanValue, EngineDialect>

/** True when any of an expression's dependencies are optional in the current scope. */
type HasOptionalSource<
  Dependencies extends Expression.SourceDependencies,
  Available extends Record<string, Plan.Source>
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
  Available extends Record<string, Plan.Source> = {},
  Dialect extends string = never,
  Grouped extends string = never,
  ScopedNames extends string = Extract<keyof Available, string>,
  Outstanding extends string = Extract<Required, string>,
  Assumptions extends PredicateFormula = TrueAssumptions
> = Plan.Plan<Selection, Required, Available, Dialect> & {
  readonly [Plan.TypeId]: Plan.State<Selection, Required, Available, Dialect>
  readonly [QueryAst.TypeId]: QueryAst.Ast<Selection, Grouped>
  readonly [QueryTypeId]: QueryState<Outstanding, ScopedNames, Grouped, Assumptions>
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
  Available extends Record<string, Plan.Source>,
  Dialect extends string,
  Grouped extends string = never,
  ScopedNames extends string = Extract<keyof Available, string>,
  Outstanding extends string = Extract<Required, string>,
  Assumptions extends PredicateFormula = TrueAssumptions
>(
  state: Plan.State<Selection, Required, Available, Dialect>,
  ast: QueryAst.Ast<Selection, Grouped>,
  _assumptions?: Assumptions
): QueryPlan<Selection, Required, Available, Dialect, Grouped, ScopedNames, Outstanding, Assumptions> => {
  const plan = Object.create(PlanProto)
  plan[Plan.TypeId] = state
  plan[QueryAst.TypeId] = ast
  plan[QueryTypeId] = {
    required: undefined as unknown as Outstanding,
    availableNames: undefined as unknown as ScopedNames,
    grouped: undefined as unknown as Grouped,
    assumptions: undefined as unknown as Assumptions
  }
  return plan
}

/** Returns the internal AST carried by a query plan. */
export const getAst = <Selection>(
  plan: QueryPlan<Selection, any, any, any, any, any, any, any>
): QueryAst.Ast<Selection, any> => plan[QueryAst.TypeId]

/** Returns the internal phantom query state carried by a query plan. */
export const getQueryState = (
  plan: QueryPlan<any, any, any, any, any, any, any, any>
): QueryState<any, any, any, any> => plan[QueryTypeId]

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

/** Converts the plan's runtime `required` metadata into a mutable string list. */
export const currentRequiredList = (required: unknown): string[] =>
  Array.isArray(required) ? [...required] : required === undefined ? [] : [required as string]

/** Sort direction accepted by `orderBy(...)`. */
export type OrderDirection = QueryAst.OrderDirection
