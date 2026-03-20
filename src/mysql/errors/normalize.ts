import type * as Renderer from "../../internal/renderer.js"
import {
  findMysqlErrorDescriptorsByNumberLoose,
  getMysqlErrorDescriptor,
  isMysqlErrorNumber,
  isMysqlErrorSymbol,
  type MysqlErrorDescriptor,
  type MysqlErrorNumber,
  type MysqlErrorSymbol,
  type MysqlErrorTag
} from "./catalog.js"
import type {
  MysqlErrorFields,
  MysqlQueryContext
} from "./fields.js"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined

const asBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const normalizeFields = (error: Record<string, unknown>): MysqlErrorFields => ({
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

/** Raw MySQL-like error shape as commonly exposed by client libraries. */
export interface MysqlErrorLike {
  readonly code?: string
  readonly errno?: string | number
  readonly sqlState?: string
  readonly sqlMessage?: string
  readonly message?: string
  readonly fatal?: boolean
  readonly sql?: string
  readonly syscall?: string
  readonly address?: string
  readonly port?: string | number
  readonly hostname?: string
}

/** Structured known MySQL error derived from the generated official catalog. */
export type KnownMysqlError<Symbol extends MysqlErrorSymbol = MysqlErrorSymbol> = Readonly<{
  readonly _tag: MysqlErrorTag<Symbol>
  readonly category: MysqlErrorDescriptor<Symbol>["category"]
  readonly number: MysqlErrorDescriptor<Symbol>["number"]
  readonly symbol: Symbol
  readonly documentedSqlState: MysqlErrorDescriptor<Symbol>["sqlState"]
  readonly messageTemplate: MysqlErrorDescriptor<Symbol>["messageTemplate"]
  readonly message: string
  readonly query?: MysqlQueryContext
  readonly raw: MysqlErrorLike
} & MysqlErrorFields>

/** Extracts the normalized MySQL error variant for a specific symbol. */
export type KnownMysqlErrorBySymbol<Symbol extends MysqlErrorSymbol> = KnownMysqlError<Symbol>

/** MySQL-like error whose symbol or number is not in the current catalog. */
export type UnknownMysqlCodeError = Readonly<{
  readonly _tag: "@mysql/unknown/code"
  readonly code?: string
  readonly errno?: string | number
  readonly message: string
  readonly query?: MysqlQueryContext
  readonly raw: MysqlErrorLike
} & MysqlErrorFields>

/** Fallback for non-MySQL driver failures in the MySQL executor path. */
export type UnknownMysqlDriverError = Readonly<{
  readonly _tag: "@mysql/unknown/driver"
  readonly message: string
  readonly query?: MysqlQueryContext
  readonly cause: unknown
}>

/** Any MySQL-specific driver failure surfaced by the MySQL executor. */
export type MysqlDriverError =
  | KnownMysqlError
  | UnknownMysqlCodeError
  | UnknownMysqlDriverError

/** Runtime guard for objects that look like MySQL driver errors. */
export const isMysqlErrorLike = (value: unknown): value is MysqlErrorLike =>
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

const errorMessageOf = (error: MysqlErrorLike): string =>
  error.sqlMessage ?? error.message ?? "MySQL driver error"

const numberOf = (error: MysqlErrorLike): string | undefined => {
  if (typeof error.errno === "number" && Number.isFinite(error.errno)) {
    return String(error.errno)
  }
  if (typeof error.errno === "string" && error.errno.trim() !== "") {
    return error.errno
  }
  return undefined
}

const findDescriptor = (error: MysqlErrorLike): MysqlErrorDescriptor | undefined => {
  if (typeof error.code === "string" && isMysqlErrorSymbol(error.code)) {
    return getMysqlErrorDescriptor(error.code)
  }
  if (typeof error.code === "string" && isMysqlErrorNumber(error.code)) {
    const matches = findMysqlErrorDescriptorsByNumberLoose(error.code)
    if (matches?.length === 1) {
      return matches[0]
    }
  }
  const number = numberOf(error)
  if (number !== undefined) {
    const matches = findMysqlErrorDescriptorsByNumberLoose(number)
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

const makeKnownMysqlError = <Symbol extends MysqlErrorSymbol>(
  descriptor: MysqlErrorDescriptor<Symbol>,
  raw: MysqlErrorLike,
  query?: MysqlQueryContext
): KnownMysqlError<Symbol> => ({
  _tag: descriptor.tag,
  category: descriptor.category,
  number: descriptor.number,
  symbol: descriptor.symbol,
  documentedSqlState: descriptor.sqlState,
  messageTemplate: descriptor.messageTemplate,
  message: errorMessageOf(raw),
  query,
  raw,
  ...normalizeFields(raw as Record<string, unknown>),
  sqlState: asString(raw.sqlState) ?? descriptor.sqlState
}) as KnownMysqlError<Symbol>

/** Normalizes an unknown failure into a structured MySQL driver error. */
export const normalizeMysqlDriverError = (
  cause: unknown,
  query?: MysqlQueryContext | Renderer.RenderedQuery<any, "mysql">
): MysqlDriverError => {
  const context = query === undefined
    ? undefined
    : "sql" in query
      ? { sql: query.sql, params: query.params }
      : query

  if (!isMysqlErrorLike(cause)) {
    return {
      _tag: "@mysql/unknown/driver",
      message: cause instanceof Error ? cause.message : "Unknown MySQL driver failure",
      query: context,
      cause
    } as UnknownMysqlDriverError
  }

  const descriptor = findDescriptor(cause)
  if (descriptor !== undefined) {
    return makeKnownMysqlError(descriptor, cause, context)
  }

  if (typeof cause.code === "string" || numberOf(cause) !== undefined) {
    return {
      _tag: "@mysql/unknown/code",
      code: asString(cause.code),
      errno: cause.errno,
      message: errorMessageOf(cause),
      query: context,
      raw: cause,
      ...normalizeFields(cause as Record<string, unknown>)
    } as UnknownMysqlCodeError
  }

  return {
    _tag: "@mysql/unknown/driver",
    message: errorMessageOf(cause),
    query: context,
    cause
  } as UnknownMysqlDriverError
}

/** Type guard for a specific MySQL catalog symbol. */
export const hasSymbol = <Symbol extends MysqlErrorSymbol>(
  error: MysqlDriverError | { readonly symbol?: string },
  symbol: Symbol
): error is KnownMysqlErrorBySymbol<Symbol> =>
  "symbol" in error && error.symbol === symbol

/** Type guard for a specific documented MySQL error number. */
export const hasNumber = <Number extends MysqlErrorNumber>(
  error: MysqlDriverError | { readonly number?: string; readonly errno?: string | number },
  number: Number
): error is KnownMysqlError & { readonly number: Number } =>
  ("number" in error && error.number === number) ||
  ("errno" in error && String(error.errno) === number)
