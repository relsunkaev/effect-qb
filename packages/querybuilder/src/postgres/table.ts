import type * as Schema from "effect/Schema"

import type * as Expression from "../internal/scalar.js"
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
  SchemaName extends string | undefined = "public"
>(
  name: Name,
  fields: Fields,
  schemaName: SchemaName = "public" as SchemaName
): TableDefinition<Name, Fields> =>
  BaseTable.make(name, fields, schemaName) as TableDefinition<Name, Fields>

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

export const option = BaseTable.option

type RichPrimaryKeyInput<Columns extends string | readonly string[]> = {
  readonly columns: Columns
  readonly name?: string
  readonly deferrable?: boolean
  readonly initiallyDeferred?: boolean
}

type RichUniqueInput<Columns extends string | readonly string[]> = {
  readonly columns: Columns
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
    }
  | {
      readonly expression: DdlExpressionLike
      readonly order?: "asc" | "desc"
      readonly nulls?: "first" | "last"
    }

type RichIndexInput<Columns extends string | readonly string[] = string | readonly string[]> = {
  readonly columns?: Columns
  readonly keys?: readonly [RichIndexKeyInput, ...RichIndexKeyInput[]]
  readonly name?: string
  readonly unique?: boolean
  readonly method?: string
  readonly include?: readonly string[]
  readonly predicate?: DdlExpressionLike
}

type RichForeignKeyInput<
  LocalColumns extends string | readonly string[],
  TargetTable extends AnyTable,
  TargetColumns extends string | readonly string[]
> = {
  readonly columns: LocalColumns
  readonly target: () => TargetTable
  readonly referencedColumns: TargetColumns
  readonly name?: string
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

const normalizeColumns = (columns: string | readonly string[]): readonly [string, ...string[]] =>
  (Array.isArray(columns) ? [...columns] : [columns]) as unknown as readonly [string, ...string[]]

const normalizeIndexKeys = (
  keys: readonly [RichIndexKeyInput, ...RichIndexKeyInput[]]
): readonly [BaseTable.IndexKeySpec, ...BaseTable.IndexKeySpec[]] =>
  keys.map((key) => "expression" in key
    ? {
        kind: "expression",
        expression: key.expression,
        order: key.order,
        nulls: key.nulls
      }
    : {
        kind: "column",
        column: key.column,
        order: key.order,
        nulls: key.nulls
      }) as unknown as readonly [BaseTable.IndexKeySpec, ...BaseTable.IndexKeySpec[]]

export const primaryKey: {
  <const Columns extends string | readonly string[]>(
    columns: Columns
  ): BaseTable.TableOption<{
    readonly kind: "primaryKey"
    readonly columns: BaseTable.NormalizeColumns<Columns>
  }>
  <const Columns extends string | readonly string[]>(
    spec: RichPrimaryKeyInput<Columns>
  ): BaseTable.TableOption
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
    columns: Columns
  ): BaseTable.TableOption<{
    readonly kind: "unique"
    readonly columns: BaseTable.NormalizeColumns<Columns>
  }>
  <const Columns extends string | readonly string[]>(
    spec: RichUniqueInput<Columns>
  ): BaseTable.TableOption
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
    columns: Columns
  ): BaseTable.TableOption<{
    readonly kind: "index"
    readonly columns: BaseTable.NormalizeColumns<Columns>
  }>
  <Table extends SchemaTable, const Columns extends string | readonly string[]>(
    spec: Omit<RichIndexInput<Columns>, "predicate"> & {
      readonly predicate: TableExpressionFactory<Table>
    }
  ): TableScopedOptionBuilder<Table, {
    readonly kind: "index"
    readonly columns?: BaseTable.NormalizeColumns<Columns>
    readonly keys?: readonly [BaseTable.IndexKeySpec, ...BaseTable.IndexKeySpec[]]
    readonly name?: string
    readonly unique?: boolean
    readonly method?: string
    readonly include?: readonly string[]
    readonly predicate?: DdlExpressionLike
  }>
  <const Columns extends string | readonly string[]>(
    spec: RichIndexInput<Columns>
  ): BaseTable.TableOption
} = ((input: unknown) =>
  isObject(input) && ("keys" in input || "name" in input || "unique" in input || "method" in input || "include" in input || "predicate" in input)
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
          predicate: predicate as unknown as DdlExpressionLike
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
  const TargetColumns extends string | readonly string[]
>(
  columnsOrSpec: LocalColumns | RichForeignKeyInput<LocalColumns, TargetTable, TargetColumns>,
  target?: () => TargetTable,
  referencedColumns?: TargetColumns
): BaseTable.TableOption =>
  isObject(columnsOrSpec) && "columns" in columnsOrSpec && "target" in columnsOrSpec
    ? (() => {
        const spec = columnsOrSpec as RichForeignKeyInput<LocalColumns, TargetTable, TargetColumns>
        const targetTable = spec.target() as BaseTable.AnyTable
        const targetState = targetTable[BaseTable.TypeId]
        return BaseTable.option({
        kind: "foreignKey",
        columns: normalizeColumns(spec.columns),
        name: spec.name,
        references: () => ({
          tableName: targetState.baseName,
          schemaName: targetState.schemaName,
          columns: normalizeColumns(spec.referencedColumns),
          knownColumns: Object.keys(targetState.fields)
        }),
        onUpdate: spec.onUpdate,
        onDelete: spec.onDelete,
        deferrable: spec.deferrable,
        initiallyDeferred: spec.initiallyDeferred
      })
      })()
    : BaseTable.foreignKey(
        columnsOrSpec as LocalColumns,
        target as () => BaseTable.AnyTable,
        referencedColumns as TargetColumns
      )

export const check: {
  <Name extends string>(name: Name, predicate: DdlExpressionLike): BaseTable.TableOption
  <Name extends string, Table extends SchemaTable>(
    name: Name,
    predicate: TableExpressionFactory<Table>
  ): TableScopedOptionBuilder<Table, {
    readonly kind: "check"
    readonly name: Name
    readonly predicate: DdlExpressionLike
  }>
  <Name extends string, Table extends SchemaTable>(
    spec: Omit<RichCheckInput<Name>, "predicate"> & {
      readonly predicate: TableExpressionFactory<Table>
    }
  ): TableScopedOptionBuilder<Table, {
    readonly kind: "check"
    readonly name: Name
    readonly predicate: DdlExpressionLike
    readonly noInherit?: boolean
  }>
  <Name extends string>(spec: RichCheckInput<Name>): BaseTable.TableOption
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
          predicate: specPredicate as unknown as DdlExpressionLike,
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
          predicate: predicateOrFactory as unknown as DdlExpressionLike
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

export type SelectOf<Table extends { readonly schemas: { readonly select: Schema.Schema<any> } }> = BaseTable.SelectOf<Table>
export type InsertOf<Table extends { readonly schemas: { readonly insert: Schema.Schema<any> } }> = BaseTable.InsertOf<Table>
export type UpdateOf<Table extends { readonly schemas: { readonly update: Schema.Schema<any> } }> = BaseTable.UpdateOf<Table>
