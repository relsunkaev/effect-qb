import * as Effect from "effect/Effect"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as Stream from "effect/Stream"

import * as CoreExecutor from "../internal/executor.js"
import * as CoreQuery from "../internal/query.js"
import * as CoreRenderer from "../internal/renderer.js"
import type * as Expression from "../internal/scalar.js"
import type { MysqlDatatypeFamily, MysqlDatatypeKind } from "./datatypes/spec.js"
import { renderMysqlPlan } from "./internal/renderer.js"
import {
  narrowMysqlDriverErrorForReadQuery,
  normalizeMysqlDriverError,
  type MysqlDriverError,
  type MysqlReadQueryError
} from "./errors/index.js"

/** MySQL-specialized flat row returned by SQL drivers. */
export type FlatRow = CoreExecutor.FlatRow
/** Runtime decode failure raised after SQL execution but before row remapping. */
export type RowDecodeError = CoreExecutor.RowDecodeError
/** MySQL-specialized rendered-query driver. */
export type Driver<Error = never, Context = never> = CoreExecutor.Driver<"mysql", Error, Context>
/** MySQL-specialized executor contract. */
export type Executor<Error = never, Context = never> = CoreExecutor.Executor<"mysql", Error, Context>
/** MySQL-specialized renderer contract. */
export type Renderer = CoreRenderer.Renderer<"mysql">
export type ValueMappings = Expression.DriverValueMappingsFor<MysqlDatatypeKind | "uuid", MysqlDatatypeFamily | "uuid">
/** MySQL EXPLAIN options. ANALYZE always uses TREE output. */
export type ExplainOptions =
  | {
      readonly analyze?: false
      readonly format?: "text" | "json"
    }
  | {
      readonly analyze: true
      readonly format?: "text"
    }
/** Optional renderer / driver overrides for the standard MySQL executor pipeline. */
export interface MakeOptions<Error = never, Context = never> {
  readonly renderer?: Renderer
  readonly driver?: Driver<Error, Context>
  readonly driverMode?: CoreExecutor.DriverMode
  readonly valueMappings?: ValueMappings
}
/** Standard composed error shape for MySQL executors. */
export type MysqlExecutorError = MysqlDriverError | RowDecodeError
/** Read-query error surface emitted by built-in MySQL executors. */
export type MysqlQueryError<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>> =
  Exclude<CoreQuery.CapabilitiesOfPlan<PlanValue>, "read"> extends never ? MysqlReadQueryError | RowDecodeError : MysqlExecutorError

/** Pipeable execution cardinality helpers. */
export const atMostOne = CoreExecutor.atMostOne
export const exactlyOne = CoreExecutor.exactlyOne
export const nonEmpty = CoreExecutor.nonEmpty

/** Runs an effect within the ambient MySQL SQL transaction service. */
export const withTransaction = CoreExecutor.withTransaction

/** MySQL executor whose error channel narrows based on the query plan. */
export interface QueryExecutor<Context = never> extends CoreExecutor.Executor<"mysql", MysqlQueryError<any>, Context> {
  readonly dialect: "mysql"
  execute<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: CoreQuery.DialectCompatiblePlan<PlanValue, "mysql">
  ): Effect.Effect<CoreQuery.ResultRows<PlanValue>, MysqlQueryError<PlanValue>, Context>
  executeResult<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: CoreQuery.DialectCompatiblePlan<PlanValue, "mysql">
  ): Effect.Effect<CoreExecutor.ExecutionResult<CoreQuery.ResultRow<PlanValue>>, MysqlQueryError<PlanValue>, Context>
  prepare<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: CoreQuery.DialectCompatiblePlan<PlanValue, "mysql">
  ): CoreExecutor.PreparedQuery<CoreQuery.ResultRow<PlanValue>, MysqlQueryError<PlanValue>, Context>
  stream<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: Exclude<CoreQuery.CapabilitiesOfPlan<PlanValue>, "read" | "locking"> extends never
      ? CoreQuery.DialectCompatiblePlan<PlanValue, "mysql">
      : never
  ): Stream.Stream<CoreQuery.ResultRow<PlanValue>, MysqlQueryError<PlanValue>, Context>
  explain<PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: Exclude<CoreQuery.CapabilitiesOfPlan<PlanValue>, "read" | "locking"> extends never
      ? CoreQuery.DialectCompatiblePlan<PlanValue, "mysql">
      : never,
    options?: ExplainOptions
  ): Effect.Effect<ReadonlyArray<FlatRow>, MysqlQueryError<PlanValue>, Context>
}

