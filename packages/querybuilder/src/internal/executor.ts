import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as SqlClient from "effect/sql/SqlClient"
import * as SqlError from "effect/sql/SqlError"
import * as Stream from "effect/Stream"

import * as Query from "./query/plan.js"
import * as QueryAst from "./query/ast.js"
import * as Renderer from "./renderer.js"
import { remapRows, type FlatRow } from "./row-decoder.js"

export { decodeChunk, decodeRows, formatRowDecodeError, makeRowDecoder, remapRows } from "./row-decoder.js"
export type { DecodeOptions, DriverMode, FlatRow, RowDecodeError } from "./row-decoder.js"

/** Driver-level result metadata retained alongside returned rows. */
export interface DriverResult {
  readonly rows: ReadonlyArray<FlatRow>
  readonly affectedRows?: number
  readonly insertId?: string | number | bigint
}

/** Decoded execution result plus portable mutation metadata when available. */
export interface ExecutionResult<Row> {
  readonly rows: ReadonlyArray<Row>
  readonly affectedRows?: number
  readonly insertId?: string | number | bigint
}

/** Failure raised when an execution result violates a requested cardinality. */
export interface ResultCardinalityError {
  readonly _tag: "ResultCardinalityError"
  readonly expected: "zeroOrOne" | "exactlyOne" | "nonEmpty"
  readonly actual: number
}

/** Reusable execution handle for one immutable query plan. */
export interface PreparedQuery<Row, Error = never, Context = never> {
  readonly execute: Effect.Effect<ReadonlyArray<Row>, Error, Context>
  readonly executeResult: Effect.Effect<ExecutionResult<Row>, Error, Context>
  readonly stream: Stream.Stream<Row, Error, Context>
}

export interface ExplainOptions {
  readonly analyze?: boolean
  readonly format?: "text" | "json"
}

/**
 * Driver that executes already-rendered SQL.
 *
 * Drivers operate on rendered SQL plus projection metadata and return flat
 * alias-keyed rows. Executors then normalize raw driver values into the
 * canonical runtime contract, validate them against runtime schemas, and remap
 * aliases back into the nested result shape.
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
  executeResult?<Row>(
    query: Renderer.RenderedQuery<Row, Dialect>
  ): Effect.Effect<DriverResult, Error, Context>
  stream<Row>(
    query: Renderer.RenderedQuery<Row, Dialect>
  ): Stream.Stream<FlatRow, Error, Context>
}

/**
 * Public execution contract.
 *
 * Executors only accept complete, dialect-compatible plans. Successful
 * execution yields the compile-time query result contract after canonical
 * scalar normalization plus runtime schema validation.
 */
export interface Executor<
  Dialect extends string = string,
  Error = never,
  Context = never
> {
  readonly dialect: Dialect
  execute<PlanValue extends Query.Plan.Any>(
    plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
  ): Effect.Effect<Query.ResultRows<PlanValue>, Error, Context>
  executeResult<PlanValue extends Query.Plan.Any>(
    plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
  ): Effect.Effect<ExecutionResult<Query.ResultRow<PlanValue>>, Error, Context>
  prepare<PlanValue extends Query.Plan.Any>(
    plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
  ): PreparedQuery<Query.ResultRow<PlanValue>, Error, Context>
  stream<PlanValue extends Query.Plan.Any>(
    plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
  ): Stream.Stream<Query.ResultRow<PlanValue>, Error, Context>
}

type ExecutorBase<
  Dialect extends string,
  Error,
  Context
> = Pick<Executor<Dialect, Error, Context>, "dialect" | "execute" | "stream"> & {
  readonly executeResult?: Executor<Dialect, Error, Context>["executeResult"]
  readonly explain?: (
    plan: Query.Plan.Any,
    options?: ExplainOptions
  ) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>
}

