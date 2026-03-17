import { pipeArguments, type Pipeable } from "effect/Pipeable"
import * as Schema from "effect/Schema"

import * as Plan from "./plan.ts"
import type { BoundColumnFrom } from "./internal/column-state.ts"
import { bindColumn, type AnyColumnDefinition } from "./internal/column-state.ts"
import {
  collectInlineOptions,
  normalizeColumnList,
  resolvePrimaryKeyColumns,
  type DeclaredTableOptions,
  type NormalizeColumns,
  type TableOptionSpec,
  type ValidateKnownColumns,
  type ValidatePrimaryKeyColumns,
  validateOptions
} from "./internal/table-options.ts"
import {
  deriveSchemas,
  type InsertRow,
  type SelectRow,
  type TableFieldMap,
  type UpdateRow
} from "./internal/schema-derivation.ts"

/** Symbol used to attach table-definition metadata. */
export const TypeId: unique symbol = Symbol.for("effect-qb/Table")
/** Symbol for the normalized table option list. */
export const OptionsSymbol: unique symbol = Symbol.for("effect-qb/Table/normalizedOptions")
/** Symbol used by `Table.Class` to declare table-level options. */
export const options: unique symbol = Symbol.for("effect-qb/Table/declaredOptions")

const CacheSymbol: unique symbol = Symbol.for("effect-qb/Table/cache")
const DeclaredOptionsSymbol: unique symbol = Symbol.for("effect-qb/Table/factoryDeclaredOptions")

type InlinePrimaryKeyKeys<Fields extends TableFieldMap> = Extract<{
  [K in keyof Fields]: Fields[K]["metadata"]["primaryKey"] extends true ? K : never
}[keyof Fields], string>

type TableDialect<Fields extends TableFieldMap> = Fields[keyof Fields][typeof import("./internal/column-state.ts").ColumnTypeId]["dbType"]["dialect"]
type TableKind = "schema" | "alias"
type ClassOptionSpec = Exclude<TableOptionSpec, { readonly kind: "primaryKey" }>
type ClassTableOption = TableOption<ClassOptionSpec>
type ClassDeclaredTableOptions = readonly ClassTableOption[]

type BuildPrimaryKey<
  Table extends TableDefinition<any, any, any, "schema">,
  Spec extends TableOptionSpec
> = Spec extends { readonly kind: "primaryKey"; readonly columns: infer Columns extends readonly string[] }
  ? Columns[number] & keyof Table[typeof TypeId]["fields"] & string
  : Table[typeof TypeId]["primaryKey"][number]

type OptionInputTable<
  Table extends TableDefinition<any, any, any, "schema">,
  Spec extends TableOptionSpec
> = Spec extends { readonly kind: "primaryKey"; readonly columns: infer Columns extends readonly string[] }
  ? ValidatePrimaryKeyColumns<Table[typeof TypeId]["fields"], Columns> extends never ? never : Table
  : Spec extends { readonly columns: infer Columns extends readonly string[] }
    ? ValidateKnownColumns<Table[typeof TypeId]["fields"], Columns> extends never ? never : Table
    : Table

type ApplyOption<
  Table extends TableDefinition<any, any, any, "schema">,
  Spec extends TableOptionSpec
> = TableDefinition<
  Table[typeof TypeId]["name"],
  Table[typeof TypeId]["fields"],
  BuildPrimaryKey<Table, Spec>,
  "schema"
>

type MissingSelfGeneric = "Missing `Self` generic - use `class Self extends Table.Class<Self>(...) {}`"

/** Bound columns keyed by field name for a particular table. */
export type BoundColumns<
  Name extends string,
  Fields extends TableFieldMap
> = {
  readonly [K in keyof Fields]: BoundColumnFrom<Fields[K], Name, Extract<K, string>>
}

/** Derived runtime schemas exposed by a table definition. */
export interface TableSchemas<
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
> {
  readonly select: Schema.Schema<SelectRow<Fields>>
  readonly insert: Schema.Schema<InsertRow<Fields>>
  readonly update: Schema.Schema<UpdateRow<Fields, PrimaryKeyColumns>>
}

interface TableState<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string,
  Kind extends TableKind = "schema"
> {
  readonly name: Name
  readonly baseName: string
  readonly fields: Fields
  readonly primaryKey: readonly PrimaryKeyColumns[]
  readonly kind: Kind
}

export type TableDefinition<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>,
  Kind extends TableKind = "schema"
