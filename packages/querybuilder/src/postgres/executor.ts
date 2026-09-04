import * as Effect from "effect/Effect"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as Stream from "effect/Stream"

import * as CoreExecutor from "../internal/executor.js"
import * as CoreQuery from "../internal/query.js"
import * as CoreRenderer from "../internal/renderer.js"
import type * as Expression from "../internal/scalar.js"
import type { PostgresDatatypeFamily, PostgresDatatypeKind } from "./datatypes/spec.js"
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
export type ValueMappings = Expression.DriverValueMappingsFor<PostgresDatatypeKind, PostgresDatatypeFamily>
/** PostgreSQL EXPLAIN options. ANALYZE executes the read query. */
export type ExplainOptions = CoreExecutor.ExplainOptions
/** Optional renderer / driver overrides for the standard Postgres executor pipeline. */
export interface MakeOptions<Error = never, Context = never> {
  readonly renderer?: Renderer
  readonly driver?: Driver<Error, Context>
  readonly driverMode?: CoreExecutor.DriverMode
  readonly valueMappings?: ValueMappings
}
/** Standard composed error shape for Postgres executors. */
export type PostgresExecutorError = PostgresDriverError | RowDecodeError
/** Read-query error surface emitted by built-in Postgres executors. */
export type PostgresQueryError<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  Exclude<CoreQuery.CapabilitiesOfPlan<PlanValue>, "read"> extends never ? PostgresReadQueryError | RowDecodeError : PostgresExecutorError

/** Pipeable execution cardinality helpers. */
export const atMostOne = CoreExecutor.atMostOne
export const exactlyOne = CoreExecutor.exactlyOne
export const nonEmpty = CoreExecutor.nonEmpty

/** Runs an effect within the ambient Postgres SQL transaction service. */
export const withTransaction = CoreExecutor.withTransaction

/** Postgres executor whose error channel narrows based on the query plan. */
export interface QueryExecutor<Context = never> extends CoreExecutor.Executor<"postgres", PostgresQueryError<any>, Context> {
  readonly dialect: "postgres"
  execute<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: CoreQuery.DialectCompatiblePlan<PlanValue, "postgres">
  ): Effect.Effect<CoreQuery.ResultRows<PlanValue>, PostgresQueryError<PlanValue>, Context>
  executeResult<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: CoreQuery.DialectCompatiblePlan<PlanValue, "postgres">
  ): Effect.Effect<CoreExecutor.ExecutionResult<CoreQuery.ResultRow<PlanValue>>, PostgresQueryError<PlanValue>, Context>
  prepare<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: CoreQuery.DialectCompatiblePlan<PlanValue, "postgres">
  ): CoreExecutor.PreparedQuery<CoreQuery.ResultRow<PlanValue>, PostgresQueryError<PlanValue>, Context>
  stream<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: Exclude<CoreQuery.CapabilitiesOfPlan<PlanValue>, "read" | "locking"> extends never
      ? CoreQuery.DialectCompatiblePlan<PlanValue, "postgres">
      : never
  ): Stream.Stream<CoreQuery.ResultRow<PlanValue>, PostgresQueryError<PlanValue>, Context>
  explain<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: Exclude<CoreQuery.CapabilitiesOfPlan<PlanValue>, "read" | "locking"> extends never
      ? CoreQuery.DialectCompatiblePlan<PlanValue, "postgres">
      : never,
    options?: ExplainOptions
  ): Effect.Effect<ReadonlyArray<FlatRow>, PostgresQueryError<PlanValue>, Context>
}

type DriverExecute<Error, Context> = <Row>(
  query: CoreRenderer.RenderedQuery<Row, "postgres">
) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>

type DriverHandlers<Error, Context> = {
  readonly execute: DriverExecute<Error, Context>
  readonly executeResult?: <Row>(
    query: CoreRenderer.RenderedQuery<Row, "postgres">
  ) => Effect.Effect<CoreExecutor.DriverResult, Error, Context>
  readonly stream: <Row>(
    query: CoreRenderer.RenderedQuery<Row, "postgres">
  ) => Stream.Stream<FlatRow, Error, Context>
}

/** Constructs a Postgres-specialized SQL driver. */
export function driver<
  Error = never,
  Context = never
>(
  execute: DriverExecute<Error, Context>
): Driver<Error, Context>
export function driver<
  Error = never,
  Context = never
>(
  handlers: DriverHandlers<Error, Context>
): Driver<Error, Context>
export function driver<
  Error = never,
  Context = never
>(
  dialect: "postgres",
  execute: DriverExecute<Error, Context>
): Driver<Error, Context>
export function driver<
  Error = never,
  Context = never
>(
  dialect: "postgres",
  handlers: DriverHandlers<Error, Context>
): Driver<Error, Context>
export function driver<
  Error = never,
  Context = never
>(
  dialectOrExecute: "postgres" | DriverExecute<Error, Context> | DriverHandlers<Error, Context>,
  maybeExecute?: DriverExecute<Error, Context> | DriverHandlers<Error, Context>
): Driver<Error, Context> {
  const executeOrHandlers = typeof dialectOrExecute === "string" ? maybeExecute : dialectOrExecute
  return typeof executeOrHandlers === "function"
    ? CoreExecutor.driver("postgres", executeOrHandlers)
    : CoreExecutor.driver("postgres", executeOrHandlers as DriverHandlers<Error, Context>)
}

const fromDriver = <
  Error = never,
  Context = never
