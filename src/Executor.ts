import * as Effect from "effect/Effect"
import * as SqlClient from "@effect/sql/SqlClient"

import * as Query from "./Query.ts"
import * as Renderer from "./Renderer.ts"

/** Flat database row keyed by rendered projection aliases. */
export type FlatRow = Readonly<Record<string, unknown>>

/**
 * Driver that executes already-rendered SQL.
 *
 * This is the concrete render -> run boundary. Drivers operate on
 * `Renderer.RenderedQuery` values and return flat alias-keyed rows, which the
 * executor layer then decodes back into `Query.ResultRow<...>` shapes using
 * the renderer's projection metadata.
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
 * execution always yields `ReadonlyArray<Query.ResultRow<typeof plan>>`.
 */
export interface Executor<
  Dialect extends string = string,
  Error = never,
  Context = never
> {
  readonly dialect: Dialect
  execute<PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any>>(
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

const decodeRows = <Row>(
  query: Renderer.RenderedQuery<Row, any>,
  rows: ReadonlyArray<FlatRow>
): ReadonlyArray<Row> =>
  rows.map((row) => {
    const decoded: Record<string, unknown> = {}
    for (const projection of query.projections) {
      setPath(decoded, projection.path, row[projection.alias])
    }
    return decoded as Row
  })

/**
 * Constructs an executor from a dialect and implementation callback.
 *
 * This is intentionally minimal. It gives future database adapters a stable,
 * strongly-typed surface without committing the library to a concrete runtime
 * strategy yet.
 */
export const make = <
  Dialect extends string,
  Error = never,
  Context = never
>(
  dialect: Dialect,
  execute: <PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any>>(
    plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
  ) => Effect.Effect<Query.ResultRows<PlanValue>, Error, Context>
): Executor<Dialect, Error, Context> => ({
  dialect,
  execute(plan) {
    return execute(plan)
  }
})

/**
 * Constructs a driver from a dialect and execution callback.
 *
 * This is the lowest-level concrete SQL execution hook in the library.
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
 * This is the concrete render -> run -> decode pipeline:
 * 1. render a complete query plan into SQL + params
 * 2. execute that rendered query through the driver
 * 3. decode flat alias-keyed rows back into `Query.ResultRow<typeof plan>`
 */
export const fromDriver = <
  Dialect extends string,
  Error = never,
  Context = never
>(
  renderer: Renderer.Renderer<Dialect>,
  sqlDriver: Driver<Dialect, Error, Context>
): Executor<Dialect, Error, Context> =>
  make(renderer.dialect, (plan) => {
    const rendered = renderer.render(plan) as Renderer.RenderedQuery<Query.ResultRow<typeof plan>, Dialect>
    return Effect.map(sqlDriver.execute(rendered), (rows) =>
      decodeRows<Query.ResultRow<typeof plan>>(rendered, rows) as Query.ResultRows<typeof plan>)
  })

/**
 * Creates an executor backed by `@effect/sql`'s `SqlClient`.
 *
 * The rendered SQL is executed via `sql.unsafe(...)`, and the flat rows are
 * decoded through the renderer's projection metadata into the canonical query
 * result shape.
 */
export const fromSqlClient = <Dialect extends string>(
  renderer: Renderer.Renderer<Dialect>
): Executor<Dialect, unknown, SqlClient.SqlClient> =>
  fromDriver(renderer, driver(renderer.dialect, (query) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql.unsafe<FlatRow>(query.sql, [...query.params]))))
