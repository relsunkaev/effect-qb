import * as Effect from "effect/Effect"
import * as SqlClient from "@effect/sql/SqlClient"
import * as Stream from "effect/Stream"

import * as CoreExecutor from "../internal/executor.js"
import * as CoreQuery from "../internal/query.js"
import * as CoreRenderer from "../internal/renderer.js"
import type * as Expression from "../internal/scalar.js"
import { renderPostgresPlan } from "./internal/renderer.js"
import {
  narrowPostgresDriverErrorForReadQuery,
  normalizePostgresDriverError,
  type PostgresDriverError,
  type PostgresReadQueryError
} from "./errors/index.js"

/** Postgres-specialized flat row returned by SQL drivers. */
export type FlatRow = CoreExecutor.FlatRow
/** Runtime decode failure raised after SQL execution but before row remapping. */
export type RowDecodeError = CoreExecutor.RowDecodeError
/** Postgres-specialized rendered-query driver. */
export type Driver<Error = never, Context = never> = CoreExecutor.Driver<"postgres", Error, Context>
/** Postgres-specialized executor contract. */
export type Executor<Error = never, Context = never> = CoreExecutor.Executor<"postgres", Error, Context>
/** Postgres-specialized renderer contract. */
export type Renderer = CoreRenderer.Renderer<"postgres">
/** Optional renderer / driver overrides for the standard Postgres executor pipeline. */
export interface MakeOptions<Error = never, Context = never> {
  readonly renderer?: Renderer
  readonly driver?: Driver<Error, Context>
  readonly driverMode?: CoreExecutor.DriverMode
  readonly valueMappings?: Expression.DriverValueMappings
}
/** Standard composed error shape for Postgres executors. */
export type PostgresExecutorError = PostgresDriverError | RowDecodeError
/** Read-query error surface emitted by built-in Postgres executors. */
export type PostgresQueryError<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  Exclude<CoreQuery.CapabilitiesOfPlan<PlanValue>, "read"> extends never ? PostgresReadQueryError : PostgresExecutorError

/** Runs an effect within the ambient Postgres SQL transaction service. */
export const withTransaction = CoreExecutor.withTransaction
/** Runs an effect in a nested Postgres SQL transaction scope. */
export const withSavepoint = CoreExecutor.withSavepoint

/** Postgres executor whose error channel narrows based on the query plan. */
export interface QueryExecutor<Context = never> {
  readonly dialect: "postgres"
  execute<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: CoreQuery.DialectCompatiblePlan<PlanValue, "postgres">
  ): Effect.Effect<CoreQuery.ResultRows<PlanValue>, PostgresQueryError<PlanValue>, Context>
  stream<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: Exclude<CoreQuery.CapabilitiesOfPlan<PlanValue>, "read" | "locking"> extends never
      ? CoreQuery.DialectCompatiblePlan<PlanValue, "postgres">
      : never
  ): Stream.Stream<CoreQuery.ResultRow<PlanValue>, PostgresQueryError<PlanValue>, Context>
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
  renderer: Renderer,
  sqlDriver: Driver<Error, Context>,
  driverMode: CoreExecutor.DriverMode = "raw",
  valueMappings?: Expression.DriverValueMappings
): QueryExecutor<Context> => ({
  dialect: "postgres",
  execute(plan) {
    const rendered = renderer.render(plan)
    return Effect.mapError(
      Effect.flatMap(
        sqlDriver.execute(rendered),
        (rows) => Effect.try({
          try: () => CoreExecutor.decodeRows(rendered, plan, rows, { driverMode, valueMappings }),
          catch: (error) => error as RowDecodeError
        })
      ),
      (error) => {
        if (typeof error === "object" && error !== null && "_tag" in error && error._tag === "RowDecodeError") {
          return error as RowDecodeError
        }
        const normalized = normalizePostgresDriverError(error, rendered)
        return CoreExecutor.hasWriteCapability(plan)
          ? normalized
          : narrowPostgresDriverErrorForReadQuery(normalized)
      }
    ) as Effect.Effect<any, any, Context>
  },
  stream(plan) {
    const rendered = renderer.render(plan)
    return Stream.mapError(
      Stream.mapChunksEffect(
        sqlDriver.stream(rendered),
        (rows) => Effect.try({
          try: () => CoreExecutor.decodeChunk(rendered, plan, rows, { driverMode, valueMappings }),
          catch: (error) => error as RowDecodeError
        })
      ),
      (error) => {
        if (typeof error === "object" && error !== null && "_tag" in error && error._tag === "RowDecodeError") {
          return error as RowDecodeError
        }
        const normalized = normalizePostgresDriverError(error, rendered)
        return CoreExecutor.hasWriteCapability(plan)
          ? normalized
          : narrowPostgresDriverErrorForReadQuery(normalized)
      }
    ) as Stream.Stream<any, any, Context>
  }
})

const sqlClientDriver = (): Driver<any, SqlClient.SqlClient> =>
  driver({
    execute: (query: CoreRenderer.RenderedQuery<any, "postgres">) =>
      Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql.unsafe<FlatRow>(query.sql, [...query.params])),
    stream: (query: CoreRenderer.RenderedQuery<any, "postgres">) =>
      CoreExecutor.streamFromSqlClient(query)
  })

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
    readonly renderer?: Renderer
    readonly driverMode?: CoreExecutor.DriverMode
    readonly valueMappings?: Expression.DriverValueMappings
  }
): QueryExecutor<SqlClient.SqlClient>
export function make<Error = never, Context = never>(
  options: {
    readonly renderer?: Renderer
    readonly driver: Driver<Error, Context>
    readonly driverMode?: CoreExecutor.DriverMode
    readonly valueMappings?: Expression.DriverValueMappings
  }
): QueryExecutor<Context>
export function make<Error = never, Context = never>(
  options: MakeOptions<Error, Context> = {}
): QueryExecutor<any> {
  if (options.driver) {
    return fromDriver(
      options.renderer ?? CoreRenderer.make("postgres", (plan) => renderPostgresPlan(plan, { valueMappings: options.valueMappings })),
      options.driver,
      options.driverMode,
      options.valueMappings
    )
  }
  return fromDriver(
    options.renderer ?? CoreRenderer.make("postgres", (plan) => renderPostgresPlan(plan, { valueMappings: options.valueMappings })),
    sqlClientDriver(),
    options.driverMode,
    options.valueMappings
  )
}

/** Creates a Postgres-specialized executor from a typed implementation callback. */
export const custom = <
  Error = never,
  Context = never
>(
  execute: <PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: CoreQuery.DialectCompatiblePlan<PlanValue, "postgres">
  ) => Effect.Effect<CoreQuery.ResultRows<PlanValue>, Error, Context>
): Executor<Error, Context> =>
  CoreExecutor.make("postgres", execute as any) as Executor<Error, Context>
