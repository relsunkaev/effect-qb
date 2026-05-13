import * as Schema from "effect/Schema"

import * as BaseColumn from "../internal/column.js"
import { makeColumnDefinition, type AnyColumnDefinition, type ColumnDefinition } from "../internal/column-state.js"
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
  schema: Schema.Schema<Type>,
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

export const custom = <SchemaType extends Schema.Top, Db extends Expression.DbType.Any>(
  schema: SchemaType,
  dbType: Db
) =>
  makeColumnDefinition(schema as unknown as Schema.Schema<NonNullable<Schema.Schema.Type<SchemaType>>>, {
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

export const uuid = () => primitive(Schema.String.check(Schema.isUUID()), mysqlDatatypes.uuid())
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
export const json = <SchemaType extends Schema.Top>(schema: SchemaType) =>
  makeColumnDefinition(schema as unknown as Schema.Schema<NonNullable<Schema.Schema.Type<SchemaType>>>, {
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
type UniqueColumn<Column extends AnyColumnDefinition> = ReturnType<typeof BaseColumn.unique<Column>>

type MysqlUniqueOptions = {
  readonly name?: string
  readonly nullsNotDistinct?: never
  readonly deferrable?: never
  readonly initiallyDeferred?: never
}

type UniqueModifier = {
  <Column extends AnyColumnDefinition>(column: Column): UniqueColumn<Column>
  readonly options: <const Options extends MysqlUniqueOptions>(
    options: Options
  ) => <Column extends AnyColumnDefinition>(column: Column) => UniqueColumn<Column>
}

export const unique = BaseColumn.unique as UniqueModifier
const default_ = BaseColumn.default_
export const generated = BaseColumn.generated
export const driverValueMapping = BaseColumn.driverValueMapping
export const references = BaseColumn.references
export const schema = BaseColumn.schema
export { default_ as default }

export type Any = BaseColumn.Any
export type AnyBound = BaseColumn.AnyBound
