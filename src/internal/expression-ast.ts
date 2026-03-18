import type * as Expression from "../expression.ts"
import type * as Query from "../query.ts"

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
export type BinaryKind = "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "like" | "ilike"

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
export type VariadicKind = "and" | "or" | "coalesce" | "concat" | "in" | "between"

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
  PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any> = Query.QueryPlan<any, any, any, any, any, any, any, any, any>
> {
  readonly kind: "exists"
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

/** Union of all internal expression nodes. */
export type Any =
  | ColumnNode
  | LiteralNode
  | UnaryNode
  | BinaryNode
  | VariadicNode
  | CaseNode
  | ExistsNode
  | WindowNode
