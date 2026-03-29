import type * as Schema from "effect/Schema"

import type * as Expression from "../../internal/scalar.js"
import type * as ExpressionAst from "../../internal/expression-ast.js"
import { makeExpression } from "../../internal/query.js"
import { mysqlDatatypes } from "../datatypes/index.js"
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
  "mysql",
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
  runtimeSchema: Schema.Schema<Runtime, any, any>
): TemporalExpression<Runtime, Db, Name> =>
  makeExpression({
    runtime: undefined as unknown as Runtime,
    dbType,
    runtimeSchema,
    nullability: "never",
    dialect: "mysql",
    kind: "scalar",
    dependencies: {},
  }, {
    kind: "function",
    name,
    args: []
  }) as TemporalExpression<Runtime, Db, Name>

/** MySQL current date. */
export const currentDate = () =>
  makeTemporal(
    "current_date",
    mysqlDatatypes.date(),
    LocalDateStringSchema
  )

/** MySQL current time. */
export const currentTime = () =>
  makeTemporal(
    "current_time",
    mysqlDatatypes.time(),
    LocalTimeStringSchema
  )

/** MySQL current timestamp. */
export const currentTimestamp = () =>
  makeTemporal(
    "current_timestamp",
    mysqlDatatypes.timestamp(),
    LocalDateTimeStringSchema
  )

/** MySQL local time. */
export const localTime = () =>
  makeTemporal(
    "localtime",
    mysqlDatatypes.time(),
    LocalTimeStringSchema
  )

/** MySQL local timestamp. */
export const localTimestamp = () =>
  makeTemporal(
    "localtimestamp",
    mysqlDatatypes.timestamp(),
    LocalDateTimeStringSchema
  )

/** MySQL current instant-like timestamp. */
export const now = () =>
  makeTemporal(
    "now",
    mysqlDatatypes.timestamp(),
    LocalDateTimeStringSchema
  )
