import * as VariantSchema from "@effect/experimental/VariantSchema"
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

/** Row shape returned by selecting from a table. */
export type SelectRow<Fields extends TableFieldMap> = Simplify<{
  [K in keyof Fields]: SelectType<Fields[K]>
}>

/** Insert payload derived from a table field map. */
export type InsertRow<Fields extends TableFieldMap> = Simplify<
  { [K in RequiredInsertKeys<Fields>]: InsertType<Fields[K]> } &
    { [K in OptionalInsertKeys<Fields>]?: InsertType<Fields[K]> }
>

/** Update payload derived from a table field map and primary key. */
export type UpdateRow<Fields extends TableFieldMap, PrimaryKey extends keyof Fields> = Simplify<
  Partial<{
    [K in UpdateKeys<Fields, PrimaryKey>]: UpdateType<Fields[K]>
  }>
>

const selectSchema = (column: AnyColumnDefinition): Schema.Schema.Any =>
  column.metadata.nullable ? Schema.NullOr(column.schema) : column.schema

const insertSchema = (column: AnyColumnDefinition): any | undefined => {
  if (column.metadata.generated) {
    return undefined
  }
  const base = column.metadata.nullable ? Schema.NullOr(column.schema) : column.schema
  return column.metadata.nullable || column.metadata.hasDefault ? Schema.optional(base) : base
}

const updateSchema = (
  column: AnyColumnDefinition,
  isPrimaryKey: boolean
): any | undefined => {
  if (column.metadata.generated || isPrimaryKey) {
    return undefined
  }
  const base = column.metadata.nullable ? Schema.NullOr(column.schema) : column.schema
  return Schema.optional(base)
}

/**
 * Derives the `select`, `insert`, and `update` schemas for a table.
 *
 * This is the central place where the column capability flags are turned into
 * real runtime schemas.
 */
export const deriveSchemas = <
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  fields: Fields,
  primaryKeyColumns: readonly PrimaryKeyColumns[]
): {
  readonly select: Schema.Schema<SelectRow<Fields>>
  readonly insert: Schema.Schema<InsertRow<Fields>>
  readonly update: Schema.Schema<UpdateRow<Fields, PrimaryKeyColumns>>
} => {
  const primaryKeySet = new Set<string>(primaryKeyColumns)
  const variants: Record<string, VariantSchema.Field<any>> = {}
  for (const [key, column] of Object.entries(fields)) {
    const config: Record<Variants, any> = {
      select: selectSchema(column),
      insert: undefined,
      update: undefined
    }
    const insert = insertSchema(column)
    const update = updateSchema(column, primaryKeySet.has(key))
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
    select: TableSchema.extract(struct, "select") as unknown as Schema.Schema<SelectRow<Fields>>,
    insert: TableSchema.extract(struct, "insert") as unknown as Schema.Schema<InsertRow<Fields>>,
    update: TableSchema.extract(struct, "update") as unknown as Schema.Schema<UpdateRow<Fields, PrimaryKeyColumns>>
  }
}
