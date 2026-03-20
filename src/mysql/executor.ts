import * as Effect from "effect/Effect"
import * as SqlClient from "@effect/sql/SqlClient"

import * as CoreExecutor from "../internal/executor.ts"
import * as Query from "./query.ts"
import * as Renderer from "./renderer.ts"
import {
  narrowMysqlDriverErrorForReadQuery,
  normalizeMysqlDriverError,
  type MysqlDriverError,
  type MysqlReadQueryError
} from "./errors/index.ts"

/** MySQL-specialized flat row returned by SQL drivers. */
export type FlatRow = CoreExecutor.FlatRow
/** Runtime decode failure raised after SQL execution but before row remapping. */
export type RowDecodeError = CoreExecutor.RowDecodeError
/** MySQL-specialized rendered-query driver. */
export type Driver<Error = never, Context = never> = CoreExecutor.Driver<"mysql", Error, Context>
/** MySQL-specialized executor contract. */
export type Executor<Error = never, Context = never> = CoreExecutor.Executor<"mysql", Error, Context>
/** Optional renderer / driver overrides for the standard MySQL executor pipeline. */
export interface MakeOptions<Error = never, Context = never> {
  readonly renderer?: Renderer.Renderer
  readonly driver?: Driver<Error, Context>
  readonly driverMode?: CoreExecutor.DriverMode
}
/** Standard composed error shape for MySQL executors. */
export type MysqlExecutorError = MysqlDriverError | RowDecodeError
/** Read-query error surface emitted by built-in MySQL executors. */
export type MysqlQueryError<PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  Exclude<Query.CapabilitiesOfPlan<PlanValue>, "read"> extends never ? MysqlReadQueryError : MysqlExecutorError

/** Runs an effect within the ambient MySQL SQL transaction service. */
export const withTransaction = CoreExecutor.withTransaction
/** Runs an effect in a nested MySQL SQL transaction scope. */
export const withSavepoint = CoreExecutor.withSavepoint

/** MySQL executor whose error channel narrows based on the query plan. */
export interface QueryExecutor<Context = never> {
  readonly dialect: "mysql"
  execute<PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: Query.DialectCompatiblePlan<PlanValue, "mysql">
  ): Effect.Effect<Query.ResultRows<PlanValue>, MysqlQueryError<PlanValue>, Context>
}

/** Constructs a MySQL-specialized SQL driver. */
export const driver = <
  Error = never,
  Context = never
>(
  execute: <Row>(
    query: Renderer.RenderedQuery<Row>
  ) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>
): Driver<Error, Context> =>
  CoreExecutor.driver("mysql", execute)

const fromDriver = <
  Error = never,
  Context = never
>(
  renderer: Renderer.Renderer,
  sqlDriver: Driver<Error, Context>,
  driverMode: CoreExecutor.DriverMode = "raw"
): QueryExecutor<Context> => ({
  dialect: "mysql",
  execute(plan) {
    const rendered = renderer.render(plan)
    return Effect.mapError(
      Effect.flatMap(
        sqlDriver.execute(rendered),
        (rows) => Effect.try({
          try: () => CoreExecutor.decodeRows(rendered, plan, rows, { driverMode }),
          catch: (error) => error as RowDecodeError
        })
      ),
      (error) => {
        if (typeof error === "object" && error !== null && "_tag" in error && error._tag === "RowDecodeError") {
          return error as RowDecodeError
        }
        const normalized = normalizeMysqlDriverError(error, rendered)
        return CoreExecutor.hasWriteCapability(plan)
          ? normalized
          : narrowMysqlDriverErrorForReadQuery(normalized)
      }
    ) as Effect.Effect<any, any, Context>
  }
})

const sqlClientDriver = (): Driver<any, SqlClient.SqlClient> =>
  driver((query) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql.unsafe<FlatRow>(query.sql, [...query.params])))

/**
 * Creates the standard MySQL executor pipeline.
 *
 * By default this uses the built-in MySQL renderer plus the ambient
 * `@effect/sql` `SqlClient`. Advanced callers can override the renderer,
 * driver, or both.
 */
export function make(): QueryExecutor<SqlClient.SqlClient>
export function make(
  options: {
    readonly renderer?: Renderer.Renderer
    readonly driverMode?: CoreExecutor.DriverMode
  }
): QueryExecutor<SqlClient.SqlClient>
export function make<Error = never, Context = never>(
  options: {
    readonly renderer?: Renderer.Renderer
    readonly driver: Driver<Error, Context>
    readonly driverMode?: CoreExecutor.DriverMode
  }
): QueryExecutor<Context>
export function make<Error = never, Context = never>(
  options: MakeOptions<Error, Context> = {}
): QueryExecutor<any> {
  if (options.driver) {
    return fromDriver(options.renderer ?? Renderer.make(), options.driver, options.driverMode)
  }
  return fromDriver(options.renderer ?? Renderer.make(), sqlClientDriver(), options.driverMode)
}

/** Creates a MySQL-specialized executor from a typed implementation callback. */
export const custom = <
  Error = never,
  Context = never
>(
  execute: <PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: Query.DialectCompatiblePlan<PlanValue, "mysql">
  ) => Effect.Effect<Query.ResultRows<PlanValue>, Error, Context>
): Executor<Error, Context> =>
  CoreExecutor.make("mysql", execute as any) as Executor<Error, Context>
