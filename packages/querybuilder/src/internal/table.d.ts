import { type Pipeable } from "effect/Pipeable";
import * as Schema from "effect/Schema";
import * as Plan from "./row-set.js";
import type { TrueFormula } from "./predicate/formula.js";
import type { BoundColumnFrom } from "./column-state.js";
import { type DdlExpressionLike, type NonEmptyStringInput, type NormalizeColumns, type TableOptionSpec, type ValidateKnownColumns, type ValidatePrimaryKeyColumns } from "./table-options.js";
import { type InsertRow, type SelectRow, type TableFieldMap, type UpdateRow } from "./schema-derivation.js";
/** Symbol used to attach table-definition metadata. */
export declare const TypeId: unique symbol;
/** Symbol for the normalized table option list. */
export declare const OptionsSymbol: unique symbol;
/** Symbol used by `Table.Class` to declare table-level options. */
export declare const options: unique symbol;
declare const DeclaredOptionsSymbol: unique symbol;
type InlinePrimaryKeyKeys<Fields extends TableFieldMap> = Extract<{
    [K in keyof Fields]: Fields[K]["metadata"]["primaryKey"] extends true ? K : never;
}[keyof Fields], string>;
type TableDialect<Fields extends TableFieldMap> = Fields[keyof Fields][typeof import("./column-state.js").ColumnTypeId]["dbType"]["dialect"];
type TableKind = "schema" | "alias";
type DefaultSchemaName = "public";
type ClassOptionSpec = Exclude<TableOptionSpec, {
    readonly kind: "primaryKey";
}>;
interface TableOptionBuilderLike<Spec extends TableOptionSpec = TableOptionSpec> {
    (table: TableDefinition<any, any, any, "schema", any>): TableDefinition<any, any, any, "schema", any>;
    readonly option: Spec;
}
type ClassTableOption = TableOptionBuilderLike<ClassOptionSpec>;
type ClassDeclaredTableOptions = readonly ClassTableOption[];
type BuildPrimaryKey<Table extends TableDefinition<any, any, any, "schema", any>, Spec extends TableOptionSpec> = Spec extends {
    readonly kind: "primaryKey";
    readonly columns: infer Columns extends readonly string[];
} ? Columns[number] & keyof Table[typeof TypeId]["fields"] & string : Table[typeof TypeId]["primaryKey"][number];
type OptionInputTable<Table extends TableDefinition<any, any, any, "schema", any>, Spec extends TableOptionSpec> = Spec extends {
    readonly kind: "primaryKey";
    readonly columns: infer Columns extends readonly string[];
} ? ValidatePrimaryKeyColumns<Table[typeof TypeId]["fields"], Columns> extends never ? never : Table : Spec extends {
    readonly columns: infer Columns extends readonly string[];
} ? ValidateKnownColumns<Table[typeof TypeId]["fields"], Columns> extends never ? never : Table : Table;
type ApplyOption<Table extends TableDefinition<any, any, any, "schema", any>, Spec extends TableOptionSpec> = Spec extends {
    readonly kind: "primaryKey";
} ? TableDefinition<Table[typeof TypeId]["name"], Table[typeof TypeId]["fields"], BuildPrimaryKey<Table, Spec>, "schema"> : TableDefinition<Table[typeof TypeId]["name"], Table[typeof TypeId]["fields"], Table[typeof TypeId]["primaryKey"][number], "schema">;
export type MissingSelfGeneric = "Missing `Self` generic - use `class Self extends Table.Class<Self>(...) {}`";
/** Bound columns keyed by field name for a particular table. */
export type BoundColumns<Name extends string, Fields extends TableFieldMap> = {
    readonly [K in keyof Fields]: BoundColumnFrom<Fields[K], Name, Extract<K, string>>;
};
/** Derived runtime schemas exposed by a table definition. */
export interface TableSchemas<Name extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string> {
    readonly select: Schema.Schema<SelectRow<Name, Fields>>;
    readonly insert: Schema.Schema<InsertRow<Name, Fields>>;
    readonly update: Schema.Schema<UpdateRow<Name, Fields, PrimaryKeyColumns>>;
}
interface TableState<Name extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string, Kind extends TableKind = "schema", SchemaName extends string | undefined = DefaultSchemaName> {
    readonly name: Name;
    readonly baseName: string;
    readonly schemaName: SchemaName;
    readonly fields: Fields;
    readonly primaryKey: readonly PrimaryKeyColumns[];
    readonly kind: Kind;
}
/** Namespace-scoped table builder. */
export interface TableSchemaNamespace<SchemaName extends string> {
    readonly schemaName: SchemaName;
    readonly table: <Name extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>>(name: Name, fields: Fields, ...options: DeclaredTableOptions) => TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>;
}
export type DeclaredTableOptions = readonly TableOptionBuilderLike[];
export type { DdlExpressionLike, IndexKeySpec, NormalizeColumns, ReferentialAction } from "./table-options.js";
export type NonEmptySchemaNameInput<Value extends string | undefined> = Value extends string ? NonEmptyStringInput<Value> : Value;
export type TableDefinition<Name extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>, Kind extends TableKind = "schema", SchemaName extends string | undefined = DefaultSchemaName> = Pipeable & {
    readonly name: Name;
    readonly columns: BoundColumns<Name, Fields>;
    readonly schemas: TableSchemas<Name, Fields, PrimaryKeyColumns>;
    readonly [TypeId]: TableState<Name, Fields, PrimaryKeyColumns, Kind, SchemaName>;
    readonly [Plan.TypeId]: Plan.State<BoundColumns<Name, Fields>, never, Record<Name, Plan.Source<Name, "required", TrueFormula>>, TableDialect<Fields>>;
    readonly [OptionsSymbol]: readonly TableOptionSpec[];
    readonly [DeclaredOptionsSymbol]: readonly TableOptionSpec[];
} & BoundColumns<Name, Fields> & Plan.RowSet<BoundColumns<Name, Fields>, never, Record<Name, Plan.Source<Name, "required", TrueFormula>>, TableDialect<Fields>>;
/**
 * Static class-based table definition.
 *
 * The class object itself acts as the table definition, exposing static bound
 * columns, derived schemas, and plan metadata.
 */
