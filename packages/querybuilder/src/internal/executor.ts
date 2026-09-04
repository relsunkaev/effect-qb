import * as Chunk from "effect/Chunk"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Formatter from "effect/Formatter"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SchemaIssue from "effect/SchemaIssue"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlError from "effect/unstable/sql/SqlError"
import * as Stream from "effect/Stream"

import * as Expression from "./scalar.js"
import * as ExpressionAst from "./expression-ast.js"
import { resolveImplicationScope, type ImplicationScope } from "./implication-runtime.js"
import { fromDriverValue } from "./runtime/driver-value-mapping.js"
import { expressionRuntimeSchema } from "./runtime/schema.js"
import { flattenSelection } from "./projections.js"
import * as Query from "./query.js"
import * as QueryAst from "./query-ast.js"
import * as Renderer from "./renderer.js"
import * as Plan from "./row-set.js"
import { columnPredicateKey } from "./predicate/runtime.js"
import { isJsonValue } from "./runtime/normalize.js"

/** Flat database row keyed by rendered projection aliases. */
export type FlatRow = Readonly<Record<string, unknown>>
export type DriverMode = "raw" | "normalized"

export interface DecodeOptions {
  readonly driverMode?: DriverMode
  readonly valueMappings?: Expression.DriverValueMappings
  /** Include rejected values in schema issues. For local debugging only. */
  readonly reportInput?: boolean
}

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

type AstBackedExpression = Expression.Any & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.Any
}

export interface RowDecodeError {
  readonly _tag: "RowDecodeError"
  readonly message: string
  readonly dialect: string
  readonly query?: {
    readonly sql: string
    readonly params: ReadonlyArray<unknown>
  }
  readonly projection: {
    readonly alias: string
    readonly path: readonly string[]
  }
  readonly dbType: Expression.DbType.Any
  readonly raw: unknown
  readonly normalized?: unknown
  readonly stage: "normalize" | "schema"
  readonly cause: unknown
  readonly schemaError?: {
    readonly message: string
    readonly issue: unknown
  }
}

/**
 * Formats projection metadata without rows, SQL, causes, or custom schema messages.
 * Projection names and dialect are caller-supplied metadata, not redacted identifiers.
 * `reportInput: true` includes sensitive diagnostic values; do not use it in shared logs.
 * The original error retains its existing raw fields regardless of this formatter.
 */
export const formatRowDecodeError = (
  error: RowDecodeError,
  options: { readonly reportInput?: boolean } = {}
): string => {
  const summary = `RowDecodeError (${error.dialect}/${error.stage}) at ${JSON.stringify(error.projection.path)}`
  if (options.reportInput !== true) return summary
  const issue = error.schemaError?.issue
  return `${summary}\n${Formatter.format({
    raw: error.raw,
    normalized: error.normalized,
    query: error.query,
    cause: SchemaIssue.isIssue(issue) ? SchemaIssue.makeFormatterDefault()(issue) : error.cause
  })}`
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

const setPath = (
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown
): void => {
  let current = target
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index]!
    const existing = current[key]
    if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
      current = existing as Record<string, unknown>
      continue
    }
    const next: Record<string, unknown> = {}
    current[key] = next
    current = next
  }
  current[path[path.length - 1]!] = value
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

export const remapRows = <Row>(
  query: Renderer.RenderedQuery<Row, any>,
  rows: ReadonlyArray<FlatRow>
): ReadonlyArray<Row> =>
  rows.map((row) => {
    const decoded: Record<string, unknown> = {}
    for (const projection of query.projections) {
      if (projection.alias in row) {
        setPath(decoded, projection.path, row[projection.alias])
      }
    }
    return decoded as Row
  })

