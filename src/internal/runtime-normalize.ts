import type * as Expression from "./expression.ts"
import { mysqlDatatypeKinds } from "../mysql/datatypes/spec.ts"
import { postgresDatatypeKinds } from "../postgres/datatypes/spec.ts"
import type { RuntimeTag } from "./datatypes/shape.ts"

const stripParameterizedKind = (kind: string): string => {
  const openParen = kind.indexOf("(")
  return openParen === -1 ? kind : kind.slice(0, openParen)
}

const stripArrayKind = (kind: string): string => {
  let current = kind
  while (current.endsWith("[]")) {
    current = current.slice(0, -2)
  }
  return current
}

const baseKind = (kind: string): string => stripArrayKind(stripParameterizedKind(kind))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const pad = (value: number, width = 2): string => value.toString().padStart(width, "0")

const formatLocalDate = (value: Date): string =>
  `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`

const formatLocalTime = (value: Date): string => {
  const milliseconds = value.getUTCMilliseconds()
  const base = `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`
  return milliseconds === 0 ? base : `${base}.${pad(milliseconds, 3)}`
}

const formatLocalDateTime = (value: Date): string => {
  const milliseconds = value.getUTCMilliseconds()
  const base = `${formatLocalDate(value)}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`
  return milliseconds === 0 ? base : `${base}.${pad(milliseconds, 3)}`
}

const runtimeTagOfBaseDbType = (
  dialect: string,
  kind: string
): RuntimeTag | undefined => {
  const normalizedKind = baseKind(kind)
  if (dialect === "postgres") {
    return postgresDatatypeKinds[normalizedKind as keyof typeof postgresDatatypeKinds]?.runtime
  }
  if (dialect === "mysql") {
    return mysqlDatatypeKinds[normalizedKind as keyof typeof mysqlDatatypeKinds]?.runtime
  }
  return undefined
}

const expectString = (value: unknown, label: string): string => {
  if (typeof value === "string") {
    return value
  }
  throw new Error(`Expected ${label} as string`)
}

const normalizeNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  if (typeof value === "bigint" && Number.isSafeInteger(Number(value))) {
    return Number(value)
  }
  throw new Error("Expected a finite numeric value")
}

const normalizeBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true
    }
    if (value === 0) {
      return false
    }
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true" || normalized === "t" || normalized === "1") {
      return true
    }
    if (normalized === "false" || normalized === "f" || normalized === "0") {
      return false
    }
  }
  throw new Error("Expected a boolean-like value")
}

const normalizeBigIntString = (value: unknown): string => {
  if (typeof value === "bigint") {
    return value.toString()
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value).toString()
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim()).toString()
  }
  throw new Error("Expected an integer-like bigint value")
}

const canonicalizeDecimalString = (input: string): string => {
  const trimmed = input.trim()
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(trimmed)
  if (match === null) {
    throw new Error("Expected a decimal string")
  }
  const sign = match[1] === "-" ? "-" : ""
  const integer = match[2]!.replace(/^0+(?=\d)/, "") || "0"
  const fraction = (match[3] ?? "").replace(/0+$/, "")
  if (fraction.length === 0) {
    return `${sign}${integer}`
  }
  return `${sign}${integer}.${fraction}`
}

const normalizeDecimalString = (value: unknown): string => {
  if (typeof value === "string") {
    return canonicalizeDecimalString(value)
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const rendered = String(value)
    if (/[eE]/.test(rendered)) {
      throw new Error("Scientific notation is not a supported decimal runtime")
    }
    return canonicalizeDecimalString(rendered)
  }
  throw new Error("Expected a decimal-like value")
}

const normalizeLocalDate = (value: unknown): string => {
  if (value instanceof Date) {
    return formatLocalDate(value)
  }
  const raw = expectString(value, "local date").trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw
  }
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return formatLocalDate(parsed)
  }
  throw new Error("Expected a local-date value")
}

const normalizeLocalTime = (value: unknown): string => {
  if (value instanceof Date) {
    return formatLocalTime(value)
  }
  const raw = expectString(value, "local time").trim()
  if (/^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) {
    return raw
  }
  throw new Error("Expected a local-time value")
}

