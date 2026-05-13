import { pipeArguments, type Pipeable } from "effect/Pipeable"
import * as Schema from "effect/Schema"

import * as Plan from "./row-set.js"
import type { Any as AnyExpression } from "./scalar.js"
import type { TrueFormula } from "./predicate/formula.js"
import type { BoundColumnFrom } from "./column-state.js"
import { bindColumn, type AnyColumnDefinition } from "./column-state.js"
import {
  collectInlineOptions,
  normalizeColumnList,
  resolvePrimaryKeyColumns,
  type DdlExpressionLike,
  type IndexKeySpec,
  type MatchingColumnArityInput,
  type NonEmptyColumnInput,
  type NormalizeColumns,
  type ReferentialAction,
  type TableOptionSpec,
  type ValidateForeignKeyOptionColumns,
  type ValidateIndexOptionColumns,
  type ValidateKnownColumns,
  type ValidatePrimaryKeyColumns,
  validateOptions
} from "./table-options.js"
import {
  deriveInsertSchema,
  deriveSelectSchema,
  deriveUpdateSchema,
  type InsertRow,
  type SelectRow,
  type TableFieldMap,
  type TableSchemaVariant,
  type UpdateRow
} from "./schema-derivation.js"

/** Symbol used to attach table-definition metadata. */
export const TypeId: unique symbol = Symbol.for("effect-qb/Table")
/** Symbol for the normalized table option list. */
export const OptionsSymbol: unique symbol = Symbol.for("effect-qb/Table/normalizedOptions")
/** Symbol used by `Table.Class` to declare table-level options. */
export const options: unique symbol = Symbol.for("effect-qb/Table/declaredOptions")

const CacheSymbol: unique symbol = Symbol.for("effect-qb/Table/cache")
const SchemaCacheSymbol: unique symbol = Symbol.for("effect-qb/Table/schemaCache")
const DeclaredOptionsSymbol: unique symbol = Symbol.for("effect-qb/Table/factoryDeclaredOptions")

type InlinePrimaryKeyKeys<Fields extends TableFieldMap> = Extract<{
  [K in keyof Fields]: Fields[K]["metadata"]["primaryKey"] extends true ? K : never
}[keyof Fields], string>

type TableDialect<Fields extends TableFieldMap> = Fields[keyof Fields][typeof import("./column-state.js").ColumnTypeId]["dbType"]["dialect"]
type TableKind = "schema" | "alias"
type DefaultSchemaName = "public"
type FieldColumnName<Fields extends TableFieldMap> = Extract<keyof Fields, string>
type FieldColumnList<Fields extends TableFieldMap> = readonly [FieldColumnName<Fields>, ...FieldColumnName<Fields>[]]
type FieldIndexKeySpec<Fields extends TableFieldMap> =
  | (Extract<IndexKeySpec, { readonly kind: "column" }> & { readonly column: FieldColumnName<Fields> })
  | Extract<IndexKeySpec, { readonly kind: "expression" }>
type ClassOptionSpec<Fields extends TableFieldMap = TableFieldMap> =
  | (Omit<Extract<TableOptionSpec, { readonly kind: "index" }>, "columns" | "include" | "keys"> & {
      readonly columns?: FieldColumnList<Fields>
      readonly include?: readonly FieldColumnName<Fields>[]
      readonly keys?: readonly [FieldIndexKeySpec<Fields>, ...FieldIndexKeySpec<Fields>[]]
    })
  | (Omit<Extract<TableOptionSpec, { readonly kind: "unique" }>, "columns"> & {
      readonly columns: FieldColumnList<Fields>
    })
  | (Omit<Extract<TableOptionSpec, { readonly kind: "foreignKey" }>, "columns"> & {
      readonly columns: FieldColumnList<Fields>
    })
  | Extract<TableOptionSpec, { readonly kind: "check" }>
interface TableOptionBuilderLike<
  Spec extends TableOptionSpec = TableOptionSpec
> {
  readonly option: Spec
}

type ClassTableOption<Fields extends TableFieldMap> = TableOptionBuilderLike<ClassOptionSpec<Fields>>
type ClassDeclaredTableOptions<Fields extends TableFieldMap> = readonly ClassTableOption<Fields>[]

