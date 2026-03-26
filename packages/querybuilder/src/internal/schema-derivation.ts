import * as VariantSchema from "@effect/experimental/VariantSchema"
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

/** Variant-schema helper used to derive select / insert / update schemas. */
export const TableSchema = VariantSchema.make({
  variants: ["select", "insert", "update"] as const,
  defaultVariant: "select"
})

type Variants = "select" | "insert" | "update"

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
): Schema.Schema.Any =>
  column.metadata.brand === true
    ? Schema.brand(`${tableName}.${columnName}`)(column.schema)
    : column.schema

const selectSchema = (
  column: AnyColumnDefinition,
  tableName: string,
  columnName: string
): Schema.Schema.Any =>
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

/**
 * Derives the `select`, `insert`, and `update` schemas for a table.
 *
 * This is the central place where the column capability flags are turned into
 * real runtime schemas.
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
  readonly select: Schema.Schema<SelectRow<TableName, Fields>>
  readonly insert: Schema.Schema<InsertRow<TableName, Fields>>
  readonly update: Schema.Schema<UpdateRow<TableName, Fields, PrimaryKeyColumns>>
} => {
  const primaryKeySet = new Set<string>(primaryKeyColumns)
  const variants: Record<string, VariantSchema.Field<any>> = {}
  for (const [key, column] of Object.entries(fields)) {
    const config: Record<Variants, any> = {
      select: selectSchema(column, tableName, key),
      insert: undefined,
      update: undefined
    }
    const insert = insertSchema(column, tableName, key)
    const update = updateSchema(column, tableName, key, primaryKeySet.has(key))
    if (insert !== undefined) {
      config.insert = insert
    } else {
      delete config.insert
    }
    if (update !== undefined) {
      config.update = update
    } else {
      delete config.update
    }
    variants[key] = TableSchema.Field(config)
  }
  const struct = TableSchema.Struct(variants as any)
  return {
    select: TableSchema.extract(struct, "select") as unknown as Schema.Schema<SelectRow<TableName, Fields>>,
    insert: TableSchema.extract(struct, "insert") as unknown as Schema.Schema<InsertRow<TableName, Fields>>,
    update: TableSchema.extract(struct, "update") as unknown as Schema.Schema<UpdateRow<TableName, Fields, PrimaryKeyColumns>>
  }
}
