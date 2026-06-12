import type * as Expression from "../internal/scalar.js"
import type { NonEmptyStringInput } from "../internal/table-options.js"
import {
  pickDatatypeConstructors,
  postgresSpecificDatatypeKeys,
  type PostgresSpecificDatatypeKey
} from "../internal/datatypes/matrix.js"
import { postgresDatatypes } from "./datatypes/index.js"

type PostgresSpecificDatatypes = Pick<typeof postgresDatatypes, PostgresSpecificDatatypeKey>

type PostgresTypeNamespace = PostgresSpecificDatatypes & {
  readonly array: <Element extends Expression.DbType.Any>(
    element: Element
  ) => Expression.DbType.Array<"postgres", Element, `${Element["kind"]}[]`>
  readonly range: <Kind extends string, Subtype extends Expression.DbType.Any>(
    kind: NonEmptyStringInput<Kind>,
    subtype: Subtype
  ) => Expression.DbType.Range<"postgres", Subtype, Kind>
  readonly multirange: <Kind extends string, Subtype extends Expression.DbType.Any>(
    kind: NonEmptyStringInput<Kind>,
    subtype: Subtype
  ) => Expression.DbType.Multirange<"postgres", Subtype, Kind>
  readonly record: <Kind extends string, Fields extends Record<string, Expression.DbType.Any>>(
    kind: NonEmptyStringInput<Kind>,
    fields: Fields
  ) => Expression.DbType.Composite<"postgres", Fields, Kind>
  readonly domain: <Kind extends string, Base extends Expression.DbType.Any>(
    kind: NonEmptyStringInput<Kind>,
    base: Base
  ) => Expression.DbType.Domain<"postgres", Base, Kind>
  readonly enum: <Kind extends string>(kind: NonEmptyStringInput<Kind>) => Expression.DbType.Enum<"postgres", Kind>
  readonly custom: <Kind extends string>(kind: NonEmptyStringInput<Kind>) => Expression.DbType.Base<"postgres", Kind>
  readonly driverValueMapping: <Db extends Expression.DbType.Any>(
    dbType: Db,
    mapping: Expression.DriverValueMapping
  ) => Db
}

const array = <Element extends Expression.DbType.Any>(
  element: Element
): Expression.DbType.Array<"postgres", Element, `${Element["kind"]}[]`> => ({
  dialect: "postgres",
  kind: `${element.kind}[]`,
  element
})

const range = <Kind extends string, Subtype extends Expression.DbType.Any>(
  kind: NonEmptyStringInput<Kind>,
  subtype: Subtype
): Expression.DbType.Range<"postgres", Subtype, Kind> => ({
  dialect: "postgres",
  kind: kind as Kind,
  subtype
})

const multirange = <Kind extends string, Subtype extends Expression.DbType.Any>(
  kind: NonEmptyStringInput<Kind>,
  subtype: Subtype
): Expression.DbType.Multirange<"postgres", Subtype, Kind> => ({
  dialect: "postgres",
  kind: kind as Kind,
  subtype
})

const record = <Kind extends string, Fields extends Record<string, Expression.DbType.Any>>(
  kind: NonEmptyStringInput<Kind>,
  fields: Fields
): Expression.DbType.Composite<"postgres", Fields, Kind> => ({
  dialect: "postgres",
  kind: kind as Kind,
  fields
})

const domain = <Kind extends string, Base extends Expression.DbType.Any>(
  kind: NonEmptyStringInput<Kind>,
  base: Base
): Expression.DbType.Domain<"postgres", Base, Kind> => ({
  dialect: "postgres",
  kind: kind as Kind,
  base
})

const enum_ = <Kind extends string>(
  kind: NonEmptyStringInput<Kind>
): Expression.DbType.Enum<"postgres", Kind> => ({
  dialect: "postgres",
  kind: kind as Kind,
  variant: "enum"
})

const custom = <Kind extends string>(
  kind: NonEmptyStringInput<Kind>
): Expression.DbType.Base<"postgres", Kind> => ({
  dialect: "postgres",
  kind: kind as Kind
})

const driverValueMapping = <Db extends Expression.DbType.Any>(
  dbType: Db,
  mapping: Expression.DriverValueMapping
): Db => ({
  ...dbType,
  driverValueMapping: mapping
})

/** Postgres database-type constructors for casts and typed column references. */
export const type: PostgresTypeNamespace = {
  ...pickDatatypeConstructors(postgresDatatypes, postgresSpecificDatatypeKeys),
  array,
  range,
  multirange,
  record,
  domain,
  enum: enum_,
  custom,
  driverValueMapping
}