type BuildPrimaryKey<
  Table extends TableDefinition<any, any, any, "schema", any>,
  Spec extends TableOptionSpec
> = Spec extends { readonly kind: "primaryKey"; readonly columns: infer Columns extends readonly string[] }
  ? Columns[number] & keyof Table[typeof TypeId]["fields"] & string
  : Table[typeof TypeId]["primaryKey"][number]

type OptionInputTable<
  Table extends TableDefinition<any, any, any, "schema", any>,
  Spec extends TableOptionSpec
> = Spec extends { readonly kind: "primaryKey"; readonly columns: infer Columns extends readonly string[] }
  ? ValidatePrimaryKeyColumns<Table[typeof TypeId]["fields"], Columns> extends never ? never : Table
  : Spec extends { readonly kind: "index" }
    ? ValidateIndexOptionColumns<Table[typeof TypeId]["fields"], Spec> extends never ? never : Table
    : Spec extends { readonly kind: "foreignKey" }
      ? ValidateForeignKeyOptionColumns<Table[typeof TypeId]["fields"], Spec> extends never ? never : Table
      : Spec extends { readonly columns: infer Columns extends readonly string[] }
        ? ValidateKnownColumns<Table[typeof TypeId]["fields"], Columns> extends never ? never : Table
        : Table

type ApplyOption<
  Table extends TableDefinition<any, any, any, "schema", any>,
  Spec extends TableOptionSpec
> = Spec extends { readonly kind: "primaryKey" }
  ? TableDefinition<
    Table[typeof TypeId]["name"],
    Table[typeof TypeId]["fields"],
    BuildPrimaryKey<Table, Spec>,
    "schema"
  >
  : TableDefinition<
    Table[typeof TypeId]["name"],
    Table[typeof TypeId]["fields"],
    Table[typeof TypeId]["primaryKey"][number],
    "schema"
  >

export type ValidateDeclaredOptions<
  Table extends TableDefinition<any, any, any, "schema", any>,
  Options extends DeclaredTableOptions
> = {
  readonly [K in keyof Options]: Options[K] extends TableOptionBuilderLike<infer Spec>
    ? OptionInputTable<Table, Spec> extends never ? never : Options[K]
    : never
}

export type ApplyDeclaredOptions<
  Table extends TableDefinition<any, any, any, "schema", any>,
  Options extends DeclaredTableOptions
> = Options extends readonly [infer Head, ...infer Tail]
  ? Head extends TableOptionBuilderLike<infer Spec>
    ? Tail extends DeclaredTableOptions
      ? ApplyDeclaredOptions<ApplyOption<Table, Spec>, Tail>
      : ApplyOption<Table, Spec>
    : Table
  : Table

export type MissingSelfGeneric = "Missing `Self` generic - use `class Self extends Table.Class<Self>(...) {}`"

/** Bound columns keyed by field name for a particular table. */
export type BoundColumns<
  Name extends string,
  Fields extends TableFieldMap
> = {
  readonly [K in keyof Fields]: BoundColumnFrom<Fields[K], Name, Extract<K, string>>
}

/** Derived runtime schemas exposed by a table definition. */
export interface TableSchemas<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
> {
  readonly select: Schema.Decoder<SelectRow<Name, Fields>, never>
  readonly insert: Schema.Decoder<InsertRow<Name, Fields>, never>
  readonly update: Schema.Decoder<UpdateRow<Name, Fields, PrimaryKeyColumns>, never>
}

type TableSchemaCache<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
> = Partial<TableSchemas<Name, Fields, PrimaryKeyColumns>> & {
  schemas?: TableSchemas<Name, Fields, PrimaryKeyColumns>
}

interface TableState<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string,
  Kind extends TableKind = "schema",
  SchemaName extends string | undefined = DefaultSchemaName
> {
  readonly name: Name
  readonly baseName: string
  readonly schemaName: SchemaName
  readonly fields: Fields
  readonly primaryKey: readonly PrimaryKeyColumns[]
  readonly kind: Kind
}

