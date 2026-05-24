import type * as Expression from "../internal/scalar.js"
import { ColumnTypeId, type AnyColumnDefinition } from "../internal/column-state.js"
import * as BaseTable from "../internal/table.js"
import type { TableOptionSpec } from "../internal/table-options.js"

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

export type AnyTable = BaseTable.AnyTable<Dialect | "standard">

type FieldsOfTable<Table extends BaseTable.AnyTable> = Table[typeof BaseTable.TypeId]["fields"] extends infer Fields extends DialectFieldMap
  ? Fields
  : never

type FieldsOfAnyTable<Table extends BaseTable.AnyTable> = Table[typeof BaseTable.TypeId]["fields"] extends infer Fields extends Record<string, AnyColumnDefinition>
  ? Fields
  : never

type ColumnNamesOfTable<Table extends BaseTable.AnyTable> = Extract<keyof FieldsOfAnyTable<Table>, string>

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
export type DdlExpressionLike = BaseTable.DdlExpressionLike
export type IndexKey = BaseTable.IndexKeySpec
export type ReferentialAction = BaseTable.ReferentialAction

type SchemaTable = {
  readonly columns: Record<string, unknown>
}

type TableExpressionFactory<Table extends SchemaTable> = (
  columns: Table["columns"]
) => DdlExpressionLike

type TableScopedOptionBuilder<
  Table extends SchemaTable,
  Spec extends import("../internal/table-options.js").TableOptionSpec = import("../internal/table-options.js").TableOptionSpec
> = {
  (table: Table): Table
  readonly option: Spec
}

export const TypeId = BaseTable.TypeId
export const OptionsSymbol = BaseTable.OptionsSymbol
export const options = BaseTable.options

export const make = <
  Name extends string,
  Fields extends DialectFieldMap,
  const SchemaName extends string | undefined = "public"
>(
  name: BaseTable.NonEmptyStringInput<Name>,
  fields: Fields & BaseTable.NonEmptyFieldMap<Fields>,
  schemaName: BaseTable.NonEmptySchemaNameInput<SchemaName> = "public" as BaseTable.NonEmptySchemaNameInput<SchemaName>
): TableDefinition<Name, Fields, InlinePrimaryKeyKeys<Fields>, "schema", SchemaName> =>
  BaseTable.make<Name, Fields, SchemaName>(name, fields, schemaName) as TableDefinition<Name, Fields, InlinePrimaryKeyKeys<Fields>, "schema", SchemaName>

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
  } as TableSchemaNamespace<SchemaName>
}

export const alias = <
  Table extends AnyTable,
  AliasName extends string