/** Requires an execution effect to contain at most one row. */
export const atMostOne = <Row, Error, Context>(
  self: Effect.Effect<ReadonlyArray<Row>, Error, Context>
): Effect.Effect<Option.Option<Row>, Error | ResultCardinalityError, Context> =>
  Effect.flatMap(self, (rows) =>
    rows.length <= 1
      ? Effect.succeed(rows.length === 0 ? Option.none() : Option.some(rows[0]!))
      : Effect.fail({
          _tag: "ResultCardinalityError",
          expected: "zeroOrOne",
          actual: rows.length
        } satisfies ResultCardinalityError))

/** Requires an execution effect to contain exactly one row. */
export const exactlyOne = <Row, Error, Context>(
  self: Effect.Effect<ReadonlyArray<Row>, Error, Context>
): Effect.Effect<Row, Error | ResultCardinalityError, Context> =>
  Effect.flatMap(self, (rows) =>
    rows.length === 1
      ? Effect.succeed(rows[0]!)
      : Effect.fail({
          _tag: "ResultCardinalityError",
          expected: "exactlyOne",
          actual: rows.length
        } satisfies ResultCardinalityError))

/** Requires an execution effect to contain at least one row. */
export const nonEmpty = <Row, Error, Context>(
  self: Effect.Effect<ReadonlyArray<Row>, Error, Context>
): Effect.Effect<readonly [Row, ...Row[]], Error | ResultCardinalityError, Context> =>
  Effect.flatMap(self, (rows) =>
    rows.length > 0
      ? Effect.succeed(rows as readonly [Row, ...Row[]])
      : Effect.fail({
          _tag: "ResultCardinalityError",
          expected: "nonEmpty",
          actual: 0
        } satisfies ResultCardinalityError))

/** Adds the standard result/cardinality contract to an executor implementation. */
export const withResultContracts = <
  Dialect extends string,
  Error,
  Context
>(
  base: ExecutorBase<Dialect, Error, Context>
): Executor<Dialect, Error, Context> => {
  const executeResult = base.executeResult ?? ((plan) =>
    Effect.map(base.execute(plan), (rows) => ({ rows })))
  return {
    ...base,
    executeResult,
    prepare(plan) {
      return {
        execute: base.execute(plan),
        executeResult: executeResult(plan),
        stream: base.stream(plan)
      }
    }
  } as Executor<Dialect, Error, Context>
}

const hasWriteStatement = (statement: QueryAst.QueryStatement): boolean =>
  statement === "insert" ||
  statement === "update" ||
  statement === "delete" ||
  statement === "truncate" ||
  statement === "merge" ||
  statement === "transaction" ||
  statement === "commit" ||
  statement === "rollback" ||
  statement === "savepoint" ||
  statement === "rollbackTo" ||
  statement === "releaseSavepoint" ||
  statement === "createTable" ||
  statement === "createIndex" ||
  statement === "dropIndex" ||
  statement === "dropTable"

const hasWriteCapabilityInSource = (source: unknown): boolean =>
  typeof source === "object" && source !== null && "plan" in source
    ? hasWriteCapability((source as { readonly plan: Query.Plan.Any }).plan)
    : false

export const hasWriteCapability = (
  plan: Query.Plan.Any
): boolean => {
  const ast = Query.getAst(plan)
  if (hasWriteStatement(ast.kind)) {
    return true
  }
  if (ast.kind === "set") {
    if (ast.setBase && hasWriteCapability((ast.setBase as Query.Plan.Any))) {
      return true
    }
    if ((ast.setOperations ?? []).some((entry) => hasWriteCapability(entry.query as Query.Plan.Any))) {
      return true
    }
  }
  if (ast.from && hasWriteCapabilityInSource(ast.from.source)) {
    return true
  }
  if (ast.into && hasWriteCapabilityInSource(ast.into.source)) {
    return true
  }
  if (ast.target && hasWriteCapabilityInSource(ast.target.source)) {
    return true
  }
  if ((ast.joins ?? []).some((join) => hasWriteCapabilityInSource(join.source))) {
    return true
  }
  return false
}

/**
 * Constructs an executor from a dialect and implementation callback.
 */
export const make = <
  Dialect extends string,
  Error = never,
  Context = never
