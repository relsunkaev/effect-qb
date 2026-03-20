import type * as Schema from "effect/Schema"

import type * as Expression from "../internal/expression.js"
import { ColumnTypeId, type AnyColumnDefinition } from "../internal/column-state.js"
import * as BaseTable from "../internal/table.js"

type Dialect = "postgres"

type DialectColumn = AnyColumnDefinition & {
  readonly [ColumnTypeId]: {
    readonly dbType: Expression.DbType.Any & { readonly dialect: Dialect }
  }
}

type DialectFieldMap = Record<string, DialectColumn>

type InlinePrimaryKeyKeys<Fields extends DialectFieldMap> = Extract<{
  [K in keyof Fields]: Fields[K]["metadata"]["primaryKey"] extends true ? K : never
}[keyof Fields], string>

export type TableDefinition<
  Name extends string,
  Fields extends DialectFieldMap,
  PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>,
  Kind extends "schema" | "alias" = "schema",
  SchemaName extends string | undefined = "public"
> = BaseTable.TableDefinition<Name, Fields, PrimaryKeyColumns, Kind, SchemaName>

export type TableClassStatic<
  Name extends string,
  Fields extends DialectFieldMap,
  PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>,
  SchemaName extends string | undefined = "public"
> = BaseTable.TableClassStatic<Name, Fields, PrimaryKeyColumns, SchemaName>

export type AnyTable = BaseTable.AnyTable

type FieldsOfTable<Table> = Table extends BaseTable.TableDefinition<any, infer Fields extends DialectFieldMap, any, any, any>
  ? Fields
  : Table extends BaseTable.TableClassStatic<any, infer Fields extends DialectFieldMap, any, any>
    ? Fields
    : never

type PrimaryKeyOfTable<Table> = Table extends BaseTable.TableDefinition<any, any, infer PrimaryKeyColumns extends string, any, any>
  ? PrimaryKeyColumns
  : Table extends BaseTable.TableClassStatic<any, any, infer PrimaryKeyColumns extends string, any>
    ? PrimaryKeyColumns
    : never

type SchemaNameOfTable<Table> = Table extends BaseTable.TableDefinition<any, any, any, any, infer SchemaName>
  ? SchemaName
  : Table extends BaseTable.TableClassStatic<any, any, any, infer SchemaName>
    ? SchemaName
    : never

export type TableSchemaNamespace<SchemaName extends string> = {
  readonly schemaName: SchemaName
  readonly table: <
    Name extends string,
    Fields extends DialectFieldMap,
    PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>
  >(
    name: Name,
    fields: Fields,
    ...options: BaseTable.DeclaredTableOptions
  ) => TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>
}

export type TableOption = BaseTable.TableOption

export const TypeId = BaseTable.TypeId
export const OptionsSymbol = BaseTable.OptionsSymbol
export const options = BaseTable.options

export const make = <
  Name extends string,
  Fields extends DialectFieldMap,
  SchemaName extends string | undefined = "public"
>(
  name: Name,
  fields: Fields,
  schemaName: SchemaName = "public" as SchemaName
): TableDefinition<Name, Fields> =>
  BaseTable.make(name, fields, schemaName) as TableDefinition<Name, Fields>

export const schema = <SchemaName extends string>(
  schemaName: SchemaName
): TableSchemaNamespace<SchemaName> => ({
  schemaName,
  table: <
    Name extends string,
    Fields extends DialectFieldMap,
    PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>
  >(
    name: Name,
    fields: Fields,
    ...declaredOptions: BaseTable.DeclaredTableOptions
  ) =>
    BaseTable.schema(schemaName).table(
      name,
      fields,
      ...declaredOptions
    ) as TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>
})

export const alias = <
  Table extends AnyTable,
  AliasName extends string
>(
  table: Table,
  aliasName: AliasName
): TableDefinition<
  AliasName,
  FieldsOfTable<Table>,
  PrimaryKeyOfTable<Table>,
  "alias",
  SchemaNameOfTable<Table>
> =>
  BaseTable.alias(table as any, aliasName) as TableDefinition<
    AliasName,
    FieldsOfTable<Table>,
    PrimaryKeyOfTable<Table>,
    "alias",
    SchemaNameOfTable<Table>
  >

export const Class = <Self = never, SchemaName extends string | undefined = "public">(
  name: string,
  schemaName: SchemaName = "public" as SchemaName
) => {
  const base = BaseTable.Class<Self, SchemaName>(name, schemaName)
  return base as unknown as <
    Fields extends DialectFieldMap
  >(fields: Fields) => [Self] extends [never]
    ? BaseTable.MissingSelfGeneric
    : TableClassStatic<typeof name, Fields, InlinePrimaryKeyKeys<Fields>, SchemaName>
}

export const primaryKey = BaseTable.primaryKey
export const unique = BaseTable.unique
export const index = BaseTable.index
export const foreignKey = <
  LocalColumns extends string | readonly string[],
  TargetTable extends AnyTable,
  TargetColumns extends string | readonly string[]
>(
  columns: LocalColumns,
  target: () => TargetTable,
  referencedColumns: TargetColumns
): BaseTable.TableOption =>
  BaseTable.foreignKey(columns, target as () => BaseTable.AnyTable, referencedColumns)

export const check = BaseTable.check

export type SelectOf<Table extends { readonly schemas: { readonly select: Schema.Schema<any> } }> = BaseTable.SelectOf<Table>
export type InsertOf<Table extends { readonly schemas: { readonly insert: Schema.Schema<any> } }> = BaseTable.InsertOf<Table>
export type UpdateOf<Table extends { readonly schemas: { readonly update: Schema.Schema<any> } }> = BaseTable.UpdateOf<Table>