> = Pipeable & {
  readonly name: Name
  readonly columns: BoundColumns<Name, Fields>
  readonly schemas: TableSchemas<Fields, PrimaryKeyColumns>
  readonly [TypeId]: TableState<Name, Fields, PrimaryKeyColumns, Kind>
  readonly [Plan.TypeId]: Plan.State<
    BoundColumns<Name, Fields>,
    never,
    Record<Name, Plan.Source<Name>>,
    TableDialect<Fields>
  >
  readonly [OptionsSymbol]: readonly TableOptionSpec[]
  readonly [DeclaredOptionsSymbol]: readonly TableOptionSpec[]
} & BoundColumns<Name, Fields> & Plan.Plan<
    BoundColumns<Name, Fields>,
    never,
    Record<Name, Plan.Source<Name>>,
    TableDialect<Fields>
  >

/**
 * Static class-based table definition.
 *
 * The class object itself acts as the table definition, exposing static bound
 * columns, derived schemas, and plan metadata.
 */
export type TableClassStatic<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>
> = (abstract new (...args: any[]) => any) & Pipeable & {
  readonly columns: BoundColumns<Name, Fields>
  readonly schemas: TableSchemas<Fields, PrimaryKeyColumns>
  readonly [TypeId]: TableState<Name, Fields, PrimaryKeyColumns>
  readonly [Plan.TypeId]: Plan.State<
    BoundColumns<Name, Fields>,
    never,
    Record<Name, Plan.Source<Name>>,
    TableDialect<Fields>
  >
  readonly [OptionsSymbol]: readonly TableOptionSpec[]
  readonly [DeclaredOptionsSymbol]?: readonly TableOptionSpec[]
  readonly [options]?: ClassDeclaredTableOptions
  readonly tableName: Name
} & BoundColumns<Name, Fields> & Plan.Plan<
    BoundColumns<Name, Fields>,
    never,
    Record<Name, Plan.Source<Name>>,
    TableDialect<Fields>
  >

/** Minimal structural table-like contract used across helper APIs. */
export type AnyTable = TableDefinition<any, any, any, any> | TableClassStatic<any, any, any>

/** Public table-option builder type used by `Table.index`, `Table.primaryKey`, and friends. */
export type TableOption<
  Spec extends TableOptionSpec = TableOptionSpec
> = {
  <
    Name extends string,
    Fields extends TableFieldMap,
    PrimaryKeyColumns extends keyof Fields & string
  >(
    table: OptionInputTable<TableDefinition<Name, Fields, PrimaryKeyColumns, "schema">, Spec>
  ): ApplyOption<TableDefinition<Name, Fields, PrimaryKeyColumns, "schema">, Spec>
  readonly option: Spec
}

const TableProto = {
  pipe(this: unknown) {
    return pipeArguments(this, arguments)
  }
}

type BuildArtifacts<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
> = {
  readonly columns: BoundColumns<Name, Fields>
  readonly schemas: TableSchemas<Fields, PrimaryKeyColumns>
  readonly normalizedOptions: readonly TableOptionSpec[]
  readonly primaryKey: readonly PrimaryKeyColumns[]
}

const buildArtifacts = <
  Name extends string,
  Fields extends TableFieldMap
>(
  name: Name,
  fields: Fields,
  declaredOptions: readonly TableOptionSpec[]
): BuildArtifacts<Name, Fields, keyof Fields & string> => {
  const normalizedOptions = [...collectInlineOptions(fields), ...declaredOptions]
  validateFieldDialects(name, fields)
  validateOptions(name, fields, declaredOptions)
  const primaryKey = resolvePrimaryKeyColumns(fields, declaredOptions) as readonly (keyof Fields & string)[]
  const columns = Object.fromEntries(
    Object.entries(fields).map(([key, column]) => [key, bindColumn(name, key, column, name)])
  ) as BoundColumns<Name, Fields>
  const schemas = deriveSchemas(fields, primaryKey)
  return {
    columns,
    schemas,
    normalizedOptions,
    primaryKey
  }
}

const makeTable = <
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string,
  Kind extends TableKind = "schema"
>(
  name: Name,
  fields: Fields,
  declaredOptions: readonly TableOptionSpec[],
  baseName: string = name,
  kind: Kind = "schema" as Kind
): TableDefinition<Name, Fields, PrimaryKeyColumns, Kind> => {
  const artifacts = buildArtifacts(name, fields, declaredOptions)
  const dialect = resolveFieldDialect(fields)
  const table = Object.create(TableProto)
  table.name = name
  table.columns = artifacts.columns
  table.schemas = artifacts.schemas
  table[TypeId] = {
    name,
    baseName,
    fields,
    primaryKey: artifacts.primaryKey,
    kind
  }
  table[Plan.TypeId] = {
    selection: artifacts.columns,
    required: undefined as never,
    available: {
      [name]: {
        name,
        mode: "required",
        baseName
      }
    },
    dialect
  }
  table[OptionsSymbol] = artifacts.normalizedOptions
  table[DeclaredOptionsSymbol] = declaredOptions
  for (const [key, value] of Object.entries(artifacts.columns)) {
    Object.defineProperty(table, key, {
      enumerable: true,
      value
    })
  }
  return table
}

