import type * as Renderer from "../../internal/renderer.js"
import {
  getPostgresErrorDescriptor,
  isPostgresSqlStateCode,
  postgresErrorClasses,
  type PostgresErrorClassCode,
  type PostgresErrorDescriptor,
  type PostgresErrorTag,
  type PostgresSqlStateCode
} from "./catalog.js"
import {
  postgresKnownErrorClassesByCode,
  type KnownPostgresErrorByCode as ExactKnownPostgresErrorByCode
} from "./generated.js"
import type {
  PostgresErrorFields,
  PostgresQueryContext
} from "./fields.js"
import type {
  PostgresErrorLike,
  PostgresKnownErrorBase
} from "./types.js"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const unwrapPostgresDriverCause = (cause: unknown): unknown => {
  let current = cause
  while (
    isRecord(current) &&
    "_tag" in current &&
    "cause" in current
  ) {
    current = current.cause
  }
  return current
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const normalizeFields = (error: Record<string, unknown>): PostgresErrorFields => ({
  severity: asString(error.severity),
  severityNonLocalized: asString(error.severityNonLocalized),
  detail: asString(error.detail),
  hint: asString(error.hint),
  position: asNumber(error.position),
  internalPosition: asNumber(error.internalPosition),
  internalQuery: asString(error.internalQuery),
  where: asString(error.where),
  schemaName: asString(error.schemaName) ?? asString(error.schema),
  tableName: asString(error.tableName) ?? asString(error.table),
  columnName: asString(error.columnName) ?? asString(error.column),
  dataTypeName: asString(error.dataTypeName) ?? asString(error.dataType),
  constraintName: asString(error.constraintName) ?? asString(error.constraint),
  file: asString(error.file),
  line: asNumber(error.line),
  routine: asString(error.routine)
})

const sqlStatePattern = /^[0-9A-Z]{5}$/

export type { PostgresErrorLike } from "./types.js"

/** Structured known Postgres SQLSTATE error derived from the catalog. */
export type KnownPostgresError<Code extends PostgresSqlStateCode = PostgresSqlStateCode> =
  ExactKnownPostgresErrorByCode<Code>

/** Extracts the known Postgres error variant for a specific SQLSTATE code. */
export type KnownPostgresErrorByCode<Code extends PostgresSqlStateCode> = ExactKnownPostgresErrorByCode<Code>

/** Postgres-like error whose SQLSTATE is well-formed but not in the current catalog. */
export type UnknownPostgresSqlStateError = Readonly<{
  readonly _tag: "@postgres/unknown/sqlstate"
  readonly code: string
  readonly classCode: string
  readonly className?: string
  readonly message: string
  readonly query?: PostgresQueryContext
  readonly raw: PostgresErrorLike
} & PostgresErrorFields>

/** Fallback for non-Postgres driver failures in the Postgres executor path. */
export type UnknownPostgresDriverError = Readonly<{
  readonly _tag: "@postgres/unknown/driver"
  readonly message: string
  readonly query?: PostgresQueryContext
  readonly cause: unknown
}>

/** Any Postgres-specific driver failure surfaced by the Postgres executor. */
export type PostgresDriverError =
  | KnownPostgresError
  | UnknownPostgresSqlStateError
  | UnknownPostgresDriverError

/** Runtime guard for objects that look like Postgres driver errors. */
export const isPostgresErrorLike = (value: unknown): value is PostgresErrorLike =>
  isRecord(value) &&
  (
    (typeof value.code === "string" && sqlStatePattern.test(value.code)) ||
    typeof value.severity === "string" ||
    typeof value.message === "string" ||
    typeof value.messagePrimary === "string"
  )

const errorMessageOf = (error: PostgresErrorLike): string =>
  error.message ?? error.messagePrimary ?? "Postgres driver error"

const makeKnownPostgresError = (
  code: PostgresSqlStateCode,
  raw: PostgresErrorLike,
  query?: PostgresQueryContext
): KnownPostgresError => {
  const descriptor = getPostgresErrorDescriptor(code)
  const ErrorClass = postgresKnownErrorClassesByCode[code]
  return new ErrorClass({
    message: errorMessageOf(raw),
    query,
    raw,
    ...normalizeFields(raw as Record<string, unknown>)
  }) as KnownPostgresError
}

/** Normalizes an unknown failure into a structured Postgres driver error. */
export const normalizePostgresDriverError = (
  cause: unknown,
  query?: PostgresQueryContext | Renderer.RenderedQuery<any, "postgres">
): PostgresDriverError => {
  const normalizedCause = unwrapPostgresDriverCause(cause)
  const context = query === undefined
    ? undefined
    : "sql" in query
      ? { sql: query.sql, params: query.params }
      : query

  if (!isPostgresErrorLike(normalizedCause)) {
    return {
      _tag: "@postgres/unknown/driver",
      message: normalizedCause instanceof Error ? normalizedCause.message : "Unknown Postgres driver failure",
      query: context,
      cause
    } as UnknownPostgresDriverError
  }

  if (normalizedCause.code && isPostgresSqlStateCode(normalizedCause.code)) {
    return makeKnownPostgresError(normalizedCause.code, normalizedCause, context)
  }

  if (typeof normalizedCause.code === "string" && sqlStatePattern.test(normalizedCause.code)) {
    const classCode = normalizedCause.code.slice(0, 2)
    return {
      _tag: "@postgres/unknown/sqlstate",
      code: normalizedCause.code,
      classCode,
      className: classCode in postgresErrorClasses
        ? postgresErrorClasses[classCode as PostgresErrorClassCode]
        : undefined,
      message: errorMessageOf(normalizedCause),
      query: context,
      raw: normalizedCause,
      ...normalizeFields(normalizedCause as Record<string, unknown>)
    } as UnknownPostgresSqlStateError
  }

  return {
    _tag: "@postgres/unknown/driver",
    message: errorMessageOf(normalizedCause),
    query: context,
    cause
  } as UnknownPostgresDriverError
}

/** Type guard for a specific SQLSTATE code. */
export const hasSqlState = <Code extends PostgresSqlStateCode>(
  error: PostgresDriverError | { readonly code?: string },
  code: Code
): error is KnownPostgresErrorByCode<Code> =>
  (typeof error === "object" &&
    error !== null &&
    error instanceof postgresKnownErrorClassesByCode[code]) ||
  ("code" in error && error.code === code)
