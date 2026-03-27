import type * as Brand from "effect/Brand"
import * as Schema from "effect/Schema"

import * as Expression from "./scalar.js"
import type { CanCastDbType } from "./datatypes/lookup.js"
import {
  BigIntStringSchema,
  InstantStringSchema,
  LocalDateStringSchema,
  DecimalStringSchema,
  LocalDateTimeStringSchema,
  LocalTimeStringSchema,
  OffsetTimeStringSchema,
  type LocalDateString,
  type LocalTimeString,
  type OffsetTimeString,
  type InstantString,
  type DecimalString,
  type LocalDateTimeString,
  type BigIntString
} from "./runtime-value.js"
import {
  type AnyBoundColumn,
  type AnyColumnDefinition,
  type BaseSelectType,
  type BoundColumn,
  BoundColumnTypeId,
  ColumnTypeId,
  type DdlExpression,
  type ColumnDefinition,
  type ColumnUniqueOptions,
  type ColumnReference,
  type ColumnIndexOptions,
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

type ReferentialAction = "noAction" | "restrict" | "cascade" | "setNull" | "setDefault"

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
> & PreserveBrand<Column>

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
> & PreserveBrand<Column>

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
> & PreserveBrand<Column>

type IndexedColumn<Column extends AnyColumnDefinition> = Column

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
> & PreserveBrand<Column>

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
> & PreserveBrand<Column>

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
> & PreserveBrand<Column>

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
> & PreserveBrand<Column>

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
> & PreserveBrand<Column>

type CompatibleColumnExpression<
  Column extends AnyColumnDefinition,
  Value extends Expression.Any
> = [Expression.RuntimeOf<Value>] extends [SelectType<Column>]
  ? Column
  : CanCastDbType<
      Expression.DbTypeOf<Value>,
      Column[typeof ColumnTypeId]["dbType"],
      Column[typeof ColumnTypeId]["dbType"]["dialect"]
    > extends true
    ? Column
    : never

type CompatibleDdlExpression<
  Column extends AnyColumnDefinition,
  Value extends DdlExpression
> = Value extends Expression.Any ? CompatibleColumnExpression<Column, Value> : Column

type BaseInsertType<Column extends AnyColumnDefinition> = NonNullable<InsertType<Column>>

type BaseUpdateType<Column extends AnyColumnDefinition> = NonNullable<UpdateType<Column>>

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
> & PreserveBrand<Column>

type ForeignKeyOptions<Target extends AnyBoundColumn> = {
  readonly target: () => Target
  readonly name?: string
  readonly onUpdate?: ReferentialAction
  readonly onDelete?: ReferentialAction
  readonly deferrable?: boolean
  readonly initiallyDeferred?: boolean
}

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
  Column[typeof ColumnTypeId]["dependencies"]
> & PreserveBrand<Column>

type BrandNameOf<Column extends AnyBoundColumn> =
  `${Column[typeof BoundColumnTypeId]["tableName"]}.${Column[typeof BoundColumnTypeId]["columnName"]}`

type BrandedValue<
  Value,
  BrandName extends string
> = [Extract<Value, null | undefined>] extends [never]
  ? Value & Brand.Brand<BrandName>
  : Exclude<Value, null | undefined> & Brand.Brand<BrandName> | Extract<Value, null | undefined>

type BrandMetadata<Column extends AnyColumnDefinition> = {
  readonly metadata: Column["metadata"] & { readonly brand: true }
}

type PreserveBrand<Column extends AnyColumnDefinition> = Column["metadata"]["brand"] extends true
  ? BrandMetadata<Column>
  : {}

type BrandedBoundColumn<
  Column extends AnyBoundColumn
> = BoundColumn<
  BrandedValue<SelectType<Column>, BrandNameOf<Column>>,
  BrandedValue<InsertType<Column>, BrandNameOf<Column>>,
  BrandedValue<UpdateType<Column>, BrandNameOf<Column>>,
  Column[typeof ColumnTypeId]["dbType"],
  IsNullable<Column>,
  HasDefault<Column>,
  IsGenerated<Column>,
  IsPrimaryKey<Column>,
  Column[typeof ColumnTypeId]["unique"],
  ReferencesOf<Column>,
  Column[typeof BoundColumnTypeId]["tableName"],
  Column[typeof BoundColumnTypeId]["columnName"],
  Column[typeof BoundColumnTypeId]["baseTableName"]
> & BrandMetadata<Column>

type BrandMarkedColumn<
  Column extends AnyColumnDefinition
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
  ReferencesOf<Column>,
  Column[typeof ColumnTypeId]["dependencies"]
> & BrandMetadata<Column>

export interface ArrayOptions {
  readonly nullableElements?: boolean
}

export type NumericOptions =
  | {
    readonly precision?: undefined
    readonly scale?: undefined
  }
  | {
    readonly precision: number
    readonly scale?: number
  }

type ArrayElementSelect<
  Column extends AnyColumnDefinition,
  Options extends ArrayOptions | undefined
> = Options extends { readonly nullableElements: true }
  ? NullableSelect<BaseSelectType<Column>>
  : BaseSelectType<Column>

type ArrayElementInsert<
  Column extends AnyColumnDefinition,
  Options extends ArrayOptions | undefined
> = Options extends { readonly nullableElements: true }
  ? NullableSelect<BaseInsertType<Column>>
  : BaseInsertType<Column>

type ArrayElementUpdate<
  Column extends AnyColumnDefinition,
  Options extends ArrayOptions | undefined
> = Options extends { readonly nullableElements: true }
  ? NullableSelect<BaseUpdateType<Column>>
  : BaseUpdateType<Column>

type ArrayColumn<
  Column extends AnyColumnDefinition,
  Options extends ArrayOptions | undefined = undefined
> = ColumnDefinition<
  ReadonlyArray<ArrayElementSelect<Column, Options>>,
  ReadonlyArray<ArrayElementInsert<Column, Options>>,
  ReadonlyArray<ArrayElementUpdate<Column, Options>>,
  Expression.DbType.Array<
    Column[typeof ColumnTypeId]["dbType"]["dialect"],
    Column[typeof ColumnTypeId]["dbType"],
    `${Column[typeof ColumnTypeId]["dbType"]["kind"]}[]`
  >,
  IsNullable<Column>,
  HasDefault<Column>,
  IsGenerated<Column>,
  IsPrimaryKey<Column>,
  Column[typeof ColumnTypeId]["unique"],
  ReferencesOf<Column>,
  Column[typeof ColumnTypeId]["dependencies"]
> & PreserveBrand<Column>

const mapColumn = <
  Column extends AnyColumnDefinition,
  Next extends AnyColumnDefinition
>(
  column: Column,
  metadata: AnyColumnDefinition["metadata"]
): Next => remapColumnDefinition(column as any, {
  metadata
}) as Next

const isColumnDefinitionValue = (value: unknown): value is AnyColumnDefinition =>
  typeof value === "object" && value !== null && ColumnTypeId in value

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
  readonly number: (options?: NumericOptions) => ColumnDefinition<DecimalString, DecimalString, DecimalString, Expression.DbType.Base<Dialect, NumberKind>, false, false, false, false, false, undefined>
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

type PostgresColumnModule = ColumnModule<
  "postgres",
  "uuid",
  "text",
  "int4",
  "numeric",
  "bool",
  "date",
  "timestamp",
  "json"
> & {
  readonly int2: () => ColumnDefinition<number, number, number, Expression.DbType.Base<"postgres", "int2">, false, false, false, false, false, undefined>
  readonly int8: () => ColumnDefinition<BigIntString, BigIntString, BigIntString, Expression.DbType.Base<"postgres", "int8">, false, false, false, false, false, undefined>
  readonly float4: () => ColumnDefinition<number, number, number, Expression.DbType.Base<"postgres", "float4">, false, false, false, false, false, undefined>
  readonly float8: () => ColumnDefinition<number, number, number, Expression.DbType.Base<"postgres", "float8">, false, false, false, false, false, undefined>
  readonly char: (length?: number) => ColumnDefinition<string, string, string, Expression.DbType.Base<"postgres", "char">, false, false, false, false, false, undefined>
  readonly varchar: (length?: number) => ColumnDefinition<string, string, string, Expression.DbType.Base<"postgres", "varchar">, false, false, false, false, false, undefined>
  readonly time: () => ColumnDefinition<LocalTimeString, LocalTimeString, LocalTimeString, Expression.DbType.Base<"postgres", "time">, false, false, false, false, false, undefined>
  readonly timetz: () => ColumnDefinition<OffsetTimeString, OffsetTimeString, OffsetTimeString, Expression.DbType.Base<"postgres", "timetz">, false, false, false, false, false, undefined>
  readonly timestamptz: () => ColumnDefinition<InstantString, InstantString, InstantString, Expression.DbType.Base<"postgres", "timestamptz">, false, false, false, false, false, undefined>
  readonly interval: () => ColumnDefinition<string, string, string, Expression.DbType.Base<"postgres", "interval">, false, false, false, false, false, undefined>
  readonly bytea: () => ColumnDefinition<Uint8Array, Uint8Array, Uint8Array, Expression.DbType.Base<"postgres", "bytea">, false, false, false, false, false, undefined>
  readonly name: () => ColumnDefinition<string, string, string, Expression.DbType.Base<"postgres", "name">, false, false, false, false, false, undefined>
  readonly oid: () => ColumnDefinition<number, number, number, Expression.DbType.Base<"postgres", "oid">, false, false, false, false, false, undefined>
  readonly regclass: () => ColumnDefinition<string, string, string, Expression.DbType.Base<"postgres", "regclass">, false, false, false, false, false, undefined>
  readonly bit: () => ColumnDefinition<string, string, string, Expression.DbType.Base<"postgres", "bit">, false, false, false, false, false, undefined>
  readonly varbit: () => ColumnDefinition<string, string, string, Expression.DbType.Base<"postgres", "varbit">, false, false, false, false, false, undefined>
  readonly xml: () => ColumnDefinition<string, string, string, Expression.DbType.Base<"postgres", "xml">, false, false, false, false, false, undefined>
  readonly pg_lsn: () => ColumnDefinition<string, string, string, Expression.DbType.Base<"postgres", "pg_lsn">, false, false, false, false, false, undefined>
  readonly jsonb: <SchemaType extends Schema.Schema.Any>(
    schema: SchemaType
  ) => ColumnDefinition<
    Schema.Schema.Type<SchemaType>,
    Schema.Schema.Type<SchemaType>,
    Schema.Schema.Type<SchemaType>,
    Expression.DbType.Json<"postgres", "jsonb">,
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

const postgresType = typeFactory("postgres")

const renderNumericDdlType = (
  kind: string,
  options?: NumericOptions
): string | undefined => {
  if (options === undefined || options.precision === undefined) {
    return undefined
  }
  return options.scale === undefined
    ? `${kind}(${options.precision})`
    : `${kind}(${options.precision},${options.scale})`
}

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
    number: (options?: NumericOptions) =>
      makeColumnDefinition(DecimalStringSchema, {
        dbType: dialectType(kinds.number),
        nullable: false,
        hasDefault: false,
        generated: false,
        primaryKey: false,
        unique: false,
        references: undefined,
        ddlType: renderNumericDdlType(kinds.number, options),
        identity: undefined
      }),
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

const postgresBase = makeColumnModule("postgres", {
  uuid: "uuid",
  text: "text",
  int: "int4",
  number: "numeric",
  boolean: "bool",
  date: "date",
  timestamp: "timestamp",
  json: "json"
})

/** Postgres-specialized column constructors. */
export const postgres: PostgresColumnModule = {
  ...postgresBase,
  int2: () => primitive(Schema.Int, postgresType("int2")),
  int8: () => primitive(BigIntStringSchema, postgresType("int8")),
  float4: () => primitive(Schema.Number, postgresType("float4")),
  float8: () => primitive(Schema.Number, postgresType("float8")),
  char: (length = 1) =>
    makeColumnDefinition(Schema.String, {
      dbType: postgresType("char"),
      nullable: false,
      hasDefault: false,
      generated: false,
      primaryKey: false,
      unique: false,
      references: undefined,
      ddlType: `char(${length})`,
      identity: undefined
    }),
  varchar: (length?: number) =>
    makeColumnDefinition(Schema.String, {
      dbType: postgresType("varchar"),
      nullable: false,
      hasDefault: false,
      generated: false,
      primaryKey: false,
      unique: false,
      references: undefined,
      ddlType: length === undefined ? "varchar" : `varchar(${length})`,
      identity: undefined
    }),
  time: () => primitive(LocalTimeStringSchema, postgresType("time")),
  timetz: () => primitive(OffsetTimeStringSchema, postgresType("timetz")),
  timestamptz: () => primitive(InstantStringSchema, postgresType("timestamptz")),
  interval: () => primitive(Schema.String, postgresType("interval")),
  bytea: () => primitive(Schema.Uint8ArrayFromSelf, postgresType("bytea")),
  name: () => primitive(Schema.String, postgresType("name")),
  oid: () => primitive(Schema.Int, postgresType("oid")),
  regclass: () => primitive(Schema.String, postgresType("regclass")),
  bit: () => primitive(Schema.String, postgresType("bit")),
  varbit: () => primitive(Schema.String, postgresType("varbit")),
  xml: () => primitive(Schema.String, postgresType("xml")),
  pg_lsn: () => primitive(Schema.String, postgresType("pg_lsn")),
  jsonb: <SchemaType extends Schema.Schema.Any>(schema: SchemaType) =>
    makeColumnDefinition(schema as unknown as Schema.Schema<NonNullable<Schema.Schema.Type<SchemaType>>, any, any>, {
      dbType: {
        ...postgresType("jsonb"),
        variant: "jsonb"
      } as Expression.DbType.Json<"postgres", "jsonb">,
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
/** Creates a Postgres `int2` column. */
export const int2 = postgres.int2
/** Creates a Postgres `int8` column. */
export const int8 = postgres.int8
/** Creates a Postgres `numeric` column decoded as `DecimalString`. */
export const number = postgres.number
/** Creates a Postgres `float4` column. */
export const float4 = postgres.float4
/** Creates a Postgres `float8` column. */
export const float8 = postgres.float8
/** Creates a Postgres `bool` column. */
export const boolean = postgres.boolean
/** Creates a Postgres `date` column decoded as `LocalDateString`. */
export const date = postgres.date
/** Creates a Postgres `timestamp` column decoded as `LocalDateTimeString`. */
export const timestamp = postgres.timestamp
/** Creates a Postgres `time` column decoded as `LocalTimeString`. */
export const time = postgres.time
/** Creates a Postgres `timetz` column decoded as `OffsetTimeString`. */
export const timetz = postgres.timetz
/** Creates a Postgres `timestamptz` column decoded as `InstantString`. */
export const timestamptz = postgres.timestamptz
/** Creates a Postgres `char` column. */
export const char = postgres.char
/** Creates a Postgres `varchar` column. */
export const varchar = postgres.varchar
/** Creates a Postgres `interval` column. */
export const interval = postgres.interval
/** Creates a Postgres `bytea` column. */
export const bytea = postgres.bytea
/** Creates a Postgres `name` column. */
export const name = postgres.name
/** Creates a Postgres `oid` column. */
export const oid = postgres.oid
/** Creates a Postgres `regclass` column. */
export const regclass = postgres.regclass
/** Creates a Postgres `bit` column. */
export const bit = postgres.bit
/** Creates a Postgres `varbit` column. */
export const varbit = postgres.varbit
/** Creates a Postgres `xml` column. */
export const xml = postgres.xml
/** Creates a Postgres `pg_lsn` column. */
export const pg_lsn = postgres.pg_lsn

/** Creates a Postgres `json` column backed by an arbitrary Effect schema. */
export const json = postgres.json
/** Creates a Postgres `jsonb` column backed by an arbitrary Effect schema. */
export const jsonb = postgres.jsonb
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

type BrandResult<Column extends AnyColumnDefinition> = Column extends AnyBoundColumn
  ? BrandedBoundColumn<Column>
  : BrandMarkedColumn<Column>

/** Brands a column with its `table.column` provenance. */
export const brand = <Column extends AnyColumnDefinition>(
  column: Column
): BrandResult<Column> => {
  if (BoundColumnTypeId in column) {
    const boundColumn = column as unknown as AnyBoundColumn
    const brandName = `${boundColumn[BoundColumnTypeId].tableName}.${boundColumn[BoundColumnTypeId].columnName}`
    return remapColumnDefinition(boundColumn, {
      schema: Schema.brand(brandName)(boundColumn.schema),
      metadata: {
        ...boundColumn.metadata,
        brand: true
      }
    }) as BrandResult<Column>
  }
  return remapColumnDefinition(column, {
    metadata: {
      ...column.metadata,
      brand: true
    }
  }) as BrandResult<Column>
}

/** Marks a column as nullable. Nullable columns decode as `T | null`. */
export const nullable = <Column extends AnyColumnDefinition>(
  column: Column[typeof ColumnTypeId]["primaryKey"] extends true ? never : Column
): NullableColumn<Column> =>
  mapColumn(column, {
    ...column.metadata,
    nullable: true
  }) as NullableColumn<Column>

/** Marks a column as a primary key. Primary keys are always unique and non-null. */
export const primaryKey = <Column extends AnyColumnDefinition>(
  column: Column[typeof ColumnTypeId]["nullable"] extends true ? never : Column
): PrimaryKeyColumn<Column> =>
  mapColumn(column, {
    ...column.metadata,
    nullable: false,
    primaryKey: true,
    unique: true
  }) as PrimaryKeyColumn<Column>

type UniqueModifier = {
  <Column extends AnyColumnDefinition>(column: Column): UniqueColumn<Column>
  readonly options: <const Options extends ColumnUniqueOptions>(
    options: Options
  ) => <Column extends AnyColumnDefinition>(column: Column) => UniqueColumn<Column>
}

/** Marks a column as unique. */
export const unique: UniqueModifier = Object.assign(
  <Column extends AnyColumnDefinition>(column: Column): UniqueColumn<Column> =>
    mapColumn(column, {
      ...column.metadata,
      unique: true
    }) as UniqueColumn<Column>,
  {
    options: <const Options extends ColumnUniqueOptions>(options: Options) =>
      <Column extends AnyColumnDefinition>(column: Column): UniqueColumn<Column> =>
        mapColumn(column, {
          ...column.metadata,
          unique: true,
          uniqueConstraint: options
        }) as UniqueColumn<Column>
  }
)

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
    }) as HasDefaultColumn<Column>

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
    }) as GeneratedColumn<Column>

/** Preserves the exact SQL type used for DDL rendering. */
export const ddlType = <SqlType extends string>(sqlType: SqlType) =>
  <Column extends AnyColumnDefinition>(column: Column): DdlTypedColumn<Column> =>
    mapColumn(column, {
      ...column.metadata,
      ddlType: sqlType
    }) as DdlTypedColumn<Column>

/** Marks a column as a Postgres array type. */
export const array = <Options extends ArrayOptions | undefined = undefined>(
  options?: Options
) =>
  <Column extends AnyColumnDefinition>(
    column: Column
  ): ArrayColumn<Column, Options> =>
    remapColumnDefinition(column as AnyColumnDefinition, {
      schema: Schema.Array(options?.nullableElements ? Schema.NullOr(column.schema) : column.schema),
      metadata: {
        ...column.metadata,
        dbType: {
          dialect: column.metadata.dbType.dialect,
          kind: `${column.metadata.dbType.kind}[]`,
          element: column.metadata.dbType
        } as Expression.DbType.Array<
          Column[typeof ColumnTypeId]["dbType"]["dialect"],
          Column[typeof ColumnTypeId]["dbType"],
          `${Column[typeof ColumnTypeId]["dbType"]["kind"]}[]`
        >,
        ddlType: `${column.metadata.ddlType ?? column.metadata.dbType.kind}[]`
      }
    }) as ArrayColumn<Column, Options>

/** Marks a column as indexed. */
export function index<Column extends AnyColumnDefinition>(
  column: Column
): IndexedColumn<Column>
export function index<const Options extends ColumnIndexOptions>(
  options: Options
): <Column extends AnyColumnDefinition>(column: Column) => IndexedColumn<Column>
export function index(arg: unknown): unknown {
  if (isColumnDefinitionValue(arg)) {
    return mapColumn(arg, {
      ...arg.metadata,
      index: arg.metadata.index ?? {}
    })
  }
  const options = (arg ?? {}) as ColumnIndexOptions
  return <Column extends AnyColumnDefinition>(
    column: Column
  ): IndexedColumn<Column> =>
    mapColumn(column, {
      ...column.metadata,
      index: options
    })
}

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
  }) as ByDefaultIdentityColumn<Column>

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
  }) as AlwaysIdentityColumn<Column>

