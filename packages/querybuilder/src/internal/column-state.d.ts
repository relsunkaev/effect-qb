import type * as Brand from "effect/Brand";
import { type Pipeable } from "effect/Pipeable";
import * as Schema from "effect/Schema";
import * as Expression from "./scalar.js";
import * as ExpressionAst from "./expression-ast.js";
import type * as SchemaExpression from "./schema-expression.js";
/** Symbol used to attach column-definition metadata. */
export declare const ColumnTypeId: unique symbol;
/** Symbol used to attach bound-column provenance. */
export declare const BoundColumnTypeId: unique symbol;
export type ColumnTypeId = typeof ColumnTypeId;
export type BoundColumnTypeId = typeof BoundColumnTypeId;
export type DdlExpression = Expression.Any | SchemaExpression.Any;
/** Lazy reference to another bound column. */
export interface ColumnReference<Target = unknown> {
    readonly target: () => Target;
    readonly name?: string;
    readonly onUpdate?: "noAction" | "restrict" | "cascade" | "setNull" | "setDefault";
    readonly onDelete?: "noAction" | "restrict" | "cascade" | "setNull" | "setDefault";
    readonly deferrable?: boolean;
    readonly initiallyDeferred?: boolean;
}
/** Inline single-column index metadata. */
export interface ColumnIndexOptions {
    readonly name?: string;
    readonly method?: string;
    readonly include?: readonly string[];
    readonly predicate?: DdlExpression;
    readonly order?: "asc" | "desc";
    readonly nulls?: "first" | "last";
    readonly operatorClass?: string;
    readonly collation?: string;
}
/** Inline single-column unique-constraint metadata. */
export interface ColumnUniqueOptions {
    readonly name?: string;
    readonly nullsNotDistinct?: boolean;
    readonly deferrable?: boolean;
    readonly initiallyDeferred?: boolean;
}
/** Complete static state tracked for a column definition. */
export interface ColumnState<Select, Insert, Update, Db extends Expression.DbType.Any, Nullable extends boolean, HasDefault extends boolean, Generated extends boolean, PrimaryKey extends boolean, Unique extends boolean, Ref, Dependencies extends Expression.BindingId = never> {
    readonly select: Select;
    readonly insert: Insert;
    readonly update: Update;
    readonly dbType: Db;
    readonly nullable: Nullable;
    readonly hasDefault: HasDefault;
    readonly generated: Generated;
    readonly primaryKey: PrimaryKey;
    readonly unique: Unique;
    readonly references: Ref;
    readonly brand?: true;
    readonly index?: ColumnIndexOptions;
    readonly uniqueConstraint?: ColumnUniqueOptions;
    readonly defaultValue?: DdlExpression;
    readonly generatedValue?: DdlExpression;
    readonly ddlType?: string;
    readonly identity?: {
        readonly generation: "always" | "byDefault";
    };
    readonly enum?: {
        readonly name: string;
        readonly schemaName?: string;
        readonly values: readonly [string, ...string[]];
    };
    readonly dependencies?: Dependencies;
}
/** Unbound column definition produced by the `Column` DSL. */
export interface ColumnDefinition<Select, Insert, Update, Db extends Expression.DbType.Any, Nullable extends boolean, HasDefault extends boolean, Generated extends boolean, PrimaryKey extends boolean, Unique extends boolean, Ref, Dependencies extends Expression.BindingId = never> extends Pipeable, Expression.Scalar<Select, Db, Nullable extends true ? "maybe" : "never", Db["dialect"], "scalar", Dependencies> {
    readonly pipe: Pipeable["pipe"];
    readonly [ColumnTypeId]: ColumnState<Select, Insert, Update, Db, Nullable, HasDefault, Generated, PrimaryKey, Unique, Ref, Dependencies>;
    readonly schema: Schema.Schema<NonNullable<Select>>;
    readonly metadata: {
        readonly dbType: Db;
        readonly nullable: Nullable;
        readonly hasDefault: HasDefault;
        readonly generated: Generated;
        readonly primaryKey: PrimaryKey;
        readonly unique: Unique;
        readonly references: Ref;
        readonly brand?: true;
        readonly index?: ColumnIndexOptions;
        readonly uniqueConstraint?: ColumnUniqueOptions;
        readonly defaultValue?: DdlExpression;
        readonly generatedValue?: DdlExpression;
        readonly ddlType?: string;
        readonly identity?: {
            readonly generation: "always" | "byDefault";
        };
        readonly enum?: {
            readonly name: string;
            readonly schemaName?: string;
            readonly values: readonly [string, ...string[]];
        };
    };
}
/** Column definition bound to a concrete table and column name. */
export interface BoundColumn<Select, Insert, Update, Db extends Expression.DbType.Any, Nullable extends boolean, HasDefault extends boolean, Generated extends boolean, PrimaryKey extends boolean, Unique extends boolean, Ref, TableName extends string, ColumnName extends string, BaseTableName extends string = TableName> extends ColumnDefinition<Select, Insert, Update, Db, Nullable, HasDefault, Generated, PrimaryKey, Unique, Ref, TableName> {
    readonly [BoundColumnTypeId]: {
        readonly tableName: TableName;
        readonly columnName: ColumnName;
        readonly baseTableName: BaseTableName;
        readonly schemaName?: string;
    };
    readonly [Expression.TypeId]: Expression.State<Select, Db, Nullable extends true ? "maybe" : "never", Db["dialect"], "scalar", TableName>;
    readonly [ExpressionAst.TypeId]: ExpressionAst.ColumnNode<TableName, ColumnName>;
}
/** Convenience alias for any column definition. */
export type AnyColumnDefinition = ColumnDefinition<any, any, any, Expression.DbType.Any, boolean, boolean, boolean, boolean, boolean, any, any>;
/** Convenience alias for any bound column. */
export type AnyBoundColumn = BoundColumn<any, any, any, Expression.DbType.Any, boolean, boolean, boolean, boolean, boolean, any, string, string, string>;
/** Constructs a runtime column-definition object from schema and metadata. */
export declare const makeColumnDefinition: <Select, Insert, Update, Db extends Expression.DbType.Any, Nullable extends boolean, HasDefault extends boolean, Generated extends boolean, PrimaryKey extends boolean, Unique extends boolean, Ref, Dependencies extends string = never>(schema: Schema.Schema<NonNullable<Select>>, metadata: {
    readonly dbType: Db;
    readonly nullable: Nullable;
    readonly hasDefault: HasDefault;
    readonly generated: Generated;
    readonly primaryKey: PrimaryKey;
    readonly unique: Unique;
    readonly references: Ref;
    readonly brand?: true | undefined;
    readonly index?: ColumnIndexOptions | undefined;
    readonly uniqueConstraint?: ColumnUniqueOptions | undefined;
    readonly defaultValue?: DdlExpression | undefined;
    readonly generatedValue?: DdlExpression | undefined;
    readonly ddlType?: string | undefined;
    readonly identity?: {
        readonly generation: "always" | "byDefault";
    } | undefined;
    readonly enum?: {
        readonly name: string;
        readonly schemaName?: string | undefined;
        readonly values: readonly [string, ...string[]];
    } | undefined;
}) => ColumnDefinition<Select, Insert, Update, Db, Nullable, HasDefault, Generated, PrimaryKey, Unique, Ref, Dependencies>;
export declare const remapColumnDefinition: <Select, Insert, Update, Db extends Expression.DbType.Any, Nullable extends boolean, HasDefault extends boolean, Generated extends boolean, PrimaryKey extends boolean, Unique extends boolean, Ref, Dependencies extends string = never>(column: ColumnDefinition<Select, Insert, Update, Db, Nullable, HasDefault, Generated, PrimaryKey, Unique, Ref, Dependencies>, options?: {
    readonly schema?: Schema.Top | undefined;
    readonly metadata?: {
        readonly dbType: Db;
        readonly nullable: Nullable;
        readonly hasDefault: HasDefault;
        readonly generated: Generated;
        readonly primaryKey: PrimaryKey;
        readonly unique: Unique;
        readonly references: Ref;
        readonly brand?: true | undefined;
        readonly index?: ColumnIndexOptions | undefined;
        readonly uniqueConstraint?: ColumnUniqueOptions | undefined;
        readonly defaultValue?: DdlExpression | undefined;
        readonly generatedValue?: DdlExpression | undefined;
        readonly ddlType?: string | undefined;
        readonly identity?: {
            readonly generation: "always" | "byDefault";
        } | undefined;
        readonly enum?: {
            readonly name: string;
            readonly schemaName?: string | undefined;
            readonly values: readonly [string, ...string[]];
        } | undefined;
    } | undefined;
}) => ColumnDefinition<Select, Insert, Update, Db, Nullable, HasDefault, Generated, PrimaryKey, Unique, Ref, Dependencies>;
/** Attaches table/column provenance to an existing column definition. */
export declare const bindColumn: <TableName extends string, ColumnName extends string, BaseTableName extends string, SchemaName extends string | undefined, Column extends AnyColumnDefinition>(tableName: TableName, columnName: ColumnName, column: Column, baseTableName: BaseTableName, schemaName?: SchemaName | undefined) => BoundColumnFrom<Column, TableName, ColumnName, BaseTableName>;
/** Extracts the internal state record for a column. */
export type ColumnStateOf<Column extends AnyColumnDefinition> = Column[typeof ColumnTypeId];
/** Extracts the read/select type of a column. */
export type SelectType<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["select"];
/** Extracts the insert type of a column. */
export type InsertType<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["insert"];
/** Extracts the update type of a column. */
export type UpdateType<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["update"];
/** Extracts whether a column is nullable. */
export type IsNullable<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["nullable"];
/** Extracts whether a column has a server-side default. */
export type HasDefault<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["hasDefault"];
/** Extracts whether a column is generated by the database. */
export type IsGenerated<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["generated"];
/** Extracts whether a column is part of a primary key. */
export type IsPrimaryKey<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["primaryKey"];
/** Extracts whether a column is unique. */
export type IsUnique<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["unique"];
/** Extracts a column's foreign-key reference metadata. */
export type ReferencesOf<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["references"];
/** Extracts the non-null select type of a column. */
export type BaseSelectType<Column extends AnyColumnDefinition> = NonNullable<SelectType<Column>>;
type BrandedValue<Value, BrandName extends string> = [Extract<Value, null | undefined>] extends [never] ? Value & Brand.Brand<BrandName> : (Exclude<Value, null | undefined> & Brand.Brand<BrandName>) | Extract<Value, null | undefined>;
/** Rebinds a generic column definition to a specific table and key. */
export type BoundColumnFrom<Column extends AnyColumnDefinition, TableName extends string, ColumnName extends string, BaseTableName extends string = TableName> = BoundColumn<Column["metadata"]["brand"] extends true ? BrandedValue<SelectType<Column>, `${TableName}.${ColumnName}`> : SelectType<Column>, Column["metadata"]["brand"] extends true ? BrandedValue<InsertType<Column>, `${TableName}.${ColumnName}`> : InsertType<Column>, Column["metadata"]["brand"] extends true ? BrandedValue<UpdateType<Column>, `${TableName}.${ColumnName}`> : UpdateType<Column>, ColumnStateOf<Column>["dbType"], IsNullable<Column>, HasDefault<Column>, IsGenerated<Column>, IsPrimaryKey<Column>, IsUnique<Column>, ReferencesOf<Column>, TableName, ColumnName, BaseTableName>;
export {};
