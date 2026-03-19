import * as Effect from "effect/Effect"
import * as SqlClient from "@effect/sql/SqlClient"

import * as CoreExecutor from "../executor.ts"
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
/** MySQL-specialized rendered-query driver. */
export type Driver<Error = never, Context = never> = CoreExecutor.Driver<"mysql", Error, Context>
/** MySQL-specialized executor contract. */
export type Executor<Error = never, Context = never> = CoreExecutor.Executor<"mysql", Error, Context>
/** Standard composed error shape for MySQL executors. */
export type MysqlExecutorError = MysqlDriverError
/** Read-query error surface emitted by built-in MySQL executors. */
export type MysqlQueryError<PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any>> =
  Exclude<Query.CapabilitiesOfPlan<PlanValue>, "read"> extends never ? MysqlReadQueryError : MysqlExecutorError

/** Runs an effect within the ambient MySQL SQL transaction service. */
export const withTransaction = CoreExecutor.withTransaction
/** Runs an effect in a nested MySQL SQL transaction scope. */
export const withSavepoint = CoreExecutor.withSavepoint

/** MySQL executor whose error channel narrows based on the query plan. */
export interface QueryExecutor<Context = never> {
  readonly dialect: "mysql"
  execute<PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any>>(
    plan: Query.DialectCompatiblePlan<PlanValue, "mysql">
  ): Effect.Effect<Query.ResultRows<PlanValue>, MysqlQueryError<PlanValue>, Context>
}

/** Creates a MySQL-specialized executor from a typed implementation callback. */
export const make = <
  Error = never,
  Context = never
>(
  execute: <PlanValue extends Query.QueryPlan<any, any, any, any, any, any, any, any, any>>(
    plan: Query.DialectCompatiblePlan<PlanValue, "mysql">
  ) => Effect.Effect<Query.ResultRows<PlanValue>, Error, Context>
): Executor<Error, Context> => {
  return {
    dialect: "mysql",
    execute(plan: any) {
      return (execute as any)(plan)
    }
  } as unknown as Executor<Error, Context>
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

/**
 * Creates a MySQL executor that normalizes raw driver failures into the
 * structured MySQL error surface before rows are remapped.
 */
export const fromDriver = <
  Error = never,
  Context = never
>(
  renderer: Renderer.Renderer,
  sqlDriver: Driver<Error, Context>
): QueryExecutor<Context> => ({
  dialect: "mysql",
  execute(plan) {
    const rendered = renderer.render(plan)
    return Effect.mapError(
      Effect.map(
        sqlDriver.execute(rendered),
        (rows) => CoreExecutor.remapRows<any>(rendered, rows)
      ),
      (error) => {
        const normalized = normalizeMysqlDriverError(error, rendered)
        return CoreExecutor.hasWriteCapability(plan)
          ? normalized
          : narrowMysqlDriverErrorForReadQuery(normalized)
      }
    ) as Effect.Effect<any, any, Context>
  }
})

/**
 * Creates a MySQL executor backed by `@effect/sql`'s `SqlClient`.
 *
 * Driver failures are normalized through the MySQL error catalog before they
 * leave the execution layer.
 */
export const fromSqlClient = (
  renderer: Renderer.Renderer
): QueryExecutor<SqlClient.SqlClient> =>
  fromDriver(renderer, driver((query) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql.unsafe<FlatRow>(query.sql, [...query.params]))))
