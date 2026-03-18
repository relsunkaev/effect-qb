import * as Schema from "effect/Schema"

import * as Expression from "./expression.ts"
import {
  type AnyBoundColumn,
  type AnyColumnDefinition,
  type BaseSelectType,
  type BoundColumn,
  ColumnTypeId,
  type ColumnDefinition,
  type ColumnReference,
  type HasDefault,
  type InsertType,
  type IsGenerated,
  type IsNullable,
  type IsPrimaryKey,
  makeColumnDefinition,
  type ReferencesOf,
  type SelectType,
  type UpdateType
} from "./internal/column-state.ts"

type CompatibleReference<
  Self extends AnyColumnDefinition,
  Target extends AnyBoundColumn
> = [BaseSelectType<Self>] extends [BaseSelectType<Target>]
  ? [BaseSelectType<Target>] extends [BaseSelectType<Self>]
    ? Self
    : never
  : never

type NullableSelect<Select> = Select | null

type NullableColumn<Column extends AnyColumnDefinition> = ColumnDefinition<
  NullableSelect<SelectType<Column>>,
  NullableSelect<InsertType<Column>>,
  NullableSelect<UpdateType<Column>>,
  Column[typeof ColumnTypeId]["dbType"],
  true,
  HasDefault<Column>,
  IsGenerated<Column>,
  IsPrimaryKey<Column>,
  Column[typeof ColumnTypeId]["unique"],
  ReferencesOf<Column>
>

type PrimaryKeyColumn<Column extends AnyColumnDefinition> = ColumnDefinition<
  SelectType<Column>,
  InsertType<Column>,
  UpdateType<Column>,
  Column[typeof ColumnTypeId]["dbType"],
  false,
  HasDefault<Column>,
  IsGenerated<Column>,
  true,
  true,
  ReferencesOf<Column>
>

type UniqueColumn<Column extends AnyColumnDefinition> = ColumnDefinition<
  SelectType<Column>,
  InsertType<Column>,
  UpdateType<Column>,
  Column[typeof ColumnTypeId]["dbType"],
  IsNullable<Column>,
  HasDefault<Column>,
  IsGenerated<Column>,
  IsPrimaryKey<Column>,
  true,
  ReferencesOf<Column>
>

type HasDefaultColumn<Column extends AnyColumnDefinition> = ColumnDefinition<
  SelectType<Column>,
  InsertType<Column>,
  UpdateType<Column>,
  Column[typeof ColumnTypeId]["dbType"],
  IsNullable<Column>,
  true,
  IsGenerated<Column>,
  IsPrimaryKey<Column>,
  Column[typeof ColumnTypeId]["unique"],
  ReferencesOf<Column>
>

type GeneratedColumn<Column extends AnyColumnDefinition> = ColumnDefinition<
  SelectType<Column>,
  InsertType<Column>,
  UpdateType<Column>,
  Column[typeof ColumnTypeId]["dbType"],
  IsNullable<Column>,
  false,
  true,
  IsPrimaryKey<Column>,
  Column[typeof ColumnTypeId]["unique"],
  ReferencesOf<Column>
>

type ReferencingColumn<
  Column extends AnyColumnDefinition,
  Target extends AnyBoundColumn
> = ColumnDefinition<
  SelectType<Column>,
  InsertType<Column>,
  UpdateType<Column>,
  Column[typeof ColumnTypeId]["dbType"],
  IsNullable<Column>,
  HasDefault<Column>,
  IsGenerated<Column>,
  IsPrimaryKey<Column>,
  Column[typeof ColumnTypeId]["unique"],
  ColumnReference<Target>
>

const mapColumn = <
  Column extends AnyColumnDefinition,
  Next extends AnyColumnDefinition
>(
  column: Column,
  metadata: Next["metadata"]
): Next => makeColumnDefinition(column.schema as any, metadata) as Next

const primitive = <Type, Db extends Expression.DbType.Any>(
  schema: Schema.Schema<Type, any, any>,
  dbType: Db
): ColumnDefinition<Type, Type, Type, Db, false, false, false, false, false, undefined> =>
  makeColumnDefinition(schema as Schema.Schema<NonNullable<Type>>, {
    dbType,
    nullable: false,
    hasDefault: false,
    generated: false,
    primaryKey: false,
    unique: false,
    references: undefined
  })