>(
  dialect: Dialect,
  execute: <PlanValue extends Query.Plan.Any>(
    plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
  ) => Effect.Effect<Query.ResultRows<PlanValue>, Error, Context>
): Executor<Dialect, Error, Context> => withResultContracts({
  dialect,
  execute(plan) {
    return (execute as any)(plan)
  },
  stream(plan) {
    return Stream.unwrap(Effect.map((execute as any)(plan), (rows: ReadonlyArray<any>) => Stream.fromIterable(rows)))
  }
})

/**
 * Constructs a driver from a dialect and execution callback.
 */
export function driver<
  Dialect extends string,
  Error = never,
  Context = never
>(
  dialect: Dialect,
  execute: <Row>(
    query: Renderer.RenderedQuery<Row, Dialect>
  ) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>
): Driver<Dialect, Error, Context>
export function driver<
  Dialect extends string,
  Error = never,
  Context = never
>(
  dialect: Dialect,
  handlers: {
    readonly execute: <Row>(
      query: Renderer.RenderedQuery<Row, Dialect>
    ) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>
    readonly stream: <Row>(
      query: Renderer.RenderedQuery<Row, Dialect>
    ) => Stream.Stream<FlatRow, Error, Context>
    readonly executeResult?: <Row>(
      query: Renderer.RenderedQuery<Row, Dialect>
    ) => Effect.Effect<DriverResult, Error, Context>
  }
): Driver<Dialect, Error, Context>
export function driver<
  Dialect extends string,
  Error = never,
  Context = never
>(
  dialect: Dialect,
  executeOrHandlers:
    | (<Row>(
      query: Renderer.RenderedQuery<Row, Dialect>
    ) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>)
    | {
      readonly execute: <Row>(
        query: Renderer.RenderedQuery<Row, Dialect>
      ) => Effect.Effect<ReadonlyArray<FlatRow>, Error, Context>
      readonly stream: <Row>(
        query: Renderer.RenderedQuery<Row, Dialect>
      ) => Stream.Stream<FlatRow, Error, Context>
      readonly executeResult?: <Row>(
        query: Renderer.RenderedQuery<Row, Dialect>
      ) => Effect.Effect<DriverResult, Error, Context>
    }
): Driver<Dialect, Error, Context> {
  return {
  dialect,
  execute(query) {
    return typeof executeOrHandlers === "function"
      ? executeOrHandlers(query)
      : executeOrHandlers.execute(query)
  },
  stream(query) {
    if (typeof executeOrHandlers === "function") {
      return Stream.unwrap(
        Effect.map(executeOrHandlers(query), (rows) => Stream.fromIterable(rows))
      )
    }
    return executeOrHandlers.stream(query)
  },
  ...(typeof executeOrHandlers === "function" || executeOrHandlers.executeResult === undefined
    ? {}
    : { executeResult: executeOrHandlers.executeResult })
  }
}

/**
 * Creates an executor by composing a renderer with a rendered-query driver.
 *
 * This is the concrete render -> run -> remap pipeline:
 * 1. render a complete query plan into SQL + params
 * 2. execute that rendered query through the driver
 * 3. remap flat alias-keyed rows back into nested objects
 */
export const fromDriver = <
  Dialect extends string,
  Error = never,
  Context = never
