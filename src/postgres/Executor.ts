import * as Effect from "effect/Effect"
import * as SqlClient from "@effect/sql/SqlClient"

import * as CoreExecutor from "../executor.ts"
import * as Query from "./query.ts"
import * as Renderer from "./renderer.ts"
import {
  narrowPostgresDriverErrorForReadQuery,
  normalizePostgresDriverError,
  type PostgresDriverError,
  type PostgresReadQueryError
} from "./errors/index.ts"

/** Postgres-specialized flat row returned by SQL drivers. */
export type FlatRow = CoreExecutor.FlatRow
/** Postgres-specialized rendered-query driver. */
export type Driver<Error = never, Context = never> = CoreExecutor.Driver<"postgres", Error, Context>
/** Postgres-specialized executor contract. */
export type Executor<Error = never, Context = never> = CoreExecutor.Executor<"postgres", Error, Context>
/** Standard composed error shape for Postgres executors. */
export type PostgresExecutorError = PostgresDriverError
/** Read-query error surface emitted by built-in Postgres executors. */
export type PostgresQueryError<PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any>> =
  Exclude<Query.CapabilitiesOfPlan<PlanValue>, "read"> extends never ? PostgresReadQueryError : PostgresExecutorError

/** Runs an effect within the ambient Postgres SQL transaction service. */
export const withTransaction = CoreExecutor.withTransaction
/** Runs an effect in a nested Postgres SQL transaction scope. */
export const withSavepoint = CoreExecutor.withSavepoint

/** Postgres executor whose error channel narrows based on the query plan. */
export interface QueryExecutor<Context = never> {
  readonly dialect: "postgres"
  execute<PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any>>(
    plan: Query.DialectCompatiblePlan<PlanValue, "postgres">
  ): Effect.Effect<Query.ResultRows<PlanValue>, PostgresQueryError<PlanValue>, Context>
}

/** Creates a Postgres-specialized executor from a typed implementation callback. */
export const make = <
  Error = never,
  Context = never
>(
  execute: <PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any>>(
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
): QueryExecutor<Context> => ({
  dialect: "postgres",
  execute(plan) {
    const rendered = renderer.render(plan)
    return Effect.mapError(
      Effect.map(
        sqlDriver.execute(rendered),
        (rows) => CoreExecutor.remapRows<any>(rendered, rows)
      ),
      (error) => {
        const normalized = normalizePostgresDriverError(error, rendered)
        return CoreExecutor.hasWriteCapability(plan)
          ? normalized
          : narrowPostgresDriverErrorForReadQuery(normalized)
      }
    ) as Effect.Effect<any, any, Context>
  }
})

/**
 * Creates a Postgres executor backed by `@effect/sql`'s `SqlClient`.
 *
 * Driver failures are normalized through the Postgres SQLSTATE catalog before
 * they leave the execution layer.
 */
export const fromSqlClient = (
  renderer: Renderer.Renderer
): QueryExecutor<SqlClient.SqlClient> =>
  fromDriver(renderer, driver((query) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql.unsafe<FlatRow>(query.sql, [...query.params]))))