>(
  table: Table,
  aliasName: BaseTable.LiteralStringInput<AliasName>
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

type ClassApi = {
  <Self = never>(
    name: "",
    schemaName?: string | undefined
  ): never
  <Self = never>(
    name: string,
    schemaName: ""
  ): never
  <Self = never, const SchemaName extends string | undefined = "public", const Name extends string = string>(
    name: BaseTable.NonEmptyStringInput<Name>,
    schemaName?: BaseTable.NonEmptySchemaNameInput<SchemaName>
  ): <
    Fields extends DialectFieldMap
  >(fields: Fields & BaseTable.NonEmptyFieldMap<Fields>) => [Self] extends [never]
    ? BaseTable.MissingSelfGeneric
    : TableClassStatic<Name, Fields, InlinePrimaryKeyKeys<Fields>, SchemaName>
}

export const Class: ClassApi = ((
  name: string,
  schemaName: string | undefined = "public"
) => {
  const base = BaseTable.Class(name as never, schemaName)
  return base
}) as ClassApi

export const option = BaseTable.option

type RichPrimaryKeyInput<Columns extends string | readonly string[]> = {
  readonly columns: Columns & BaseTable.NonEmptyColumnInput<Columns>
  readonly name?: string
  readonly deferrable?: boolean
  readonly initiallyDeferred?: boolean
}

type RichUniqueInput<Columns extends string | readonly string[]> = {
  readonly columns: Columns & BaseTable.NonEmptyColumnInput<Columns>
  readonly name?: string
  readonly nullsNotDistinct?: boolean
  readonly deferrable?: boolean
  readonly initiallyDeferred?: boolean
}

type RichIndexKeyInput =
  | {
      readonly column: string
      readonly order?: "asc" | "desc"
      readonly nulls?: "first" | "last"
      readonly operatorClass?: string
      readonly collation?: string
    }
  | {
      readonly expression: DdlExpressionLike
      readonly order?: "asc" | "desc"
      readonly nulls?: "first" | "last"
      readonly operatorClass?: string
      readonly collation?: string
    }

type RichIndexDetails = {
  readonly name?: string
  readonly unique?: boolean
  readonly method?: string
  readonly include?: readonly string[]
  readonly predicate?: DdlExpressionLike
}

type RichIndexInput<Columns extends string | readonly string[] = string | readonly string[]> = RichIndexDetails & (
  | {
      readonly columns: Columns & BaseTable.NonEmptyColumnInput<Columns>
      readonly keys?: readonly [RichIndexKeyInput, ...RichIndexKeyInput[]]
    }
  | {
      readonly columns?: Columns & BaseTable.NonEmptyColumnInput<Columns>
      readonly keys: readonly [RichIndexKeyInput, ...RichIndexKeyInput[]]
    }
)

type PrimaryKeyOptionSpec = Extract<TableOptionSpec, { readonly kind: "primaryKey" }>
type UniqueOptionSpec = Extract<TableOptionSpec, { readonly kind: "unique" }>
type IndexOptionSpec = Extract<TableOptionSpec, { readonly kind: "index" }>
type ForeignKeyOptionSpec = Extract<TableOptionSpec, { readonly kind: "foreignKey" }>

type RichPrimaryKeyOptionSpec<Columns extends string | readonly string[]> = PrimaryKeyOptionSpec & {
  readonly kind: "primaryKey"
  readonly columns: BaseTable.NormalizeColumns<Columns>
}

type RichUniqueOptionSpec<Columns extends string | readonly string[]> = UniqueOptionSpec & {
  readonly kind: "unique"
  readonly columns: BaseTable.NormalizeColumns<Columns>
}

type KnownTargetColumnsInput<
  TargetTable extends AnyTable,
  Columns extends string | readonly string[]
> = BaseTable.NormalizeColumns<Columns> extends infer NormalizedColumns extends readonly string[]
  ? string extends NormalizedColumns[number]
    ? unknown
    : Exclude<NormalizedColumns[number], ColumnNamesOfTable<TargetTable>> extends never
      ? unknown
      : never
  : never

type RichIndexColumnOption<Spec> = Spec extends { readonly columns: infer Columns extends string | readonly string[] }
  ? { readonly columns: BaseTable.NormalizeColumns<Columns> }
  : {}

type RichIndexIncludeOption<Spec> = Spec extends { readonly include: infer Include extends readonly string[] }
  ? { readonly include: Include }
  : {}

type RichIndexKeySpec<Key> = Key extends { readonly column: infer Column extends string }
  ? BaseTable.IndexKeySpec & { readonly kind: "column"; readonly column: Column }
  : BaseTable.IndexKeySpec & { readonly kind: "expression" }

type RichIndexKeys<Keys extends readonly [RichIndexKeyInput, ...RichIndexKeyInput[]]> = {
  readonly [K in keyof Keys]: Keys[K] extends RichIndexKeyInput ? RichIndexKeySpec<Keys[K]> : never
} & readonly [BaseTable.IndexKeySpec, ...BaseTable.IndexKeySpec[]]

type RichIndexKeysOption<Spec> = Spec extends { readonly keys: infer Keys extends readonly [RichIndexKeyInput, ...RichIndexKeyInput[]] }
  ? { readonly keys: RichIndexKeys<Keys> }
  : {}

type RichIndexColumnsConstraint<Spec> = Spec extends { readonly columns: infer Columns extends string | readonly string[] }
  ? BaseTable.NonEmptyColumnInput<Columns> extends never ? never : unknown
  : unknown

type RichIndexOptionSpec<Spec> = IndexOptionSpec & {
  readonly kind: "index"
  readonly name?: string
  readonly unique?: boolean
  readonly method?: string
  readonly predicate?: DdlExpressionLike
} & RichIndexColumnOption<Spec> & RichIndexIncludeOption<Spec> & RichIndexKeysOption<Spec>

type RichForeignKeyOptionSpec<
  LocalColumns extends string | readonly string[],
  TargetTable extends AnyTable,
  TargetColumns extends string | readonly string[]
> = ForeignKeyOptionSpec & {
  readonly kind: "foreignKey"
  readonly columns: BaseTable.NormalizeColumns<LocalColumns>
  readonly references: () => {
    readonly tableName: string
    readonly schemaName?: string
    readonly columns: BaseTable.NormalizeColumns<TargetColumns>
    readonly knownColumns: readonly ColumnNamesOfTable<TargetTable>[]
  }
}

type RichForeignKeyInput<
  LocalColumns extends string | readonly string[],
  TargetTable extends AnyTable,
  TargetColumns extends string | readonly string[],
  Name extends string = string
> = {
  readonly columns: LocalColumns & BaseTable.NonEmptyColumnInput<LocalColumns>
  readonly target: () => TargetTable
  readonly referencedColumns: TargetColumns & BaseTable.NonEmptyColumnInput<TargetColumns> & BaseTable.MatchingColumnArityInput<LocalColumns, TargetColumns> & KnownTargetColumnsInput<NoInfer<TargetTable>, TargetColumns>
  readonly name?: BaseTable.NonEmptyStringInput<Name>
  readonly onUpdate?: ReferentialAction
  readonly onDelete?: ReferentialAction
  readonly deferrable?: boolean
  readonly initiallyDeferred?: boolean
}

type RichCheckInput<Name extends string = string> = {
  readonly name: Name
  readonly predicate: DdlExpressionLike
  readonly noInherit?: boolean
}

type NonEmptyOptionNameInput<Spec> = Spec extends { readonly name: infer Name extends string }
  ? BaseTable.NonEmptyStringInput<Name> extends never ? never : unknown
  : unknown

type NonEmptyStringArrayInput<Values extends readonly string[]> =
  [Extract<Values[number], "">] extends [never] ? unknown : never

type NonEmptyIndexMethodInput<Spec> = Spec extends { readonly method: infer Method extends string }
  ? BaseTable.NonEmptyStringInput<Method> extends never ? never : unknown
  : unknown

type NonEmptyIndexIncludeInput<Spec> = Spec extends { readonly include: infer Include extends readonly string[] }
  ? NonEmptyStringArrayInput<Include>
  : unknown

type EmptyIndexKeyColumn<Key> = Key extends { readonly column: infer Column extends string }
  ? BaseTable.NonEmptyStringInput<Column> extends never ? Key : never
  : never

type EmptyIndexKeyOperatorClass<Key> = Key extends { readonly operatorClass: infer OperatorClass extends string }
  ? BaseTable.NonEmptyStringInput<OperatorClass> extends never ? Key : never
  : never

type EmptyIndexKeyCollation<Key> = Key extends { readonly collation: infer Collation extends string }
  ? BaseTable.NonEmptyStringInput<Collation> extends never ? Key : never
  : never

type InvalidIndexKeyMetadata<Key> =
  | EmptyIndexKeyColumn<Key>
  | EmptyIndexKeyOperatorClass<Key>
  | EmptyIndexKeyCollation<Key>

type NonEmptyIndexKeysInput<Spec> = Spec extends { readonly keys: infer Keys extends readonly RichIndexKeyInput[] }
  ? [InvalidIndexKeyMetadata<Keys[number]>] extends [never] ? unknown : never
  : unknown

type NonEmptyIndexMetadataInput<Spec> =
  & NonEmptyOptionNameInput<Spec>
  & NonEmptyIndexMethodInput<Spec>
  & NonEmptyIndexIncludeInput<Spec>
  & NonEmptyIndexKeysInput<Spec>

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isTableExpressionFactory = (value: unknown): value is TableExpressionFactory<SchemaTable> =>
  typeof value === "function"

const makeTableScopedOption = <
  Table extends SchemaTable,
  Spec extends import("../internal/table-options.js").TableOptionSpec
>(
  placeholder: Spec,
  resolve: (table: Table) => Spec
): TableScopedOptionBuilder<Table, Spec> => {
  const builder = ((table: Table) =>
    BaseTable.option(resolve(table))(table as never)) as unknown as TableScopedOptionBuilder<Table, Spec>
  ;(builder as { option: Spec }).option = placeholder
  return builder
}

const normalizeColumns = (columns: string | readonly string[]): readonly [string, ...string[]] => {
  if (typeof columns === "string") {
    return [columns]
  }
  return [columns[0] as string, ...columns.slice(1)]
}

const normalizeIndexKey = (key: RichIndexKeyInput): BaseTable.IndexKeySpec =>
  "expression" in key
    ? {
        kind: "expression",
        expression: key.expression,
        order: key.order,
        nulls: key.nulls,
        operatorClass: key.operatorClass,
        collation: key.collation
      }
    : {
        kind: "column",
        column: key.column,
        order: key.order,
        nulls: key.nulls,
        operatorClass: key.operatorClass,
        collation: key.collation
      }

const normalizeIndexKeys = (
  keys: readonly [RichIndexKeyInput, ...RichIndexKeyInput[]]
): readonly [BaseTable.IndexKeySpec, ...BaseTable.IndexKeySpec[]] =>
  [normalizeIndexKey(keys[0]), ...keys.slice(1).map(normalizeIndexKey)]

export const primaryKey: {
  <const Columns extends string | readonly string[]>(
    columns: Columns & BaseTable.NonEmptyColumnInput<Columns>
  ): BaseTable.TableOption<{
    readonly kind: "primaryKey"
    readonly columns: BaseTable.NormalizeColumns<Columns>
  }>
  <const Columns extends string | readonly string[], const Spec extends RichPrimaryKeyInput<Columns>>(
    spec: Spec & NonEmptyOptionNameInput<Spec>
  ): BaseTable.TableOption<RichPrimaryKeyOptionSpec<Columns>>
} = ((input: unknown) =>
  isObject(input) && "columns" in input
    ? BaseTable.option({
        kind: "primaryKey",
        columns: normalizeColumns((input as RichPrimaryKeyInput<string | readonly string[]>).columns),
        name: (input as RichPrimaryKeyInput<string | readonly string[]>).name,
        deferrable: (input as RichPrimaryKeyInput<string | readonly string[]>).deferrable,
        initiallyDeferred: (input as RichPrimaryKeyInput<string | readonly string[]>).initiallyDeferred
      })
    : BaseTable.primaryKey(input as string | readonly string[])) as never

export const unique: {
  <const Columns extends string | readonly string[]>(
    columns: Columns & BaseTable.NonEmptyColumnInput<Columns>
  ): BaseTable.TableOption<{
    readonly kind: "unique"
    readonly columns: BaseTable.NormalizeColumns<Columns>
  }>
  <const Columns extends string | readonly string[], const Spec extends RichUniqueInput<Columns>>(
    spec: Spec & NonEmptyOptionNameInput<Spec>
  ): BaseTable.TableOption<RichUniqueOptionSpec<Columns>>
} = ((input: unknown) =>
  isObject(input) && "columns" in input && ("name" in input || "nullsNotDistinct" in input || "deferrable" in input || "initiallyDeferred" in input)
    ? BaseTable.option({
        kind: "unique",
        columns: normalizeColumns((input as RichUniqueInput<string | readonly string[]>).columns),
        name: (input as RichUniqueInput<string | readonly string[]>).name,
        nullsNotDistinct: (input as RichUniqueInput<string | readonly string[]>).nullsNotDistinct,
        deferrable: (input as RichUniqueInput<string | readonly string[]>).deferrable,
        initiallyDeferred: (input as RichUniqueInput<string | readonly string[]>).initiallyDeferred
      })
    : BaseTable.unique(input as string | readonly string[])) as never

export const index: {
  <const Columns extends string | readonly string[]>(
    columns: Columns & BaseTable.NonEmptyColumnInput<Columns>
  ): BaseTable.TableOption<{
    readonly kind: "index"
    readonly columns: BaseTable.NormalizeColumns<Columns>
  }>
  <Table extends SchemaTable, const Columns extends string | readonly string[], const Spec extends Omit<RichIndexInput<Columns>, "predicate"> & {
      readonly predicate: TableExpressionFactory<Table>
  }>(
    spec: Spec & RichIndexColumnsConstraint<Spec> & NonEmptyIndexMetadataInput<Spec>
  ): TableScopedOptionBuilder<Table, RichIndexOptionSpec<Spec>>
  <const Columns extends string | readonly string[], const Spec extends RichIndexInput<Columns>>(
    spec: Spec & RichIndexColumnsConstraint<Spec> & NonEmptyIndexMetadataInput<Spec>
  ): BaseTable.TableOption<RichIndexOptionSpec<Spec>>
} = ((input: unknown) =>
  isObject(input) && ("columns" in input || "keys" in input || "name" in input || "unique" in input || "method" in input || "include" in input || "predicate" in input)
    ? (() => {
        const spec = input as RichIndexInput<string | readonly string[]> & {
          readonly predicate?: DdlExpressionLike | TableExpressionFactory<SchemaTable>
        }
        const predicate = spec.predicate
        const placeholder = {
          kind: "index" as const,
          columns: spec.columns === undefined
            ? undefined
            : normalizeColumns(spec.columns),
          keys: spec.keys === undefined
            ? undefined
            : normalizeIndexKeys(spec.keys),
          name: spec.name,
          unique: spec.unique,
          method: spec.method,
          include: spec.include,
          predicate: predicate as DdlExpressionLike
        }
        return isTableExpressionFactory(predicate)
          ? makeTableScopedOption(placeholder, (table) => ({
              ...placeholder,
              predicate: predicate(table.columns)
            }))
          : BaseTable.option({
              ...placeholder,
              predicate
            })
      })()
    : BaseTable.index(input as string | readonly string[])) as never
export const foreignKey = <
  const LocalColumns extends string | readonly string[],
  TargetTable extends AnyTable,
  const TargetColumns extends string | readonly string[],
  const Name extends string = string
>(
  columnsOrSpec: (LocalColumns & BaseTable.NonEmptyColumnInput<LocalColumns>) | RichForeignKeyInput<LocalColumns, TargetTable, TargetColumns, Name>,
  target?: () => TargetTable,
  referencedColumns?: TargetColumns & BaseTable.NonEmptyColumnInput<TargetColumns> & BaseTable.MatchingColumnArityInput<LocalColumns, TargetColumns> & KnownTargetColumnsInput<NoInfer<TargetTable>, TargetColumns>
): BaseTable.TableOption<RichForeignKeyOptionSpec<LocalColumns, TargetTable, TargetColumns>> =>
  isObject(columnsOrSpec) && "columns" in columnsOrSpec && "target" in columnsOrSpec
    ? (() => {
        const spec = columnsOrSpec as RichForeignKeyInput<LocalColumns, TargetTable, TargetColumns, Name>
        const targetTable = spec.target()
        const targetState = targetTable[BaseTable.TypeId]
        const knownColumns = Object.keys(targetState.fields).map((key) => key as ColumnNamesOfTable<TargetTable>)
        return BaseTable.option({
          kind: "foreignKey",
          columns: normalizeColumns(spec.columns) as BaseTable.NormalizeColumns<LocalColumns>,
          name: spec.name,
          references: () => ({
            tableName: targetState.baseName,
            schemaName: targetState.schemaName,
            columns: normalizeColumns(spec.referencedColumns) as BaseTable.NormalizeColumns<TargetColumns>,
            knownColumns
          }),
          onUpdate: spec.onUpdate,
          onDelete: spec.onDelete,
          deferrable: spec.deferrable,
          initiallyDeferred: spec.initiallyDeferred
        } as RichForeignKeyOptionSpec<LocalColumns, TargetTable, TargetColumns>)
      })()
    : BaseTable.foreignKey<LocalColumns, TargetTable, TargetColumns>(
        columnsOrSpec as LocalColumns & BaseTable.NonEmptyColumnInput<LocalColumns>,
        target as () => TargetTable,
        referencedColumns as TargetColumns & BaseTable.NonEmptyColumnInput<TargetColumns> & BaseTable.MatchingColumnArityInput<LocalColumns, TargetColumns> & KnownTargetColumnsInput<NoInfer<TargetTable>, TargetColumns>
      )

export const check: {
  <const Name extends string>(name: BaseTable.NonEmptyStringInput<Name>, predicate: DdlExpressionLike): BaseTable.TableOption
  <const Name extends string, Table extends SchemaTable>(
    name: BaseTable.NonEmptyStringInput<Name>,
    predicate: TableExpressionFactory<Table>
  ): TableScopedOptionBuilder<Table, {
    readonly kind: "check"
    readonly name: Name
    readonly predicate: DdlExpressionLike
  }>
  <const Name extends string, Table extends SchemaTable>(
    spec: Omit<RichCheckInput<Name>, "predicate"> & {
      readonly name: BaseTable.NonEmptyStringInput<Name>
      readonly predicate: TableExpressionFactory<Table>
    }
  ): TableScopedOptionBuilder<Table, {
    readonly kind: "check"
    readonly name: Name
    readonly predicate: DdlExpressionLike
    readonly noInherit?: boolean
  }>
  <const Name extends string>(spec: RichCheckInput<Name> & {
    readonly name: BaseTable.NonEmptyStringInput<Name>
  }): BaseTable.TableOption
} = ((nameOrSpec: string | RichCheckInput, predicate?: DdlExpressionLike) =>
  isObject(nameOrSpec)
    ? (() => {
        const spec = nameOrSpec as RichCheckInput & {
          readonly predicate: DdlExpressionLike | TableExpressionFactory<SchemaTable>
        }
        const specPredicate = spec.predicate
        const placeholder = {
          kind: "check" as const,
          name: spec.name,
          predicate: specPredicate as DdlExpressionLike,
          noInherit: spec.noInherit
        }
        return isTableExpressionFactory(specPredicate)
          ? makeTableScopedOption(placeholder, (table) => ({
              ...placeholder,
              predicate: specPredicate(table.columns)
            }))
          : BaseTable.option({
              ...placeholder,
              predicate: specPredicate
            })
      })()
    : (() => {
        const predicateOrFactory = predicate as DdlExpressionLike | TableExpressionFactory<SchemaTable>
        const placeholder = {
          kind: "check" as const,
          name: nameOrSpec,
          predicate: predicateOrFactory as DdlExpressionLike
        }
        return isTableExpressionFactory(predicateOrFactory)
          ? makeTableScopedOption(placeholder, (table) => ({
              ...placeholder,
              predicate: predicateOrFactory(table.columns)
            }))
          : BaseTable.option({
              ...placeholder,
              predicate: predicateOrFactory
            })
      })()) as never

export const selectSchema = BaseTable.selectSchema
export const insertSchema = BaseTable.insertSchema
export const updateSchema = BaseTable.updateSchema

export type SelectOf<Table extends AnyTable> = BaseTable.SelectOf<Table>
export type InsertOf<Table extends AnyTable> = BaseTable.InsertOf<Table>
export type UpdateOf<Table extends AnyTable> = BaseTable.UpdateOf<Table>
