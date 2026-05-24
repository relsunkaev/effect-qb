import type { AnyColumnDefinition } from "../internal/column-state.js"
import * as BaseTable from "../internal/table.js"

type Dialect = string

type DialectColumn = AnyColumnDefinition

type DialectFieldMap = Record<string, DialectColumn>

type InlinePrimaryKeyKeys<Fields extends DialectFieldMap> = Extract<{
  [K in keyof Fields]: Fields[K]["metadata"]["primaryKey"] extends true ? K : never
}[keyof Fields], string>

export type TableDefinition<
  Name extends string,
  Fields extends DialectFieldMap,
  PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>,
  Kind extends "schema" | "alias" = "schema",
  SchemaName extends string | undefined = undefined
> = BaseTable.TableDefinition<Name, Fields, PrimaryKeyColumns, Kind, SchemaName>

export type TableClassStatic<
  Name extends string,
  Fields extends DialectFieldMap,
  PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>,
  SchemaName extends string | undefined = undefined
> = BaseTable.TableClassStatic<Name, Fields, PrimaryKeyColumns, SchemaName>

export type AnyTable = BaseTable.AnyTable<Dialect>

type FieldsOfTable<Table extends BaseTable.AnyTable> = Table[typeof BaseTable.TypeId]["fields"] extends infer Fields extends DialectFieldMap
  ? Fields
  : never

type PrimaryKeyOfTable<Table extends BaseTable.AnyTable> = Table[typeof BaseTable.TypeId]["primaryKey"][number]

type SchemaNameOfTable<Table extends BaseTable.AnyTable> = Table[typeof BaseTable.TypeId]["schemaName"]

type ApplySchemaTableOptions<
  Name extends string,
  Fields extends DialectFieldMap,
  PrimaryKeyColumns extends keyof Fields & string,
  SchemaName extends string,
  Options extends BaseTable.DeclaredTableOptions
> = BaseTable.ApplyDeclaredOptions<
  BaseTable.TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>,
  Options
> extends BaseTable.TableDefinition<any, any, infer AppliedPrimaryKeyColumns extends keyof Fields & string, "schema", any>
  ? TableDefinition<Name, Fields, AppliedPrimaryKeyColumns, "schema", SchemaName>
  : TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>

export type TableSchemaNamespace<SchemaName extends string> = {
  readonly schemaName: SchemaName
  readonly table: <
    Name extends string,
    Fields extends DialectFieldMap,
    const Options extends BaseTable.DeclaredTableOptions,
    PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>
  >(
    name: BaseTable.NonEmptyStringInput<Name>,
    fields: Fields & BaseTable.NonEmptyFieldMap<Fields>,
    ...options: Options & BaseTable.ValidateDeclaredOptions<BaseTable.TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>, Options>
  ) => ApplySchemaTableOptions<Name, Fields, PrimaryKeyColumns, SchemaName, Options>
}

export type TableOption = BaseTable.TableOption

export const TypeId = BaseTable.TypeId
export const OptionsSymbol = BaseTable.OptionsSymbol
export const options = BaseTable.options
export const option = BaseTable.option

export const make = <
  Name extends string,
  Fields extends DialectFieldMap,
  SchemaName extends string | undefined = undefined
>(
  name: BaseTable.NonEmptyStringInput<Name>,
  fields: Fields & BaseTable.NonEmptyFieldMap<Fields>,
  schemaName: SchemaName = undefined as SchemaName
): TableDefinition<Name, Fields> =>
  BaseTable.make<Name, Fields, SchemaName>(name, fields, schemaName) as TableDefinition<Name, Fields>

export const schema = <SchemaName extends string>(
  schemaName: BaseTable.NonEmptyStringInput<SchemaName>
): TableSchemaNamespace<SchemaName> => {
  const table = <
    Name extends string,
    Fields extends DialectFieldMap,
    const Options extends BaseTable.DeclaredTableOptions,
    PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>
  >(
    name: BaseTable.NonEmptyStringInput<Name>,
    fields: Fields & BaseTable.NonEmptyFieldMap<Fields>,
    ...declaredOptions: Options & BaseTable.ValidateDeclaredOptions<BaseTable.TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>, Options>
  ) =>
    (BaseTable.schema(schemaName).table as (
      name: BaseTable.NonEmptyStringInput<Name>,
      fields: Fields & BaseTable.NonEmptyFieldMap<Fields>,
      ...options: BaseTable.DeclaredTableOptions
    ) => BaseTable.TableDefinition<any, any, any, "schema", any>)(
      name,
      fields,
      ...declaredOptions
    ) as ApplySchemaTableOptions<Name, Fields, PrimaryKeyColumns, SchemaName, Options>
  return {
    schemaName,
    table
  } as unknown as TableSchemaNamespace<SchemaName>
}

export const alias = <
  Table extends AnyTable,
  AliasName extends string
>(
  table: Table,
  aliasName: BaseTable.NonEmptyStringInput<AliasName>
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

export const Class = <Self = never, SchemaName extends string | undefined = undefined>(
  name: string,
  schemaName: SchemaName = undefined as SchemaName
) => {
  const base = BaseTable.Class<Self, SchemaName>(name, schemaName)
  return base as unknown as <
    Fields extends DialectFieldMap
  >(fields: Fields & BaseTable.NonEmptyFieldMap<Fields>) => [Self] extends [never]
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
  columns: LocalColumns & BaseTable.NonEmptyColumnInput<LocalColumns>,
  target: () => TargetTable,
  referencedColumns: TargetColumns & BaseTable.NonEmptyColumnInput<TargetColumns> & BaseTable.MatchingColumnArityInput<LocalColumns, TargetColumns>
) =>
  BaseTable.foreignKey<LocalColumns, TargetTable, TargetColumns>(
    columns as LocalColumns & BaseTable.NonEmptyColumnInput<LocalColumns>,
    target,
    referencedColumns as TargetColumns & BaseTable.NonEmptyColumnInput<TargetColumns> & BaseTable.MatchingColumnArityInput<LocalColumns, TargetColumns>
  )

export const check = BaseTable.check

export const selectSchema = BaseTable.selectSchema
export const insertSchema = BaseTable.insertSchema
export const updateSchema = BaseTable.updateSchema

export type SelectOf<Table extends AnyTable> = BaseTable.SelectOf<Table>
export type InsertOf<Table extends AnyTable> = BaseTable.InsertOf<Table>
export type UpdateOf<Table extends AnyTable> = BaseTable.UpdateOf<Table>
