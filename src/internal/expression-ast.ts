import type * as Expression from "./expression.js"
import type * as Query from "./query.js"
import type * as JsonPath from "./json/path.js"
import type { JsonNode } from "./json/ast.js"

/** Symbol used to attach internal expression-AST metadata to runtime values. */
export const TypeId: unique symbol = Symbol.for("effect-qb/ExpressionAst")

export type TypeId = typeof TypeId

/** Bound column reference captured by the internal expression AST. */
export interface ColumnNode<
  TableName extends string = string,
  ColumnName extends string = string
> {
  readonly kind: "column"
  readonly tableName: TableName
  readonly columnName: ColumnName
}

/** Constant literal captured by the internal expression AST. */
export interface LiteralNode<Value = unknown> {
  readonly kind: "literal"
  readonly value: Value
}

/** Explicit type cast captured by the internal expression AST. */
export interface CastNode<
  Value extends Expression.Any = Expression.Any,
  Target extends Expression.DbType.Any = Expression.DbType.Any
> {
  readonly kind: "cast"
  readonly value: Value
  readonly target: Target
}

/** `excluded.column` reference used inside insert conflict handlers. */
export interface ExcludedNode<
  ColumnName extends string = string
> {
  readonly kind: "excluded"
  readonly columnName: ColumnName
}

/** Unary expression kinds supported by the current query layer. */
export type UnaryKind =
  | "isNull"
  | "isNotNull"
  | "not"
  | "upper"
  | "lower"
  | "count"
  | "max"
  | "min"

/** Unary expression node. */
export interface UnaryNode<
  Kind extends UnaryKind = UnaryKind,
  Value extends Expression.Any = Expression.Any
> {
  readonly kind: Kind
  readonly value: Value
}

/** Binary expression kinds supported by the current query layer. */
export type BinaryKind =
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "like"
  | "ilike"
  | "isDistinctFrom"
  | "isNotDistinctFrom"
  | "contains"
  | "containedBy"
  | "overlaps"

/** Binary expression node. */
export interface BinaryNode<
  Kind extends BinaryKind = BinaryKind,
  Left extends Expression.Any = Expression.Any,
  Right extends Expression.Any = Expression.Any
> {
  readonly kind: Kind
  readonly left: Left
  readonly right: Right
}

/** Variadic expression kinds supported by the current query layer. */
export type VariadicKind = "and" | "or" | "coalesce" | "concat" | "in" | "notIn" | "between"

/** Variadic expression node. */
export interface VariadicNode<
  Kind extends VariadicKind = VariadicKind,
  Values extends readonly Expression.Any[] = readonly Expression.Any[]
> {
  readonly kind: Kind
  readonly values: Values
}

/** One `when ... then ...` branch inside a searched `case`. */
export interface CaseBranchNode<
  Predicate extends Expression.Any = Expression.Any,
  Then extends Expression.Any = Expression.Any
> {
  readonly when: Predicate
  readonly then: Then
}

/** Searched `case when ... then ... else ... end` expression node. */
export interface CaseNode<
  Branches extends readonly CaseBranchNode[] = readonly CaseBranchNode[],
  Else extends Expression.Any = Expression.Any
> {
  readonly kind: "case"
  readonly branches: Branches
  readonly else: Else
}

/** `exists (<subquery>)` expression node. */
export interface ExistsNode<
  PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any, any> = Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>
> {
  readonly kind: "exists"
  readonly plan: PlanValue
}

/** Scalar subquery expression node. */
export interface ScalarSubqueryNode<
  PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any, any> = Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>
> {
  readonly kind: "scalarSubquery"
  readonly plan: PlanValue
}

/** `value in (<subquery>)` expression node. */
export interface InSubqueryNode<
  Left extends Expression.Any = Expression.Any,
  PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any, any> = Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>
> {
  readonly kind: "inSubquery"
  readonly left: Left
  readonly plan: PlanValue
}

/** `value <op> any|all (<subquery>)` expression node. */
export interface QuantifiedComparisonNode<
  Kind extends "comparisonAny" | "comparisonAll" = "comparisonAny" | "comparisonAll",
  Operator extends "eq" | "neq" | "lt" | "lte" | "gt" | "gte" = "eq" | "neq" | "lt" | "lte" | "gt" | "gte",
  Left extends Expression.Any = Expression.Any,
  PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any, any> = Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>
> {
  readonly kind: Kind
  readonly operator: Operator
  readonly left: Left
  readonly plan: PlanValue
}

/** Ordering term inside a window specification. */
export interface WindowOrderByNode<
  Value extends Expression.Any = Expression.Any
> {
  readonly value: Value
  readonly direction: "asc" | "desc"
}

/** Window function kinds supported by the query layer. */
export type WindowKind = "rowNumber" | "rank" | "denseRank" | "over"

/** Window function expression node. */
export interface WindowNode<
  Kind extends WindowKind = WindowKind,
  Value extends Expression.Any | undefined = Expression.Any | undefined,
  PartitionBy extends readonly Expression.Any[] = readonly Expression.Any[],
  OrderBy extends readonly WindowOrderByNode[] = readonly WindowOrderByNode[]
