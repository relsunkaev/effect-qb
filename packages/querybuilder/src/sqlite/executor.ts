import * as Effect from "effect/Effect"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as Stream from "effect/Stream"

import * as CoreExecutor from "../internal/executor.js"
import * as CoreQuery from "../internal/query.js"
import * as CoreRenderer from "../internal/renderer.js"
import type * as Expression from "../internal/scalar.js"
import type { SqliteDatatypeFamily, SqliteDatatypeKind } from "./datatypes/spec.js"
import { renderSqlitePlan } from "./internal/renderer.js"
import {
  narrowSqliteDriverErrorForReadQuery,
  normalizeSqliteDriverError,
  type SqliteDriverError,
  type SqliteReadQueryError
} from "./errors/index.js"

/** SQLite-specialized flat row returned by SQL drivers. */
export type FlatRow = CoreExecutor.FlatRow
/** Runtime decode failure raised after SQL execution but before row remapping. */
export type RowDecodeError = CoreExecutor.RowDecodeError
/** Safe by default; input reporting is an explicit debugging opt-in. */
export const formatRowDecodeError = CoreExecutor.formatRowDecodeError
/** SQLite-specialized rendered-query driver. */
export type Driver<Error = never, Context = never> = CoreExecutor.Driver<"sqlite", Error, Context>
/** SQLite-specialized executor contract. */
export type Executor<Error = never, Context = never> = CoreExecutor.Executor<"sqlite", Error, Context>
/** SQLite-specialized renderer contract. */
export type Renderer = CoreRenderer.Renderer<"sqlite">
export type ValueMappings = Expression.DriverValueMappingsFor<SqliteDatatypeKind | "uuid", SqliteDatatypeFamily | "uuid">
/** Optional renderer / driver overrides for the standard SQLite executor pipeline. */
export interface MakeOptions<Error = never, Context = never> {
  readonly renderer?: Renderer
  readonly driver?: Driver<Error, Context>
  readonly driverMode?: CoreExecutor.DriverMode
  /** Retain rejected values in schema issues for local debugging. */
  readonly reportInput?: boolean
  readonly valueMappings?: ValueMappings
}
/** Standard composed error shape for SQLite executors. */
export type SqliteExecutorError = SqliteDriverError | RowDecodeError
/** Read-query error surface emitted by built-in SQLite executors. */
export type SqliteQueryError<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  Exclude<CoreQuery.CapabilitiesOfPlan<PlanValue>, "read"> extends never ? SqliteReadQueryError | RowDecodeError : SqliteExecutorError

/** Pipeable execution cardinality helpers. */
export const atMostOne = CoreExecutor.atMostOne
export const exactlyOne = CoreExecutor.exactlyOne
export const nonEmpty = CoreExecutor.nonEmpty

/** Runs an effect within the ambient SQLite SQL transaction service. */
export const withTransaction = CoreExecutor.withTransaction

/** SQLite executor whose error channel narrows based on the query plan. */
export interface QueryExecutor<Context = never> extends CoreExecutor.Executor<"sqlite", SqliteQueryError<any>, Context> {
  readonly dialect: "sqlite"
  execute<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: CoreQuery.DialectCompatiblePlan<PlanValue, "sqlite">
  ): Effect.Effect<CoreQuery.ResultRows<PlanValue>, SqliteQueryError<PlanValue>, Context>
  executeResult<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: CoreQuery.DialectCompatiblePlan<PlanValue, "sqlite">
  ): Effect.Effect<CoreExecutor.ExecutionResult<CoreQuery.ResultRow<PlanValue>>, SqliteQueryError<PlanValue>, Context>
  prepare<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: CoreQuery.DialectCompatiblePlan<PlanValue, "sqlite">
  ): CoreExecutor.PreparedQuery<CoreQuery.ResultRow<PlanValue>, SqliteQueryError<PlanValue>, Context>
  stream<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: Exclude<CoreQuery.CapabilitiesOfPlan<PlanValue>, "read" | "locking"> extends never
      ? CoreQuery.DialectCompatiblePlan<PlanValue, "sqlite">
      : never
  ): Stream.Stream<CoreQuery.ResultRow<PlanValue>, SqliteQueryError<PlanValue>, Context>
  explain<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: Exclude<CoreQuery.CapabilitiesOfPlan<PlanValue>, "read" | "locking"> extends never
      ? CoreQuery.DialectCompatiblePlan<PlanValue, "sqlite">
      : never
  ): Effect.Effect<ReadonlyArray<FlatRow>, SqliteQueryError<PlanValue>, Context>
}

type DriverExecute<Error, Context> = <Row>(
  query: CoreRenderer.RenderedQuery<Row, "sqlite">
) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>

type DriverHandlers<Error, Context> = {
  readonly execute: DriverExecute<Error, Context>
  readonly executeResult?: <Row>(
    query: CoreRenderer.RenderedQuery<Row, "sqlite">
  ) => Effect.Effect<CoreExecutor.DriverResult, Error, Context>
  readonly stream: <Row>(
    query: CoreRenderer.RenderedQuery<Row, "sqlite">
  ) => Stream.Stream<FlatRow, Error, Context>
}

