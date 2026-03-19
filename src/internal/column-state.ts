import { pipeArguments, type Pipeable } from "effect/Pipeable"
import * as Schema from "effect/Schema"

import * as Expression from "./expression.ts"
import * as ExpressionAst from "./expression-ast.ts"

/** Symbol used to attach column-definition metadata. */
export const ColumnTypeId: unique symbol = Symbol.for("effect-qb/Column")
/** Symbol used to attach bound-column provenance. */
export const BoundColumnTypeId: unique symbol = Symbol.for("effect-qb/BoundColumn")

export type ColumnTypeId = typeof ColumnTypeId
export type BoundColumnTypeId = typeof BoundColumnTypeId

/** Lazy reference to another bound column. */
export interface ColumnReference<Target = unknown> {
  readonly target: () => Target
}

/** Complete static state tracked for a column definition. */
export interface ColumnState<
  Select,
  Insert,
  Update,
  Db extends Expression.DbType.Any,
  Nullable extends boolean,
  HasDefault extends boolean,
  Generated extends boolean,
  PrimaryKey extends boolean,
  Unique extends boolean,
  Ref,
  Source = never,
  Dependencies extends Expression.SourceDependencies = {}
> {
  readonly select: Select
  readonly insert: Insert
  readonly update: Update
  readonly dbType: Db
  readonly nullable: Nullable
  readonly hasDefault: HasDefault
  readonly generated: Generated
  readonly primaryKey: PrimaryKey
  readonly unique: Unique
  readonly references: Ref
  readonly source: Source
  readonly dependencies: Dependencies
}

/** Unbound column definition produced by the `Column` DSL. */
export interface ColumnDefinition<
  Select,
  Insert,
  Update,
  Db extends Expression.DbType.Any,
  Nullable extends boolean,
  HasDefault extends boolean,
  Generated extends boolean,
  PrimaryKey extends boolean,
  Unique extends boolean,
  Ref,
  Source = never,
  Dependencies extends Expression.SourceDependencies = {}
> extends Pipeable, Expression.Expression<
    Select,
    Db,
    Nullable extends true ? "maybe" : "never",
    Db["dialect"],
    "scalar",
    Source,
    Dependencies
  > {
  readonly [ColumnTypeId]: ColumnState<
    Select,
    Insert,
    Update,
    Db,
    Nullable,
    HasDefault,
    Generated,
    PrimaryKey,
    Unique,
    Ref,
    Source,
    Dependencies
  >
  readonly schema: Schema.Schema<NonNullable<Select>, any, any>
  readonly metadata: {
    readonly dbType: Db
    readonly nullable: Nullable
    readonly hasDefault: HasDefault
    readonly generated: Generated
    readonly primaryKey: PrimaryKey
    readonly unique: Unique
    readonly references: Ref
  }
}

/** Column definition bound to a concrete table and column name. */
export interface BoundColumn<
  Select,
  Insert,
  Update,
  Db extends Expression.DbType.Any,
  Nullable extends boolean,
  HasDefault extends boolean,
  Generated extends boolean,
  PrimaryKey extends boolean,
    Unique extends boolean,
    Ref,
    TableName extends string,
    ColumnName extends string,
    BaseTableName extends string = TableName
> extends ColumnDefinition<
    Select,
    Insert,
    Update,
    Db,
    Nullable,
    HasDefault,
    Generated,
    PrimaryKey,
    Unique,
    Ref,
    Expression.ColumnSource<TableName, ColumnName, BaseTableName>,
    Record<TableName, true>
  > {
  readonly [BoundColumnTypeId]: {
    readonly tableName: TableName
    readonly columnName: ColumnName
    readonly baseTableName: BaseTableName
    readonly schemaName?: string
  }
  readonly [Expression.TypeId]: Expression.State<
    Select,
    Db,
    Nullable extends true ? "maybe" : "never",
    Db["dialect"],
    "scalar",
    Expression.ColumnSource<TableName, ColumnName, BaseTableName>,
    Record<TableName, true>,
    "propagate"
  >
  readonly [ExpressionAst.TypeId]: ExpressionAst.ColumnNode<TableName, ColumnName>
}

/** Convenience alias for any column definition. */
export type AnyColumnDefinition = ColumnDefinition<
  any,
  any,
  any,
  Expression.DbType.Any,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  any,
  any
>
/** Convenience alias for any bound column. */
export type AnyBoundColumn = BoundColumn<
  any,
  any,
  any,
  Expression.DbType.Any,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  any,
  string,
  string
>

const ColumnProto = {
  pipe(this: unknown) {
    return pipeArguments(this, arguments)
  }
}

/** Constructs a runtime column-definition object from schema and metadata. */
export const makeColumnDefinition = <
  Select,
  Insert,
  Update,
  Db extends Expression.DbType.Any,
  Nullable extends boolean,
  HasDefault extends boolean,
  Generated extends boolean,
  PrimaryKey extends boolean,
  Unique extends boolean,
  Ref,
  Source = never,
  Dependencies extends Expression.SourceDependencies = {}
