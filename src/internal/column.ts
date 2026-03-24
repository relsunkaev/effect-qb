import * as Schema from "effect/Schema"

import * as Expression from "./expression.js"
import {
  LocalDateStringSchema,
  DecimalStringSchema,
  LocalDateTimeStringSchema,
  type LocalDateString,
  type DecimalString,
  type LocalDateTimeString
} from "./runtime-value.js"
import {
  type AnyBoundColumn,
  type AnyColumnDefinition,
  type BaseSelectType,
  type BoundColumn,
  ColumnTypeId,
  type DdlExpression,
  type ColumnDefinition,
  type ColumnReference,
  type HasDefault,
  type InsertType,
  type IsGenerated,
  type IsNullable,
  type IsPrimaryKey,
  makeColumnDefinition,
  type ReferencesOf,
  remapColumnDefinition,
  type SelectType,
  type UpdateType
} from "./column-state.js"

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

type DdlTypedColumn<Column extends AnyColumnDefinition> = ColumnDefinition<
  SelectType<Column>,
  InsertType<Column>,
  UpdateType<Column>,
  Column[typeof ColumnTypeId]["dbType"],
  IsNullable<Column>,
  HasDefault<Column>,
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

type ByDefaultIdentityColumn<Column extends AnyColumnDefinition> = ColumnDefinition<
  SelectType<Column>,
  InsertType<Column>,
  UpdateType<Column>,
  Column[typeof ColumnTypeId]["dbType"],
  IsNullable<Column>,
  true,
  false,
  IsPrimaryKey<Column>,
  Column[typeof ColumnTypeId]["unique"],
  ReferencesOf<Column>
>

type AlwaysIdentityColumn<Column extends AnyColumnDefinition> = ColumnDefinition<
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

type CompatibleColumnExpression<
  Column extends AnyColumnDefinition,
  Value extends Expression.Any
> = [Expression.RuntimeOf<Value>] extends [SelectType<Column>] ? Column : never

type CompatibleDdlExpression<
  Column extends AnyColumnDefinition,
  Value extends DdlExpression
> = Value extends Expression.Any ? CompatibleColumnExpression<Column, Value> : Column

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

type SchemaCompatibleColumn<
  Column extends AnyColumnDefinition,
  SchemaType extends Schema.Schema.Any
> = [BaseSelectType<Column>] extends [Schema.Schema.Encoded<SchemaType>]
  ? Column
  : never

type ColumnSchemaOutput<
  Column extends AnyColumnDefinition,
  SchemaType extends Schema.Schema.Any
> = IsNullable<Column> extends true
  ? Schema.Schema.Type<SchemaType> | null
  : Schema.Schema.Type<SchemaType>

type ColumnWithSchema<
  Column extends AnyColumnDefinition,
  SchemaType extends Schema.Schema.Any
> = ColumnDefinition<
  ColumnSchemaOutput<Column, SchemaType>,
  ColumnSchemaOutput<Column, SchemaType>,
  ColumnSchemaOutput<Column, SchemaType>,
  Column[typeof ColumnTypeId]["dbType"],
  IsNullable<Column>,
  HasDefault<Column>,
  IsGenerated<Column>,
  IsPrimaryKey<Column>,
  Column[typeof ColumnTypeId]["unique"],
  ReferencesOf<Column>,
  Column[typeof ColumnTypeId]["source"],
  Column[typeof ColumnTypeId]["dependencies"]
>

const mapColumn = <
  Column extends AnyColumnDefinition,
  Next extends AnyColumnDefinition
>(
  column: Column,
  metadata: Next["metadata"]
): Next => remapColumnDefinition(column as any, {
  metadata
}) as Next

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
  DateKind extends string,
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
  readonly number: () => ColumnDefinition<DecimalString, DecimalString, DecimalString, Expression.DbType.Base<Dialect, NumberKind>, false, false, false, false, false, undefined>
  readonly boolean: () => ColumnDefinition<boolean, boolean, boolean, Expression.DbType.Base<Dialect, BooleanKind>, false, false, false, false, false, undefined>
  readonly date: () => ColumnDefinition<LocalDateString, LocalDateString, LocalDateString, Expression.DbType.Base<Dialect, DateKind>, false, false, false, false, false, undefined>
  readonly timestamp: () => ColumnDefinition<LocalDateTimeString, LocalDateTimeString, LocalDateTimeString, Expression.DbType.Base<Dialect, TimestampKind>, false, false, false, false, false, undefined>
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
  DateKind extends string,
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
    readonly date: DateKind
    readonly timestamp: TimestampKind
    readonly json: JsonKind
  }
): ColumnModule<Dialect, UuidKind, TextKind, IntKind, NumberKind, BooleanKind, DateKind, TimestampKind, JsonKind> => {
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
        references: undefined,
        ddlType: undefined,
        identity: undefined
      }),
    uuid: () => primitive(Schema.UUID, dialectType(kinds.uuid)),
    text: () => primitive(Schema.String, dialectType(kinds.text)),
    int: () => primitive(Schema.Int, dialectType(kinds.int)),
    number: () => primitive(DecimalStringSchema, dialectType(kinds.number)),
    boolean: () => primitive(Schema.Boolean, dialectType(kinds.boolean)),
    date: () => primitive(LocalDateStringSchema, dialectType(kinds.date)),
    timestamp: () => primitive(LocalDateTimeStringSchema, dialectType(kinds.timestamp)),
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
        references: undefined,
        ddlType: undefined,
        identity: undefined
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
  date: "date",
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
  date: "date",
  timestamp: "timestamp",
  json: "json"
})

