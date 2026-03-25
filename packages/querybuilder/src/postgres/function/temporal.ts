import type * as Schema from "effect/Schema"

import type * as Expression from "../../internal/expression.js"
import type * as ExpressionAst from "../../internal/expression-ast.js"
import { makeExpression } from "../../internal/query.js"
import {
  InstantStringSchema,
  LocalDateStringSchema,
  LocalDateTimeStringSchema,
  LocalTimeStringSchema,
  OffsetTimeStringSchema,
  type InstantString,
  type LocalDateString,
  type LocalDateTimeString,
  type LocalTimeString,
  type OffsetTimeString
} from "../../internal/runtime-value.js"

type TemporalExpression<
  Runtime,
  Db extends Expression.DbType.Any,
  Name extends string
> = Expression.Expression<
  Runtime,
  Db,
  "never",
  "postgres",
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
    dialect: "postgres",
    aggregation: "scalar",
    source: undefined as never,
    dependencies: {},
    sourceNullability: "resolved"
  }, {
    kind: "function",
    name,
    args: []
  }) as TemporalExpression<Runtime, Db, Name>

/** Postgres current instant. */
export const now = () =>
  makeTemporal(
    "now",
    { dialect: "postgres", kind: "timestamptz" } as Expression.DbType.PgTimestamptz,
    InstantStringSchema
  )

/** Postgres current date. */
export const currentDate = () =>
  makeTemporal(
    "current_date",
    { dialect: "postgres", kind: "date" } as Expression.DbType.PgDate,
    LocalDateStringSchema
  )

/** Postgres current time with time zone. */
export const currentTime = () =>
  makeTemporal(
    "current_time",
    { dialect: "postgres", kind: "timetz" } as Expression.DbType.PgTimetz,
    OffsetTimeStringSchema
  )

/** Postgres current timestamp with time zone. */
export const currentTimestamp = () =>
  makeTemporal(
    "current_timestamp",
    { dialect: "postgres", kind: "timestamptz" } as Expression.DbType.PgTimestamptz,
    InstantStringSchema
  )

/** Postgres local time without time zone. */
export const localTime = () =>
  makeTemporal(
    "localtime",
    { dialect: "postgres", kind: "time" } as Expression.DbType.PgTime,
    LocalTimeStringSchema
  )

/** Postgres local timestamp without time zone. */
export const localTimestamp = () =>
  makeTemporal(
    "localtimestamp",
    { dialect: "postgres", kind: "timestamp" } as Expression.DbType.PgTimestamp,
    LocalDateTimeStringSchema
  )