/** Constructs a SQLite-specialized SQL driver. */
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
  dialect: "sqlite",
  execute: DriverExecute<Error, Context>
): Driver<Error, Context>
export function driver<
  Error = never,
  Context = never
>(
  dialect: "sqlite",
  handlers: DriverHandlers<Error, Context>
): Driver<Error, Context>
export function driver<
  Error = never,
  Context = never
>(
  dialectOrExecute: "sqlite" | DriverExecute<Error, Context> | DriverHandlers<Error, Context>,
  maybeExecute?: DriverExecute<Error, Context> | DriverHandlers<Error, Context>
): Driver<Error, Context> {
  const executeOrHandlers = typeof dialectOrExecute === "string" ? maybeExecute : dialectOrExecute
  return typeof executeOrHandlers === "function"
    ? CoreExecutor.driver("sqlite", executeOrHandlers)
    : CoreExecutor.driver("sqlite", executeOrHandlers as DriverHandlers<Error, Context>)
}

const fromDriver = <
  Error = never,
  Context = never
>(
  renderer: Renderer,
  sqlDriver: Driver<Error, Context>,
  options: CoreExecutor.DecodeOptions = {}
): QueryExecutor<Context> => {
  const renderedCache = new WeakMap<object, CoreRenderer.RenderedQuery<any, "sqlite">>()
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
    rendered: CoreRenderer.RenderedQuery<any, "sqlite">,
    plan: CoreQuery.Plan.Any
  ) => {
    if (typeof error === "object" && error !== null && "_tag" in error && error._tag === "RowDecodeError") {
      return error as RowDecodeError
    }
    const normalized = normalizeSqliteDriverError(error, rendered)
    return CoreExecutor.hasWriteCapability(plan)
      ? normalized
      : narrowSqliteDriverErrorForReadQuery(normalized)
  }
  return CoreExecutor.withResultContracts({
    dialect: "sqlite",
    execute(plan) {
      const rendered = render(plan)
      return Effect.mapError(
        Effect.flatMap(
          sqlDriver.execute(rendered),
          (rows) => Effect.try({
            try: () => CoreExecutor.decodeRows(rendered, plan, rows, options),
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
            rows: CoreExecutor.decodeRows(rendered, plan, rows, options)
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
            try: () => CoreExecutor.decodeRows(rendered, plan, rows, options) as never,
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
    execute: (query: CoreRenderer.RenderedQuery<any, "sqlite">) =>
      Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql.unsafe<FlatRow>(query.sql, [...query.params])),
    stream: (query: CoreRenderer.RenderedQuery<any, "sqlite">) =>
      Stream.unwrap(
        Effect.map(
          Effect.flatMap(SqlClient.SqlClient, (sql) =>
            sql.unsafe<FlatRow>(query.sql, [...query.params])),
          (rows) => Stream.fromIterable(rows)
        )
      )
  })

/**
 * Creates the standard SQLite executor pipeline.
 *
 * By default this uses the built-in SQLite renderer plus the ambient
 * `effect/unstable/sql` `SqlClient`. Advanced callers can override the renderer,
 * driver, or both.
 */
export function make(): QueryExecutor<SqlClient.SqlClient>
export function make(options: {
  readonly renderer?: Renderer
  readonly driverMode?: CoreExecutor.DriverMode
  readonly reportInput?: boolean
  readonly valueMappings?: ValueMappings
}): QueryExecutor<SqlClient.SqlClient>
export function make<Error = never, Context = never>(
  options: {
    readonly renderer?: Renderer
    readonly driver: Driver<Error, Context>
    readonly driverMode?: CoreExecutor.DriverMode
    readonly reportInput?: boolean
    readonly valueMappings?: ValueMappings
  }
): QueryExecutor<Context>
export function make<Error = never, Context = never>(
  options: MakeOptions<Error, Context> = {}
): QueryExecutor<any> {
  if (options.driver) {
    return fromDriver(
      options.renderer ?? CoreRenderer.makeTrusted("sqlite", (plan) => renderSqlitePlan(plan, { valueMappings: options.valueMappings })),
      options.driver,
      options
    )
  }
  return fromDriver(
    options.renderer ?? CoreRenderer.makeTrusted("sqlite", (plan) => renderSqlitePlan(plan, { valueMappings: options.valueMappings })),
    sqlClientDriver(),
    options
  )
}

/** Creates a SQLite-specialized executor from a typed implementation callback. */
export const custom = <
  Error = never,
  Context = never
>(
  execute: <PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: CoreQuery.DialectCompatiblePlan<PlanValue, "sqlite">
  ) => Effect.Effect<CoreQuery.ResultRows<PlanValue>, Error, Context>
): Executor<Error, Context> =>
  CoreExecutor.make("sqlite", execute as any) as Executor<Error, Context>
