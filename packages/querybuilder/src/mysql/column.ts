import * as Schema from "effect/Schema"

import * as BaseColumn from "../internal/column.js"
import { makeColumnDefinition, type ColumnDefinition } from "../internal/column-state.js"
import type * as Expression from "../internal/scalar.js"
import {
  DecimalStringSchema,
  LocalDateStringSchema,
  LocalDateTimeStringSchema,
  type DecimalString,
  type LocalDateString,
  type LocalDateTimeString
} from "../internal/runtime/value.js"
import { mysqlDatatypes } from "./datatypes/index.js"

const enrichDbType = <Db extends Expression.DbType.Any>(dbType: Db): Db => {
  const candidate = (mysqlDatatypes as unknown as Record<string, (() => Expression.DbType.Any) | undefined>)[dbType.kind]
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

export const uuid = () => primitive(Schema.UUID, mysqlDatatypes.uuid())
export const text = () => primitive(Schema.String, mysqlDatatypes.text())
export const int = () => primitive(Schema.Int, mysqlDatatypes.int())
export const number = (options?: BaseColumn.NumericOptions) =>
  makeColumnDefinition(DecimalStringSchema, {
    dbType: mysqlDatatypes.decimal(),
    nullable: false,
    hasDefault: false,
    generated: false,
    primaryKey: false,
    unique: false,
    references: undefined,
    ddlType: renderNumericDdlType("decimal", options),
    identity: undefined
  })
export const boolean = () => primitive(Schema.Boolean, mysqlDatatypes.boolean())
export const date = () => primitive(LocalDateStringSchema, mysqlDatatypes.date())
export const datetime = () => primitive(LocalDateTimeStringSchema, mysqlDatatypes.datetime())
export const timestamp = () => primitive(LocalDateTimeStringSchema, mysqlDatatypes.timestamp())
export const json = <SchemaType extends Schema.Schema.Any>(schema: SchemaType) =>
  makeColumnDefinition(schema as unknown as Schema.Schema<NonNullable<Schema.Schema.Type<SchemaType>>, any, any>, {
    dbType: { ...mysqlDatatypes.json(), variant: "json" } as Expression.DbType.Json<"mysql", "json">,
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
export const references = BaseColumn.references
export const schema = BaseColumn.schema
export { default_ as default }

export type Any = BaseColumn.Any
export type AnyBound = BaseColumn.AnyBound
