import type * as Schema from "effect/Schema"

import type * as Expression from "../../internal/scalar.js"
import type * as ExpressionAst from "../../internal/expression-ast.js"
import { makeExpression } from "../../internal/query.js"
import { postgresDatatypes } from "../datatypes/index.js"
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
} from "../../internal/runtime/value.js"

type TemporalExpression<
  Runtime,
  Db extends Expression.DbType.Any,
  Name extends string
> = Expression.Scalar<
  Runtime,
  Db,
  "never",
  "postgres",
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
    dialect: "postgres",
    kind: "scalar",
    dependencies: {},
  }, {
    kind: "function",
    name,
    args: []
  }) as TemporalExpression<Runtime, Db, Name>

/** Postgres current instant. */
export const now = () =>
  makeTemporal(
    "now",
    postgresDatatypes.timestamptz(),
    InstantStringSchema
  )

/** Postgres current date. */
export const currentDate = () =>
  makeTemporal(
    "current_date",
    postgresDatatypes.date(),
    LocalDateStringSchema
  )

/** Postgres current time with time zone. */
export const currentTime = () =>
  makeTemporal(
    "current_time",
    postgresDatatypes.timetz(),
    OffsetTimeStringSchema
  )

/** Postgres current timestamp with time zone. */
export const currentTimestamp = () =>
  makeTemporal(
    "current_timestamp",
    postgresDatatypes.timestamptz(),
    InstantStringSchema
  )

/** Postgres local time without time zone. */
export const localTime = () =>
  makeTemporal(
    "localtime",
    postgresDatatypes.time(),
    LocalTimeStringSchema
  )

/** Postgres local timestamp without time zone. */
export const localTimestamp = () =>
  makeTemporal(
    "localtimestamp",
    postgresDatatypes.timestamp(),
    LocalDateTimeStringSchema
  )