/** Namespace-scoped table builder. */
export interface TableSchemaNamespace<SchemaName extends string> {
  readonly schemaName: SchemaName
  readonly table: <
    Name extends string,
    Fields extends TableFieldMap,
    const Options extends DeclaredTableOptions,
    PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>
  >(
    name: Name,
    fields: Fields,
    ...options: Options & ValidateDeclaredOptions<TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>, Options>
  ) => ApplyDeclaredOptions<TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>, Options>
}

export type DeclaredTableOptions = readonly TableOptionBuilderLike[]
export type { DdlExpressionLike, IndexKeySpec, MatchingColumnArityInput, NonEmptyColumnInput, NormalizeColumns, ReferentialAction } from "./table-options.js"

export type TableDefinition<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>,
  Kind extends TableKind = "schema",
  SchemaName extends string | undefined = DefaultSchemaName
> = Pipeable & {
  readonly name: Name
  readonly columns: BoundColumns<Name, Fields>
  readonly schemas: TableSchemas<Name, Fields, PrimaryKeyColumns>
  readonly [TypeId]: TableState<Name, Fields, PrimaryKeyColumns, Kind, SchemaName>
  readonly [Plan.TypeId]: Plan.State<
    BoundColumns<Name, Fields>,
    never,
    Record<Name, Plan.Source<Name, "required", TrueFormula>>,
    TableDialect<Fields>
  >
  readonly [OptionsSymbol]: readonly TableOptionSpec[]
  readonly [DeclaredOptionsSymbol]: readonly TableOptionSpec[]
} & BoundColumns<Name, Fields> & Plan.RowSet<
    BoundColumns<Name, Fields>,
    never,
    Record<Name, Plan.Source<Name, "required", TrueFormula>>,
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
  PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>,
  SchemaName extends string | undefined = DefaultSchemaName
> = (abstract new (...args: any[]) => any) & Pipeable & {
  readonly columns: BoundColumns<Name, Fields>
  readonly schemas: TableSchemas<Name, Fields, PrimaryKeyColumns>
  readonly [TypeId]: TableState<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>
  readonly [Plan.TypeId]: Plan.State<
    BoundColumns<Name, Fields>,
    never,
    Record<Name, Plan.Source<Name, "required", TrueFormula>>,
    TableDialect<Fields>
  >
  readonly [OptionsSymbol]: readonly TableOptionSpec[]
  readonly [DeclaredOptionsSymbol]?: readonly TableOptionSpec[]
  readonly [options]?: ClassDeclaredTableOptions<Fields>
  readonly tableName: Name
} & BoundColumns<Name, Fields> & Plan.RowSet<
    BoundColumns<Name, Fields>,
    never,
    Record<Name, Plan.Source<Name, "required", TrueFormula>>,
    TableDialect<Fields>
  >

/** Minimal structural table-like contract used across helper APIs. */
export type AnyTable<Dialect extends string = string> = {
  readonly [TypeId]: TableState<string, TableFieldMap, string, TableKind, string | undefined>
  readonly [OptionsSymbol]: readonly TableOptionSpec[]
} & Plan.RowSet<any, any, Record<string, Plan.AnySource>, Dialect>

type FieldsOfAnyTable<Table extends AnyTable> = Table[typeof TypeId]["fields"]

type ColumnNamesOfAnyTable<Table extends AnyTable> = Extract<keyof FieldsOfAnyTable<Table>, string>

/** Public table-option builder type used by `Table.index`, `Table.primaryKey`, and friends. */
export type TableOption<
  Spec extends TableOptionSpec = TableOptionSpec
> = {
  <
    Name extends string,
    Fields extends TableFieldMap,
    PrimaryKeyColumns extends keyof Fields & string
  >(
    table: OptionInputTable<TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", any>, Spec>
  ): ApplyOption<TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", any>, Spec>
  readonly option: Spec
}

const TableProto = {
  pipe(this: unknown) {
    return pipeArguments(this, arguments)
  }
}

const attachPipe = <Value extends object>(value: Value): Value => {
  Object.defineProperty(value, "pipe", {
    configurable: true,
    writable: true,
    value: function(this: unknown) {
      return pipeArguments(value, arguments)
    }
  })
  return value
}

