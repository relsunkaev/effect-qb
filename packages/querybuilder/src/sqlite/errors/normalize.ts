import type * as Renderer from "../../internal/renderer.js"
import {
  findSqliteErrorDescriptorsByNumberLoose,
  getSqliteErrorDescriptor,
  isSqliteErrorNumber,
  isSqliteErrorSymbol,
  type SqliteErrorDescriptor,
  type SqliteErrorNumber,
  type SqliteErrorSymbol,
} from "./catalog.js"
import type {
  SqliteErrorFields,
  SqliteQueryContext
} from "./fields.js"
import type {
  SqliteErrorLike,
  SqliteKnownErrorBase
} from "./types.js"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const unwrapSqliteDriverCause = (cause: unknown): unknown => {
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

const asBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined

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

const normalizeFields = (error: Record<string, unknown>): SqliteErrorFields => ({
  code: asString(error.code),
  errno: asNumber(error.errno),
  sqlState: asString(error.sqlState),
  sqlMessage: asString(error.sqlMessage),
  fatal: asBoolean(error.fatal),
  sql: asString(error.sql),
  syscall: asString(error.syscall),
  address: asString(error.address),
  port: asNumber(error.port),
  hostname: asString(error.hostname)
})

export type { SqliteErrorLike } from "./types.js"

/** Structured known SQLite error derived from the SQLite result-code catalog. */
export type KnownSqliteError<Symbol extends SqliteErrorSymbol = SqliteErrorSymbol> =
  SqliteKnownErrorBase & { readonly symbol: Symbol }

/** Extracts the normalized SQLite error variant for a specific symbol. */
export type KnownSqliteErrorBySymbol<Symbol extends SqliteErrorSymbol> = KnownSqliteError<Symbol>

/** SQLite-like error whose symbol or number is not in the current catalog. */
export type UnknownSqliteCodeError = Readonly<{
  readonly _tag: "@sqlite/unknown/code"
  readonly code?: string
  readonly errno?: string | number
  readonly message: string
  readonly query?: SqliteQueryContext
  readonly raw: SqliteErrorLike
} & SqliteErrorFields>

/** Fallback for non-SQLite driver failures in the SQLite executor path. */
export type UnknownSqliteDriverError = Readonly<{
  readonly _tag: "@sqlite/unknown/driver"
  readonly message: string
  readonly query?: SqliteQueryContext
  readonly cause: unknown
}>

/** Any SQLite-specific driver failure surfaced by the SQLite executor. */
export type SqliteDriverError =
  | KnownSqliteError
  | UnknownSqliteCodeError
  | UnknownSqliteDriverError

/** Runtime guard for objects that look like SQLite driver errors. */
export const isSqliteErrorLike = (value: unknown): value is SqliteErrorLike =>
  isRecord(value) &&
  (
    typeof value.code === "string" ||
    typeof value.errno === "string" ||
    typeof value.errno === "number" ||
    typeof value.sqlState === "string" ||
    typeof value.sqlMessage === "string" ||
    typeof value.message === "string" ||
    typeof value.fatal === "boolean"
  )

const errorMessageOf = (error: SqliteErrorLike): string =>
  error.sqlMessage ?? error.message ?? "SQLite driver error"

const numberOf = (error: SqliteErrorLike): string | undefined => {
  if (typeof error.errno === "number" && Number.isFinite(error.errno)) {
    return String(error.errno)
  }
  if (typeof error.errno === "string" && error.errno.trim() !== "") {
    return error.errno
  }
  return undefined
}

const findDescriptor = (error: SqliteErrorLike): SqliteErrorDescriptor | undefined => {
  if (typeof error.code === "string" && isSqliteErrorSymbol(error.code)) {
    return getSqliteErrorDescriptor(error.code)
  }
  if (typeof error.code === "string" && isSqliteErrorNumber(error.code)) {
    const matches = findSqliteErrorDescriptorsByNumberLoose(error.code)
    if (matches?.length === 1) {
      return matches[0]
    }
  }
  const number = numberOf(error)
  if (number !== undefined) {
    const matches = findSqliteErrorDescriptorsByNumberLoose(number)
    if (!matches || matches.length === 0) {
      return undefined
    }
    if (matches.length === 1) {
      return matches[0]
    }
    if (typeof error.code === "string") {
      return matches.find((descriptor) => descriptor.symbol === error.code)
    }
  }
  return undefined
}

const makeKnownSqliteError = (
  descriptor: SqliteErrorDescriptor,
  raw: SqliteErrorLike,
  query?: SqliteQueryContext
): SqliteKnownErrorBase => {
  const fields = normalizeFields(raw as Record<string, unknown>)
  return {
    _tag: descriptor.tag,
    category: descriptor.category,
    number: descriptor.number,
    symbol: descriptor.symbol,
    messageTemplate: descriptor.messageTemplate,
    message: errorMessageOf(raw),
    query,
    raw,
    ...fields
  } as SqliteKnownErrorBase
}

/** Normalizes an unknown failure into a structured SQLite driver error. */
export const normalizeSqliteDriverError = (
  cause: unknown,
  query?: SqliteQueryContext | Renderer.RenderedQuery<any, "sqlite">
): SqliteDriverError => {
  const normalizedCause = unwrapSqliteDriverCause(cause)
  const context = query === undefined
    ? undefined
    : "sql" in query
      ? { sql: query.sql, params: query.params }
      : query

  if (!isSqliteErrorLike(normalizedCause)) {
    return {
      _tag: "@sqlite/unknown/driver",
      message: normalizedCause instanceof Error ? normalizedCause.message : "Unknown SQLite driver failure",
      query: context,
      cause
    } as UnknownSqliteDriverError
  }

  const descriptor = findDescriptor(normalizedCause)
  if (descriptor !== undefined) {
    return makeKnownSqliteError(descriptor, normalizedCause, context)
  }

  if (typeof normalizedCause.code === "string" || numberOf(normalizedCause) !== undefined) {
    return {
      _tag: "@sqlite/unknown/code",
      code: asString(normalizedCause.code),
      errno: normalizedCause.errno,
      message: errorMessageOf(normalizedCause),
      query: context,
      raw: normalizedCause,
      ...normalizeFields(normalizedCause as Record<string, unknown>)
    } as UnknownSqliteCodeError
  }

  return {
    _tag: "@sqlite/unknown/driver",
    message: errorMessageOf(normalizedCause),
    query: context,
    cause
  } as UnknownSqliteDriverError
}

/** Type guard for a specific SQLite catalog symbol. */
export const hasSymbol = <Symbol extends SqliteErrorSymbol>(
  error: SqliteDriverError | { readonly symbol?: string },
  symbol: Symbol
): error is KnownSqliteErrorBySymbol<Symbol> =>
  "symbol" in error && error.symbol === symbol

/** Type guard for a specific documented SQLite error number. */
export const hasNumber = <Number extends SqliteErrorNumber>(
  error: SqliteDriverError | { readonly number?: string; readonly errno?: string | number },
  number: Number
): error is KnownSqliteError & { readonly number: Number } =>
  ("number" in error && error.number === number) ||
  ("errno" in error && String(error.errno) === number)