export type TableClassStatic<Name extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>, SchemaName extends string | undefined = DefaultSchemaName> = (abstract new (...args: any[]) => any) & Pipeable & {
    readonly columns: BoundColumns<Name, Fields>;
    readonly schemas: TableSchemas<Name, Fields, PrimaryKeyColumns>;
    readonly [TypeId]: TableState<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>;
    readonly [Plan.TypeId]: Plan.State<BoundColumns<Name, Fields>, never, Record<Name, Plan.Source<Name, "required", TrueFormula>>, TableDialect<Fields>>;
    readonly [OptionsSymbol]: readonly TableOptionSpec[];
    readonly [DeclaredOptionsSymbol]?: readonly TableOptionSpec[];
    readonly [options]?: ClassDeclaredTableOptions;
    readonly tableName: Name;
} & BoundColumns<Name, Fields> & Plan.RowSet<BoundColumns<Name, Fields>, never, Record<Name, Plan.Source<Name, "required", TrueFormula>>, TableDialect<Fields>>;
/** Minimal structural table-like contract used across helper APIs. */
export type AnyTable<Dialect extends string = string> = {
    readonly [TypeId]: TableState<string, TableFieldMap, string, TableKind, string | undefined>;
    readonly [OptionsSymbol]: readonly TableOptionSpec[];
} & Plan.RowSet<any, any, Record<string, Plan.AnySource>, Dialect>;
/** Public table-option builder type used by `Table.index`, `Table.primaryKey`, and friends. */
export type TableOption<Spec extends TableOptionSpec = TableOptionSpec> = {
    <Name extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string>(table: OptionInputTable<TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", any>, Spec>): ApplyOption<TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", any>, Spec>;
    readonly option: Spec;
};
export declare const option: <Spec extends TableOptionSpec>(spec: Spec) => TableOption<Spec>;
export declare const optionFromTable: <Spec extends TableOptionSpec>(spec: Spec, resolve: (table: TableDefinition<any, any, any, "schema", any>) => Spec) => TableOption<Spec>;
/** Creates a table definition from a name and field map. */
export declare function make<Name extends string, Fields extends TableFieldMap, const SchemaName extends string | undefined = DefaultSchemaName>(name: NonEmptyStringInput<Name>, fields: Fields, schemaName?: NonEmptySchemaNameInput<SchemaName>): TableDefinition<Name, Fields, InlinePrimaryKeyKeys<Fields>, "schema", SchemaName>;
/**
 * Creates a namespace-scoped builder for a concrete SQL schema/database.
 */
export declare const schema: <SchemaName extends string>(schemaName: SchemaName) => TableSchemaNamespace<SchemaName>;
/**
 * Creates an aliased source from an existing table definition.
 *
 * The alias becomes the logical source identity used by the query layer while
 * the original physical table name is retained in bound-column provenance for
 * downstream SQL rendering work.
 */
export declare const alias: <Name extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string, SchemaName extends string, AliasName extends string>(table: TableClassStatic<Name, Fields, PrimaryKeyColumns, SchemaName> | TableDefinition<Name, Fields, PrimaryKeyColumns, any, SchemaName>, aliasName: AliasName) => TableDefinition<AliasName, Fields, PrimaryKeyColumns, "alias", SchemaName>;
/** Returns the lazily derived select schema for a table. */
export declare function selectSchema<Name extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string>(table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, any> | TableClassStatic<Name, Fields, PrimaryKeyColumns, any>): Schema.Schema<SelectRow<Name, Fields>>;
/** Returns the lazily derived insert schema for a table. */
export declare function insertSchema<Name extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string>(table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, any> | TableClassStatic<Name, Fields, PrimaryKeyColumns, any>): Schema.Schema<InsertRow<Name, Fields>>;
/** Returns the lazily derived update schema for a table. */
export declare function updateSchema<Name extends string, Fields extends TableFieldMap, PrimaryKeyColumns extends keyof Fields & string>(table: TableDefinition<Name, Fields, PrimaryKeyColumns, any, any> | TableClassStatic<Name, Fields, PrimaryKeyColumns, any>): Schema.Schema<UpdateRow<Name, Fields, PrimaryKeyColumns>>;
/**
 * Class-based table constructor mirroring `Schema.Class`.
 *
 * The returned base class can be extended and configured with
 * `static readonly [Table.options]`.
 */
export declare function Class<Self = never>(name: "", schemaName?: string | undefined): never;
export declare function Class<Self = never>(name: string, schemaName: ""): never;
export declare function Class<Self = never, const SchemaName extends string | undefined = DefaultSchemaName, const Name extends string = string>(name: NonEmptyStringInput<Name>, schemaName?: NonEmptySchemaNameInput<SchemaName>): <Fields extends TableFieldMap>(fields: Fields) => [Self] extends [never] ? "Missing `Self` generic - use `class Self extends Table.Class<Self>(...) {}`" : TableClassStatic<Name, Fields, Extract<{ [K in keyof Fields]: Fields[K]["metadata"]["primaryKey"] extends true ? K : never; }[keyof Fields], string>, SchemaName>;
/** Declares a table-level primary key. */
export declare const primaryKey: <const Columns extends string | readonly string[]>(columns: Columns) => TableOption<{
    readonly kind: "primaryKey";
    readonly columns: NormalizeColumns<Columns>;
}>;
/** Declares a table-level unique constraint. */
export declare const unique: <const Columns extends string | readonly string[]>(columns: Columns) => TableOption<{
    readonly kind: "unique";
    readonly columns: NormalizeColumns<Columns>;
}>;
/** Declares a table-level index. */
export declare const index: <const Columns extends string | readonly string[]>(columns: Columns) => TableOption<{
    readonly kind: "index";
    readonly columns: NormalizeColumns<Columns>;
}>;
/** Declares a table-level foreign key. */
export declare const foreignKey: <const LocalColumns extends string | readonly string[], TargetTable extends AnyTable, const TargetColumns extends string | readonly string[]>(columns: LocalColumns, target: () => TargetTable, referencedColumns: TargetColumns) => TableOption<{
    readonly kind: "foreignKey";
    readonly columns: NormalizeColumns<LocalColumns>;
    readonly references: () => {
        readonly tableName: string;
        readonly schemaName?: string | undefined;
        readonly columns: NormalizeColumns<TargetColumns>;
        readonly knownColumns: readonly string[];
    };
}>;
/** Declares a check constraint expression. */
export declare const check: <const Name extends string>(name: NonEmptyStringInput<Name>, predicate: DdlExpressionLike) => TableOption<{
    readonly kind: "check";
    readonly name: Name;
    readonly predicate: DdlExpressionLike;
}>;
/** Extracts the row type produced by `selectSchema(table)`. */
export type SelectOf<Table extends AnyTable> = Table[typeof TypeId] extends {
    readonly name: infer Name extends string;
    readonly fields: infer Fields extends TableFieldMap;
} ? SelectRow<Name, Fields> : never;
/** Extracts the payload type produced by `insertSchema(table)`. */
export type InsertOf<Table extends AnyTable> = Table[typeof TypeId] extends {
    readonly name: infer Name extends string;
    readonly fields: infer Fields extends TableFieldMap;
} ? InsertRow<Name, Fields> : never;
/** Extracts the payload type produced by `updateSchema(table)`. */
export type UpdateOf<Table extends AnyTable> = Table[typeof TypeId] extends {
    readonly name: infer Name extends string;
    readonly fields: infer Fields extends TableFieldMap;
    readonly primaryKey: readonly (infer PrimaryKeyColumns)[];
} ? UpdateRow<Name, Fields, Extract<PrimaryKeyColumns, keyof Fields & string>> : never;