>(
  schema: Schema.Schema<NonNullable<Select>, any, any>,
  metadata: ColumnDefinition<
    Select,
    Insert,
    Update,
    Db,
    Nullable,
    HasDefault,
    Generated,
    PrimaryKey,
    Unique,
    Ref,
    Source,
    Dependencies
  >["metadata"]
): ColumnDefinition<
  Select,
  Insert,
  Update,
  Db,
  Nullable,
  HasDefault,
  Generated,
  PrimaryKey,
  Unique,
  Ref,
  Source,
  Dependencies
> => {
  const column = Object.create(ColumnProto)
  column.schema = schema
  column.metadata = metadata
  column[Expression.TypeId] = {
    runtime: undefined as Select,
    dbType: metadata.dbType,
    nullability: (metadata.nullable ? "maybe" : "never") as Nullable extends true ? "maybe" : "never",
    dialect: metadata.dbType.dialect,
    aggregation: "scalar",
    source: undefined as Source,
    sourceNullability: "propagate" as const,
    dependencies: {} as Dependencies
  }
  column[ColumnTypeId] = {
    select: undefined as Select,
    insert: undefined as Insert,
    update: undefined as Update,
    dbType: metadata.dbType,
    nullable: metadata.nullable,
    hasDefault: metadata.hasDefault,
    generated: metadata.generated,
    primaryKey: metadata.primaryKey,
    unique: metadata.unique,
    references: metadata.references,
    source: undefined as Source,
    dependencies: {} as Dependencies
  }
  return column
}

/** Attaches table/column provenance to an existing column definition. */
export const bindColumn = <
  TableName extends string,
  ColumnName extends string,
  BaseTableName extends string,
  SchemaName extends string | undefined,
  Column extends AnyColumnDefinition
>(
  tableName: TableName,
  columnName: ColumnName,
  column: Column,
  baseTableName: BaseTableName,
  schemaName?: SchemaName
): BoundColumnFrom<Column, TableName, ColumnName, BaseTableName> => {
  const bound = Object.create(ColumnProto)
  bound.schema = column.schema
  bound.metadata = column.metadata
  bound[Expression.TypeId] = {
    runtime: undefined as SelectType<Column>,
    dbType: column.metadata.dbType,
    nullability: (column.metadata.nullable ? "maybe" : "never") as IsNullable<Column> extends true ? "maybe" : "never",
    dialect: column.metadata.dbType.dialect,
    aggregation: "scalar",
    source: {
      tableName,
      columnName,
      baseTableName
    },
    sourceNullability: "propagate" as const,
    dependencies: {
      [tableName]: true
    } as Record<TableName, true>
  }
  bound[ExpressionAst.TypeId] = {
    kind: "column",
    tableName,
    columnName
  } satisfies ExpressionAst.ColumnNode<TableName, ColumnName>
  bound[ColumnTypeId] = column[ColumnTypeId]
  bound[BoundColumnTypeId] = {
    tableName,
    columnName,
    baseTableName,
    schemaName
  }
  return bound
}

/** Extracts the internal state record for a column. */
export type ColumnStateOf<Column extends AnyColumnDefinition> = Column[typeof ColumnTypeId]
/** Extracts the read/select type of a column. */
export type SelectType<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["select"]
/** Extracts the insert type of a column. */
export type InsertType<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["insert"]
/** Extracts the update type of a column. */
export type UpdateType<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["update"]
/** Extracts whether a column is nullable. */
export type IsNullable<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["nullable"]
/** Extracts whether a column has a server-side default. */
export type HasDefault<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["hasDefault"]
/** Extracts whether a column is generated by the database. */
export type IsGenerated<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["generated"]
/** Extracts whether a column is part of a primary key. */
export type IsPrimaryKey<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["primaryKey"]
/** Extracts whether a column is unique. */
export type IsUnique<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["unique"]
/** Extracts a column's foreign-key reference metadata. */
export type ReferencesOf<Column extends AnyColumnDefinition> = ColumnStateOf<Column>["references"]
/** Extracts the non-null select type of a column. */
export type BaseSelectType<Column extends AnyColumnDefinition> = NonNullable<SelectType<Column>>

/** Rebinds a generic column definition to a specific table and key. */
export type BoundColumnFrom<
  Column extends AnyColumnDefinition,
  TableName extends string,
  ColumnName extends string,
  BaseTableName extends string = TableName
> = BoundColumn<
  SelectType<Column>,
  InsertType<Column>,
  UpdateType<Column>,
  ColumnStateOf<Column>["dbType"],
  IsNullable<Column>,
  HasDefault<Column>,
  IsGenerated<Column>,
  IsPrimaryKey<Column>,
  IsUnique<Column>,
  ReferencesOf<Column>,
  TableName,
  ColumnName,
  BaseTableName
>
