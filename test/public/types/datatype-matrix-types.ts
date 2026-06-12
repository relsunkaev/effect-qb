import { Query } from "effect-qb"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"
import type {
  MysqlSpecificDatatypeKey,
  PortableDatatypeKind,
  PostgresSpecificDatatypeKey,
  SqliteSpecificDatatypeKey
} from "#internal/datatypes/matrix.ts"

type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2)
    ? (<T>() => T extends B ? 1 : 2) extends
        (<T>() => T extends A ? 1 : 2)
      ? true
      : false
    : false

type Assert<T extends true> = T

type FunctionKeys<T> = {
  readonly [K in keyof T]: T[K] extends (...args: readonly any[]) => any ? K : never
}[keyof T] & string

type StandardTypeKeys = FunctionKeys<typeof Query.type>
type PostgresTypeKeys = FunctionKeys<typeof Pg.Type>
type MysqlTypeKeys = FunctionKeys<typeof My.Type>
type SqliteTypeKeys = FunctionKeys<typeof Sq.Type>

type StandardTypeHelpers = "custom" | "driverValueMapping"
type PostgresTypeHelpers =
  | "array"
  | "range"
  | "multirange"
  | "record"
  | "domain"
  | "enum"
  | "custom"
  | "driverValueMapping"
type MysqlTypeHelpers = "enum" | "set" | "custom" | "driverValueMapping"
type SqliteTypeHelpers = "custom" | "driverValueMapping"

type _StandardTypesMatchPortableMatrix = Assert<IsExact<StandardTypeKeys, PortableDatatypeKind | StandardTypeHelpers>>
type _PostgresTypesMatchSpecificMatrix = Assert<IsExact<PostgresTypeKeys, PostgresSpecificDatatypeKey | PostgresTypeHelpers>>
type _MysqlTypesMatchSpecificMatrix = Assert<IsExact<MysqlTypeKeys, MysqlSpecificDatatypeKey | MysqlTypeHelpers>>
type _SqliteTypesMatchSpecificMatrix = Assert<IsExact<SqliteTypeKeys, SqliteSpecificDatatypeKey | SqliteTypeHelpers>>

type _PostgresDoesNotDuplicatePortableTypes = Assert<IsExact<Extract<PostgresTypeKeys, PortableDatatypeKind>, never>>
type _MysqlDoesNotDuplicatePortableTypes = Assert<IsExact<Extract<MysqlTypeKeys, PortableDatatypeKind>, never>>
type _SqliteDoesNotDuplicatePortableTypes = Assert<IsExact<Extract<SqliteTypeKeys, PortableDatatypeKind>, never>>
