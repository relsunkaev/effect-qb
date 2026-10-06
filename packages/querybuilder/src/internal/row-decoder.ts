import { isDomain } from "./datatypes/guards.js"
import * as Chunk from "effect/Chunk"
import * as Exit from "effect/Exit"
import * as Formatter from "effect/Formatter"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SchemaIssue from "effect/SchemaIssue"
import * as Expression from "./scalar.js"
import * as ExpressionAst from "./expression-ast.js"
import { resolveImplicationScope, type ImplicationScope } from "./implication-runtime.js"
import { fromDriverValue } from "./runtime/driver-value-mapping.js"
import { expressionRuntimeSchema } from "./runtime/schema.js"
import { flattenSelection } from "./projections.js"
import * as Query from "./query.js"
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

type AstBackedExpression = Expression.Any & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.Any
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
  if (isDomain(dbType)) {
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
  const schema = expressionRuntimeSchema(expression, { assumptions: scope.assumptions })
  let normalized = raw
  if (driverMode === "raw") {
    try {
      normalized = fromDriverValue(raw, {
        dialect: rendered.dialect,
        dbType: expression[Expression.TypeId].dbType,
        runtimeSchema: schema,
        driverValueMapping: expression[Expression.TypeId].driverValueMapping,
        valueMappings
      })
    } catch (cause) {
      throw makeRowDecodeError(rendered, projection, expression, raw, "normalize", cause)
    }
  }

  const nullability = effectiveRuntimeNullability(expression, scope)
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