/**
 * Attaches a lazy foreign-key reference to another bound column.
 *
 * The base, non-null select types must match.
 */
export function foreignKey<Target extends AnyBoundColumn>(
  target: () => Target
): <Column extends AnyColumnDefinition>(
  column: CompatibleReference<Column, Target>
) => ReferencingColumn<Column, Target>
export function foreignKey<const Options extends ForeignKeyOptions<AnyBoundColumn>>(
  options: Options
): <Column extends AnyColumnDefinition>(
  column: CompatibleReference<Column, ReturnType<Options["target"]>>
) => ReferencingColumn<Column, ReturnType<Options["target"]>>
export function foreignKey(arg: unknown): unknown {
  if (typeof arg === "function") {
    const target = arg as () => AnyBoundColumn
    return <Column extends AnyColumnDefinition>(
      column: CompatibleReference<Column, AnyBoundColumn>
    ): ReferencingColumn<Column, AnyBoundColumn> =>
      mapColumn(column, {
        ...column.metadata,
        references: { target }
      }) as ReferencingColumn<Column, AnyBoundColumn>
  }
  const options = arg as ForeignKeyOptions<AnyBoundColumn>
  return <Column extends AnyColumnDefinition>(
    column: CompatibleReference<Column, ReturnType<typeof options.target>>
  ): ReferencingColumn<Column, ReturnType<typeof options.target>> =>
    mapColumn(column, {
      ...column.metadata,
      references: options
    }) as ReferencingColumn<Column, ReturnType<typeof options.target>>
}

export const references = <Target extends AnyBoundColumn>(target: () => Target) =>
  foreignKey(target)

/** Convenience alias for any column definition. */
export type Any = AnyColumnDefinition
/** Convenience alias for any bound column. */
export type AnyBound = BoundColumn<any, any, any, any, any, any, any, any, any, any, any, any>

export { default_ as default }
