import * as Schema from "effect/Schema"

import type * as Expression from "../scalar.js"
import { normalizeDbValue } from "./normalize.js"

export type DriverValueMapping = Expression.DriverValueMapping
export type DriverValueMappings = Expression.DriverValueMappings

export interface DriverValueContext {
  readonly dialect?: string
  readonly dbType?: Expression.DbType.Any
  readonly runtimeSchema?: Schema.Top
  readonly driverValueMapping?: DriverValueMapping
  readonly valueMappings?: DriverValueMappings
}

type MappingKey =
  | "fromDriver"
  | "toDriver"
  | "selectSql"
  | "jsonSelectSql"

const runtimeTagOfDbType = (
  dbType: Expression.DbType.Any | undefined
): string | undefined => {
  if (dbType === undefined) {
    return undefined
  }
  if ("base" in dbType) {
    return runtimeTagOfDbType(dbType.base)
  }
  if ("element" in dbType) {
    return "array"
  }
  if ("fields" in dbType) {
    return "record"
  }
  if ("variant" in dbType && dbType.variant === "json") {
    return "json"
  }
  if ("variant" in dbType && (dbType.variant === "enum" || dbType.variant === "set")) {
    return "string"
  }
  return dbType.runtime
}

const familyOfDbType = (
  dbType: Expression.DbType.Any | undefined
): string | undefined => {
  if (dbType === undefined) {
    return undefined
  }
  if ("base" in dbType) {
    return familyOfDbType(dbType.base)
  }
  return dbType.family
}

const mappingCandidates = (
  context: DriverValueContext
): readonly (DriverValueMapping | undefined)[] => {
  const dbType = context.dbType
  const runtimeTag = runtimeTagOfDbType(dbType)
  const family = familyOfDbType(dbType)
  return [
    context.driverValueMapping,
    dbType?.driverValueMapping,
    dbType === undefined ? undefined : context.valueMappings?.[dbType.kind],
    family === undefined ? undefined : context.valueMappings?.[family],
    runtimeTag === undefined ? undefined : context.valueMappings?.[runtimeTag]
  ]
}

const findMapping = <Key extends MappingKey>(
  context: DriverValueContext,
  key: Key
): NonNullable<DriverValueMapping[Key]> | undefined => {
  for (const candidate of mappingCandidates(context)) {
    const value = candidate?.[key]
    if (value !== undefined) {
      return value as NonNullable<DriverValueMapping[Key]>
    }
  }
  return undefined
}

const isJsonDbType = (dbType: Expression.DbType.Any | undefined): boolean => {
  if (dbType === undefined) {
    return false
  }
  if ("base" in dbType) {
    return isJsonDbType(dbType.base)
  }
  if (!("variant" in dbType)) {
    return false
  }
  const variant = dbType.variant as string
  return variant === "json" || variant === "jsonb"
}

const schemaAccepts = (
  schema: Schema.Top | undefined,
  value: unknown
): boolean =>
  schema !== undefined && (Schema.is(schema) as (candidate: unknown) => boolean)(value)

const encodeWithSchema = (
  schema: Schema.Top | undefined,
  value: unknown
): { readonly value: unknown; readonly encoded: boolean } => {
  if (schema === undefined) {
    return { value, encoded: false }
  }
  if (!(Schema.is(schema) as (value: unknown) => boolean)(value)) {
    return { value, encoded: false }
  }
  return {
    value: (Schema.encodeUnknownSync as any)(schema)(value),
    encoded: true
  }
}

const normalizeJsonDriverString = (
  value: string,
  context: DriverValueContext
): unknown | undefined => {
  if (!isJsonDbType(context.dbType) || context.runtimeSchema === undefined) {
    return undefined
  }
  try {
    const parsed = JSON.parse(value)
    if (value.trimStart().startsWith("\"") && schemaAccepts(context.runtimeSchema, parsed)) {
      return parsed
    }
    if (schemaAccepts(context.runtimeSchema, value) && !schemaAccepts(context.runtimeSchema, parsed)) {
      return value
    }
  } catch (error) {
    if (error instanceof SyntaxError && schemaAccepts(context.runtimeSchema, value)) {
      return value
    }
    if (!(error instanceof SyntaxError)) {
      throw error
    }
  }
  return undefined
}

export const toDriverValue = (
  value: unknown,
  context: DriverValueContext
): unknown => {
  if (value === null) {
    return null
  }
  if (value instanceof Date && Number.isNaN(value.getTime())) {
    throw new Error("Expected a valid Date value")
  }
  const dbType = context.dbType
  const encoded = encodeWithSchema(context.runtimeSchema, value)
  let current = encoded.value
  const custom = findMapping(context, "toDriver")
  if (custom !== undefined && dbType !== undefined) {
    return custom(current, dbType)
  }
  if (encoded.encoded && typeof current === "string" && isJsonDbType(dbType)) {
    return current
  }
  return dbType === undefined || !encoded.encoded
    ? current
    : normalizeDbValue(dbType, current)
}

export const fromDriverValue = (
  value: unknown,
  context: DriverValueContext
): unknown => {
  if (value === null) {
    return null
  }
  const dbType = context.dbType
  const custom = findMapping(context, "fromDriver")
  if (custom !== undefined && dbType !== undefined) {
    return custom(value, dbType)
  }
  if (typeof value === "string") {
    const normalizedJsonString = normalizeJsonDriverString(value, context)
    if (normalizedJsonString !== undefined) {
      return normalizedJsonString
    }
  }
  return dbType === undefined
    ? value
    : normalizeDbValue(dbType, value)
}

const textCast = (sql: string): string => `(${sql})::text`

const postgresJsonSql = (
  sql: string,
  dbType: Expression.DbType.Any
): string => {
  const runtimeTag = runtimeTagOfDbType(dbType)
  switch (runtimeTag) {
    case "bigintString":
    case "decimalString":
    case "localDate":
    case "localTime":
    case "offsetTime":
    case "localDateTime":
    case "instant":
    case "year":
      return textCast(sql)
    case "bytes":
      return `encode(${sql}, 'base64')`
    default:
      return sql
  }
}

export const renderSelectSql = (
  sql: string,
  context: DriverValueContext
): string => {
  const dbType = context.dbType
  const custom = findMapping(context, "selectSql")
  return custom !== undefined && dbType !== undefined
    ? custom(sql, dbType)
    : sql
}

export const renderJsonSelectSql = (
  sql: string,
  context: DriverValueContext
): string => {
  const dbType = context.dbType
  const custom = findMapping(context, "jsonSelectSql")
  if (custom !== undefined && dbType !== undefined) {
    return custom(sql, dbType)
  }
  return context.dialect === "postgres" && dbType !== undefined
    ? postgresJsonSql(sql, dbType)
    : sql
}