const extractDeclaredOptions = (
  declaredOptions: DeclaredTableOptions | undefined
): readonly TableOptionSpec[] => declaredOptions?.map((option) => option.option) ?? []

const validateClassOptions = (declaredOptions: readonly TableOptionSpec[]): void => {
  for (const option of declaredOptions) {
    if (option.kind === "primaryKey") {
      throw new Error("Table.Class does not support table-level primary keys; declare primary keys inline on columns")
    }
  }
}

const resolveFieldDialect = (fields: TableFieldMap): string => {
  const dialects = [...new Set(Object.values(fields).map((field) => field.metadata.dbType.dialect))]
  if (dialects.length === 0) {
    return "postgres"
  }
  if (dialects.length > 1) {
    throw new Error(`Mixed table dialects are not supported: ${dialects.join(", ")}`)
  }
  return dialects[0]!
}

const validateFieldDialects = (tableName: string, fields: TableFieldMap): void => {
  try {
    resolveFieldDialect(fields)
  } catch (error) {
    throw new Error(`Invalid dialects for table '${tableName}': ${(error as Error).message}`)
  }
}

const ensureClassArtifacts = <
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  self: TableClassStatic<Name, Fields, PrimaryKeyColumns> & {
    readonly [CacheSymbol]?: BuildArtifacts<Name, Fields, PrimaryKeyColumns>
  }
): BuildArtifacts<Name, Fields, PrimaryKeyColumns> => {
  const cached = self[CacheSymbol]
  if (cached) {
    return cached
  }
  const state = self[TypeId]
  const declaredOptions = extractDeclaredOptions(self[options])
  validateClassOptions(declaredOptions)
  const artifacts = buildArtifacts(
    state.name,
    state.fields,
    declaredOptions
  ) as BuildArtifacts<Name, Fields, PrimaryKeyColumns>
  Object.defineProperty(self, CacheSymbol, {
    configurable: true,
    value: artifacts
  })
  return artifacts
}

const appendOption = <
  Table extends TableDefinition<any, any, any, "schema">,
  Spec extends TableOptionSpec
>(
  table: Table,
  option: Spec
): ApplyOption<Table, Spec> => {
  const state = table[TypeId]
  if (state.kind !== "schema") {
    throw new Error("Table options can only be applied to schema tables, not aliased query sources")
  }
  return makeTable(state.name, state.fields, [...table[DeclaredOptionsSymbol], option], state.baseName) as unknown as ApplyOption<Table, Spec>
}

const makeOption = <Spec extends TableOptionSpec>(option: Spec): TableOption<Spec> => {
  const builder = ((table: TableDefinition<any, any, any, "schema">) =>
    appendOption(table, option)) as unknown as TableOption<Spec>
  ;(builder as { option: Spec }).option = option
  return builder
}

/** Creates a table definition from a name and field map. */
export const make = <
  Name extends string,
  Fields extends TableFieldMap
>(
  name: Name,
  fields: Fields
): TableDefinition<Name, Fields> => makeTable(name, fields, [])

/**
 * Creates an aliased source from an existing table definition.
 *
 * The alias becomes the logical source identity used by the query layer while
 * the original physical table name is retained in bound-column provenance for
 * downstream SQL rendering work.
 */
export const alias = <
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string,
  AliasName extends string
>(
  table: TableDefinition<Name, Fields, PrimaryKeyColumns> | TableClassStatic<Name, Fields, PrimaryKeyColumns>,
  aliasName: AliasName
): TableDefinition<
  AliasName,
  Fields,
  PrimaryKeyColumns,
  "alias"
> => {
  const state = table[TypeId]
  const columns = Object.fromEntries(
    Object.entries(state.fields).map(([key, column]) => [key, bindColumn(aliasName, key, column as AnyColumnDefinition, state.baseName)])
  ) as BoundColumns<AliasName, Fields>
  const aliased = Object.create(TableProto)
  aliased.name = aliasName
  aliased.columns = columns
  aliased.schemas = table.schemas
  aliased[TypeId] = {
    name: aliasName,
    baseName: state.baseName,
    fields: state.fields,
    primaryKey: state.primaryKey,
    kind: "alias"
  }
  aliased[Plan.TypeId] = {
    selection: columns,
    required: undefined as never,
    available: {
      [aliasName]: {
        name: aliasName,
        mode: "required",
        baseName: state.baseName
      }
    },
    dialect: table[Plan.TypeId].dialect
  }
  aliased[OptionsSymbol] = table[OptionsSymbol]
  aliased[DeclaredOptionsSymbol] = table[DeclaredOptionsSymbol]
  for (const [key, value] of Object.entries(columns)) {
    Object.defineProperty(aliased, key, {
      enumerable: true,
      value
    })
  }
  return aliased
}

