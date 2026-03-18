import type * as Expression from "../expression.ts"

/** Symbol used to attach query-clause AST metadata to query-plan values. */
export const TypeId: unique symbol = Symbol.for("effect-qb/QueryAst")

export type TypeId = typeof TypeId

/** Statement kinds supported by the current query AST. */
export type QueryStatement =
  | "select"
  | "set"
  | "insert"
  | "update"
  | "delete"
  | "createTable"
  | "createIndex"
  | "dropIndex"
  | "alterTable"
  | "dropTable"

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

/** DDL payload recorded by schema-manipulation statements. */
export type DdlClause =
  | {
      readonly kind: "createTable"
      readonly ifNotExists: boolean
    }
  | {
      readonly kind: "dropTable"
      readonly ifExists: boolean
    }
  | {
      readonly kind: "createIndex"
      readonly name: string
      readonly columns: readonly [string, ...string[]]
      readonly unique: boolean
      readonly ifNotExists: boolean
    }
  | {
      readonly kind: "dropIndex"
      readonly name: string
      readonly ifExists: boolean
    }

/** Join kinds supported by the current query layer. */
export type JoinKind = "inner" | "left" | "right" | "full" | "cross"

/** Join clause recorded by the query AST. */
export interface JoinClause<
  TableName extends string = string,
  Kind extends JoinKind = JoinKind,
  On extends Expression.Any | undefined = Expression.Any | undefined
> {
  readonly kind: Kind
  readonly tableName: TableName
  readonly baseTableName: string
  readonly source: unknown
  readonly on?: On
}

/** Sort direction recorded by an `ORDER BY` clause. */
export type OrderDirection = "asc" | "desc"

/** Ordering clause recorded by the query AST. */
export interface OrderByClause<Value extends Expression.Any = Expression.Any> {
  readonly kind: "orderBy"
  readonly value: Value
  readonly direction: OrderDirection
}

/** Set-operator kinds supported by compound queries. */
export type SetOperatorKind = "union" | "intersect" | "except"

/** Compound-query clause recorded by the query AST. */
export interface SetOperationClause {
  readonly kind: SetOperatorKind
  readonly all?: boolean
  readonly query: unknown
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
  readonly distinct?: boolean
  readonly setBase?: unknown
  readonly from?: FromClause
  readonly into?: FromClause
  readonly target?: FromClause
  readonly values?: readonly AssignmentClause[]
  readonly set?: readonly AssignmentClause[]
  readonly ddl?: DdlClause
  readonly where: readonly WhereClause[]
  readonly having: readonly HavingClause[]
  readonly joins: readonly JoinClause[]
  readonly groupBy: readonly Expression.Any[]
  readonly orderBy: readonly OrderByClause[]
  readonly limit?: Expression.Any
  readonly offset?: Expression.Any
  readonly setOperations?: readonly SetOperationClause[]
  readonly groupedSources?: Grouped
}
