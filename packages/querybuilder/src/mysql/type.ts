import type * as Expression from "../internal/scalar.js"
import type { NonEmptyStringInput } from "../internal/table-options.js"
import {
  mysqlSpecificDatatypeKeys,
  pickDatatypeConstructors,
  type MysqlSpecificDatatypeKey
} from "../internal/datatypes/matrix.js"
import { mysqlDatatypes } from "./datatypes/index.js"

type MysqlSpecificDatatypes = Pick<typeof mysqlDatatypes, MysqlSpecificDatatypeKey>

type MysqlTypeNamespace = MysqlSpecificDatatypes & {
  readonly enum: <Kind extends string>(kind: NonEmptyStringInput<Kind>) => Expression.DbType.Enum<"mysql", Kind>
  readonly set: <Kind extends string>(kind: NonEmptyStringInput<Kind>) => Expression.DbType.Set<"mysql", Kind>
  readonly custom: <Kind extends string>(kind: NonEmptyStringInput<Kind>) => Expression.DbType.Base<"mysql", Kind>
  readonly driverValueMapping: <Db extends Expression.DbType.Any>(
    dbType: Db,
    mapping: Expression.DriverValueMapping
  ) => Db
}

const enum_ = <Kind extends string>(
  kind: NonEmptyStringInput<Kind>
): Expression.DbType.Enum<"mysql", Kind> => ({
  dialect: "mysql",
  kind: kind as Kind,
  variant: "enum"
})

const set = <Kind extends string>(
  kind: NonEmptyStringInput<Kind>
): Expression.DbType.Set<"mysql", Kind> => ({
  dialect: "mysql",
  kind: kind as Kind,
  variant: "set"
})

const custom = <Kind extends string>(
  kind: NonEmptyStringInput<Kind>
): Expression.DbType.Base<"mysql", Kind> => ({
  dialect: "mysql",
  kind: kind as Kind
})

const driverValueMapping = <Db extends Expression.DbType.Any>(
  dbType: Db,
  mapping: Expression.DriverValueMapping
): Db => ({
  ...dbType,
  driverValueMapping: mapping
})

/** MySQL-only database-type constructors for casts and typed column references. */
export const type: MysqlTypeNamespace = {
  ...pickDatatypeConstructors(mysqlDatatypes, mysqlSpecificDatatypeKeys),
  enum: enum_,
  set,
  custom,
  driverValueMapping
}
