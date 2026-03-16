import type * as Expression from "../Expression.ts"

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
export type BinaryKind = "eq"

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
export type VariadicKind = "and" | "or" | "coalesce" | "concat"

/** Variadic expression node. */
export interface VariadicNode<
  Kind extends VariadicKind = VariadicKind,
  Values extends readonly Expression.Any[] = readonly Expression.Any[]
> {
  readonly kind: Kind
  readonly values: Values
}

/** Union of all internal expression nodes. */
export type Any =
  | ColumnNode
  | LiteralNode
  | UnaryNode
  | BinaryNode
  | VariadicNode