const makeRowDecodeError = (
  rendered: Renderer.RenderedQuery<any, any>,
  projection: Renderer.RenderedQuery<any, any>["projections"][number],
  expression: Expression.Any,
  raw: unknown,
  stage: RowDecodeError["stage"],
  cause: unknown,
  normalized?: unknown
): RowDecodeError => {
  const schemaError = Schema.isSchemaError(cause)
    ? {
        message: cause.message,
        issue: cause.issue
      }
    : undefined
  return {
    _tag: "RowDecodeError",
    message: stage === "normalize"
      ? `Failed to normalize projection '${projection.alias}'`
      : `Failed to decode projection '${projection.alias}' against its runtime schema`,
    dialect: rendered.dialect,
    query: {
      sql: rendered.sql,
      params: rendered.params
    },
    projection: {
      alias: projection.alias,
      path: projection.path
    },
    dbType: expression[Expression.TypeId].dbType,
    raw,
    normalized,
    stage,
    cause,
    ...(schemaError === undefined ? {} : { schemaError })
  }
}

const hasOptionalSourceDependency = (
  expression: Expression.Any,
  scope: ImplicationScope
): boolean => {
  const state = expression[Expression.TypeId]
  return Object.keys(state.dependencies).some((sourceName) =>
    !scope.absentSourceNames.has(sourceName) && scope.sourceModes.get(sourceName) === "optional")
}

const effectiveRuntimeNullability = (
  expression: Expression.Any,
  scope: ImplicationScope
): Expression.Nullability => {
  const nullability = expression[Expression.TypeId].nullability
  const ast = (expression as AstBackedExpression)[ExpressionAst.TypeId]
  if (nullability === "always") {
    return "always"
  }
  if (ast.kind === "column") {
    const key = columnPredicateKey(ast.tableName, ast.columnName)
    if (scope.absentSourceNames.has(ast.tableName) || scope.nullKeys.has(key)) {
      return "always"
    }
    if (scope.nonNullKeys.has(key)) {
      return "never"
    }
  }
  if (Object.keys(expression[Expression.TypeId].dependencies).some((sourceName) => scope.absentSourceNames.has(sourceName))) {
    return "always"
  }
  return hasOptionalSourceDependency(expression, scope)
    ? "maybe"
    : nullability
}

const dbTypeAllowsTopLevelJsonNull = (
  dbType: Expression.DbType.Any
): boolean => {
  if ("base" in dbType) {
    return dbTypeAllowsTopLevelJsonNull(dbType.base)
  }
  return ("variant" in dbType && dbType.variant === "json") || dbType.runtime === "json"
}

const schemaAcceptsNull = (
  schema: Schema.Top | undefined
): boolean =>
  schema !== undefined && (Schema.is(schema) as (value: unknown) => boolean)(null)

const decodeProjectionValue = (
  rendered: Renderer.RenderedQuery<any, any>,
  projection: Renderer.RenderedQuery<any, any>["projections"][number],
  expression: Expression.Any,
  raw: unknown,
  scope: ImplicationScope,
  driverMode: DriverMode,
  valueMappings?: Expression.DriverValueMappings,
  reportInput = false
): unknown => {
  let normalized = raw
  if (driverMode === "raw") {
    try {
      normalized = fromDriverValue(raw, {
        dialect: rendered.dialect,
        dbType: expression[Expression.TypeId].dbType,
        runtimeSchema: expression[Expression.TypeId].runtimeSchema,
        driverValueMapping: expression[Expression.TypeId].driverValueMapping,
        valueMappings
      })
    } catch (cause) {
      throw makeRowDecodeError(rendered, projection, expression, raw, "normalize", cause)
    }
  }

  const nullability = effectiveRuntimeNullability(expression, scope)
  const schema = expressionRuntimeSchema(expression, { assumptions: scope.assumptions })
  if (normalized === null) {
    if (nullability === "never") {
      if (dbTypeAllowsTopLevelJsonNull(expression[Expression.TypeId].dbType) && schemaAcceptsNull(schema)) {
        return null
      }
      throw makeRowDecodeError(
        rendered,
        projection,
        expression,
        raw,
        "schema",
        new Error("Received null for a non-null projection"),
        normalized
      )
    }
    return null
  }

  if (nullability === "always") {
    throw makeRowDecodeError(
      rendered,
      projection,
      expression,
      raw,
      "schema",
      new Error("Received non-null for an always-null projection"),
      normalized
    )
  }

  if (dbTypeAllowsTopLevelJsonNull(expression[Expression.TypeId].dbType) && !isJsonValue(normalized)) {
    throw makeRowDecodeError(
      rendered,
      projection,
      expression,
      raw,
      "schema",
      new Error("Expected a JSON value"),
      normalized
    )
  }

  if (schema === undefined) {
    return normalized
  }

  if ((Schema.is(schema as Schema.Top) as (value: unknown) => boolean)(normalized)) {
    return normalized
  }

  const decoded = (Schema.decodeUnknownExit as any)(schema)(normalized, { reportInput })
  if (Exit.isSuccess(decoded)) {
    return decoded.value
  }

  const cause = Option.match(Exit.findErrorOption(decoded), {
    onNone: () => decoded.cause,
    onSome: (schemaError) => schemaError
  })
  throw makeRowDecodeError(rendered, projection, expression, raw, "schema", cause, normalized)
}