> {
  readonly kind: "window"
  readonly function: Kind
  readonly value?: Value
  readonly partitionBy: PartitionBy
  readonly orderBy: OrderBy
}

export type JsonSegmentTuple = readonly any[]

export type JsonAccessKind =
  | "jsonGet"
  | "jsonPath"
  | "jsonAccess"
  | "jsonTraverse"
  | "jsonGetText"
  | "jsonPathText"
  | "jsonAccessText"
  | "jsonTraverseText"

export interface JsonAccessNode<
  Kind extends JsonAccessKind = JsonAccessKind,
  Base extends Expression.Any = Expression.Any,
  Segments extends JsonSegmentTuple = JsonSegmentTuple
> {
  readonly kind: Kind
  readonly base: Base
  readonly segments: Segments
}

export type JsonKeyPredicateKind =
  | "jsonHasKey"
  | "jsonKeyExists"
  | "jsonHasAnyKeys"
  | "jsonHasAllKeys"

export interface JsonKeyPredicateNode<
  Kind extends JsonKeyPredicateKind = JsonKeyPredicateKind,
  Base extends Expression.Any = Expression.Any,
  Keys extends readonly string[] = readonly string[]
> {
  readonly kind: Kind
  readonly base: Base
  readonly keys: Keys
}

export type JsonBinaryKind = "jsonConcat" | "jsonMerge"

export interface JsonBinaryNode<
  Kind extends JsonBinaryKind = JsonBinaryKind,
  Left extends Expression.Any = Expression.Any,
  Right extends Expression.Any = Expression.Any
> {
  readonly kind: Kind
  readonly left: Left
  readonly right: Right
}

export type JsonDeleteKind = "jsonDelete" | "jsonDeletePath" | "jsonRemove"

export interface JsonDeleteNode<
  Kind extends JsonDeleteKind = JsonDeleteKind,
  Base extends Expression.Any = Expression.Any,
  Segments extends JsonSegmentTuple = JsonSegmentTuple
> {
  readonly kind: Kind
  readonly base: Base
  readonly segments: Segments
}

export interface JsonSetNode<
  Base extends Expression.Any = Expression.Any,
  Segments extends JsonSegmentTuple = JsonSegmentTuple,
  NewValue extends Expression.Any = Expression.Any
> {
  readonly kind: "jsonSet"
  readonly base: Base
  readonly segments: Segments
  readonly newValue: NewValue
  readonly createMissing: boolean
}

export interface JsonInsertNode<
  Base extends Expression.Any = Expression.Any,
  Segments extends JsonSegmentTuple = JsonSegmentTuple,
  Insert extends Expression.Any = Expression.Any
> {
  readonly kind: "jsonInsert"
  readonly base: Base
  readonly segments: Segments
  readonly insert: Insert
  readonly insertAfter: boolean
}

export type JsonQueryPredicateKind = "jsonPathExists" | "jsonPathMatch"

export interface JsonQueryPredicateNode<
  Kind extends JsonQueryPredicateKind = JsonQueryPredicateKind,
  Base extends Expression.Any = Expression.Any,
  QueryValue extends Expression.Any | JsonPath.Path<any> | string = Expression.Any | JsonPath.Path<any> | string
> {
  readonly kind: Kind
  readonly base: Base
  readonly query: QueryValue
}

export interface JsonBuildObjectEntryNode<
  Key extends string = string,
  Value extends Expression.Any = Expression.Any
> {
  readonly key: Key
  readonly value: Value
}

export interface JsonBuildObjectNode<
  Entries extends readonly JsonBuildObjectEntryNode[] = readonly JsonBuildObjectEntryNode[]
> {
  readonly kind: "jsonBuildObject"
  readonly entries: Entries
}

export interface JsonBuildArrayNode<
  Values extends readonly Expression.Any[] = readonly Expression.Any[]
> {
  readonly kind: "jsonBuildArray"
  readonly values: Values
}

export interface JsonWrapNode<
  Kind extends "jsonToJson" | "jsonToJsonb" = "jsonToJson" | "jsonToJsonb",
  Value extends Expression.Any = Expression.Any
> {
  readonly kind: Kind
  readonly value: Value
}

export interface JsonUnaryNode<
  Kind extends "jsonTypeOf" | "jsonLength" | "jsonKeys" | "jsonStripNulls" = "jsonTypeOf" | "jsonLength" | "jsonKeys" | "jsonStripNulls",
  Value extends Expression.Any = Expression.Any
> {
  readonly kind: Kind
  readonly value: Value
}

/** Union of all internal expression nodes. */
export type Any =
  | ColumnNode
  | LiteralNode
  | CastNode
  | ExcludedNode
  | UnaryNode
  | BinaryNode
  | VariadicNode
  | CaseNode
  | ExistsNode
  | ScalarSubqueryNode
  | InSubqueryNode
  | QuantifiedComparisonNode
  | WindowNode
  | JsonNode
  | JsonAccessNode
  | JsonKeyPredicateNode
  | JsonBinaryNode
  | JsonDeleteNode
  | JsonSetNode
  | JsonInsertNode
  | JsonQueryPredicateNode
  | JsonBuildObjectNode
  | JsonBuildArrayNode
  | JsonWrapNode
  | JsonUnaryNode
