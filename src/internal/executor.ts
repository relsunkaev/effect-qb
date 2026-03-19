import * as Effect from "effect/Effect"
import * as SqlClient from "@effect/sql/SqlClient"
import * as SqlError from "@effect/sql/SqlError"

import * as Query from "./query.ts"
import * as QueryAst from "./query-ast.ts"
import * as Renderer from "./renderer.ts"

/** Flat database row keyed by rendered projection aliases. */
export type FlatRow = Readonly<Record<string, unknown>>

/**
 * Driver that executes already-rendered SQL.
 *
 * Drivers operate on rendered SQL plus projection metadata and return flat
 * alias-keyed rows. The executor layer only remaps those aliases back into the
 * nested query result shape.
 */
export interface Driver<
  Dialect extends string = string,
  Error = never,
  Context = never
> {
  readonly dialect: Dialect
  execute<Row>(
    query: Renderer.RenderedQuery<Row, Dialect>
  ): Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>
}

/**
 * Public execution contract.
 *
 * Executors only accept complete, dialect-compatible plans. Successful
 * execution yields the compile-time query result contract, but runtime
 * execution does not validate the returned row payloads.
 */
export interface Executor<
  Dialect extends string = string,
  Error = never,
  Context = never
> {
  readonly dialect: Dialect
  execute<PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any>>(
    plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
  ): Effect.Effect<Query.ResultRows<PlanValue>, Error, Context>
}

const setPath = (
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown
): void => {
  let current = target
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index]!
    const existing = current[key]
    if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
      current = existing as Record<string, unknown>
      continue
    }
    const next: Record<string, unknown> = {}
    current[key] = next
    current = next
  }
  current[path[path.length - 1]!] = value
}

const hasWriteStatement = (statement: QueryAst.QueryStatement): boolean =>
  statement === "insert" ||
  statement === "update" ||
  statement === "delete" ||
  statement === "truncate" ||
  statement === "merge" ||
  statement === "transaction" ||
  statement === "commit" ||
  statement === "rollback" ||
  statement === "savepoint" ||
  statement === "rollbackTo" ||
  statement === "releaseSavepoint" ||
  statement === "createTable" ||
  statement === "createIndex" ||
  statement === "dropIndex" ||
  statement === "dropTable"

const hasWriteCapabilityInSource = (source: unknown): boolean =>
  typeof source === "object" && source !== null && "plan" in source
    ? hasWriteCapability((source as { readonly plan: Query.QueryPlan<any, any, any, any, any, any, any, any, any, any> }).plan)
    : false

export const hasWriteCapability = (
  plan: Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>
): boolean => {
  const ast = Query.getAst(plan)
  if (hasWriteStatement(ast.kind)) {
    return true
  }
  if (ast.kind === "set") {
    if (ast.setBase && hasWriteCapability((ast.setBase as Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>))) {
      return true
    }
    if ((ast.setOperations ?? []).some((entry) => hasWriteCapability(entry.query as Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>))) {
      return true
    }
  }
  if (ast.from && hasWriteCapabilityInSource(ast.from.source)) {
    return true
  }
  if (ast.into && hasWriteCapabilityInSource(ast.into.source)) {
    return true
  }
  if (ast.target && hasWriteCapabilityInSource(ast.target.source)) {
    return true
  }
  if ((ast.joins ?? []).some((join) => hasWriteCapabilityInSource(join.source))) {
    return true
  }
  return false
}

export const remapRows = <Row>(
  query: Renderer.RenderedQuery<Row, any>,
  rows: ReadonlyArray<FlatRow>
): ReadonlyArray<Row> =>
  rows.map((row) => {
    const decoded: Record<string, unknown> = {}
    for (const projection of query.projections) {
      if (projection.alias in row) {
        setPath(decoded, projection.path, row[projection.alias])
      }
    }
    return decoded as Row
  })

/**
 * Constructs an executor from a dialect and implementation callback.
 */
export const make = <
  Dialect extends string,
  Error = never,
  Context = never
>(
  dialect: Dialect,
  execute: <PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any>>(
    plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
  ) => Effect.Effect<Query.ResultRows<PlanValue>, Error, Context>
): Executor<Dialect, Error, Context> => ({
  dialect,
  execute(plan) {
    return (execute as any)(plan)
  }
}) as Executor<Dialect, Error, Context>

/**
 * Constructs a driver from a dialect and execution callback.
 */
export const driver = <
  Dialect extends string,
  Error = never,
  Context = never
>(
  dialect: Dialect,
  execute: <Row>(
    query: Renderer.RenderedQuery<Row, Dialect>
  ) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>
): Driver<Dialect, Error, Context> => ({
  dialect,
  execute(query) {
    return execute(query)
  }
})

/**
 * Creates an executor by composing a renderer with a rendered-query driver.
 *
 * This is the concrete render -> run -> remap pipeline:
 * 1. render a complete query plan into SQL + params
 * 2. execute that rendered query through the driver
 * 3. remap flat alias-keyed rows back into nested objects
 */
export const fromDriver = <
  Dialect extends string,
  Error = never,
  Context = never
>(
  renderer: Renderer.Renderer<Dialect>,
  sqlDriver: Driver<Dialect, Error, Context>
): Executor<Dialect, Error, Context> => {
  const executor = {
    dialect: renderer.dialect,
    execute(plan: any) {
      const rendered = renderer.render(plan) as Renderer.RenderedQuery<any, Dialect>
      return Effect.map(
        sqlDriver.execute(rendered),
        (rows) => remapRows<any>(rendered, rows)
      )
    }
  }
  return executor as unknown as Executor<Dialect, Error, Context>
}

/**
 * Creates an executor backed by `@effect/sql`'s `SqlClient`.
 */
export const fromSqlClient = <Dialect extends string>(
  renderer: Renderer.Renderer<Dialect>
): Executor<Dialect, unknown, SqlClient.SqlClient> =>
  fromDriver(renderer, driver(renderer.dialect, (query) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql.unsafe<FlatRow>(query.sql, [...query.params]))))

/** Runs an effect within the ambient `@effect/sql` transaction service. */
export const withTransaction = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | SqlError.SqlError, R | SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(effect))

/**
 * Runs an effect in a nested transaction scope.
 *
 * When the ambient `@effect/sql` client is already inside a transaction, the
 * underlying client implementation uses a savepoint.
 */
export const withSavepoint = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | SqlError.SqlError, R | SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(effect))
