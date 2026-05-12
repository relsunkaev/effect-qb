import type * as Brand from "effect/Brand"
import * as Schema from "effect/Schema"

import type { JsonPrimitive, JsonValue } from "../json/types.js"

export type { JsonPrimitive, JsonValue } from "../json/types.js"

export type LocalDateString = string & Brand.Brand<"LocalDateString">
export type LocalTimeString = string & Brand.Brand<"LocalTimeString">
export type OffsetTimeString = string & Brand.Brand<"OffsetTimeString">
export type LocalDateTimeString = string & Brand.Brand<"LocalDateTimeString">
export type InstantString = string & Brand.Brand<"InstantString">
export type YearString = string & Brand.Brand<"YearString">
export type BigIntString = string & Brand.Brand<"BigIntString">
export type DecimalString = string & Brand.Brand<"DecimalString">

const brandString = <BrandName extends string>(
  pattern: RegExp,
  brand: BrandName
): Schema.Schema<string & Brand.Brand<BrandName>> =>
  Schema.String.pipe(
    Schema.pattern(pattern),
    Schema.brand(brand)
  ) as unknown as Schema.Schema<string & Brand.Brand<BrandName>>

export const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/

export const isValidLocalDateString = (value: string): boolean => {
  const match = localDatePattern.exec(value)
  if (match === null) {
    return false
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  parsed.setUTCFullYear(year)
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
}

export const localTimePattern = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/

export const isValidLocalTimeString = (value: string): boolean => {
  const match = localTimePattern.exec(value)
  if (match === null) {
    return false
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3])
  return hour >= 0 && hour <= 23 &&
    minute >= 0 && minute <= 59 &&
    second >= 0 && second <= 59
}

const offsetPattern = /^(?:Z|[+-](\d{2}):(\d{2}))$/

const isValidOffset = (value: string): boolean => {
  const match = offsetPattern.exec(value)
  if (match === null) {
    return false
  }
  if (value === "Z") {
    return true
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour >= 0 && hour <= 23 &&
    minute >= 0 && minute <= 59
}

export const offsetTimePattern = /^(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})$/

export const isValidOffsetTimeString = (value: string): boolean => {
  const match = offsetTimePattern.exec(value)
  return match !== null &&
    isValidLocalTimeString(match[1]!) &&
    isValidOffset(match[2]!)
}

export const localDateTimePattern = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/

export const isValidLocalDateTimeString = (value: string): boolean => {
  const match = localDateTimePattern.exec(value)
  return match !== null &&
    isValidLocalDateString(match[1]!) &&
    isValidLocalTimeString(match[2]!)
}

export const instantPattern = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})$/

export const isValidInstantString = (value: string): boolean => {
  const match = instantPattern.exec(value)
  return match !== null &&
    isValidLocalDateString(match[1]!) &&
    isValidLocalTimeString(match[2]!) &&
    isValidOffset(match[3]!)
}

export const LocalDateStringSchema = Schema.String.pipe(
  Schema.pattern(localDatePattern),
  Schema.filter(isValidLocalDateString),
  Schema.brand("LocalDateString")
) as unknown as Schema.Schema<LocalDateString>

export const LocalTimeStringSchema = Schema.String.pipe(
  Schema.pattern(localTimePattern),
  Schema.filter(isValidLocalTimeString),
  Schema.brand("LocalTimeString")
) as unknown as Schema.Schema<LocalTimeString>

export const OffsetTimeStringSchema = Schema.String.pipe(
  Schema.pattern(offsetTimePattern),
  Schema.filter(isValidOffsetTimeString),
  Schema.brand("OffsetTimeString")
) as unknown as Schema.Schema<OffsetTimeString>

export const LocalDateTimeStringSchema = Schema.String.pipe(
  Schema.pattern(localDateTimePattern),
  Schema.filter(isValidLocalDateTimeString),
  Schema.brand("LocalDateTimeString")
) as unknown as Schema.Schema<LocalDateTimeString>

export const InstantStringSchema = Schema.String.pipe(
  Schema.pattern(instantPattern),
  Schema.filter(isValidInstantString),
  Schema.brand("InstantString")
) as unknown as Schema.Schema<InstantString>

export const YearStringSchema = brandString(
  /^\d{4}$/,
  "YearString"
)

export const canonicalizeBigIntString = (input: string): string => {
  const trimmed = input.trim()
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error("Expected an integer-like bigint value")
  }
  return BigInt(trimmed).toString()
}

export const isCanonicalBigIntString = (value: string): boolean => {
  try {
    return canonicalizeBigIntString(value) === value
  } catch {
    return false
  }
}

export const canonicalizeDecimalString = (input: string): string => {
  const trimmed = input.trim()
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(trimmed)
  if (match === null) {
    throw new Error("Expected a decimal string")
  }
  const sign = match[1] === "-" ? "-" : ""
  const integer = match[2]!.replace(/^0+(?=\d)/, "") || "0"
  const fraction = (match[3] ?? "").replace(/0+$/, "")
  if (fraction.length === 0) {
    if (integer === "0") {
      return "0"
    }
    return `${sign}${integer}`
  }
  return `${sign}${integer}.${fraction}`
}

export const isCanonicalDecimalString = (value: string): boolean => {
  try {
    return canonicalizeDecimalString(value) === value
  } catch {
    return false
  }
}

export const BigIntStringSchema = Schema.String.pipe(
  Schema.filter(isCanonicalBigIntString),
  Schema.brand("BigIntString")
) as unknown as Schema.Schema<BigIntString>

export const DecimalStringSchema = Schema.String.pipe(
  Schema.filter(isCanonicalDecimalString),
  Schema.brand("DecimalString")
) as unknown as Schema.Schema<DecimalString>

export const JsonValueSchema: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(
    Schema.String,
    Schema.Number.pipe(Schema.finite()),
    Schema.Boolean,
    Schema.Null,
    Schema.Array(JsonValueSchema),
    Schema.Record({
      key: Schema.String,
      value: JsonValueSchema
    })
  )
)

export const JsonPrimitiveSchema: Schema.Schema<JsonPrimitive> = Schema.Union(
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  Schema.Null
)
