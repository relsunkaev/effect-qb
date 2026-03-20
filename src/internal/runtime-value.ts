import type * as Brand from "effect/Brand"
import * as Schema from "effect/Schema"

import type { JsonPrimitive, JsonValue } from "./json/types.ts"

export type { JsonPrimitive, JsonValue } from "./json/types.ts"

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

export const LocalDateStringSchema = brandString(
  /^\d{4}-\d{2}-\d{2}$/,
  "LocalDateString"
)

export const LocalTimeStringSchema = brandString(
  /^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/,
  "LocalTimeString"
)

export const OffsetTimeStringSchema = brandString(
  /^\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
  "OffsetTimeString"
)

export const LocalDateTimeStringSchema = brandString(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/,
  "LocalDateTimeString"
)

export const InstantStringSchema = brandString(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
  "InstantString"
)

export const YearStringSchema = brandString(
  /^\d{4}$/,
  "YearString"
)

export const BigIntStringSchema = brandString(
  /^-?\d+$/,
  "BigIntString"
)

export const DecimalStringSchema = brandString(
  /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/,
  "DecimalString"
)

export const JsonValueSchema: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(
    Schema.String,
    Schema.Number,
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