/** Creates a Postgres `uuid` column. */
export const uuid = postgres.uuid
/** Creates a Postgres `text` column. */
export const text = postgres.text
/** Creates a Postgres `int4` column. */
export const int = postgres.int
/** Creates a Postgres `numeric` column decoded as `DecimalString`. */
export const number = postgres.number
/** Creates a Postgres `bool` column. */
export const boolean = postgres.boolean
/** Creates a Postgres `date` column decoded as `LocalDateString`. */
export const date = postgres.date
/** Creates a Postgres `timestamp` column decoded as `LocalDateTimeString`. */
export const timestamp = postgres.timestamp

/** Creates a Postgres `json` column backed by an arbitrary Effect schema. */
export const json = postgres.json
/** Creates a Postgres column backed by an arbitrary SQL type and Effect schema. */
export const custom = postgres.custom

/** Replaces a column's runtime schema while preserving its SQL type metadata. */
export const schema = <SchemaType extends Schema.Schema.Any>(nextSchema: SchemaType) =>
  <Column extends AnyColumnDefinition>(
    column: SchemaCompatibleColumn<Column, SchemaType>
  ): ColumnWithSchema<Column, SchemaType> =>
    remapColumnDefinition(column as AnyColumnDefinition, {
      schema: nextSchema
    }) as ColumnWithSchema<Column, SchemaType>

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

/** Marks a column as having a database default expression and therefore optional on insert. */
export const default_ = <Value extends DdlExpression>(value: Value) =>
  <Column extends AnyColumnDefinition>(
    column: Column[typeof ColumnTypeId]["generated"] extends true ? never : CompatibleDdlExpression<Column, Value>
  ): HasDefaultColumn<Column> =>
    mapColumn(column, {
      ...column.metadata,
      hasDefault: true,
      defaultValue: value,
      generatedValue: undefined,
      identity: undefined
    })

/** Marks a column as generated by the database expression and omitted from insert/update. */
export const generated = <Value extends DdlExpression>(value: Value) =>
  <Column extends AnyColumnDefinition>(
    column: Column[typeof ColumnTypeId]["hasDefault"] extends true ? never : CompatibleDdlExpression<Column, Value>
  ): GeneratedColumn<Column> =>
    mapColumn(column, {
      ...column.metadata,
      generated: true,
      hasDefault: false,
      defaultValue: undefined,
      generatedValue: value,
      identity: undefined
    })

/** Preserves the exact SQL type used for DDL rendering. */
export const ddlType = <SqlType extends string>(sqlType: SqlType) =>
  <Column extends AnyColumnDefinition>(column: Column): DdlTypedColumn<Column> =>
    mapColumn(column, {
      ...column.metadata,
      ddlType: sqlType
    })

/** Marks a column as `generated by default as identity`. */
export const identityByDefault = <Column extends AnyColumnDefinition>(
  column: Column[typeof ColumnTypeId]["generated"] extends true ? never : Column
): ByDefaultIdentityColumn<Column> =>
  mapColumn(column, {
    ...column.metadata,
    hasDefault: true,
    generated: false,
    defaultValue: undefined,
    generatedValue: undefined,
    identity: {
      generation: "byDefault"
    }
  })

/** Marks a column as `generated always as identity`. */
export const identityAlways = <Column extends AnyColumnDefinition>(
  column: Column[typeof ColumnTypeId]["hasDefault"] extends true ? never : Column
): AlwaysIdentityColumn<Column> =>
  mapColumn(column, {
    ...column.metadata,
    hasDefault: false,
    generated: true,
    defaultValue: undefined,
    generatedValue: undefined,
    identity: {
      generation: "always"
    }
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

export { default_ as default }