const normalizeOffsetTime = (value: unknown): string => {
  if (value instanceof Date) {
    return `${formatLocalTime(value)}Z`
  }
  const raw = expectString(value, "offset time").trim()
  if (/^\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    return raw
  }
  throw new Error("Expected an offset-time value")
}

const normalizeLocalDateTime = (value: unknown): string => {
  if (value instanceof Date) {
    return formatLocalDateTime(value)
  }
  const raw = expectString(value, "local datetime").trim()
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) {
    return raw.replace(" ", "T")
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) {
      return formatLocalDateTime(parsed)
    }
  }
  throw new Error("Expected a local-datetime value")
}

const normalizeInstant = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString()
  }
  const raw = expectString(value, "instant").trim()
  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) {
    throw new Error("Instant values require a timezone offset")
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Expected an ISO instant value")
  }
  return parsed.toISOString()
}

const normalizeYear = (value: unknown): string => {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 9999) {
    return pad(value, 4)
  }
  const raw = expectString(value, "year").trim()
  if (/^\d{4}$/.test(raw)) {
    return raw
  }
  throw new Error("Expected a four-digit year")
}

const normalizeBytes = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value)
  }
  if (typeof Buffer !== "undefined" && value instanceof Buffer) {
    return new Uint8Array(value)
  }
  throw new Error("Expected a byte array value")
}

const isJsonValue = (value: unknown): boolean => {
  if (value === null) {
    return true
  }
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return true
    case "object":
      if (Array.isArray(value)) {
        return value.every(isJsonValue)
      }
      return isRecord(value) && Object.values(value).every(isJsonValue)
    default:
      return false
  }
}

const normalizeJson = (value: unknown): unknown => {
  if (typeof value === "string") {
    const parsed = JSON.parse(value)
    if (isJsonValue(parsed)) {
      return parsed
    }
    throw new Error("Parsed JSON value is not a valid JSON runtime")
  }
  if (isJsonValue(value)) {
    return value
  }
  throw new Error("Expected a JSON value")
}

export const normalizeDbValue = (
  dbType: Expression.DbType.Any,
  value: unknown
): unknown => {
  if (value === null) {
    return null
  }
  if ("base" in dbType) {
    return normalizeDbValue(dbType.base, value)
  }
  if ("element" in dbType) {
    if (!Array.isArray(value)) {
      throw new Error("Expected an array value")
    }
    return value.map((entry) => normalizeDbValue(dbType.element, entry))
  }
  if ("fields" in dbType) {
    if (!isRecord(value)) {
      throw new Error("Expected a record value")
    }
    const normalized: Record<string, unknown> = {}
    for (const [key, fieldDbType] of Object.entries(dbType.fields)) {
      if (key in value) {
        normalized[key] = normalizeDbValue(fieldDbType, value[key])
      }
    }
    return normalized
  }
  if ("variant" in dbType && dbType.variant === "json") {
    return normalizeJson(value)
  }
  if ("variant" in dbType && (dbType.variant === "enum" || dbType.variant === "set")) {
    return expectString(value, "text")
  }
  switch (runtimeTagOfBaseDbType(dbType.dialect, dbType.kind)) {
    case "string":
      return expectString(value, "text")
    case "number":
      return normalizeNumber(value)
    case "bigintString":
      return normalizeBigIntString(value)
    case "boolean":
      return normalizeBoolean(value)
    case "json":
      return normalizeJson(value)
    case "localDate":
      return normalizeLocalDate(value)
    case "localTime":
      return normalizeLocalTime(value)
    case "offsetTime":
      return normalizeOffsetTime(value)
    case "localDateTime":
      return normalizeLocalDateTime(value)
    case "instant":
      return normalizeInstant(value)
    case "year":
      return normalizeYear(value)
    case "decimalString":
      return normalizeDecimalString(value)
    case "bytes":
      return normalizeBytes(value)
    case "array":
      if (!Array.isArray(value)) {
        throw new Error("Expected an array value")
      }
      return value
    case "record":
      if (!isRecord(value)) {
        throw new Error("Expected a record value")
      }
      return value
    case "null":
      return null
    case "unknown":
    case undefined:
      return value
  }
}
