import type * as Schema from "effect/Schema"

import type * as Expression from "../../internal/scalar.js"
import type * as ExpressionAst from "../../internal/expression-ast.js"
import { makeExpression } from "../../internal/query.js"
import { sqliteDatatypes } from "../datatypes/index.js"
import {
  LocalDateStringSchema,
  LocalDateTimeStringSchema,
  LocalTimeStringSchema,
  type LocalDateString,
  type LocalDateTimeString,
  type LocalTimeString
} from "../../internal/runtime/value.js"

type TemporalExpression<
  Runtime,
  Db extends Expression.DbType.Any,
  Name extends string
> = Expression.Scalar<
  Runtime,
  Db,
  "never",
  "sqlite",
  "scalar",
  never
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.FunctionCallNode<Name, readonly []>
}

const makeTemporal = <
  Runtime,
  Db extends Expression.DbType.Any,
  Name extends string
>(
  name: Name,
  dbType: Db,
  runtimeSchema: Schema.Schema<Runtime>
): TemporalExpression<Runtime, Db, Name> =>
  makeExpression({
    runtime: undefined as unknown as Runtime,
    dbType,
    runtimeSchema,
    nullability: "never",
    dialect: "sqlite",
    kind: "scalar",
    dependencies: {},
  }, {
    kind: "function",
    name,
    args: []
  }) as TemporalExpression<Runtime, Db, Name>

/** SQLite current date. */
export const currentDate = () =>
  makeTemporal(
    "current_date",
    sqliteDatatypes.date(),
    LocalDateStringSchema
  )

/** SQLite current time. */
export const currentTime = () =>
  makeTemporal(
    "current_time",
    sqliteDatatypes.time(),
    LocalTimeStringSchema
  )

/** SQLite current timestamp. */
export const currentTimestamp = () =>
  makeTemporal(
    "current_timestamp",
    sqliteDatatypes.timestamp(),
    LocalDateTimeStringSchema
  )

/** SQLite local time. */
export const localTime = () =>
  makeTemporal(
    "localtime",
    sqliteDatatypes.time(),
    LocalTimeStringSchema
  )

/** SQLite local timestamp. */
export const localTimestamp = () =>
  makeTemporal(
    "localtimestamp",
    sqliteDatatypes.timestamp(),
    LocalDateTimeStringSchema
  )

/** SQLite current instant-like timestamp. */
export const now = () =>
  makeTemporal(
    "now",
    sqliteDatatypes.timestamp(),
    LocalDateTimeStringSchema
  )
