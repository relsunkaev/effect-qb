import type * as Brand from "effect/Brand"
import * as Schema from "effect/Schema"

import {
  type AnyColumnDefinition,
  type HasDefault,
  type InsertType,
  type IsGenerated,
  type IsNullable,
  type SelectType,
  type UpdateType
} from "./column-state.js"

export type TableSchemaVariant = "select" | "insert" | "update"

/** Normalized field map used by table definitions. */
export type TableFieldMap = Record<string, AnyColumnDefinition>

type GeneratedKeys<Fields extends TableFieldMap> = {
  [K in keyof Fields]: IsGenerated<Fields[K]> extends true ? K : never
}[keyof Fields]

type OptionalInsertKeys<Fields extends TableFieldMap> = {
  [K in keyof Fields]:
    IsGenerated<Fields[K]> extends true ? never :
      IsNullable<Fields[K]> extends true ? K :
        HasDefault<Fields[K]> extends true ? K :
          never
}[keyof Fields]

type RequiredInsertKeys<Fields extends TableFieldMap> = Exclude<keyof Fields, GeneratedKeys<Fields> | OptionalInsertKeys<Fields>>

type UpdateKeys<Fields extends TableFieldMap, PrimaryKey extends keyof Fields> = Exclude<
  keyof Fields,
  GeneratedKeys<Fields> | PrimaryKey
>

type Simplify<T> = { [K in keyof T]: T[K] } & {}

type BrandedValue<
  Value,
  BrandName extends string
> = [Extract<Value, null | undefined>] extends [never]
  ? Value & Brand.Brand<BrandName>
  : Exclude<Value, null | undefined> & Brand.Brand<BrandName> | Extract<Value, null | undefined>

type BrandNameOf<
  TableName extends string,
  ColumnName extends string
> = `${TableName}.${ColumnName}`

type BrandedSelectType<
  Column extends AnyColumnDefinition,
  TableName extends string,
  ColumnName extends string
> = Column["metadata"]["brand"] extends true
  ? BrandedValue<SelectType<Column>, BrandNameOf<TableName, ColumnName>>
  : SelectType<Column>

type BrandedInsertType<
  Column extends AnyColumnDefinition,
  TableName extends string,
  ColumnName extends string
> = Column["metadata"]["brand"] extends true
  ? BrandedValue<InsertType<Column>, BrandNameOf<TableName, ColumnName>>
  : InsertType<Column>

type BrandedUpdateType<
  Column extends AnyColumnDefinition,
  TableName extends string,
  ColumnName extends string
> = Column["metadata"]["brand"] extends true
  ? BrandedValue<UpdateType<Column>, BrandNameOf<TableName, ColumnName>>
  : UpdateType<Column>

/** Row shape returned by selecting from a table. */
export type SelectRow<
  TableName extends string,
  Fields extends TableFieldMap
> = Simplify<{
  [K in keyof Fields]: BrandedSelectType<Fields[K], TableName, Extract<K, string>>
}>

/** Insert payload derived from a table field map. */
export type InsertRow<
  TableName extends string,
  Fields extends TableFieldMap
> = Simplify<
  { [K in RequiredInsertKeys<Fields>]: BrandedInsertType<Fields[K], TableName, Extract<K, string>> } &
    { [K in OptionalInsertKeys<Fields>]?: BrandedInsertType<Fields[K], TableName, Extract<K, string>> }
>

/** Update payload derived from a table field map and primary key. */
export type UpdateRow<
  TableName extends string,
  Fields extends TableFieldMap,
  PrimaryKey extends keyof Fields
> = Simplify<
  Partial<{
    [K in UpdateKeys<Fields, PrimaryKey>]: BrandedUpdateType<Fields[K], TableName, Extract<K, string>>
  }>
>

const maybeBrandSchema = (
  column: AnyColumnDefinition,
  tableName: string,
  columnName: string
): Schema.Top =>
  column.metadata.brand === true
    ? Schema.brand(`${tableName}.${columnName}`)(column.schema)
    : column.schema

const selectSchema = (
  column: AnyColumnDefinition,
  tableName: string,
  columnName: string
): Schema.Top =>
  column.metadata.nullable ? Schema.NullOr(maybeBrandSchema(column, tableName, columnName)) : maybeBrandSchema(column, tableName, columnName)