type BuildArtifacts<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
> = {
  readonly columns: BoundColumns<Name, Fields>
  readonly normalizedOptions: readonly TableOptionSpec[]
  readonly primaryKey: readonly PrimaryKeyColumns[]
}

const buildArtifacts = <
  Name extends string,
  Fields extends TableFieldMap,
  SchemaName extends string | undefined
>(
  name: Name,
  fields: Fields,
  declaredOptions: readonly TableOptionSpec[],
  schemaName: SchemaName
): BuildArtifacts<Name, Fields, keyof Fields & string> => {
  const normalizedOptions = [...collectInlineOptions(fields), ...declaredOptions]
  validateFieldDialects(name, fields)
  validateOptions(name, fields, declaredOptions)
  const primaryKey = resolvePrimaryKeyColumns(fields, declaredOptions) as readonly (keyof Fields & string)[]
  const columns = Object.fromEntries(
    Object.entries(fields).map(([key, column]) => [key, bindColumn(name, key, column, name, schemaName)])
  ) as BoundColumns<Name, Fields>
  return {
    columns,
    normalizedOptions,
    primaryKey
  }
}

const getSchemaCache = <
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, any> | TableClassStatic<Name, Fields, PrimaryKeyColumns, any>
): TableSchemaCache<Name, Fields, PrimaryKeyColumns> => {
  const target = table as unknown as {
    [SchemaCacheSymbol]?: TableSchemaCache<Name, Fields, PrimaryKeyColumns>
  }
  if (target[SchemaCacheSymbol] !== undefined) {
    return target[SchemaCacheSymbol]
  }
  const cache: TableSchemaCache<Name, Fields, PrimaryKeyColumns> = {}
  Object.defineProperty(table, SchemaCacheSymbol, {
    configurable: true,
    value: cache
  })
  return cache
}

const deriveTableSchema = <
  Variant extends TableSchemaVariant,
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, any> | TableClassStatic<Name, Fields, PrimaryKeyColumns, any>,
  variant: Variant
): TableSchemas<Name, Fields, PrimaryKeyColumns>[Variant] => {
  const state = table[TypeId]
  switch (variant) {
    case "select":
      return deriveSelectSchema(state.name, state.fields, state.primaryKey) as TableSchemas<Name, Fields, PrimaryKeyColumns>[Variant]
    case "insert":
      return deriveInsertSchema(state.name, state.fields, state.primaryKey) as TableSchemas<Name, Fields, PrimaryKeyColumns>[Variant]
    case "update":
      return deriveUpdateSchema(state.name, state.fields, state.primaryKey) as TableSchemas<Name, Fields, PrimaryKeyColumns>[Variant]
  }
}

const schemaFor = <
  Variant extends TableSchemaVariant,
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, any> | TableClassStatic<Name, Fields, PrimaryKeyColumns, any>,
  variant: Variant
): TableSchemas<Name, Fields, PrimaryKeyColumns>[Variant] => {
  const cache = getSchemaCache(table)
  const cached = cache[variant]
  if (cached !== undefined) {
    return cached as TableSchemas<Name, Fields, PrimaryKeyColumns>[Variant]
  }
  const schema = deriveTableSchema(table, variant)
  cache[variant] = schema as any
  return schema
}

export function selectSchema<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, any> | TableClassStatic<Name, Fields, PrimaryKeyColumns, any>
): Schema.Decoder<SelectRow<Name, Fields>, never> {
  return schemaFor(table, "select") as Schema.Decoder<SelectRow<Name, Fields>, never>
}

export function insertSchema<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, any> | TableClassStatic<Name, Fields, PrimaryKeyColumns, any>
): Schema.Decoder<InsertRow<Name, Fields>, never> {
  return schemaFor(table, "insert") as Schema.Decoder<InsertRow<Name, Fields>, never>
}

export function updateSchema<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, any> | TableClassStatic<Name, Fields, PrimaryKeyColumns, any>
): Schema.Decoder<UpdateRow<Name, Fields, PrimaryKeyColumns>, never> {
  return schemaFor(table, "update") as Schema.Decoder<UpdateRow<Name, Fields, PrimaryKeyColumns>, never>
}

