import * as Schema from "effect/Schema"

import * as BaseColumn from "../internal/column.js"
import { makeColumnDefinition, type ColumnDefinition } from "../internal/column-state.js"
import type * as Expression from "../internal/scalar.js"
import {
  BigIntStringSchema,
  DecimalStringSchema,
  InstantStringSchema,
  LocalDateStringSchema,
  LocalDateTimeStringSchema,
  LocalTimeStringSchema,
  OffsetTimeStringSchema,
  type BigIntString,
  type DecimalString,
  type InstantString,
  type LocalDateString,
  type LocalDateTimeString,
  type LocalTimeString,
  type OffsetTimeString
} from "../internal/runtime/value.js"
import { postgresDatatypes } from "./datatypes/index.js"

const enrichDbType = <Db extends Expression.DbType.Any>(dbType: Db): Db => {
  const candidate = (postgresDatatypes as unknown as Record<string, (() => Expression.DbType.Any) | undefined>)[dbType.kind]
  return typeof candidate === "function"
    ? { ...candidate(), ...dbType } as Db
    : dbType
}

const primitive = <Type, Db extends Expression.DbType.Any>(
  schema: Schema.Schema<Type, any, any>,
  dbType: Db
): ColumnDefinition<Type, Type, Type, Db, false, false, false, false, false, undefined> =>
  makeColumnDefinition(schema as Schema.Schema<NonNullable<Type>>, {
    dbType,
    nullable: false,
    hasDefault: false,
    generated: false,
    primaryKey: false,
    unique: false,
    references: undefined
  })

const renderNumericDdlType = (
  kind: string,
  options?: BaseColumn.NumericOptions
): string | undefined => {
  if (options === undefined || options.precision === undefined) {
    return undefined
  }
  return options.scale === undefined
    ? `${kind}(${options.precision})`
    : `${kind}(${options.precision},${options.scale})`
}

export const custom = <SchemaType extends Schema.Schema.Any, Db extends Expression.DbType.Any>(
  schema: SchemaType,
  dbType: Db
) =>
  makeColumnDefinition(schema as unknown as Schema.Schema<NonNullable<Schema.Schema.Type<SchemaType>>, any, any>, {
    dbType: enrichDbType(dbType),
    nullable: false,
    hasDefault: false,
    generated: false,
    primaryKey: false,
    unique: false,
    references: undefined,
    ddlType: undefined,
    identity: undefined
  })

export const uuid = () => primitive(Schema.UUID, postgresDatatypes.uuid())
export const text = () => primitive(Schema.String, postgresDatatypes.text())
export const int = () => primitive(Schema.Int, postgresDatatypes.int4())
export const int2 = () => primitive(Schema.Int, postgresDatatypes.int2())
export const int8 = () => primitive(BigIntStringSchema, postgresDatatypes.int8())
export const number = (options?: BaseColumn.NumericOptions) =>
  makeColumnDefinition(DecimalStringSchema, {
    dbType: postgresDatatypes.numeric(),
    nullable: false,
    hasDefault: false,
    generated: false,
    primaryKey: false,
    unique: false,
    references: undefined,
    ddlType: renderNumericDdlType("numeric", options),
    identity: undefined
  })
export const float4 = () => primitive(Schema.Number, postgresDatatypes.float4())
export const float8 = () => primitive(Schema.Number, postgresDatatypes.float8())
export const boolean = () => primitive(Schema.Boolean, postgresDatatypes.boolean())
export const date = () => primitive(LocalDateStringSchema, postgresDatatypes.date())
export const timestamp = () => primitive(LocalDateTimeStringSchema, postgresDatatypes.timestamp())
export const time = () => primitive(LocalTimeStringSchema, postgresDatatypes.time())
export const timetz = () => primitive(OffsetTimeStringSchema, postgresDatatypes.timetz())
export const timestamptz = () => primitive(InstantStringSchema, postgresDatatypes.timestamptz())
export const interval = () => primitive(Schema.String, postgresDatatypes.interval())
export const bytea = () => primitive(Schema.Uint8ArrayFromSelf, postgresDatatypes.bytea())
export const name = () => primitive(Schema.String, postgresDatatypes.name())
export const oid = () => primitive(Schema.Int, postgresDatatypes.oid())
export const regclass = () => primitive(Schema.String, postgresDatatypes.regclass())
export const bit = () => primitive(Schema.String, postgresDatatypes.bit())
export const varbit = () => primitive(Schema.String, postgresDatatypes.varbit())
export const xml = () => primitive(Schema.String, postgresDatatypes.xml())
export const pg_lsn = () => primitive(Schema.String, postgresDatatypes.pg_lsn())
export const char = (length = 1) =>
  makeColumnDefinition(Schema.String, {
    dbType: postgresDatatypes.char(),
    nullable: false,
    hasDefault: false,
    generated: false,
    primaryKey: false,
    unique: false,
    references: undefined,
    ddlType: `char(${length})`,
    identity: undefined
  })
export const varchar = (length?: number) =>
  makeColumnDefinition(Schema.String, {
    dbType: postgresDatatypes.varchar(),
    nullable: false,
    hasDefault: false,
    generated: false,
    primaryKey: false,
    unique: false,
    references: undefined,
    ddlType: length === undefined ? "varchar" : `varchar(${length})`,
    identity: undefined
  })
export const json = <SchemaType extends Schema.Schema.Any>(schema: SchemaType) =>
  makeColumnDefinition(schema as unknown as Schema.Schema<NonNullable<Schema.Schema.Type<SchemaType>>, any, any>, {
    dbType: postgresDatatypes.json(),
    nullable: false,
    hasDefault: false,
    generated: false,
    primaryKey: false,
    unique: false,
    references: undefined,
    ddlType: undefined,
    identity: undefined
  })
export const jsonb = <SchemaType extends Schema.Schema.Any>(schema: SchemaType) =>
  makeColumnDefinition(schema as unknown as Schema.Schema<NonNullable<Schema.Schema.Type<SchemaType>>, any, any>, {
    dbType: postgresDatatypes.jsonb(),
    nullable: false,
    hasDefault: false,
    generated: false,
    primaryKey: false,
    unique: false,
    references: undefined,
    ddlType: undefined,
    identity: undefined
  })

export const nullable = BaseColumn.nullable
export const brand = BaseColumn.brand
export const primaryKey = BaseColumn.primaryKey
export const unique = BaseColumn.unique
const default_ = BaseColumn.default_
export const generated = BaseColumn.generated
export const ddlType = BaseColumn.ddlType
export const array = BaseColumn.array
export const identityAlways = BaseColumn.identityAlways
export const identityByDefault = BaseColumn.identityByDefault
export const foreignKey = BaseColumn.foreignKey
export const index = BaseColumn.index
export const references = BaseColumn.references
export const schema = BaseColumn.schema
export { default_ as default }

export type Any = BaseColumn.Any
export type AnyBound = BaseColumn.AnyBound