/** Constructs a MySQL-specialized SQL driver. */
export function driver<
  Error = never,
  Context = never
>(
  execute: <Row>(
    query: CoreRenderer.RenderedQuery<Row, "mysql">
  ) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>
): Driver<Error, Context>
export function driver<
  Error = never,
  Context = never
>(
  handlers: {
    readonly execute: <Row>(
      query: CoreRenderer.RenderedQuery<Row, "mysql">
    ) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>
    readonly executeResult?: <Row>(
      query: CoreRenderer.RenderedQuery<Row, "mysql">
    ) => Effect.Effect<CoreExecutor.DriverResult, Error, Context>
    readonly stream: <Row>(
      query: CoreRenderer.RenderedQuery<Row, "mysql">
    ) => Stream.Stream<FlatRow, Error, Context>
  }
): Driver<Error, Context>
export function driver<
  Error = never,
  Context = never
>(
  executeOrHandlers:
    | (<Row>(
      query: CoreRenderer.RenderedQuery<Row, "mysql">
    ) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>)
    | {
      readonly execute: <Row>(
        query: CoreRenderer.RenderedQuery<Row, "mysql">
      ) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>
      readonly executeResult?: <Row>(
        query: CoreRenderer.RenderedQuery<Row, "mysql">
      ) => Effect.Effect<CoreExecutor.DriverResult, Error, Context>
      readonly stream: <Row>(
        query: CoreRenderer.RenderedQuery<Row, "mysql">
      ) => Stream.Stream<FlatRow, Error, Context>
    }
): Driver<Error, Context> {
  return CoreExecutor.driver("mysql", executeOrHandlers as any)
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
  const renderedCache = new WeakMap<object, CoreRenderer.RenderedQuery<any, "mysql">>()
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
    rendered: CoreRenderer.RenderedQuery<any, "mysql">,
    plan: CoreQuery.Plan.Any
  ) => {
    if (typeof error === "object" && error !== null && "_tag" in error && error._tag === "RowDecodeError") {
      return error as RowDecodeError
    }
    const normalized = normalizeMysqlDriverError(error, rendered)
    return CoreExecutor.hasWriteCapability(plan)
      ? normalized
      : narrowMysqlDriverErrorForReadQuery(normalized)
  }
  return CoreExecutor.withResultContracts({
    dialect: "mysql",
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
    execute: (query) =>
      Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql.unsafe<FlatRow>(query.sql, [...query.params])),
    executeResult: (query) =>
      Effect.flatMap(SqlClient.SqlClient, (sql) =>
        Effect.map(sql.unsafe<FlatRow>(query.sql, [...query.params]).raw, (raw) => {
          if (Array.isArray(raw)) {
            return { rows: raw as ReadonlyArray<FlatRow> }
          }
          const header = raw as {
            readonly affectedRows?: number
            readonly insertId?: number | string
          } | null
          return {
            rows: [],
            ...(typeof header?.affectedRows === "number" ? { affectedRows: header.affectedRows } : {}),
            ...(header?.insertId === undefined ? {} : { insertId: header.insertId })
          }
        })),
    stream: (query) =>
      CoreExecutor.streamFromSqlClient(query)
  })

/**
 * Creates the standard MySQL executor pipeline.
 *
 * By default this uses the built-in MySQL renderer plus the ambient
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
      options.renderer ?? CoreRenderer.makeTrusted("mysql", (plan) => renderMysqlPlan(plan, { valueMappings: options.valueMappings })),
      options.driver,
      options.driverMode,
      options.valueMappings
    )
  }
  return fromDriver(
    options.renderer ?? CoreRenderer.makeTrusted("mysql", (plan) => renderMysqlPlan(plan, { valueMappings: options.valueMappings })),
    sqlClientDriver(),
    options.driverMode,
    options.valueMappings
  )
}

/** Creates a MySQL-specialized executor from a typed implementation callback. */
export const custom = <
  Error = never,
  Context = never
>(
  execute: <PlanValue extends CoreQuery.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
    plan: CoreQuery.DialectCompatiblePlan<PlanValue, "mysql">
  ) => Effect.Effect<CoreQuery.ResultRows<PlanValue>, Error, Context>
): Executor<Error, Context> =>
  CoreExecutor.make("mysql", execute as any) as Executor<Error, Context>
