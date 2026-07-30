import * as Numeric from "../../internal/dialect-numeric.js"
import * as Expression from "../../internal/scalar.js"
import { mysqlDatatypes } from "../datatypes/index.js"

export { count, max, min } from "../internal/dsl.js"

type MyDecimal = ReturnType<typeof mysqlDatatypes.decimal>
type MyDouble = ReturnType<typeof mysqlDatatypes.double>

type IsAny<Value> = 0 extends (1 & Value) ? true : false

type BaseDb<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
    ? BaseDb<Base>
    : Db

type MyAggregateCategory<Db extends Expression.DbType.Any> =
  BaseDb<Db> extends infer Base extends Expression.DbType.Any
    ? Base["dialect"] extends "standard"
      ? Base["kind"] extends "int" | "integer" | "bigint" | "numeric" | "decimal"
        ? "exact"
        : Base["kind"] extends "real" ? "approximate" : never
      : Base["dialect"] extends "mysql"
        ? Base["kind"] extends "tinyint" | "smallint" | "mediumint" | "int" | "integer" | "bigint" |
          "decimal" | "dec" | "numeric" | "fixed"
          ? "exact"
          : Base["kind"] extends "float" | "double" | "real" ? "approximate" : never
        : never
    : never

type AggregateInputError<
  Operation extends "sum" | "avg",
  Db extends Expression.DbType.Any
> = {
  readonly __effect_qb_error__: "effect-qb: unsupported mysql aggregate input"
  readonly __effect_qb_operation__: Operation
  readonly __effect_qb_db_type__: Db
  readonly __effect_qb_expected__: "an integer, decimal, float, double, or real database type"
  readonly __effect_qb_hint__: "Use Cast.to(...) with a supported Type or My.Type witness"
}

type MyAggregateConstraint<
  Value extends Numeric.Input,
  Operation extends "sum" | "avg"
> = IsAny<Value> extends true ? unknown
  : Numeric.DialectConstraint<Value, MyDouble, "mysql"> & (
    MyAggregateCategory<Numeric.DbTypeOfInput<Value, MyDouble, "mysql">> extends never
      ? AggregateInputError<
          Operation,
          Numeric.DbTypeOfInput<Value, MyDouble, "mysql">
        >
      : unknown
  )

type MyAggregateResultDb<Value extends Numeric.Input> =
  MyAggregateCategory<Numeric.DbTypeOfInput<Value, MyDouble, "mysql">> extends "exact"
    ? MyDecimal
    : MyDouble

const baseDb = (db: Expression.DbType.Any): Expression.DbType.Any =>
  "base" in db ? baseDb(db.base) : db

const resultDb = (value: Numeric.Input): MyDecimal | MyDouble => {
  if (typeof value === "number") return mysqlDatatypes.double()
  const db = baseDb(value[Expression.TypeId].dbType)
  const approximate = db.kind === "real" || db.kind === "float" || db.kind === "double"
  return approximate
    ? mysqlDatatypes.double()
    : mysqlDatatypes.decimal()
}

export const sum = <Value extends Numeric.Input>(
  value: Value & MyAggregateConstraint<NoInfer<Value>, "sum">
): Numeric.AggregateResult<"sum", Value, MyDouble, MyAggregateResultDb<Value>, "mysql"> =>
  (Numeric.aggregate as any)("sum", value, {
    dialect: "mysql",
    literalDb: mysqlDatatypes.double(),
    resultDb: resultDb(value)
  })

export const avg = <Value extends Numeric.Input>(
  value: Value & MyAggregateConstraint<NoInfer<Value>, "avg">
): Numeric.AggregateResult<"avg", Value, MyDouble, MyAggregateResultDb<Value>, "mysql"> =>
  (Numeric.aggregate as any)("avg", value, {
    dialect: "mysql",
    literalDb: mysqlDatatypes.double(),
    resultDb: resultDb(value)
  })