type ColumnModule<
  Dialect extends string,
  UuidKind extends string,
  TextKind extends string,
  IntKind extends string,
  NumberKind extends string,
  BooleanKind extends string,
  TimestampKind extends string,
  JsonKind extends string
> = {
  readonly custom: <
    SchemaType extends Schema.Schema.Any,
    Db extends Expression.DbType.Any
  >(
    schema: SchemaType,
    dbType: Db
  ) => ColumnDefinition<
    Schema.Schema.Type<SchemaType>,
    Schema.Schema.Type<SchemaType>,
    Schema.Schema.Type<SchemaType>,
    Db,
    false,
    false,
    false,
    false,
    false,
    undefined
  >
  readonly uuid: () => ColumnDefinition<string, string, string, Expression.DbType.Base<Dialect, UuidKind>, false, false, false, false, false, undefined>
  readonly text: () => ColumnDefinition<string, string, string, Expression.DbType.Base<Dialect, TextKind>, false, false, false, false, false, undefined>
  readonly int: () => ColumnDefinition<number, number, number, Expression.DbType.Base<Dialect, IntKind>, false, false, false, false, false, undefined>
  readonly number: () => ColumnDefinition<number, number, number, Expression.DbType.Base<Dialect, NumberKind>, false, false, false, false, false, undefined>
  readonly boolean: () => ColumnDefinition<boolean, boolean, boolean, Expression.DbType.Base<Dialect, BooleanKind>, false, false, false, false, false, undefined>
  readonly timestamp: () => ColumnDefinition<Date, Date, Date, Expression.DbType.Base<Dialect, TimestampKind>, false, false, false, false, false, undefined>
  readonly json: <SchemaType extends Schema.Schema.Any>(
    schema: SchemaType
  ) => ColumnDefinition<
    Schema.Schema.Type<SchemaType>,
    Schema.Schema.Type<SchemaType>,
    Schema.Schema.Type<SchemaType>,
    Expression.DbType.Json<Dialect, JsonKind>,
    false,
    false,
    false,
    false,
    false,
    undefined
  >
}

const typeFactory = <Dialect extends string>(dialect: Dialect) =>
  <Kind extends string>(kind: Kind): Expression.DbType.Base<Dialect, Kind> => ({
    dialect,
    kind
  })

const makeColumnModule = <
  Dialect extends string,
  UuidKind extends string,
  TextKind extends string,
  IntKind extends string,
  NumberKind extends string,
  BooleanKind extends string,
  TimestampKind extends string,
  JsonKind extends string
>(
  dialect: Dialect,
  kinds: {
    readonly uuid: UuidKind
    readonly text: TextKind
    readonly int: IntKind
    readonly number: NumberKind
    readonly boolean: BooleanKind
    readonly timestamp: TimestampKind
    readonly json: JsonKind
  }
): ColumnModule<Dialect, UuidKind, TextKind, IntKind, NumberKind, BooleanKind, TimestampKind, JsonKind> => {
  const dialectType = typeFactory(dialect)
  return {
    custom: <SchemaType extends Schema.Schema.Any, Db extends Expression.DbType.Any>(
      schema: SchemaType,
      dbType: Db
    ) =>
      makeColumnDefinition(schema as unknown as Schema.Schema<NonNullable<Schema.Schema.Type<SchemaType>>, any, any>, {
        dbType,
        nullable: false,
        hasDefault: false,
        generated: false,
        primaryKey: false,
        unique: false,
        references: undefined
      }),
    uuid: () => primitive(Schema.UUID, dialectType(kinds.uuid)),
    text: () => primitive(Schema.String, dialectType(kinds.text)),
    int: () => primitive(Schema.Int, dialectType(kinds.int)),
    number: () => primitive(Schema.Number, dialectType(kinds.number)),
    boolean: () => primitive(Schema.Boolean, dialectType(kinds.boolean)),
    timestamp: () => primitive(Schema.Date, dialectType(kinds.timestamp)),
    json: <SchemaType extends Schema.Schema.Any>(schema: SchemaType) =>
      makeColumnDefinition(schema as unknown as Schema.Schema<NonNullable<Schema.Schema.Type<SchemaType>>, any, any>, {
        dbType: {
          ...dialectType(kinds.json),
          variant: "json"
        } as Expression.DbType.Json<Dialect, JsonKind>,
        nullable: false,
        hasDefault: false,
        generated: false,
        primaryKey: false,
        unique: false,
        references: undefined
      })
  }
}

