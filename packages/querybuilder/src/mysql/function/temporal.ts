import type * as Schema from "effect/Schema"

import type * as Expression from "../../internal/expression.js"
import type * as ExpressionAst from "../../internal/expression-ast.js"
import { makeExpression } from "../../internal/query.js"
import {
  LocalDateStringSchema,
  LocalDateTimeStringSchema,
  LocalTimeStringSchema,
  type LocalDateString,
  type LocalDateTimeString,
  type LocalTimeString
} from "../../internal/runtime-value.js"

type TemporalExpression<
  Runtime,
  Db extends Expression.DbType.Any,
  Name extends string
> = Expression.Expression<
  Runtime,
  Db,
  "never",
  "mysql",
  "scalar",
  never,
  {},
  "resolved"
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
    aggregation: "scalar",
    source: undefined as never,
    dependencies: {},
    sourceNullability: "resolved"
  }, {
    kind: "function",
    name,
    args: []
  }) as TemporalExpression<Runtime, Db, Name>

/** MySQL current date. */
export const currentDate = () =>
  makeTemporal(
    "current_date",
    { dialect: "mysql", kind: "date" } as Expression.DbType.MySqlDate,
    LocalDateStringSchema
  )

/** MySQL current time. */
export const currentTime = () =>
  makeTemporal(
    "current_time",
    { dialect: "mysql", kind: "time" } as Expression.DbType.MySqlTime,
    LocalTimeStringSchema
  )

/** MySQL current timestamp. */
export const currentTimestamp = () =>
  makeTemporal(
    "current_timestamp",
    { dialect: "mysql", kind: "timestamp" } as Expression.DbType.MySqlTimestamp,
    LocalDateTimeStringSchema
  )

/** MySQL local time. */
export const localTime = () =>
  makeTemporal(
    "localtime",
    { dialect: "mysql", kind: "time" } as Expression.DbType.MySqlTime,
    LocalTimeStringSchema
  )

/** MySQL local timestamp. */
export const localTimestamp = () =>
  makeTemporal(
    "localtimestamp",
    { dialect: "mysql", kind: "timestamp" } as Expression.DbType.MySqlTimestamp,
    LocalDateTimeStringSchema
  )

/** MySQL current instant-like timestamp. */
export const now = () =>
  makeTemporal(
    "now",
    { dialect: "mysql", kind: "timestamp" } as Expression.DbType.MySqlTimestamp,
    LocalDateTimeStringSchema
  )