export const makeRowDecoder = (
  rendered: Renderer.RenderedQuery<any, any>,
  plan: Query.Plan.Any,
  options: DecodeOptions = {}
): ((row: FlatRow) => any) => {
  const projections = flattenSelection(
    Query.getAst(plan).select as Record<string, unknown>
  )
  const byPath = new Map(
    projections.map((projection) => [JSON.stringify(projection.path), projection.expression] as const)
  )
  const driverMode = options.driverMode ?? "raw"
  const valueMappings = options.valueMappings ?? rendered.valueMappings
  const scope = resolveImplicationScope(plan[Plan.TypeId].available, Query.getQueryState(plan).assumptions)
  return (row) => {
    const decoded: Record<string, unknown> = {}
    for (const projection of rendered.projections) {
      const expression = byPath.get(JSON.stringify(projection.path))
      if (expression === undefined) {
        throw new Error(`Rendered projection path '${projection.path.join(".")}' does not exist in the query selection`)
      }
      if (!(projection.alias in row)) {
        throw makeRowDecodeError(
          rendered,
          projection,
          expression,
          undefined,
          "schema",
          new Error(`Missing required projection alias '${projection.alias}'`)
        )
      }
      setPath(
        decoded,
        projection.path,
        decodeProjectionValue(rendered, projection, expression, row[projection.alias], scope, driverMode, valueMappings, options.reportInput)
      )
    }
    return decoded
  }
}

export const decodeChunk = (
  rendered: Renderer.RenderedQuery<any, any>,
  plan: Query.Plan.Any,
  rows: Chunk.Chunk<FlatRow>,
  options: DecodeOptions = {}
): Chunk.Chunk<any> => {
  const decodeRow = makeRowDecoder(rendered, plan, options)
  return Chunk.fromIterable(Chunk.toReadonlyArray(rows).map((row) => decodeRow(row)))
}

export const decodeRows = (
  rendered: Renderer.RenderedQuery<any, any>,
  plan: Query.Plan.Any,
  rows: ReadonlyArray<FlatRow>,
  options: DecodeOptions = {}
): ReadonlyArray<any> => {
  const decodeRow = makeRowDecoder(rendered, plan, options)
  return rows.map((row) => decodeRow(row))
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
  Stream.unwrap(
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      Effect.flatMap(
        Effect.serviceOption(sql.transactionService),
        Option.match({
          onNone: () => sql.reserve,
          onSome: ([connection]) => Effect.succeed(connection)
        })
      ).pipe(
        Effect.map((connection) => connection.executeStream(query.sql, [...query.params], undefined))
      )
    )
  )

export const fromSqlClient = <Dialect extends string>(
  renderer: Renderer.Renderer<Dialect>
): Executor<Dialect, unknown, SqlClient.SqlClient> =>
  fromDriver(renderer, driver(renderer.dialect, {
    execute: (query) =>
      Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql.unsafe<FlatRow>(query.sql, [...query.params])),
    stream: (query) => streamFromSqlClient(query)
  }))

/**
 * Runs an effect within the ambient `effect/unstable/sql` transaction service.
 *
 * Nested calls rely on the underlying client transaction implementation for
 * savepoint behavior.
 */
export const withTransaction = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | SqlError.SqlError, R | SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(effect))