/** Postgres-specialized column constructors. */
export const postgres = makeColumnModule("postgres", {
  uuid: "uuid",
  text: "text",
  int: "int4",
  number: "numeric",
  boolean: "bool",
  timestamp: "timestamp",
  json: "json"
})

/** MySQL-specialized column constructors. */
export const mysql = makeColumnModule("mysql", {
  uuid: "uuid",
  text: "text",
  int: "int",
  number: "decimal",
  boolean: "boolean",
  timestamp: "timestamp",
  json: "json"
})

/** Creates a Postgres `uuid` column. */
export const uuid = postgres.uuid
/** Creates a Postgres `text` column. */
export const text = postgres.text
/** Creates a Postgres `int4` column. */
export const int = postgres.int
/** Creates a Postgres `numeric` column. */
export const number = postgres.number
/** Creates a Postgres `bool` column. */
export const boolean = postgres.boolean
/** Creates a Postgres `timestamp` column decoded as `Date`. */
export const timestamp = postgres.timestamp

/** Creates a Postgres `json` column backed by an arbitrary Effect schema. */
export const json = postgres.json
/** Creates a Postgres column backed by an arbitrary SQL type and Effect schema. */
export const custom = postgres.custom

/** Marks a column as nullable. Nullable columns decode as `T | null`. */
export const nullable = <Column extends AnyColumnDefinition>(
  column: Column[typeof ColumnTypeId]["primaryKey"] extends true ? never : Column
): NullableColumn<Column> =>
  mapColumn(column, {
    ...column.metadata,
    nullable: true
  })

/** Marks a column as a primary key. Primary keys are always unique and non-null. */
export const primaryKey = <Column extends AnyColumnDefinition>(
  column: Column[typeof ColumnTypeId]["nullable"] extends true ? never : Column
): PrimaryKeyColumn<Column> =>
  mapColumn(column, {
    ...column.metadata,
    nullable: false,
    primaryKey: true,
    unique: true
  })

/** Marks a column as unique. */
export const unique = <Column extends AnyColumnDefinition>(
  column: Column
): UniqueColumn<Column> =>
  mapColumn(column, {
    ...column.metadata,
    unique: true
  })

/** Marks a column as having a server-side default and therefore optional on insert. */
export const hasDefault = <Column extends AnyColumnDefinition>(
  column: Column[typeof ColumnTypeId]["generated"] extends true ? never : Column
): HasDefaultColumn<Column> =>
  mapColumn(column, {
    ...column.metadata,
    hasDefault: true
  })

/** Marks a column as generated by the database and omitted from insert/update. */
export const generated = <Column extends AnyColumnDefinition>(
  column: Column[typeof ColumnTypeId]["hasDefault"] extends true ? never : Column
): GeneratedColumn<Column> =>
  mapColumn(column, {
    ...column.metadata,
    generated: true,
    hasDefault: false
  })

/**
 * Attaches a lazy foreign-key reference to another bound column.
 *
 * The base, non-null select types must match.
 */
export const references = <Target extends AnyBoundColumn>(target: () => Target) =>
  <Column extends AnyColumnDefinition>(
    column: CompatibleReference<Column, Target>
  ): ReferencingColumn<Column, Target> =>
    mapColumn(column, {
      ...column.metadata,
      references: { target }
    })

/** Convenience alias for any column definition. */
export type Any = AnyColumnDefinition
/** Convenience alias for any bound column. */
export type AnyBound = BoundColumn<any, any, any, any, any, any, any, any, any, any, any, any>
