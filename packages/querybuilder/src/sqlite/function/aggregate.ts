import { isDomain } from "../../internal/datatypes/guards.js"
import * as Numeric from "../../internal/dialect-numeric.js"
import * as Expression from "../../internal/scalar.js"
import { sqliteDatatypes } from "../datatypes/index.js"

export { count, max, min } from "../internal/dsl.js"

type SqInteger = ReturnType<typeof sqliteDatatypes.integer>
type SqBigInt = ReturnType<typeof sqliteDatatypes.bigint>
type SqDouble = ReturnType<typeof sqliteDatatypes.double>

type IsAny<Value> = 0 extends (1 & Value) ? true : false

type BaseDb<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
    ? BaseDb<Base>
    : Db

type SqAggregateCategory<Db extends Expression.DbType.Any> =
  BaseDb<Db> extends infer Base extends Expression.DbType.Any
    ? Base["dialect"] extends "standard" | "sqlite"
      ? Base["kind"] extends "int" | "integer" ? "integer"
        : Base["kind"] extends "bigint" ? "bigint"
          : Base["kind"] extends "numeric" | "decimal" | "real" | "double"
            ? "approximate"
            : never
      : never
    : never

type AggregateInputError<
  Operation extends "sum" | "avg",
  Db extends Expression.DbType.Any
> = {
  readonly __effect_qb_error__: "effect-qb: unsupported sqlite aggregate input"
  readonly __effect_qb_operation__: Operation
  readonly __effect_qb_db_type__: Db
  readonly __effect_qb_expected__: "an integer, numeric, decimal, real, or double database type"
  readonly __effect_qb_hint__: "Use Cast.to(...) with a supported Type or Sq.Type witness"
}

type SqAggregateConstraint<
  Value extends Numeric.Input,
  Operation extends "sum" | "avg"
> = IsAny<Value> extends true ? unknown
  : Numeric.DialectConstraint<Value, SqDouble, "sqlite"> & (
    SqAggregateCategory<Numeric.DbTypeOfInput<Value, SqDouble, "sqlite">> extends never
      ? AggregateInputError<
          Operation,
          Numeric.DbTypeOfInput<Value, SqDouble, "sqlite">
        >
      : unknown
  )

type SqSumResultDb<Value extends Numeric.Input> =
  SqAggregateCategory<Numeric.DbTypeOfInput<Value, SqDouble, "sqlite">> extends "integer"
    ? SqInteger
    : SqAggregateCategory<Numeric.DbTypeOfInput<Value, SqDouble, "sqlite">> extends "bigint"
      ? SqBigInt
      : SqDouble

const baseDb = (db: Expression.DbType.Any): Expression.DbType.Any =>
  isDomain(db) ? baseDb(db.base) : db

const sumResultDb = (value: Numeric.Input): SqInteger | SqBigInt | SqDouble => {
  if (typeof value === "number") return sqliteDatatypes.double()
  const db = baseDb(value[Expression.TypeId].dbType)
  if (db.kind === "int" || db.kind === "integer") {
    return sqliteDatatypes.integer()
  }
  if (db.kind === "bigint") {
    return sqliteDatatypes.bigint()
  }
  return sqliteDatatypes.double()
}

export const sum = <Value extends Numeric.Input>(
  value: Value & SqAggregateConstraint<NoInfer<Value>, "sum">
): Numeric.AggregateResult<"sum", Value, SqDouble, SqSumResultDb<Value>, "sqlite"> =>
  (Numeric.aggregate as any)("sum", value, {
    dialect: "sqlite",
    literalDb: sqliteDatatypes.double(),
    resultDb: sumResultDb(value)
  })

export const avg = <Value extends Numeric.Input>(
  value: Value & SqAggregateConstraint<NoInfer<Value>, "avg">
): Numeric.AggregateResult<"avg", Value, SqDouble, SqDouble, "sqlite"> =>
  (Numeric.aggregate as any)("avg", value, {
    dialect: "sqlite",
    literalDb: sqliteDatatypes.double(),
    resultDb: sqliteDatatypes.double()
  })
