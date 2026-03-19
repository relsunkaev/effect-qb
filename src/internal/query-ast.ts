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
  | "truncate"
  | "merge"
  | "transaction"
  | "commit"
  | "rollback"
  | "savepoint"
  | "rollbackTo"
  | "releaseSavepoint"
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
  readonly tableName?: string
  readonly columnName: string
  readonly value: Value
}

/** One row in a multi-row `values (...)` insert source. */
export interface InsertValuesRowClause<
  Values extends readonly AssignmentClause[] = readonly AssignmentClause[]
> {
  readonly values: Values
}

/** Additional insert source kinds beyond a single literal row. */
export type InsertSourceClause =
  | {
      readonly kind: "values"
      readonly columns: readonly [string, ...string[]]
      readonly rows: readonly [InsertValuesRowClause, ...InsertValuesRowClause[]]
    }
  | {
      readonly kind: "query"
      readonly columns: readonly [string, ...string[]]
      readonly query: unknown
    }
  | {
      readonly kind: "unnest"
      readonly columns: readonly [string, ...string[]]
      readonly values: readonly {
        readonly columnName: string
        readonly values: readonly unknown[]
      }[]
    }

/** One branch inside a `merge` statement. */
export type MergeMatchedClause<
  Predicate extends Expression.Any | undefined = Expression.Any | undefined
> =
  | {
      readonly kind: "update"
      readonly values: readonly AssignmentClause[]
      readonly predicate?: Predicate
    }
  | {
      readonly kind: "delete"
      readonly predicate?: Predicate
    }

/** Insert branch inside a `merge` statement. */
export interface MergeNotMatchedClause<
  Predicate extends Expression.Any | undefined = Expression.Any | undefined
> {
  readonly kind: "insert"
  readonly values: readonly AssignmentClause[]
  readonly predicate?: Predicate
}

/** Payload recorded by a `merge` statement. */
export interface MergeClause<
  On extends Expression.Any = Expression.Any,
  Predicate extends Expression.Any | undefined = Expression.Any | undefined
> {
  readonly kind: "merge"
  readonly on: On
  readonly whenMatched?: MergeMatchedClause<Predicate>
  readonly whenNotMatched?: MergeNotMatchedClause<Predicate>
}

/** DDL payload recorded by schema-manipulation statements. */
export type DdlClause =
  | {
      readonly kind: "createTable"
      readonly ifNotExists: boolean
    }

/** Truncate payload recorded by a truncate statement. */
export interface TruncateClause {
  readonly kind: "truncate"
  readonly restartIdentity: boolean
  readonly cascade: boolean
}

/** Transaction-control payload recorded by transactional statements. */
export type TransactionClause =
  | {
      readonly kind: "transaction"
      readonly isolationLevel?: "read committed" | "repeatable read" | "serializable"
      readonly readOnly?: boolean
    }
  | {
      readonly kind: "commit"
    }
  | {
      readonly kind: "rollback"
    }
  | {
      readonly kind: "savepoint"
      readonly name: string
    }
  | {
      readonly kind: "rollbackTo"
      readonly name: string
    }
  | {
      readonly kind: "releaseSavepoint"
      readonly name: string
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

/** Locking mode attached to a select statement. */
export interface LockClause {
  readonly kind: "lock"
  readonly mode: "update" | "share" | "lowPriority" | "ignore" | "quick"
  readonly nowait?: boolean
  readonly skipLocked?: boolean
}

/** Conflict target attached to a Postgres insert statement. */
export type ConflictTargetClause =
  | {
      readonly kind: "columns"
      readonly columns: readonly [string, ...string[]]
      readonly where?: Expression.Any
    }
  | {
      readonly kind: "constraint"
      readonly name: string
    }

/** Conflict clause attached to an insert statement. */
export interface ConflictClause {
  readonly kind: "conflict"
  readonly target?: ConflictTargetClause
  readonly action: "doNothing" | "doUpdate"
  readonly values?: readonly AssignmentClause[]
  readonly where?: Expression.Any
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
  readonly recursive?: boolean
  readonly from?: FromClause
  readonly into?: FromClause
  readonly target?: FromClause
  readonly targets?: readonly FromClause[]
  readonly using?: FromClause
  readonly values?: readonly AssignmentClause[]
  readonly insertSource?: InsertSourceClause
  readonly set?: readonly AssignmentClause[]
  readonly ddl?: DdlClause
  readonly truncate?: TruncateClause
  readonly merge?: MergeClause
  readonly transaction?: TransactionClause
  readonly lock?: LockClause
  readonly conflict?: ConflictClause
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