>(
  renderer: Renderer.Renderer<Dialect>,
  sqlDriver: Driver<Dialect, Error, Context>
): Executor<Dialect, Error, Context> => {
  const renderedCache = new WeakMap<object, Renderer.RenderedQuery<any, Dialect>>()
  const render = (plan: Query.Plan.Any): Renderer.RenderedQuery<any, Dialect> => {
    const cached = renderedCache.get(plan)
    if (cached !== undefined) {
      return cached
    }
    const rendered = renderer.render(plan as any) as Renderer.RenderedQuery<any, Dialect>
    renderedCache.set(plan, rendered)
    return rendered
  }
  const executor = withResultContracts<Dialect, Error, Context>({
    dialect: renderer.dialect,
    execute<PlanValue extends Query.Plan.Any>(
      plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
    ) {
      const rendered = render(plan as Query.Plan.Any)
      return Effect.map(
        sqlDriver.execute(rendered),
        (rows) => remapRows<any>(rendered, rows)
      ) as Effect.Effect<Query.ResultRows<PlanValue>, Error, Context>
    },
    executeResult<PlanValue extends Query.Plan.Any>(
      plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
    ) {
      const rendered = render(plan as Query.Plan.Any)
      const result = sqlDriver.executeResult
        ? sqlDriver.executeResult(rendered)
        : Effect.map(sqlDriver.execute(rendered), (rows) => ({ rows }))
      return Effect.map(result, ({ rows, ...metadata }) => ({
        ...metadata,
        rows: remapRows<any>(rendered, rows)
      })) as Effect.Effect<ExecutionResult<Query.ResultRow<PlanValue>>, Error, Context>
    },
    stream<PlanValue extends Query.Plan.Any>(
      plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
    ) {
      const rendered = render(plan as Query.Plan.Any)
      return Stream.mapArray(
        sqlDriver.stream(rendered),
        (rows) => remapRows<any>(rendered, rows) as never
      ) as Stream.Stream<Query.ResultRow<PlanValue>, Error, Context>
    }
  })
  return executor
}

/** Builds a dialect-specific EXPLAIN statement around an already rendered query. */
export const explainQuery = <Dialect extends string>(
  query: Renderer.RenderedQuery<any, Dialect>,
  options: ExplainOptions = {}
): Renderer.RenderedQuery<FlatRow, Dialect> => {
  const analyze = options.analyze ?? false
  const format = options.format ?? "text"
  let prefix: string
  switch (query.dialect) {
    case "postgres":
      prefix = `explain (${[
        ...(analyze ? ["analyze true"] : []),
        `format ${format}`
      ].join(", ")}) `
      break
    case "mysql":
      if (analyze && format === "json") {
        throw new Error("MySQL EXPLAIN ANALYZE cannot be combined with JSON format")
      }
      prefix = analyze ? "explain analyze " : format === "json" ? "explain format=json " : "explain "
      break
    case "sqlite":
      if (analyze || format === "json") {
        throw new Error("SQLite EXPLAIN QUERY PLAN does not support analyze or JSON format")
      }
      prefix = "explain query plan "
      break
    default:
      if (analyze || format === "json") {
        throw new Error("Portable EXPLAIN only supports text plans without analyze")
      }
      prefix = "explain "
  }
  return {
    ...query,
    sql: prefix + query.sql,
    projections: [],
    [Renderer.TypeId]: {
      row: undefined as unknown as FlatRow,
      dialect: query.dialect
    }
  }
}

export const streamFromSqlClient = <Dialect extends string>(
  query: Renderer.RenderedQuery<any, Dialect>
): Stream.Stream<FlatRow, SqlError.SqlError, SqlClient.SqlClient> =>
  SqlClient.SqlClient.pipe(
    Effect.flatMap(connectionForStream),
    Effect.map((connection) => connection.executeStream(query.sql, [...query.params], undefined)),
    Stream.unwrap
  )

const connectionForStream = (sql: SqlClient.SqlClient) =>
  Effect.serviceOption(sql.transactionService).pipe(
    Effect.flatMap(Option.match({
      onNone: () => sql.reserve,
      onSome: ([connection]) => Effect.succeed(connection)
    }))
  )

export const fromSqlClient = <Dialect extends string>(
  renderer: Renderer.Renderer<Dialect>
): Executor<Dialect, unknown, SqlClient.SqlClient> =>
  fromDriver(renderer, driver(renderer.dialect, {
    execute: (query) =>
      SqlClient.SqlClient.pipe(
        Effect.flatMap((sql) => sql.unsafe<FlatRow>(query.sql, [...query.params]))
      ),
    stream: (query) => streamFromSqlClient(query)
  }))

/**
 * Runs an effect within the ambient `effect/sql` transaction service.
 *
 * Nested calls rely on the underlying client transaction implementation for
 * savepoint behavior.
 */
export const withTransaction = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | SqlError.SqlError, R | SqlClient.SqlClient> =>
  SqlClient.SqlClient.pipe(
    Effect.flatMap((sql) => sql.withTransaction(effect))
  )
