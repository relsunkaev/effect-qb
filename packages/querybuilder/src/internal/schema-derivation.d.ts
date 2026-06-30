import type * as Brand from "effect/Brand";
import * as Schema from "effect/Schema";
import { type AnyColumnDefinition, type HasDefault, type InsertType, type IsGenerated, type IsNullable, type SelectType, type UpdateType } from "./column-state.js";
export type TableSchemaVariant = "select" | "insert" | "update";
/** Normalized field map used by table definitions. */
export type TableFieldMap = Record<string, AnyColumnDefinition>;
type GeneratedKeys<Fields extends TableFieldMap> = {
    [K in keyof Fields]: IsGenerated<Fields[K]> extends true ? K : never;
}[keyof Fields];
type OptionalInsertKeys<Fields extends TableFieldMap> = {
    [K in keyof Fields]: IsGenerated<Fields[K]> extends true ? never : IsNullable<Fields[K]> extends true ? K : HasDefault<Fields[K]> extends true ? K : never;
}[keyof Fields];
type RequiredInsertKeys<Fields extends TableFieldMap> = Exclude<keyof Fields, GeneratedKeys<Fields> | OptionalInsertKeys<Fields>>;
type UpdateKeys<Fields extends TableFieldMap, PrimaryKey extends keyof Fields> = Exclude<keyof Fields, GeneratedKeys<Fields> | PrimaryKey>;
type Simplify<T> = {
    [K in keyof T]: T[K];
} & {};
type BrandedValue<Value, BrandName extends string> = [Extract<Value, null | undefined>] extends [never] ? Value & Brand.Brand<BrandName> : (Exclude<Value, null | undefined> & Brand.Brand<BrandName>) | Extract<Value, null | undefined>;
type BrandNameOf<TableName extends string, ColumnName extends string> = `${TableName}.${ColumnName}`;
type BrandedSelectType<Column extends AnyColumnDefinition, TableName extends string, ColumnName extends string> = Column["metadata"]["brand"] extends true ? BrandedValue<SelectType<Column>, BrandNameOf<TableName, ColumnName>> : SelectType<Column>;
type BrandedInsertType<Column extends AnyColumnDefinition, TableName extends string, ColumnName extends string> = Column["metadata"]["brand"] extends true ? BrandedValue<InsertType<Column>, BrandNameOf<TableName, ColumnName>> : InsertType<Column>;
type BrandedUpdateType<Column extends AnyColumnDefinition, TableName extends string, ColumnName extends string> = Column["metadata"]["brand"] extends true ? BrandedValue<UpdateType<Column>, BrandNameOf<TableName, ColumnName>> : UpdateType<Column>;
/** Row shape returned by selecting from a table. */
export type SelectRow<TableName extends string, Fields extends TableFieldMap> = Simplify<{
    [K in keyof Fields]: BrandedSelectType<Fields[K], TableName, Extract<K, string>>;
}>;
/** Insert payload derived from a table field map. */
export type InsertRow<TableName extends string, Fields extends TableFieldMap> = Simplify<{
    [K in RequiredInsertKeys<Fields>]: BrandedInsertType<Fields[K], TableName, Extract<K, string>>;
} & {
    [K in OptionalInsertKeys<Fields>]?: BrandedInsertType<Fields[K], TableName, Extract<K, string>>;
}>;
/** Update payload derived from a table field map and primary key. */
export type UpdateRow<TableName extends string, Fields extends TableFieldMap, PrimaryKey extends keyof Fields> = Simplify<Partial<{
    [K in UpdateKeys<Fields, PrimaryKey>]: BrandedUpdateType<Fields[K], TableName, Extract<K, string>>;
}>>;
type SchemaOfVariant<Variant extends TableSchemaVariant, TableName extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string> = Variant extends "select" ? Schema.ConstraintDecoder<SelectRow<TableName, Fields>, never> : Variant extends "insert" ? Schema.ConstraintDecoder<InsertRow<TableName, Fields>, never> : Schema.ConstraintDecoder<UpdateRow<TableName, Fields, PrimaryKeyColumns>, never>;
export declare const deriveSchema: <Variant extends TableSchemaVariant, TableName extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string>(variant: Variant, tableName: TableName, fields: Fields, primaryKeyColumns: readonly PrimaryKeyColumns[]) => SchemaOfVariant<Variant, TableName, Fields, PrimaryKeyColumns>;
export declare const deriveSelectSchema: <TableName extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string>(tableName: TableName, fields: Fields, primaryKeyColumns: readonly PrimaryKeyColumns[]) => Schema.ConstraintDecoder<SelectRow<TableName, Fields>, never>;
export declare const deriveInsertSchema: <TableName extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string>(tableName: TableName, fields: Fields, primaryKeyColumns: readonly PrimaryKeyColumns[]) => Schema.ConstraintDecoder<InsertRow<TableName, Fields>, never>;
export declare const deriveUpdateSchema: <TableName extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string>(tableName: TableName, fields: Fields, primaryKeyColumns: readonly PrimaryKeyColumns[]) => Schema.ConstraintDecoder<UpdateRow<TableName, Fields, PrimaryKeyColumns>, never>;
/**
 * Derives the `select`, `insert`, and `update` schemas for a table.
 *
 * This is the central place where the column capability flags are turned into
 * real runtime schemas.
 *
 * @deprecated Prefer `deriveSelectSchema`, `deriveInsertSchema`, and
 * `deriveUpdateSchema` so individual variants are derived lazily.
 */
export declare const deriveSchemas: <TableName extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string>(tableName: TableName, fields: Fields, primaryKeyColumns: readonly PrimaryKeyColumns[]) => {
    readonly select: Schema.ConstraintDecoder<SelectRow<TableName, Fields>, never>;
    readonly insert: Schema.ConstraintDecoder<InsertRow<TableName, Fields>, never>;
    readonly update: Schema.ConstraintDecoder<UpdateRow<TableName, Fields, PrimaryKeyColumns>, never>;
};
export {};