/**
 * Class-based table constructor mirroring `Schema.Class`.
 *
 * The returned base class can be extended and configured with
 * `static readonly [Table.options]`.
 */
export const Class = <Self = never>(name: string) =>
  <Fields extends TableFieldMap>(fields: Fields): [Self] extends [never]
    ? MissingSelfGeneric
    : TableClassStatic<typeof name, Fields> => {
      abstract class TableClassBase {
        static readonly tableName = name

        static get columns() {
          return ensureClassArtifacts(this as any).columns
        }

        static get schemas() {
          return ensureClassArtifacts(this as any).schemas
        }

        static get [TypeId]() {
          const declaredOptions = extractDeclaredOptions((this as unknown as TableClassStatic<typeof name, Fields>)[options])
          validateClassOptions(declaredOptions)
          return {
            name,
            baseName: name,
            fields,
            primaryKey: resolvePrimaryKeyColumns(fields, collectInlineOptions(fields)),
            kind: "schema"
          }
        }

        static get [Plan.TypeId]() {
          const artifacts = ensureClassArtifacts(this as any)
          return {
            selection: artifacts.columns,
            required: undefined as never,
            available: {
              [name]: {
                name,
                mode: "required",
                baseName: name
              }
            },
            dialect: resolveFieldDialect(fields)
          }
        }

        static get [OptionsSymbol]() {
          return ensureClassArtifacts(this as any).normalizedOptions
        }

        static pipe(this: unknown) {
          return pipeArguments(this, arguments)
        }
      }

      for (const key of Object.keys(fields)) {
        Object.defineProperty(TableClassBase, key, {
          enumerable: true,
          configurable: true,
          get() {
            return (ensureClassArtifacts(this as any).columns as unknown as Record<string, AnyColumnDefinition>)[key]
          }
        })
      }

      return TableClassBase as any
    }

/** Declares a table-level primary key. */
export const primaryKey = <
  Columns extends string | readonly string[]
>(
  columns: Columns
): TableOption<{
  readonly kind: "primaryKey"
  readonly columns: NormalizeColumns<Columns>
}> => makeOption({
  kind: "primaryKey",
  columns: normalizeColumnList(columns) as NormalizeColumns<Columns>
})

/** Declares a table-level unique constraint. */
export const unique = <
  Columns extends string | readonly string[]
>(
  columns: Columns
): TableOption<{
  readonly kind: "unique"
  readonly columns: NormalizeColumns<Columns>
}> => makeOption({
  kind: "unique",
  columns: normalizeColumnList(columns) as NormalizeColumns<Columns>
})

/** Declares a table-level index. */
export const index = <
  Columns extends string | readonly string[]
>(
  columns: Columns
): TableOption<{
  readonly kind: "index"
  readonly columns: NormalizeColumns<Columns>
}> => makeOption({
  kind: "index",
  columns: normalizeColumnList(columns) as NormalizeColumns<Columns>
})

/** Declares a table-level foreign key. */
export const foreignKey = <
  LocalColumns extends string | readonly string[],
  TargetTable extends AnyTable,
  TargetColumns extends string | readonly string[]
>(
  columns: LocalColumns,
  target: () => TargetTable,
  referencedColumns: TargetColumns
): TableOption<{
  readonly kind: "foreignKey"
  readonly columns: NormalizeColumns<LocalColumns>
  readonly references: () => {
    readonly tableName: string
    readonly columns: NormalizeColumns<TargetColumns>
    readonly knownColumns: readonly string[]
  }
}> => makeOption({
  kind: "foreignKey",
  columns: normalizeColumnList(columns) as NormalizeColumns<LocalColumns>,
  references: () => ({
    tableName: target()[TypeId].baseName,
    columns: normalizeColumnList(referencedColumns) as NormalizeColumns<TargetColumns>,
    knownColumns: Object.keys(target()[TypeId].fields)
  })
})

/** Declares a metadata-only check constraint placeholder. */
export const check = <Name extends string>(
  name: Name,
  predicate: unknown
): TableOption<{
  readonly kind: "check"
  readonly name: Name
  readonly predicate: unknown
}> => makeOption({
  kind: "check",
  name,
  predicate
})

/** Extracts the row type of a table's select schema. */
export type SelectOf<Table extends { readonly schemas: { readonly select: Schema.Schema<any> } }> = Schema.Schema.Type<
  Table["schemas"]["select"]
>
/** Extracts the payload type of a table's insert schema. */
export type InsertOf<Table extends { readonly schemas: { readonly insert: Schema.Schema<any> } }> = Schema.Schema.Type<
  Table["schemas"]["insert"]
>
/** Extracts the payload type of a table's update schema. */
export type UpdateOf<Table extends { readonly schemas: { readonly update: Schema.Schema<any> } }> = Schema.Schema.Type<
  Table["schemas"]["update"]
>
