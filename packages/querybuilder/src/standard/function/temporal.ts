import type * as Schema from "effect/Schema"

import type * as Expression from "../../internal/scalar.js"
import type * as ExpressionAst from "../../internal/expression-ast.js"
import { makeExpression } from "../../internal/query.js"
import {
  InstantStringSchema,
  LocalDateStringSchema,
  LocalDateTimeStringSchema,
  LocalTimeStringSchema,
  type InstantString,
  type LocalDateString,
  type LocalDateTimeString,
  type LocalTimeString
} from "../../internal/runtime/value.js"
import { standardDatatypes } from "../datatypes/index.js"

type TemporalExpression<
  Runtime,
  Db extends Expression.DbType.Any,
  Name extends string
> = Expression.Scalar<
  Runtime,
  Db,
  "never",
  "standard",
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
    dialect: "standard",
    kind: "scalar",
    dependencies: {}
  }, {
    kind: "function",
    name,
    args: []
  }) as TemporalExpression<Runtime, Db, Name>

/** Standard current instant. */
export const now = (): TemporalExpression<InstantString, ReturnType<typeof standardDatatypes.timestamp>, "now"> =>
  makeTemporal("now", standardDatatypes.timestamp(), InstantStringSchema)

/** Standard current date. */
export const currentDate = (): TemporalExpression<LocalDateString, ReturnType<typeof standardDatatypes.date>, "current_date"> =>
  makeTemporal("current_date", standardDatatypes.date(), LocalDateStringSchema)

/** Standard current time. */
export const currentTime = (): TemporalExpression<LocalTimeString, ReturnType<typeof standardDatatypes.time>, "current_time"> =>
  makeTemporal("current_time", standardDatatypes.time(), LocalTimeStringSchema)

/** Standard current timestamp. */
export const currentTimestamp = (): TemporalExpression<LocalDateTimeString, ReturnType<typeof standardDatatypes.timestamp>, "current_timestamp"> =>
  makeTemporal("current_timestamp", standardDatatypes.timestamp(), LocalDateTimeStringSchema)

/** Standard local time. */
export const localTime = (): TemporalExpression<LocalTimeString, ReturnType<typeof standardDatatypes.time>, "localtime"> =>
  makeTemporal("localtime", standardDatatypes.time(), LocalTimeStringSchema)

/** Standard local timestamp. */
export const localTimestamp = (): TemporalExpression<LocalDateTimeString, ReturnType<typeof standardDatatypes.timestamp>, "localtimestamp"> =>
  makeTemporal("localtimestamp", standardDatatypes.timestamp(), LocalDateTimeStringSchema)
