import * as Effect from "effect/Effect"
import * as SqlClient from "@effect/sql/SqlClient"

import * as CoreExecutor from "../Executor.ts"
import * as Query from "./Query.ts"
import * as Renderer from "./Renderer.ts"
import {
  normalizePostgresDriverError,
  type PostgresDriverError
} from "./errors/index.ts"

/** Postgres-specialized flat row returned by SQL drivers. */
export type FlatRow = CoreExecutor.FlatRow
/** Postgres-specialized rendered-query driver. */
export type Driver<Error = never, Context = never> = CoreExecutor.Driver<"postgres", Error, Context>
/** Postgres-specialized executor contract. */
export type Executor<Error = never, Context = never> = CoreExecutor.Executor<"postgres", Error, Context>
/** Standard composed error shape for Postgres executors. */
export type PostgresExecutorError = PostgresDriverError

/** Creates a Postgres-specialized executor from a typed implementation callback. */
export const make = <
  Error = never,
  Context = never
>(
  execute: <PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any>>(
    plan: Query.DialectCompatiblePlan<PlanValue, "postgres">
  ) => Effect.Effect<Query.ResultRows<PlanValue>, Error, Context>
): Executor<Error, Context> => {
  return {
    dialect: "postgres",
    execute(plan: any) {
      return (execute as any)(plan)
    }
  } as unknown as Executor<Error, Context>
}

/** Constructs a Postgres-specialized SQL driver. */
export const driver = <
  Error = never,
  Context = never
>(
  execute: <Row>(
    query: Renderer.RenderedQuery<Row>
  ) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>
): Driver<Error, Context> =>
  CoreExecutor.driver("postgres", execute)

/**
 * Creates a Postgres executor that normalizes raw driver failures into the
 * structured Postgres error surface before rows are remapped.
 */
export const fromDriver = <
  Error = never,
  Context = never
>(
  renderer: Renderer.Renderer,
  sqlDriver: Driver<Error, Context>
): Executor<PostgresExecutorError, Context> => {
  const normalizedDriver = driver((query) =>
    Effect.mapError(
      sqlDriver.execute(query),
      (error) => normalizePostgresDriverError(error, query)
    ))

  return CoreExecutor.fromDriver(renderer, normalizedDriver) as Executor<PostgresExecutorError, Context>
}

/**
 * Creates a Postgres executor backed by `@effect/sql`'s `SqlClient`.
 *
 * Driver failures are normalized through the Postgres SQLSTATE catalog before
 * they leave the execution layer.
 */
export const fromSqlClient = (
  renderer: Renderer.Renderer
): Executor<PostgresExecutorError, SqlClient.SqlClient> =>
  fromDriver(renderer, driver((query) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql.unsafe<FlatRow>(query.sql, [...query.params]))))