const schemasFor = <
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, any> | TableClassStatic<Name, Fields, PrimaryKeyColumns, any>
): TableSchemas<Name, Fields, PrimaryKeyColumns> => {
  const cache = getSchemaCache(table)
  if (cache.schemas !== undefined) {
    return cache.schemas
  }
  const schemas = {} as TableSchemas<Name, Fields, PrimaryKeyColumns>
  Object.defineProperties(schemas, {
    select: {
      enumerable: true,
      get: () => selectSchema(table)
    },
    insert: {
      enumerable: true,
      get: () => insertSchema(table)
    },
    update: {
      enumerable: true,
      get: () => updateSchema(table)
    }
  })
  cache.schemas = schemas
  return schemas
}

const defineSchemasGetter = <
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, any>
): void => {
  Object.defineProperty(table, "schemas", {
    configurable: true,
    enumerable: true,
    get() {
      return schemasFor(table)
    }
  })
}

const makeTable = <
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string,
  Kind extends TableKind = "schema",
  SchemaName extends string | undefined = DefaultSchemaName
>(
  name: Name,
  fields: Fields,
  declaredOptions: readonly TableOptionSpec[],
  baseName: string = name,
  kind: Kind = "schema" as Kind,
  schemaName?: SchemaName,
  schemaMode: "default" | "explicit" = "default"
): TableDefinition<Name, Fields, PrimaryKeyColumns, Kind, SchemaName> => {
  const resolvedSchemaName = schemaMode === "explicit"
    ? schemaName
    : ("public" as SchemaName)
  const artifacts = buildArtifacts(name, fields, declaredOptions, resolvedSchemaName)
  const dialect = resolveFieldDialect(fields)
  const table = attachPipe(Object.create(TableProto))
  table.name = name
  table.columns = artifacts.columns
  defineSchemasGetter(table)
  table[TypeId] = {
    name,
    baseName,
    schemaName: resolvedSchemaName,
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

const applyDeclaredOptions = <
  Table extends TableDefinition<any, any, any, "schema", any>
>(
  table: Table,
  declaredOptions: DeclaredTableOptions | undefined
): Table => {
  if (declaredOptions === undefined || declaredOptions.length === 0) {
    return table
  }
  return declaredOptions.reduce<TableDefinition<any, any, any, "schema", any>>(
    (current, option) =>
      (option as unknown as (
        table: TableDefinition<any, any, any, "schema", any>
      ) => TableDefinition<any, any, any, "schema", any>)(current),
    table
  ) as unknown as Table
}

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
    throw new Error("Cannot infer table dialect from an empty field set")
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
  const classOptions = self[options]
  validateClassOptions(extractDeclaredOptions(classOptions))
  const table = applyDeclaredOptions(
    makeTable(
      state.name,
      state.fields,
      [],
      state.name,
      "schema",
      state.schemaName,
      state.schemaName === undefined || state.schemaName === "public" ? "default" : "explicit"
    ) as TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", typeof state.schemaName>,
    classOptions
  )
  const artifacts = {
    columns: table.columns,
    normalizedOptions: table[OptionsSymbol],
    primaryKey: table[TypeId].primaryKey as readonly PrimaryKeyColumns[]
  } satisfies BuildArtifacts<Name, Fields, PrimaryKeyColumns>
  Object.defineProperty(self, CacheSymbol, {
    configurable: true,
    value: artifacts
  })
  return artifacts
}

const appendOption = <
  Table extends TableDefinition<any, any, any, "schema", any>,
  Spec extends TableOptionSpec
>(
  table: Table,
  option: Spec
): ApplyOption<Table, Spec> => {
  const state = table[TypeId]
  if (state.kind !== "schema") {
    throw new Error("Table options can only be applied to schema tables, not aliased query sources")
  }
  return makeTable(
    state.name,
    state.fields,
    [...table[DeclaredOptionsSymbol], option],
    state.baseName,
    state.kind,
    state.schemaName,
    "explicit"
  ) as unknown as ApplyOption<Table, Spec>
}

const makeOption = <Spec extends TableOptionSpec>(option: Spec): TableOption<Spec> => {
  const builder = ((table: TableDefinition<any, any, any, "schema", any>) =>
    appendOption(table, option)) as unknown as TableOption<Spec>
  ;(builder as { option: Spec }).option = option
  return builder
}

const makeResolvedOption = <Spec extends TableOptionSpec>(
  option: Spec,
  resolve: (table: TableDefinition<any, any, any, "schema", any>) => Spec
): TableOption<Spec> => {
  const builder = ((table: TableDefinition<any, any, any, "schema", any>) =>
    appendOption(table, resolve(table))) as unknown as TableOption<Spec>
  ;(builder as { option: Spec }).option = option
  return builder
}

export const option = <Spec extends TableOptionSpec>(spec: Spec): TableOption<Spec> =>
  makeOption(spec)

export const optionFromTable = <Spec extends TableOptionSpec>(
  spec: Spec,
  resolve: (table: TableDefinition<any, any, any, "schema", any>) => Spec
): TableOption<Spec> =>
  makeResolvedOption(spec, resolve)

/** Creates a table definition from a name and field map. */
export function make<
  Name extends string,
  Fields extends TableFieldMap,
  SchemaName extends string | undefined = DefaultSchemaName
>(
  name: Name,
  fields: Fields,
  schemaName?: SchemaName
): TableDefinition<Name, Fields, InlinePrimaryKeyKeys<Fields>, "schema", SchemaName> {
  const resolvedSchemaName = arguments.length >= 3
    ? schemaName
    : ("public" as SchemaName)
  return makeTable(
    name,
    fields,
    [],
    name,
    "schema",
    resolvedSchemaName,
    arguments.length >= 3 ? "explicit" : "default"
  )
}

/**
 * Creates a namespace-scoped builder for a concrete SQL schema/database.
 */
export const schema = <SchemaName extends string>(
  schemaName: SchemaName
): TableSchemaNamespace<SchemaName> => {
  const table = <
    Name extends string,
    Fields extends TableFieldMap,
    const Options extends DeclaredTableOptions,
    PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>
  >(
    name: Name,
    fields: Fields,
    ...options: Options & ValidateDeclaredOptions<TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>, Options>
  ): ApplyDeclaredOptions<TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>, Options> =>
    applyDeclaredOptions(
      makeTable(
        name,
        fields,
        [],
        name,
        "schema",
        schemaName,
        "explicit"
      ) as TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>,
      options as unknown as Options
    ) as ApplyDeclaredOptions<TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>, Options>
  return {
    schemaName,
    table
  } as unknown as TableSchemaNamespace<SchemaName>
}

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
  SchemaName extends string,
  AliasName extends string
>(
  table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, SchemaName> | TableClassStatic<Name, Fields, PrimaryKeyColumns, SchemaName>,
  aliasName: AliasName
): TableDefinition<
  AliasName,
  Fields,
  PrimaryKeyColumns,
  "alias",
  SchemaName
> => {
  const state = table[TypeId]
  const columns = Object.fromEntries(
    Object.entries(state.fields).map(([key, column]) => [key, bindColumn(aliasName, key, column as AnyColumnDefinition, state.baseName, state.schemaName)])
  ) as BoundColumns<AliasName, Fields>
  const aliased = attachPipe(Object.create(TableProto))
  aliased.name = aliasName
  aliased.columns = columns
  defineSchemasGetter(aliased)
  aliased[TypeId] = {
    name: aliasName,
    baseName: state.baseName,
    schemaName: state.schemaName,
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
export function Class<
  Self = never,
  SchemaName extends string | undefined = DefaultSchemaName
>(
  name: string,
  schemaName?: SchemaName
) {
  const resolvedSchemaName = arguments.length >= 2
    ? schemaName
    : ("public" as SchemaName)
  return <Fields extends TableFieldMap>(fields: Fields): [Self] extends [never]
    ? MissingSelfGeneric
    : TableClassStatic<typeof name, Fields, InlinePrimaryKeyKeys<Fields>, SchemaName> => {
      abstract class TableClassBase {
        static readonly tableName = name

        static get columns() {
          return ensureClassArtifacts(this as any).columns
        }

        static get schemas() {
          return schemasFor(this as any)
        }

        static get [TypeId]() {
          const declaredOptions = extractDeclaredOptions((this as unknown as TableClassStatic<typeof name, Fields>)[options])
          validateClassOptions(declaredOptions)
          return {
            name,
            baseName: name,
            schemaName: resolvedSchemaName,
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
}

/** Declares a table-level primary key. */
export const primaryKey = <
  const Columns extends string | readonly string[]
>(
  columns: Columns & NonEmptyColumnInput<Columns>
): TableOption<{
  readonly kind: "primaryKey"
  readonly columns: NormalizeColumns<Columns>
}> => makeOption({
  kind: "primaryKey",
  columns: normalizeColumnList(columns) as NormalizeColumns<Columns>
})

/** Declares a table-level unique constraint. */
export const unique = <
  const Columns extends string | readonly string[]
>(
  columns: Columns & NonEmptyColumnInput<Columns>
): TableOption<{
  readonly kind: "unique"
  readonly columns: NormalizeColumns<Columns>
}> => makeOption({
  kind: "unique",
  columns: normalizeColumnList(columns) as NormalizeColumns<Columns>
})

/** Declares a table-level index. */
export const index = <
  const Columns extends string | readonly string[]
>(
  columns: Columns & NonEmptyColumnInput<Columns>
): TableOption<{
  readonly kind: "index"
  readonly columns: NormalizeColumns<Columns>
}> => makeOption({
  kind: "index",
  columns: normalizeColumnList(columns) as NormalizeColumns<Columns>
})

/** Declares a table-level foreign key. */
export const foreignKey = <
  const LocalColumns extends string | readonly string[],
  TargetTable extends AnyTable,
  const TargetColumns extends string | readonly string[]
>(
  columns: LocalColumns & NonEmptyColumnInput<LocalColumns>,
  target: () => TargetTable,
  referencedColumns: TargetColumns & NonEmptyColumnInput<TargetColumns> & MatchingColumnArityInput<LocalColumns, TargetColumns>
): TableOption<{
  readonly kind: "foreignKey"
  readonly columns: NormalizeColumns<LocalColumns>
  readonly references: () => {
    readonly tableName: string
    readonly schemaName?: string
    readonly columns: NormalizeColumns<TargetColumns>
    readonly knownColumns: readonly ColumnNamesOfAnyTable<TargetTable>[]
  }
}> => makeOption({
  kind: "foreignKey",
  columns: normalizeColumnList(columns) as NormalizeColumns<LocalColumns>,
  references: () => ({
    tableName: target()[TypeId].baseName,
    schemaName: target()[TypeId].schemaName,
    columns: normalizeColumnList(referencedColumns) as NormalizeColumns<TargetColumns>,
    knownColumns: Object.keys(target()[TypeId].fields) as unknown as readonly ColumnNamesOfAnyTable<TargetTable>[]
  })
})

/** Declares a check constraint expression. */
export const check = <Name extends string>(
  name: Name,
  predicate: DdlExpressionLike
): TableOption<{
  readonly kind: "check"
  readonly name: Name
  readonly predicate: DdlExpressionLike
}> => makeOption({
  kind: "check",
  name,
  predicate
})

/** Extracts the row type produced by `selectSchema(table)`. */
export type SelectOf<Table extends AnyTable> = Table[typeof TypeId] extends {
  readonly name: infer Name extends string
  readonly fields: infer Fields extends TableFieldMap
} ? SelectRow<Name, Fields> : never

/** Extracts the payload type produced by `insertSchema(table)`. */
export type InsertOf<Table extends AnyTable> = Table[typeof TypeId] extends {
  readonly name: infer Name extends string
  readonly fields: infer Fields extends TableFieldMap
} ? InsertRow<Name, Fields> : never

/** Extracts the payload type produced by `updateSchema(table)`. */
export type UpdateOf<Table extends AnyTable> = Table[typeof TypeId] extends {
  readonly name: infer Name extends string
  readonly fields: infer Fields extends TableFieldMap
  readonly primaryKey: readonly (infer PrimaryKeyColumns)[]
} ? UpdateRow<Name, Fields, Extract<PrimaryKeyColumns, keyof Fields & string>> : never
