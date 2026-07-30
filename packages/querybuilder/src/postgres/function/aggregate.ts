import * as Numeric from "../../internal/dialect-numeric.js"
import * as Expression from "../../internal/scalar.js"
import { postgresDatatypes } from "../datatypes/index.js"

export { count, max, min } from "../internal/dsl.js"

type PgInt8 = ReturnType<typeof postgresDatatypes.int8>
type PgNumeric = ReturnType<typeof postgresDatatypes.numeric>
type PgFloat4 = ReturnType<typeof postgresDatatypes.float4>
type PgFloat8 = ReturnType<typeof postgresDatatypes.float8>

type IsAny<Value> = 0 extends (1 & Value) ? true : false

type BaseDb<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
    ? BaseDb<Base>
    : Db

type PgAggregateCategory<Db extends Expression.DbType.Any> =
  BaseDb<Db> extends infer Base extends Expression.DbType.Any
    ? Base["dialect"] extends "standard"
      ? Base["kind"] extends "int" | "integer" ? "int4"
        : Base["kind"] extends "bigint" ? "int8"
          : Base["kind"] extends "numeric" | "decimal" ? "numeric"
            : Base["kind"] extends "real" ? "float4"
              : never
      : Base["dialect"] extends "postgres"
        ? Base["kind"] extends "int2" | "int4" | "int8" | "numeric" | "float4" | "float8"
          ? Base["kind"]
          : never
        : never
    : never

type AggregateInputError<
  Operation extends "sum" | "avg",
  Db extends Expression.DbType.Any
> = {
  readonly __effect_qb_error__: "effect-qb: unsupported postgres aggregate input"
  readonly __effect_qb_operation__: Operation
  readonly __effect_qb_db_type__: Db
  readonly __effect_qb_expected__: "smallint, integer, bigint, numeric, real, or double precision"
  readonly __effect_qb_hint__: "Use Cast.to(...) with a supported Type or Pg.Type witness"
}

type PgAggregateConstraint<
  Value extends Numeric.Input,
  Operation extends "sum" | "avg"
> = IsAny<Value> extends true ? unknown
  : Numeric.DialectConstraint<Value, PgFloat8, "postgres"> & (
    PgAggregateCategory<Numeric.DbTypeOfInput<Value, PgFloat8, "postgres">> extends never
      ? AggregateInputError<
          Operation,
          Numeric.DbTypeOfInput<Value, PgFloat8, "postgres">
        >
      : unknown
  )

type PgSumResultDb<Value extends Numeric.Input> =
  PgAggregateCategory<Numeric.DbTypeOfInput<Value, PgFloat8, "postgres">> extends "int2" | "int4"
    ? PgInt8
    : PgAggregateCategory<Numeric.DbTypeOfInput<Value, PgFloat8, "postgres">> extends "int8" | "numeric"
      ? PgNumeric
      : PgAggregateCategory<Numeric.DbTypeOfInput<Value, PgFloat8, "postgres">> extends "float4"
        ? PgFloat4
        : PgFloat8

type PgAvgResultDb<Value extends Numeric.Input> =
  PgAggregateCategory<Numeric.DbTypeOfInput<Value, PgFloat8, "postgres">> extends "float4" | "float8"
    ? PgFloat8
    : PgNumeric

const baseDb = (db: Expression.DbType.Any): Expression.DbType.Any =>
  "base" in db ? baseDb(db.base) : db

const category = (
  value: Numeric.Input
): "int2" | "int4" | "int8" | "numeric" | "float4" | "float8" => {
  if (typeof value === "number") return "float8"
  const db = baseDb(value[Expression.TypeId].dbType)
  if (db.dialect === "standard") {
    if (db.kind === "int" || db.kind === "integer") return "int4"
    if (db.kind === "bigint") return "int8"
    if (db.kind === "numeric" || db.kind === "decimal") return "numeric"
    return "float4"
  }
  return db.kind as "int2" | "int4" | "int8" | "numeric" | "float4" | "float8"
}

const sumResultDb = (value: Numeric.Input) => {
  const valueCategory = category(value)
  if (valueCategory === "int2" || valueCategory === "int4") {
    return postgresDatatypes.int8()
  }
  if (valueCategory === "int8" || valueCategory === "numeric") {
    return postgresDatatypes.numeric()
  }
  return valueCategory === "float4"
    ? postgresDatatypes.float4()
    : postgresDatatypes.float8()
}

const avgResultDb = (value: Numeric.Input) => {
  const valueCategory = category(value)
  return valueCategory === "float4" || valueCategory === "float8"
    ? postgresDatatypes.float8()
    : postgresDatatypes.numeric()
}

export const sum = <Value extends Numeric.Input>(
  value: Value & PgAggregateConstraint<NoInfer<Value>, "sum">
): Numeric.AggregateResult<"sum", Value, PgFloat8, PgSumResultDb<Value>, "postgres"> =>
  (Numeric.aggregate as any)("sum", value, {
    dialect: "postgres",
    literalDb: postgresDatatypes.float8(),
    resultDb: sumResultDb(value)
  })

export const avg = <Value extends Numeric.Input>(
  value: Value & PgAggregateConstraint<NoInfer<Value>, "avg">
): Numeric.AggregateResult<"avg", Value, PgFloat8, PgAvgResultDb<Value>, "postgres"> =>
  (Numeric.aggregate as any)("avg", value, {
    dialect: "postgres",
    literalDb: postgresDatatypes.float8(),
    resultDb: avgResultDb(value)
  })
