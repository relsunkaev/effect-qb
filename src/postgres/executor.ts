import * as Effect from "effect/Effect"
import * as SqlClient from "@effect/sql/SqlClient"

import * as CoreExecutor from "../internal/executor.ts"
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
/** Optional renderer / driver overrides for the standard Postgres executor pipeline. */
export interface MakeOptions<Error = never, Context = never> {
  readonly renderer?: Renderer.Renderer
  readonly driver?: Driver<Error, Context>
}
/** Standard composed error shape for Postgres executors. */
export type PostgresExecutorError = PostgresDriverError
/** Read-query error surface emitted by built-in Postgres executors. */
export type PostgresQueryError<PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  Exclude<Query.CapabilitiesOfPlan<PlanValue>, "read"> extends never ? PostgresReadQueryError : PostgresExecutorError

/** Runs an effect within the ambient Postgres SQL transaction service. */
export const withTransaction = CoreExecutor.withTransaction
/** Runs an effect in a nested Postgres SQL transaction scope. */
export const withSavepoint = CoreExecutor.withSavepoint

/** Postgres executor whose error channel narrows based on the query plan. */
export interface QueryExecutor<Context = never> {
  readonly dialect: "postgres"
  execute<PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: Query.DialectCompatiblePlan<PlanValue, "postgres">
  ): Effect.Effect<Query.ResultRows<PlanValue>, PostgresQueryError<PlanValue>, Context>
}

/** Constructs a Postgres-specialized SQL driver. */
export function driver(execute: any): Driver<any, any>
export function driver(dialect: "postgres", execute: any): Driver<any, any>
export function driver(dialectOrExecute: "postgres" | any, maybeExecute?: any): Driver<any, any> {
  const execute = typeof dialectOrExecute === "string" ? maybeExecute : dialectOrExecute
  return CoreExecutor.driver("postgres", execute as any)
}

const fromDriver = <
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

const sqlClientDriver = (): Driver<any, SqlClient.SqlClient> =>
  driver((query: Renderer.RenderedQuery<any>) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql.unsafe<FlatRow>(query.sql, [...query.params])))

/**
 * Creates the standard Postgres executor pipeline.
 *
 * By default this uses the built-in Postgres renderer plus the ambient
 * `@effect/sql` `SqlClient`. Advanced callers can override the renderer,
 * driver, or both.
 */
export function make(): QueryExecutor<SqlClient.SqlClient>
export function make(
  options: {
    readonly renderer?: Renderer.Renderer
  }
): QueryExecutor<SqlClient.SqlClient>
export function make<Error = never, Context = never>(
  options: {
    readonly renderer?: Renderer.Renderer
    readonly driver: Driver<Error, Context>
  }
): QueryExecutor<Context>
export function make<Error = never, Context = never>(
  options: MakeOptions<Error, Context> = {}
): QueryExecutor<any> {
  if (options.driver) {
    return fromDriver(options.renderer ?? Renderer.make(), options.driver)
  }
  return fromDriver(options.renderer ?? Renderer.make(), sqlClientDriver())
}

/** Creates a Postgres-specialized executor from a typed implementation callback. */
export const custom = <
  Error = never,
  Context = never
>(
  execute: <PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: Query.DialectCompatiblePlan<PlanValue, "postgres">
  ) => Effect.Effect<Query.ResultRows<PlanValue>, Error, Context>
): Executor<Error, Context> =>
  CoreExecutor.make("postgres", execute as any) as Executor<Error, Context>
