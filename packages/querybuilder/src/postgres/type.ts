import type * as Expression from "../internal/scalar.js"
import { postgresDatatypes } from "./datatypes/index.js"
import { type as postgresType } from "./internal/dsl.js"

type PostgresTypeNamespace = typeof postgresDatatypes & {
  readonly array: <Element extends Expression.DbType.Any>(
    element: Element
  ) => Expression.DbType.Array<"postgres", Element, `${Element["kind"]}[]`>
  readonly range: <Kind extends string, Subtype extends Expression.DbType.Any>(
    kind: Kind,
    subtype: Subtype
  ) => Expression.DbType.Range<"postgres", Subtype, Kind>
  readonly multirange: <Kind extends string, Subtype extends Expression.DbType.Any>(
    kind: Kind,
    subtype: Subtype
  ) => Expression.DbType.Multirange<"postgres", Subtype, Kind>
  readonly record: <Kind extends string, Fields extends Record<string, Expression.DbType.Any>>(
    kind: Kind,
    fields: Fields
  ) => Expression.DbType.Composite<"postgres", Fields, Kind>
  readonly domain: <Kind extends string, Base extends Expression.DbType.Any>(
    kind: Kind,
    base: Base
  ) => Expression.DbType.Domain<"postgres", Base, Kind>
  readonly enum: <Kind extends string>(kind: Kind) => Expression.DbType.Enum<"postgres", Kind>
  readonly set: <Kind extends string>(kind: Kind) => Expression.DbType.Set<"postgres", Kind>
  readonly custom: <Kind extends string>(kind: Kind) => Expression.DbType.Base<"postgres", Kind>
  readonly driverValueMapping: <Db extends Expression.DbType.Any>(
    dbType: Db,
    mapping: Expression.DriverValueMapping
  ) => Db
}

/** Postgres database-type constructors for casts and typed column references. */
export const type: PostgresTypeNamespace = postgresType