const insertSchema = (
  column: AnyColumnDefinition,
  tableName: string,
  columnName: string
): any | undefined => {
  if (column.metadata.generated) {
    return undefined
  }
  const base = column.metadata.nullable
    ? Schema.NullOr(maybeBrandSchema(column, tableName, columnName))
    : maybeBrandSchema(column, tableName, columnName)
  return column.metadata.nullable || column.metadata.hasDefault ? Schema.optional(base) : base
}

const updateSchema = (
  column: AnyColumnDefinition,
  tableName: string,
  columnName: string,
  isPrimaryKey: boolean
): any | undefined => {
  if (column.metadata.generated || isPrimaryKey) {
    return undefined
  }
  const base = column.metadata.nullable
    ? Schema.NullOr(maybeBrandSchema(column, tableName, columnName))
    : maybeBrandSchema(column, tableName, columnName)
  return Schema.optional(base)
}

type SchemaOfVariant<
  Variant extends TableSchemaVariant,
  TableName extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
> = Variant extends "select" ? Schema.Decoder<SelectRow<TableName, Fields>, never>
  : Variant extends "insert" ? Schema.Decoder<InsertRow<TableName, Fields>, never>
  : Schema.Decoder<UpdateRow<TableName, Fields, PrimaryKeyColumns>, never>

const fieldSchemaForVariant = (
  variant: TableSchemaVariant,
  column: AnyColumnDefinition,
  tableName: string,
  columnName: string,
  primaryKeySet: ReadonlySet<string>
): any | undefined => {
  switch (variant) {
    case "select":
      return selectSchema(column, tableName, columnName)
    case "insert":
      return insertSchema(column, tableName, columnName)
    case "update":
      return updateSchema(column, tableName, columnName, primaryKeySet.has(columnName))
  }
}

export const deriveSchema = <
  Variant extends TableSchemaVariant,
  TableName extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  variant: Variant,
  tableName: TableName,
  fields: Fields,
  primaryKeyColumns: readonly PrimaryKeyColumns[]
): SchemaOfVariant<Variant, TableName, Fields, PrimaryKeyColumns> => {
  const primaryKeySet = new Set<string>(primaryKeyColumns)
  const structFields: Record<string, any> = {}
  for (const [key, column] of Object.entries(fields)) {
    const schema = fieldSchemaForVariant(variant, column, tableName, key, primaryKeySet)
    if (schema !== undefined) {
      structFields[key] = schema
    }
  }
  return Schema.Struct(structFields) as unknown as SchemaOfVariant<Variant, TableName, Fields, PrimaryKeyColumns>
}

export const deriveSelectSchema = <
  TableName extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  tableName: TableName,
  fields: Fields,
  primaryKeyColumns: readonly PrimaryKeyColumns[]
): Schema.Decoder<SelectRow<TableName, Fields>, never> =>
  deriveSchema("select", tableName, fields, primaryKeyColumns)

export const deriveInsertSchema = <
  TableName extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  tableName: TableName,
  fields: Fields,
  primaryKeyColumns: readonly PrimaryKeyColumns[]
): Schema.Decoder<InsertRow<TableName, Fields>, never> =>
  deriveSchema("insert", tableName, fields, primaryKeyColumns)

export const deriveUpdateSchema = <
  TableName extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  tableName: TableName,
  fields: Fields,
  primaryKeyColumns: readonly PrimaryKeyColumns[]
): Schema.Decoder<UpdateRow<TableName, Fields, PrimaryKeyColumns>, never> =>
  deriveSchema("update", tableName, fields, primaryKeyColumns)

/**
 * Derives the `select`, `insert`, and `update` schemas for a table.
 *
 * This is the central place where the column capability flags are turned into
 * real runtime schemas.
 *
 * @deprecated Prefer `deriveSelectSchema`, `deriveInsertSchema`, and
 * `deriveUpdateSchema` so individual variants are derived lazily.
 */
export const deriveSchemas = <
  TableName extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  tableName: TableName,
  fields: Fields,
  primaryKeyColumns: readonly PrimaryKeyColumns[]
): {
  readonly select: Schema.Decoder<SelectRow<TableName, Fields>, never>
  readonly insert: Schema.Decoder<InsertRow<TableName, Fields>, never>
  readonly update: Schema.Decoder<UpdateRow<TableName, Fields, PrimaryKeyColumns>, never>
} => ({
  select: deriveSelectSchema(tableName, fields, primaryKeyColumns),
  insert: deriveInsertSchema(tableName, fields, primaryKeyColumns),
  update: deriveUpdateSchema(tableName, fields, primaryKeyColumns)
})