>(
  renderer: Renderer,
  sqlDriver: Driver<Error, Context>,
  driverMode: CoreExecutor.DriverMode = "raw",
  valueMappings?: Expression.DriverValueMappings
): QueryExecutor<Context> => {
  const renderedCache = new WeakMap<object, CoreRenderer.RenderedQuery<any, "postgres">>()
  const render = (plan: CoreQuery.Plan.Any) => {
    const cached = renderedCache.get(plan)
    if (cached !== undefined) {
      return cached
    }
    const rendered = renderer.render(plan as any)
    renderedCache.set(plan, rendered)
    return rendered
  }
  const mapExecutionError = (
    error: unknown,
    rendered: CoreRenderer.RenderedQuery<any, "postgres">,
    plan: CoreQuery.Plan.Any
  ) => {
    if (typeof error === "object" && error !== null && "_tag" in error && error._tag === "RowDecodeError") {
      return error as RowDecodeError
    }
    const normalized = normalizePostgresDriverError(error, rendered)
    return CoreExecutor.hasWriteCapability(plan)
      ? normalized
      : narrowPostgresDriverErrorForReadQuery(normalized)
  }
  return CoreExecutor.withResultContracts({
    dialect: "postgres",
    execute(plan) {
      const rendered = render(plan)
      return Effect.mapError(
        Effect.flatMap(
          sqlDriver.execute(rendered),
          (rows) => Effect.try({
            try: () => CoreExecutor.decodeRows(rendered, plan, rows, { driverMode, valueMappings }),
            catch: (error) => error as RowDecodeError
          })
        ),
        (error) => mapExecutionError(error, rendered, plan)
      ) as Effect.Effect<any, any, Context>
    },
    executeResult(plan) {
      const rendered = render(plan)
      const result = sqlDriver.executeResult
        ? sqlDriver.executeResult(rendered)
        : Effect.map(sqlDriver.execute(rendered), (rows) => ({ rows }))
      return Effect.mapError(
        Effect.flatMap(result, ({ rows, ...metadata }) => Effect.try({
          try: () => ({
            ...metadata,
            rows: CoreExecutor.decodeRows(rendered, plan, rows, { driverMode, valueMappings })
          }),
          catch: (error) => error as RowDecodeError
        })),
        (error) => mapExecutionError(error, rendered, plan)
      ) as Effect.Effect<any, any, Context>
    },
    stream(plan) {
      const rendered = render(plan)
      return Stream.mapError(
        Stream.mapArrayEffect(
          sqlDriver.stream(rendered),
          (rows) => Effect.try({
            try: () => CoreExecutor.decodeRows(rendered, plan, rows, { driverMode, valueMappings }) as never,
            catch: (error) => error as RowDecodeError
          })
        ),
        (error) => mapExecutionError(error, rendered, plan)
      ) as Stream.Stream<any, any, Context>
    },
    explain(plan, options) {
      const rendered = CoreExecutor.explainQuery(render(plan), options)
      return Effect.mapError(
        sqlDriver.execute(rendered),
        (error) => mapExecutionError(error, rendered, plan)
      ) as Effect.Effect<any, any, Context>
    }
  }) as QueryExecutor<Context>
}

const sqlClientDriver = (): Driver<any, SqlClient.SqlClient> =>
  driver({
    execute: (query: CoreRenderer.RenderedQuery<any, "postgres">) =>
      Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql.unsafe<FlatRow>(query.sql, [...query.params])),
    executeResult: (query: CoreRenderer.RenderedQuery<any, "postgres">) =>
      Effect.flatMap(SqlClient.SqlClient, (sql) =>
        Effect.map(sql.unsafe<FlatRow>(query.sql, [...query.params]).raw, (raw) => {
          const result = raw as {
            readonly rows?: ReadonlyArray<FlatRow>
            readonly rowCount?: number | null
          }
          return {
            rows: result.rows ?? [],
            ...(typeof result.rowCount === "number" ? { affectedRows: result.rowCount } : {})
          }
        })),
    stream: (query: CoreRenderer.RenderedQuery<any, "postgres">) =>
      CoreExecutor.streamFromSqlClient(query)
  })

/**
 * Creates the standard Postgres executor pipeline.
 *
 * By default this uses the built-in Postgres renderer plus the ambient
 * `effect/unstable/sql` `SqlClient`. Advanced callers can override the renderer,
 * driver, or both.
 */
export function make(): QueryExecutor<SqlClient.SqlClient>
export function make(
  options: {
    readonly renderer?: Renderer
    readonly driverMode?: CoreExecutor.DriverMode
    readonly valueMappings?: ValueMappings
  }
): QueryExecutor<SqlClient.SqlClient>
export function make<Error = never, Context = never>(
  options: {
    readonly renderer?: Renderer
    readonly driver: Driver<Error, Context>
    readonly driverMode?: CoreExecutor.DriverMode
    readonly valueMappings?: ValueMappings
  }
): QueryExecutor<Context>
export function make<Error = never, Context = never>(
  options: MakeOptions<Error, Context> = {}
): QueryExecutor<any> {
  if (options.driver) {
    return fromDriver(
      options.renderer ?? CoreRenderer.makeTrusted("postgres", (plan) => renderPostgresPlan(plan, { valueMappings: options.valueMappings })),
      options.driver,
      options.driverMode,
      options.valueMappings
    )
  }
  return fromDriver(
    options.renderer ?? CoreRenderer.makeTrusted("postgres", (plan) => renderPostgresPlan(plan, { valueMappings: options.valueMappings })),
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
