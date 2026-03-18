import type * as Expression from "../expression.ts"

/** Symbol used to attach query-clause AST metadata to query-plan values. */
export const TypeId: unique symbol = Symbol.for("effect-qb/QueryAst")

export type TypeId = typeof TypeId

/** Statement kinds supported by the current query AST. */
export type QueryStatement = "select" | "insert" | "update" | "delete"

/** Base `FROM` clause recorded by the query AST. */
export interface FromClause<TableName extends string = string> {
  readonly kind: "from"
  readonly tableName: TableName
  readonly baseTableName: string
  readonly source: unknown
}

/** Boolean predicate recorded in a `WHERE` clause. */
export interface WhereClause<Predicate extends Expression.Any = Expression.Any> {
  readonly kind: "where"
  readonly predicate: Predicate
}

/** Boolean predicate recorded in a `HAVING` clause. */
export interface HavingClause<Predicate extends Expression.Any = Expression.Any> {
  readonly kind: "having"
  readonly predicate: Predicate
}

/** Assignment recorded in a mutation statement. */
export interface AssignmentClause<Value extends Expression.Any = Expression.Any> {
  readonly columnName: string
  readonly value: Value
}

/** Join kinds supported by the current query layer. */
export type JoinKind = "inner" | "left"

/** Join clause recorded by the query AST. */
export interface JoinClause<
  TableName extends string = string,
  Kind extends JoinKind = JoinKind,
  On extends Expression.Any = Expression.Any
> {
  readonly kind: Kind
  readonly tableName: TableName
  readonly baseTableName: string
  readonly source: unknown
  readonly on: On
}

/** Sort direction recorded by an `ORDER BY` clause. */
export type OrderDirection = "asc" | "desc"

/** Ordering clause recorded by the query AST. */
export interface OrderByClause<Value extends Expression.Any = Expression.Any> {
  readonly kind: "orderBy"
  readonly value: Value
  readonly direction: OrderDirection
}

/**
 * Internal query AST stored alongside public `Plan` metadata.
 *
 * The public plan state tracks selection, required sources, available sources,
 * and dialect. This AST captures the clause ordering needed to eventually
 * render or optimize a SQL query.
 */
export interface Ast<
  Selection = unknown,
  Grouped extends string = never,
  Statement extends QueryStatement = "select"
> {
  readonly kind: Statement
  readonly select: Selection
  readonly from?: FromClause
  readonly into?: FromClause
  readonly target?: FromClause
  readonly values?: readonly AssignmentClause[]
  readonly set?: readonly AssignmentClause[]
  readonly where: readonly WhereClause[]
  readonly having: readonly HavingClause[]
  readonly joins: readonly JoinClause[]
  readonly groupBy: readonly Expression.Any[]
  readonly orderBy: readonly OrderByClause[]
  readonly groupedSources?: Grouped
}
