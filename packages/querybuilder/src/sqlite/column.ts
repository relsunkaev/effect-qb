import * as Schema from "effect/Schema"

import * as BaseColumn from "../internal/column.js"
import { makeColumnDefinition, type AnyColumnDefinition, type ColumnDefinition } from "../internal/column-state.js"
import type * as Expression from "../internal/scalar.js"
import type { NonEmptyStringInput } from "../internal/table-options.js"
import { enrichDbType } from "../internal/datatypes/enrich.js"
import {
  DecimalStringSchema,
  LocalDateStringSchema,
  LocalDateTimeStringSchema,
  LocalTimeStringSchema,
  type DecimalString,
  type LocalDateString,
  type LocalDateTimeString,
  type LocalTimeString
} from "../internal/runtime/value.js"
import { sqliteDatatypes } from "./datatypes/index.js"

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
    dbType: enrichDbType(sqliteDatatypes, dbType),
    nullable: false,
    hasDefault: false,
    generated: false,
    primaryKey: false,
    unique: false,
    references: undefined,
    ddlType: undefined,
    identity: undefined
  })

export const uuid = () => primitive(Schema.String.check(Schema.isUUID()), sqliteDatatypes.uuid())
export const text = () => primitive(Schema.String, sqliteDatatypes.text())
export const int = () => primitive(Schema.Int, sqliteDatatypes.int())
export const number = (options?: BaseColumn.NumericOptions) =>
  makeColumnDefinition(DecimalStringSchema, {
    dbType: sqliteDatatypes.decimal(),
    nullable: false,
    hasDefault: false,
    generated: false,
    primaryKey: false,
    unique: false,
    references: undefined,
    ddlType: renderNumericDdlType("decimal", options),
    identity: undefined
  })
export const boolean = () => primitive(Schema.Boolean, sqliteDatatypes.boolean())
export const date = () => primitive(LocalDateStringSchema, sqliteDatatypes.date())
export const time = () => primitive(LocalTimeStringSchema, sqliteDatatypes.time())
export const datetime = () => primitive(LocalDateTimeStringSchema, sqliteDatatypes.datetime())
export const timestamp = () => primitive(LocalDateTimeStringSchema, sqliteDatatypes.timestamp())
export const json = <SchemaType extends Schema.Top>(schema: SchemaType) =>
  makeColumnDefinition(schema as unknown as Schema.Schema<NonNullable<Schema.Schema.Type<SchemaType>>>, {
    dbType: { ...sqliteDatatypes.json(), variant: "json" } as Expression.DbType.Json<"sqlite", "json">,
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

type SqliteUniqueOptions = {
  readonly name?: string
  readonly nullsNotDistinct?: never
  readonly deferrable?: never
  readonly initiallyDeferred?: never
}

type NonEmptyOptionNameInput<Options> = Options extends { readonly name: infer Name extends string }
  ? NonEmptyStringInput<Name> extends never ? never : unknown
  : unknown

type UniqueModifier = {
  <Column extends AnyColumnDefinition>(column: Column): UniqueColumn<Column>
  readonly options: <const Options extends SqliteUniqueOptions>(
    options: Options & NonEmptyOptionNameInput<Options>
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
