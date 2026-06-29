import { pipeArguments, type Pipeable } from "effect/Pipeable"
import * as Schema from "effect/Schema"

import * as Plan from "./row-set.js"
import type { Any as AnyExpression } from "./scalar.js"
import type { TrueFormula } from "./predicate/formula.js"
import type { BoundColumnFrom } from "./column-state.js"
import { bindColumn, BoundColumnTypeId, type AnyBoundColumn, type AnyColumnDefinition } from "./column-state.js"
import {
  collectInlineOptions,
  resolvePrimaryKeyColumns,
  type ColumnList,
  type DdlExpressionLike,
  type IndexKeySpec,
  type LiteralStringInput,
  type NonEmptyStringInput,
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
import * as Casing from "./casing.js"

/** Symbol used to attach table-definition metadata. */
export const TypeId: unique symbol = Symbol.for("effect-qb/Table")
/** Symbol for the normalized table option list. */
export const OptionsSymbol: unique symbol = Symbol.for("effect-qb/Table/normalizedOptions")
/** Symbol used by `Table.Class` to declare table-level options. */
export const options: unique symbol = Symbol.for("effect-qb/Table/declaredOptions")

const CacheSymbol: unique symbol = Symbol.for("effect-qb/Table/cache")
const SchemaCacheSymbol: unique symbol = Symbol.for("effect-qb/Table/schemaCache")
const DeclaredOptionsSymbol: unique symbol = Symbol.for("effect-qb/Table/factoryDeclaredOptions")
const ResolveOptionSymbol: unique symbol = Symbol.for("effect-qb/Table/resolveOption")

type InlinePrimaryKeyKeys<Fields extends TableFieldMap> = Extract<{
  [K in keyof Fields]: Fields[K]["metadata"]["primaryKey"] extends true ? K : never
}[keyof Fields], string>

type FieldDialects<Fields extends TableFieldMap> = Fields[keyof Fields][typeof import("./column-state.js").ColumnTypeId]["dbType"]["dialect"]
type ConcreteFieldDialects<Fields extends TableFieldMap> = Exclude<FieldDialects<Fields>, "standard">
type TableDialect<Fields extends TableFieldMap> = [ConcreteFieldDialects<Fields>] extends [never]
  ? "standard"
  : ConcreteFieldDialects<Fields>
type TableKind = "schema" | "alias"
type DefaultSchemaName = "public"
type NonEmptyFieldMap<Fields extends TableFieldMap> =
  string extends keyof Fields ? Fields : "" extends keyof Fields ? never : Fields
type FieldColumnName<Fields extends TableFieldMap> = Extract<keyof Fields, string>
type FieldColumnList<Fields extends TableFieldMap> = readonly [FieldColumnName<Fields>, ...FieldColumnName<Fields>[]]
export type SchemaTableDefinition = TableDefinition<any, any, any, "schema", any, any>
type LooseTableSelection = any
type ConcreteSelector<
  Table extends SchemaTableDefinition,
  Selection extends AnyColumnSelection
> = SchemaTableDefinition extends Table ? never : (table: Table) => Selection
type ColumnNameOfBound<Column> = Column extends {
  readonly [BoundColumnTypeId]: {
    readonly columnName: infer ColumnName extends string
  }
} ? ColumnName : never
type BoundColumnTupleNames<Columns extends readonly AnyBoundColumn[]> =
  Columns extends readonly [infer Head extends AnyBoundColumn, ...infer Tail extends AnyBoundColumn[]]
    ? readonly [ColumnNameOfBound<Head>, ...BoundColumnTupleNames<Tail>]
    : readonly []
type ColumnSelectionNames<Selection> =
  Selection extends AnyBoundColumn
    ? readonly [ColumnNameOfBound<Selection>]
    : Selection extends readonly [infer Head extends AnyBoundColumn, ...infer Tail extends AnyBoundColumn[]]
      ? readonly [ColumnNameOfBound<Head>, ...BoundColumnTupleNames<Tail>]
      : never
export type TableColumnSelection<Table extends SchemaTableDefinition> =
  TableColumn<Table> | readonly [TableColumn<Table>, ...TableColumn<Table>[]]
export type TableColumn<Table extends SchemaTableDefinition> =
  SchemaTableDefinition extends Table ? AnyBoundColumn : Table extends TableDefinition<infer Name, infer Fields, any, "schema", any>
    ? BoundColumns<Name, Fields>[Extract<keyof Fields, string>]
    : never
export type AnyColumnSelection = AnyBoundColumn | readonly [AnyBoundColumn, ...AnyBoundColumn[]]
export type SelectedColumns<Selection extends AnyColumnSelection> = ColumnSelectionNames<Selection>
type MatchingSelectionArityInput<
  Left extends AnyColumnSelection,
  Right extends AnyColumnSelection
> = SelectedColumns<Left>["length"] extends SelectedColumns<Right>["length"]
  ? SelectedColumns<Right>["length"] extends SelectedColumns<Left>["length"]
    ? unknown
    : never
  : never
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
  Spec extends TableOptionSpec = TableOptionSpec,
  TableContext extends SchemaTableDefinition = SchemaTableDefinition
> {
  readonly option: Spec
}

type ClassTableOption<Fields extends TableFieldMap> = TableOption<
  ClassOptionSpec<Fields>,
  TableDefinition<string, Fields, keyof Fields & string, "schema", any>
>
type ClassDeclaredTableOptions<Fields extends TableFieldMap> = readonly ClassTableOption<Fields>[]
type TableNameOf<Table extends TableDefinition<any, any, any, "schema", any>> =
  Table extends TableDefinition<infer Name, any, any, "schema", any> ? Name : never
type TableFieldsOf<Table extends TableDefinition<any, any, any, "schema", any>> =
  Table extends TableDefinition<any, infer Fields, any, "schema", any> ? Fields : never
type TablePrimaryKeyOf<Table extends TableDefinition<any, any, any, "schema", any>> =
  Table extends TableDefinition<any, any, infer PrimaryKeyColumns, "schema", any> ? PrimaryKeyColumns : never
type TableSchemaNameOf<Table extends TableDefinition<any, any, any, "schema", any>> =
  Table extends TableDefinition<any, any, any, "schema", infer SchemaName> ? SchemaName : never
type HasBroadColumns<Columns extends readonly string[]> = string extends Columns[number] ? true : false

export type ConflictArbiterScope = "unconditional" | "partial"
export type ConflictArbiter<
  Columns extends ColumnList = ColumnList,
  Scope extends ConflictArbiterScope = ConflictArbiterScope,
  Name extends string | undefined = string | undefined,
  Constraint extends boolean = boolean
> = {
  readonly columns: Columns
  readonly scope: Scope
  readonly name?: Name
  readonly constraint: Constraint
}

type InlineConflictArbiters<Fields extends TableFieldMap> = Extract<{
  [K in keyof Fields]: Fields[K] extends AnyColumnDefinition
    ? Fields[K]["metadata"]["primaryKey"] extends true
      ? ConflictArbiter<readonly [Extract<K, string>], "unconditional", undefined, true>
      : Fields[K]["metadata"]["unique"] extends true
        ? ConflictArbiter<
          readonly [Extract<K, string>],
          "unconditional",
          Fields[K]["metadata"]["uniqueConstraint"] extends { readonly name?: infer Name extends string } ? Name : undefined,
          true
        >
        : never
    : never
}[keyof Fields], ConflictArbiter>

type TableConflictArbitersOf<Table extends TableDefinition<any, any, any, any, any, any>> =
  Table extends TableDefinition<any, any, any, any, any, infer ConflictArbiters> ? ConflictArbiters : never

type NormalizeArbiterColumns<Columns> =
  Columns extends readonly [infer Head extends string, ...infer Tail extends string[]]
    ? readonly [Head, ...Tail]
    : Columns extends string
      ? readonly [Columns]
      : never

type OptionColumns<Spec extends TableOptionSpec> =
  Spec extends { readonly columns?: infer Columns } ? NormalizeArbiterColumns<Columns> : never

type OptionName<Spec extends TableOptionSpec> =
  Spec extends { readonly name: infer Name extends string } ? Name : undefined

type ConflictArbiterFromOption<Spec extends TableOptionSpec> =
  OptionColumns<Spec> extends infer Columns extends ColumnList
    ? HasBroadColumns<Columns> extends true
      ? never
      : Spec extends { readonly kind: "primaryKey" | "unique" }
        ? ConflictArbiter<Columns, "unconditional", OptionName<Spec>, true>
        : Spec extends { readonly kind: "index"; readonly unique: true }
          ? ConflictArbiter<Columns, Spec extends { readonly predicate: DdlExpressionLike } ? "partial" : "unconditional", OptionName<Spec>, false>
          : never
    : never

type BuildPrimaryKey<
  Table extends TableDefinition<any, any, any, "schema", any, any>,
  Spec extends TableOptionSpec
> = Spec extends { readonly kind: "primaryKey"; readonly columns: infer Columns extends readonly string[] }
  ? HasBroadColumns<Columns> extends true
    ? TablePrimaryKeyOf<Table>
    : Columns[number] & keyof TableFieldsOf<Table> & string
  : TablePrimaryKeyOf<Table>

type OptionInputConstraint<
  Table extends TableDefinition<any, any, any, "schema", any, any>,
  Spec extends TableOptionSpec
> = Spec extends { readonly kind: "primaryKey"; readonly columns: infer Columns extends readonly string[] }
  ? HasBroadColumns<Columns> extends true ? unknown : ValidatePrimaryKeyColumns<Table[typeof TypeId]["fields"], Columns> extends never ? never : unknown
  : Spec extends { readonly kind: "index" }
    ? Spec extends { readonly columns: infer Columns extends readonly string[] }
      ? HasBroadColumns<Columns> extends true ? unknown : ValidateIndexOptionColumns<Table[typeof TypeId]["fields"], Spec> extends never ? never : unknown
      : ValidateIndexOptionColumns<Table[typeof TypeId]["fields"], Spec> extends never ? never : unknown
    : Spec extends { readonly kind: "foreignKey" }
      ? Spec extends { readonly columns: infer Columns extends readonly string[] }
        ? HasBroadColumns<Columns> extends true ? unknown : ValidateForeignKeyOptionColumns<Table[typeof TypeId]["fields"], Spec> extends never ? never : unknown
        : ValidateForeignKeyOptionColumns<Table[typeof TypeId]["fields"], Spec> extends never ? never : unknown
      : Spec extends { readonly columns: infer Columns extends readonly string[] }
        ? HasBroadColumns<Columns> extends true ? unknown : ValidateKnownColumns<Table[typeof TypeId]["fields"], Columns> extends never ? never : unknown
        : unknown

type OptionInputTable<
  Table extends TableDefinition<any, any, any, "schema", any, any>,
  Spec extends TableOptionSpec
> = Table & OptionInputConstraint<Table, Spec>

type OptionValidationArgs<
  Table extends TableDefinition<any, any, any, "schema", any, any>,
  Spec extends TableOptionSpec
> = OptionInputConstraint<Table, Spec> extends never ? [never] : []

type ApplyOption<
  Table extends TableDefinition<any, any, any, "schema", any, any>,
  Spec extends TableOptionSpec
> = Spec extends { readonly kind: "primaryKey" }
  ? TableDefinition<
    TableNameOf<Table>,
    TableFieldsOf<Table>,
    BuildPrimaryKey<Table, Spec>,
    "schema",
    TableSchemaNameOf<Table>,
    TableConflictArbitersOf<Table> | ConflictArbiterFromOption<Spec>
  >
  : TableDefinition<
    TableNameOf<Table>,
    TableFieldsOf<Table>,
    TablePrimaryKeyOf<Table>,
    "schema",
    TableSchemaNameOf<Table>,
    TableConflictArbitersOf<Table> | ConflictArbiterFromOption<Spec>
  >

type ApplyTableOption<
  Table extends TableDefinition<any, any, any, "schema", any, any>,
  Spec extends TableOptionSpec
> = ApplyOption<Table, Spec>

type TableOptionPipe<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string,
  Kind extends TableKind,
  SchemaName extends string | undefined,
  ConflictArbiters extends ConflictArbiter
> = Kind extends "schema"
  ? {
      pipe<Spec extends TableOptionSpec>(
        option: TableOption<Spec, TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName, ConflictArbiters>>,
        ...validation: OptionValidationArgs<TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName, ConflictArbiters>, Spec>
      ): ApplyTableOption<TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName, ConflictArbiters>, Spec>
    }
  : {}

export type ValidateDeclaredOptions<
  Table extends TableDefinition<any, any, any, "schema", any, any>,
  Options extends DeclaredTableOptions
> = {
  readonly [K in keyof Options]: Options[K] extends TableOptionBuilderLike<infer Spec>
    ? OptionInputTable<Table, Spec> extends never ? never : Options[K]
    : never
}

export type ApplyDeclaredOptions<
  Table extends TableDefinition<any, any, any, "schema", any, any>,
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

type AnyTableSchemas = {
  readonly select: Schema.Schema<any>
  readonly insert: Schema.Schema<any>
  readonly update: Schema.Schema<any>
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
  SchemaName extends string | undefined = DefaultSchemaName,
  ConflictArbiters extends ConflictArbiter = InlineConflictArbiters<Fields>
> {
  readonly name: Name
  readonly baseName: string
  readonly schemaName: SchemaName
  readonly fields: Fields
  readonly primaryKey: readonly PrimaryKeyColumns[]
  readonly conflictArbiters: readonly ConflictArbiters[]
  readonly kind: Kind
  readonly casing?: Casing.Options
}

export type DeclaredTableOptions = readonly TableOptionBuilderLike[]
export type { DdlExpressionLike, IndexKeySpec, LiteralStringInput, MatchingColumnArityInput, NonEmptyColumnInput, NonEmptyStringInput, NormalizeColumns, ReferentialAction } from "./table-options.js"
export type { NonEmptyFieldMap }
export type NonEmptySchemaNameInput<Value extends string | undefined> =
  Value extends string ? NonEmptyStringInput<Value> : Value

export type TableDefinition<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>,
  Kind extends TableKind = "schema",
  SchemaName extends string | undefined = DefaultSchemaName,
  ConflictArbiters extends ConflictArbiter = InlineConflictArbiters<Fields>
> = Pipeable & TableOptionPipe<Name, Fields, PrimaryKeyColumns, Kind, SchemaName, ConflictArbiters> & {
  readonly name: Name
  readonly columns: BoundColumns<Name, Fields>
  readonly schemas: TableSchemas<Name, Fields, PrimaryKeyColumns> & AnyTableSchemas
  readonly [TypeId]: TableState<Name, Fields, PrimaryKeyColumns, Kind, SchemaName, ConflictArbiters>
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
  SchemaName extends string | undefined = DefaultSchemaName,
  ConflictArbiters extends ConflictArbiter = InlineConflictArbiters<Fields>
> = (abstract new (...args: any[]) => any) & Pipeable & {
  readonly columns: BoundColumns<Name, Fields>
  readonly schemas: TableSchemas<Name, Fields, PrimaryKeyColumns>
  readonly [TypeId]: TableState<Name, Fields, PrimaryKeyColumns, "schema", SchemaName, ConflictArbiters>
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
  readonly [TypeId]: TableState<string, TableFieldMap, string, TableKind, string | undefined, ConflictArbiter>
  readonly [OptionsSymbol]: readonly TableOptionSpec[]
} & Plan.RowSet<any, any, Record<string, Plan.AnySource>, Dialect>

type CheckPredicateTable = any
type CheckPredicate = (table: CheckPredicateTable) => DdlExpressionLike

/** Public table-option builder type used by `Table.index`, `Table.primaryKey`, and friends. */
export type TableOption<
  Spec extends TableOptionSpec = TableOptionSpec,
  TableContext extends SchemaTableDefinition = SchemaTableDefinition
> = Pipeable & {
  readonly pipe: Pipeable["pipe"]
  readonly option: Spec
  readonly [ResolveOptionSymbol]?: (table: TableDefinition<any, any, any, "schema", any>) => Spec
} & (Spec extends { readonly kind: "primaryKey" }
  ? {
  <Table extends TableContext>(
    table: Table,
    ...validation: OptionValidationArgs<Table, Spec>
  ): ApplyOption<Table, Spec>
  }
  : {
    <Table extends TableContext>(
      table: Table,
      ...validation: OptionValidationArgs<Table, Spec>
    ): ApplyOption<Table, Spec>
  })

const TableProto = {
  pipe(this: Pipeable) {
    return pipeArguments(this, arguments)
  }
}

const attachPipe = <Value extends object>(value: Value): Value => {
  Object.defineProperty(value, "pipe", {
    configurable: true,
    writable: true,
    value: function(this: Value) {
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
  readonly conflictArbiters: readonly ConflictArbiter[]
}

const conflictArbitersFromOptions = (
  options: readonly TableOptionSpec[]
): readonly ConflictArbiter[] =>
  options.flatMap((option): readonly ConflictArbiter[] => {
    if (typeof option !== "object" || option === null) {
      return []
    }
    if (!("columns" in option) || !Array.isArray(option.columns) || option.columns.length === 0) {
      return []
    }
    switch (option.kind) {
      case "primaryKey":
      case "unique":
        return [{
          columns: option.columns as ColumnList,
          scope: "unconditional",
          name: option.name,
          constraint: true
        }]
      case "index":
        return option.unique === true
          ? [{
            columns: option.columns as ColumnList,
            scope: option.predicate === undefined ? "unconditional" : "partial",
            name: option.name,
            constraint: false
          }]
          : []
      default:
        return []
    }
  })

const buildArtifacts = <
  Name extends string,
  Fields extends TableFieldMap,
  SchemaName extends string | undefined
>(
  name: Name,
  fields: Fields,
  declaredOptions: readonly TableOptionSpec[],
  schemaName: SchemaName,
  casing?: Casing.Options
): BuildArtifacts<Name, Fields, keyof Fields & string> => {
  const normalizedOptions = [...collectInlineOptions(fields), ...declaredOptions]
  validateFieldDialects(name, fields)
  validateOptions(name, fields, declaredOptions)
  const primaryKey = resolvePrimaryKeyColumns(fields, declaredOptions) as readonly (keyof Fields & string)[]
  const conflictArbiters = conflictArbitersFromOptions(normalizedOptions)
  const columns = Object.fromEntries(
    Object.entries(fields).map(([key, column]) => [key, bindColumn(name, key, column, name, schemaName, casing)])
  ) as BoundColumns<Name, Fields>
  return {
    columns,
    normalizedOptions,
    primaryKey,
    conflictArbiters
  }
}

const getSchemaCache = <
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string
>(
  table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, any> | TableClassStatic<Name, Fields, PrimaryKeyColumns, any>
): TableSchemaCache<Name, Fields, PrimaryKeyColumns> => {
  const target = table as {
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
  SchemaName extends string | undefined = DefaultSchemaName,
  ConflictArbiters extends ConflictArbiter = InlineConflictArbiters<Fields>
>(
  name: Name,
  fields: Fields,
  declaredOptions: readonly TableOptionSpec[],
  baseName: string = name,
  kind: Kind = "schema" as Kind,
  schemaName?: SchemaName,
  schemaMode: "default" | "explicit" = "default",
  casing?: Casing.Options
): TableDefinition<Name, Fields, PrimaryKeyColumns, Kind, SchemaName, ConflictArbiters> => {
  const resolvedSchemaName = schemaMode === "explicit"
    ? schemaName
    : ("public" as SchemaName)
  const artifacts = buildArtifacts(name, fields, declaredOptions, resolvedSchemaName, casing)
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
    conflictArbiters: artifacts.conflictArbiters as readonly ConflictArbiters[],
    kind,
    casing
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

const resolveFieldDialect = (fields: TableFieldMap): string => {
  const dialects = [...new Set(Object.values(fields).map((field) => field.metadata.dbType.dialect))]
  if (dialects.length === 0) {
    throw new Error("Cannot infer table dialect from an empty field set")
  }
  const concreteDialects = dialects.filter((dialect) => dialect !== "standard")
  const uniqueConcreteDialects = [...new Set(concreteDialects)]
  if (uniqueConcreteDialects.length > 1) {
    throw new Error(`Mixed table dialects are not supported: ${dialects.join(", ")}`)
  }
  return uniqueConcreteDialects[0] ?? "standard"
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
  const table = applyDeclaredOptions(
    makeTable(
      state.name,
      state.fields,
      [],
      state.name,
      "schema",
      state.schemaName,
      state.schemaName === undefined || state.schemaName === "public" ? "default" : "explicit",
      state.casing
    ) as TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", typeof state.schemaName>,
    classOptions
  )
  const artifacts = {
    columns: table.columns,
    normalizedOptions: table[OptionsSymbol],
    primaryKey: table[TypeId].primaryKey as readonly PrimaryKeyColumns[],
    conflictArbiters: table[TypeId].conflictArbiters
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
  return makeTable(
    state.name,
    state.fields,
    [...table[DeclaredOptionsSymbol], option],
    state.baseName,
    state.kind,
    state.schemaName,
    "explicit",
    state.casing
  ) as unknown as ApplyOption<Table, Spec>
}

const makeOption = <
  Spec extends TableOptionSpec,
  TableContext extends SchemaTableDefinition = SchemaTableDefinition
>(option: Spec): TableOption<Spec, TableContext> => {
  return attachPipe(Object.assign(
    <Table extends TableDefinition<any, any, any, "schema", any>>(
      table: Table,
      ..._validation: OptionValidationArgs<Table, Spec>
    ): ApplyTableOption<Table, Spec> =>
      appendOption(table, option) as unknown as ApplyTableOption<Table, Spec>,
    { option }
  )) as unknown as TableOption<Spec, TableContext>
}

const makeResolvedOption = <
  Spec extends TableOptionSpec,
  TableContext extends SchemaTableDefinition = SchemaTableDefinition
>(
  option: Spec,
  resolve: (table: TableDefinition<any, any, any, "schema", any>) => Spec
): TableOption<Spec, TableContext> => {
  return attachPipe(Object.assign(
    <Table extends TableDefinition<any, any, any, "schema", any>>(
      table: Table,
      ..._validation: OptionValidationArgs<Table, Spec>
    ): ApplyTableOption<Table, Spec> =>
      appendOption(
        table,
        resolve(table)
      ) as unknown as ApplyTableOption<Table, Spec>,
    {
      option,
      [ResolveOptionSymbol]: resolve
    }
  )) as unknown as TableOption<Spec, TableContext>
}

export const option = <Spec extends TableOptionSpec>(spec: Spec): TableOption<Spec> =>
  makeOption(spec)

export const optionFromTable = <
  Spec extends TableOptionSpec,
  TableContext extends SchemaTableDefinition = SchemaTableDefinition
>(
  spec: Spec,
  resolve: (table: TableDefinition<any, any, any, "schema", any>) => Spec
): TableOption<Spec, TableContext> =>
  makeResolvedOption(spec, resolve)

export const resolveOption = <
  Spec extends TableOptionSpec,
  TableContext extends SchemaTableDefinition
>(
  option: TableOption<Spec, TableContext>,
  table: TableContext
): Spec => {
  const resolve = option[ResolveOptionSymbol]
  return resolve === undefined ? option.option : resolve(table)
}

export const mapOption = <
  Spec extends TableOptionSpec,
  Next extends TableOptionSpec,
  TableContext extends SchemaTableDefinition
>(
  option: TableOption<Spec, TableContext>,
  map: (spec: Spec) => Next
): TableOption<Next, TableContext> => {
  const resolve = option[ResolveOptionSymbol]
  return resolve === undefined
    ? makeOption<Next, TableContext>(map(option.option))
    : makeResolvedOption<Next, TableContext>(
        map(option.option),
        (table) => map(resolve(table))
      )
}

/** Creates a table definition from a name and field map. */
export function make<
  Name extends string,
  Fields extends TableFieldMap
>(
  name: NonEmptyStringInput<Name>,
  fields: Fields & NonEmptyFieldMap<Fields>
): TableDefinition<Name, Fields, InlinePrimaryKeyKeys<Fields>, "schema", DefaultSchemaName>
export function make<
  Name extends string,
  Fields extends TableFieldMap,
  const SchemaName extends string
>(
  name: NonEmptyStringInput<Name>,
  fields: Fields & NonEmptyFieldMap<Fields>,
  schemaName: NonEmptySchemaNameInput<SchemaName>
): TableDefinition<Name, Fields, InlinePrimaryKeyKeys<Fields>, "schema", SchemaName>
export function make(
  name: string,
  fields: TableFieldMap,
  schemaName?: string
): any {
  const resolvedSchemaName = arguments.length >= 3
    ? schemaName
    : "public"
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

export const withCasing = <
  Table extends TableDefinition<any, any, any, any, any>
>(
  table: Table,
  casing: Casing.Options
): Table => {
  const state = table[TypeId]
  return makeTable(
    state.name,
    state.fields,
    table[DeclaredOptionsSymbol],
    state.baseName,
    state.kind,
    state.schemaName,
    "explicit",
    Casing.merge(state.casing, casing)
  ) as Table
}

export const withSchema = <
  Table extends TableDefinition<any, any, any, any, any>,
  SchemaName extends string
>(
  table: Table,
  schemaName: SchemaName,
  schemaCasing?: Casing.Options
): TableDefinition<
  Table[typeof TypeId]["name"],
  Table[typeof TypeId]["fields"],
  Table[typeof TypeId]["primaryKey"][number],
  Table[typeof TypeId]["kind"],
  SchemaName,
  Table[typeof TypeId]["conflictArbiters"][number]
> => {
  const state = table[TypeId]
  return makeTable(
    state.name,
    state.fields,
    table[DeclaredOptionsSymbol],
    state.baseName,
    state.kind,
    schemaName,
    "explicit",
    Casing.merge(schemaCasing, state.casing)
  ) as TableDefinition<
    Table[typeof TypeId]["name"],
    Table[typeof TypeId]["fields"],
    Table[typeof TypeId]["primaryKey"][number],
    Table[typeof TypeId]["kind"],
    SchemaName,
    Table[typeof TypeId]["conflictArbiters"][number]
  >
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
  ConflictArbiters extends ConflictArbiter,
  AliasName extends string
>(
  table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, SchemaName, ConflictArbiters> | TableClassStatic<Name, Fields, PrimaryKeyColumns, SchemaName, ConflictArbiters>,
  aliasName: LiteralStringInput<AliasName>
): TableDefinition<
  AliasName,
  Fields,
  PrimaryKeyColumns,
  "alias",
  SchemaName,
  ConflictArbiters
> => {
  const state = table[TypeId]
  const columns = Object.fromEntries(
    Object.entries(state.fields).map(([key, column]) => [key, bindColumn(aliasName as AliasName, key, column as AnyColumnDefinition, state.baseName, state.schemaName, state.casing)])
  ) as BoundColumns<AliasName, Fields>
  const aliased = attachPipe(Object.create(TableProto))
  aliased.name = aliasName as AliasName
  aliased.columns = columns
  defineSchemasGetter(aliased)
  aliased[TypeId] = {
    name: aliasName as AliasName,
    baseName: state.baseName,
    schemaName: state.schemaName,
    fields: state.fields,
    primaryKey: state.primaryKey,
    conflictArbiters: state.conflictArbiters,
    kind: "alias",
    casing: state.casing
  }
  aliased[Plan.TypeId] = {
    selection: columns,
    required: undefined as never,
    available: {
      [aliasName]: {
        name: aliasName as AliasName,
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
export function Class<Self = never>(
  name: "",
  schemaName?: string | undefined
): never
export function Class<Self = never>(
  name: string,
  schemaName: ""
): never
export function Class<
  Self = never,
  const SchemaName extends string | undefined = DefaultSchemaName,
  const Name extends string = string
>(
  name: NonEmptyStringInput<Name>,
  schemaName?: NonEmptySchemaNameInput<SchemaName>
): <Fields extends TableFieldMap>(fields: Fields & NonEmptyFieldMap<Fields>) => [Self] extends [never]
  ? MissingSelfGeneric
  : TableClassStatic<Name, Fields, InlinePrimaryKeyKeys<Fields>, SchemaName>
export function Class<
  Self = never,
  SchemaName extends string | undefined = DefaultSchemaName,
  Name extends string = string
>(
  name: string,
  schemaName?: SchemaName
): any {
  const resolvedSchemaName = arguments.length >= 2
    ? schemaName
    : ("public" as SchemaName)
  return <Fields extends TableFieldMap>(fields: Fields & NonEmptyFieldMap<Fields>): [Self] extends [never]
    ? MissingSelfGeneric
    : TableClassStatic<Name, Fields, InlinePrimaryKeyKeys<Fields>, SchemaName> => {
      abstract class TableClassBase {
        static readonly tableName = name

        static get columns() {
          return ensureClassArtifacts(this as any).columns
        }

        static get schemas() {
          return schemasFor(this as any)
        }

        static get [TypeId]() {
          const declaredOptions = extractDeclaredOptions((this as unknown as TableClassStatic<Name, Fields>)[options])
          const normalizedOptions = [...collectInlineOptions(fields), ...declaredOptions]
          return {
            name,
            baseName: name,
            schemaName: resolvedSchemaName,
            fields,
            primaryKey: resolvePrimaryKeyColumns(fields, collectInlineOptions(fields)),
            conflictArbiters: conflictArbitersFromOptions(normalizedOptions),
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

        static pipe(this: Pipeable) {
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

const selectionArray = (selection: AnyColumnSelection): readonly AnyBoundColumn[] =>
  (Array.isArray(selection) ? selection : [selection]) as readonly AnyBoundColumn[]

export const selectedColumnList = <Selection extends AnyColumnSelection>(
  selection: Selection
): SelectedColumns<Selection> =>
  selectionArray(selection).map((column) => column[BoundColumnTypeId].columnName) as unknown as SelectedColumns<Selection>

const referenceFromSelection = <Selection extends AnyColumnSelection>(selection: Selection) => {
  const columns = selectionArray(selection)
  const first = columns[0]!
  const bound = first[BoundColumnTypeId]
  return {
    tableName: bound.baseTableName,
    schemaName: bound.schemaName,
    casing: bound.casing,
    columns: columns.map((column) => column[BoundColumnTypeId].columnName) as unknown as SelectedColumns<Selection>
  }
}

/** Declares a table-level primary key. */
export function primaryKey<
  Table extends SchemaTableDefinition,
  Selection extends TableColumnSelection<Table> = TableColumnSelection<Table>
>(
  columns: ConcreteSelector<Table, Selection>
): TableOption<{
  readonly kind: "primaryKey"
  readonly columns: SelectedColumns<Selection>
}, Table>
export function primaryKey<
  Selection extends AnyColumnSelection
>(
  columns: (table: LooseTableSelection) => Selection
): TableOption<{
  readonly kind: "primaryKey"
  readonly columns: SelectedColumns<Selection>
}>
export function primaryKey(
  columns: (table: any) => AnyColumnSelection
): TableOption<{
  readonly kind: "primaryKey"
  readonly columns: readonly [string, ...string[]]
}> {
  return makeResolvedOption({
    kind: "primaryKey",
    columns: [] as unknown as readonly [string, ...string[]]
  }, (table) => ({
    kind: "primaryKey",
    columns: selectedColumnList(columns(table))
  }))
}

/** Declares a table-level unique constraint. */
export function unique<
  Table extends SchemaTableDefinition,
  Selection extends TableColumnSelection<Table> = TableColumnSelection<Table>
>(
  columns: ConcreteSelector<Table, Selection>
): TableOption<{
  readonly kind: "unique"
  readonly columns: SelectedColumns<Selection>
}, Table>
export function unique<
  Selection extends AnyColumnSelection
>(
  columns: (table: LooseTableSelection) => Selection
): TableOption<{
  readonly kind: "unique"
  readonly columns: SelectedColumns<Selection>
}>
export function unique(
  columns: (table: any) => AnyColumnSelection
): TableOption<{
  readonly kind: "unique"
  readonly columns: readonly [string, ...string[]]
}> {
  return makeResolvedOption({
    kind: "unique",
    columns: [] as unknown as readonly [string, ...string[]]
  }, (table) => ({
    kind: "unique",
    columns: selectedColumnList(columns(table))
  }))
}

/** Declares a table-level index. */
export function index<
  Table extends SchemaTableDefinition,
  Selection extends TableColumnSelection<Table> = TableColumnSelection<Table>
>(
  columns: ConcreteSelector<Table, Selection>
): TableOption<{
  readonly kind: "index"
  readonly columns: SelectedColumns<Selection>
}, Table>
export function index<
  Selection extends AnyColumnSelection
>(
  columns: (table: LooseTableSelection) => Selection
): TableOption<{
  readonly kind: "index"
  readonly columns: SelectedColumns<Selection>
}>
export function index(
  columns: (table: any) => AnyColumnSelection
): TableOption<{
  readonly kind: "index"
  readonly columns: readonly [string, ...string[]]
}> {
  return makeResolvedOption({
    kind: "index",
    columns: [] as unknown as readonly [string, ...string[]]
  }, (table) => ({
    kind: "index",
    columns: selectedColumnList(columns(table))
  }))
}

/** Declares a table-level foreign key. */
export function foreignKey<
  Table extends SchemaTableDefinition,
  LocalSelection extends TableColumnSelection<Table> = TableColumnSelection<Table>,
  TargetSelection extends AnyColumnSelection = AnyColumnSelection
>(
  columns: ConcreteSelector<Table, LocalSelection>,
  target: () => TargetSelection & MatchingSelectionArityInput<LocalSelection, TargetSelection>
): TableOption<{
  readonly kind: "foreignKey"
  readonly columns: SelectedColumns<LocalSelection>
  readonly references: () => {
    readonly tableName: string
    readonly schemaName?: string
    readonly casing?: Casing.Options
    readonly columns: SelectedColumns<TargetSelection>
  }
}, Table>
export function foreignKey<
  LocalSelection extends AnyColumnSelection,
  TargetSelection extends AnyColumnSelection
>(
  columns: (table: LooseTableSelection) => LocalSelection,
  target: () => TargetSelection
): TableOption<{
  readonly kind: "foreignKey"
  readonly columns: SelectedColumns<LocalSelection>
  readonly references: () => {
    readonly tableName: string
    readonly schemaName?: string
    readonly casing?: Casing.Options
    readonly columns: SelectedColumns<TargetSelection>
  }
}>
export function foreignKey(
  columns: (table: any) => AnyColumnSelection,
  target: () => AnyColumnSelection
): TableOption<{
  readonly kind: "foreignKey"
  readonly columns: readonly [string, ...string[]]
  readonly references: () => {
    readonly tableName: string
    readonly schemaName?: string
    readonly casing?: Casing.Options
    readonly columns: readonly [string, ...string[]]
  }
}> {
  return makeResolvedOption({
    kind: "foreignKey",
    columns: [] as unknown as readonly [string, ...string[]],
    references: () => referenceFromSelection(target())
  }, (table) => ({
    kind: "foreignKey",
    columns: selectedColumnList(columns(table)),
    references: () => referenceFromSelection(target())
  }))
}

/** Declares a check constraint expression. */
export function check<const Name extends string>(
  name: NonEmptyStringInput<Name>,
  predicate: DdlExpressionLike
): TableOption<{
  readonly kind: "check"
  readonly name: Name
  readonly predicate: DdlExpressionLike
}>
export function check<const Name extends string>(
  name: NonEmptyStringInput<Name>,
  predicate: CheckPredicate
): TableOption<{
  readonly kind: "check"
  readonly name: Name
  readonly predicate: DdlExpressionLike
}>
export function check(
  name: string,
  predicate: DdlExpressionLike | CheckPredicate
): TableOption<{
  readonly kind: "check"
  readonly name: string
  readonly predicate: DdlExpressionLike
}> {
  const spec = {
    kind: "check",
    name,
    predicate: predicate as DdlExpressionLike
  } as const
  return typeof predicate === "function"
    ? makeResolvedOption(spec, (table) => ({
        ...spec,
        predicate: predicate(table as CheckPredicateTable)
      }))
    : makeOption(spec)
}

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
