import { isDomain } from "../../internal/datatypes/guards.js"
import * as Numeric from "../../internal/dialect-numeric.js"
import * as Expression from "../../internal/scalar.js"
import { mysqlDatatypes } from "../datatypes/index.js"
import { mysqlDatatypeFamilies } from "../datatypes/spec.js"

type MyNumericDb<
  Kind extends "bigint" | "decimal" | "double",
  Runtime extends "number" | "bigintString" | "decimalString"
> = Expression.DbType.Base<"mysql", Kind> & {
  readonly family: "numeric"
  readonly runtime: Runtime
  readonly compareGroup: "numeric"
  readonly castTargets: typeof mysqlDatatypeFamilies.numeric.castTargets
  readonly implicitTargets: readonly []
  readonly traits: { readonly ordered: true }
}

type MyBigInt = MyNumericDb<"bigint", "bigintString">
type MyDecimal = MyNumericDb<"decimal", "decimalString">
type MyDouble = MyNumericDb<"double", "number">

type IsAny<Value> = 0 extends (1 & Value) ? true : false

type BaseDb<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
    ? BaseDb<Base>
    : Db

type MyNumericCategory<Db extends Expression.DbType.Any> =
  BaseDb<Db> extends infer Base extends Expression.DbType.Any
    ? Base["dialect"] extends "standard"
      ? Base["kind"] extends "int" | "integer" | "bigint" ? "integer"
        : Base["kind"] extends "numeric" | "decimal" ? "exact"
          : Base["kind"] extends "real" ? "approximate"
            : never
      : Base["dialect"] extends "mysql"
        ? Base["kind"] extends "tinyint" | "smallint" | "mediumint" | "int" | "integer" | "bigint"
          ? "integer"
          : Base["kind"] extends "decimal" | "dec" | "numeric" | "fixed"
            ? "exact"
            : Base["kind"] extends "float" | "double" | "real"
              ? "approximate"
              : never
        : never
    : never

type NumericInputError<
  Operation extends "modulo" | "round",
  Db extends Expression.DbType.Any
> = {
  readonly __effect_qb_error__: "effect-qb: unsupported mysql numeric input"
  readonly __effect_qb_operation__: Operation
  readonly __effect_qb_db_type__: Db
  readonly __effect_qb_expected__: "an integer, decimal, float, double, or real database type"
  readonly __effect_qb_hint__: "Use Cast.to(...) with a supported Type or My.Type witness"
}

type MyNumericConstraint<
  Value extends Numeric.Input,
  Operation extends "modulo" | "round"
> =
  IsAny<Value> extends true ? unknown
    : Numeric.DialectConstraint<Value, MyDouble, "mysql"> & (
      MyNumericCategory<Numeric.DbTypeOfInput<Value, MyDouble, "mysql">> extends never
        ? NumericInputError<Operation, Numeric.DbTypeOfInput<Value, MyDouble, "mysql">>
        : unknown
    )

type MyResultCategory<
  Left extends Numeric.Input,
  Right extends Numeric.Input
> =
  MyNumericCategory<Numeric.DbTypeOfInput<Left, MyDouble, "mysql">> extends infer LeftCategory
    ? MyNumericCategory<Numeric.DbTypeOfInput<Right, MyDouble, "mysql">> extends infer RightCategory
      ? "approximate" extends LeftCategory | RightCategory ? "approximate"
        : "exact" extends LeftCategory | RightCategory ? "exact"
          : "integer"
      : never
    : never

type MyResultDbForCategory<Category> =
  Category extends "approximate" ? MyDouble
    : Category extends "exact" ? MyDecimal
      : MyBigInt

type MyModuloResultDb<
  Left extends Numeric.Input,
  Right extends Numeric.Input
> = MyResultDbForCategory<MyResultCategory<Left, Right>>

type MyRoundResultDb<Value extends Numeric.Input> =
  MyResultDbForCategory<MyNumericCategory<Numeric.DbTypeOfInput<Value, MyDouble, "mysql">>>

type MyModuloResult<
  Left extends Numeric.Input,
  Right extends Numeric.Input
> = Numeric.BinaryResult<
  Left,
  Right,
  MyDouble,
  MyModuloResultDb<Left, Right>,
  Numeric.ZeroDivisorNullability<Left, Right, MyDouble, "mysql">,
  "mysql"
>

type MyRoundResult<
  Value extends Numeric.Input,
  WithScale extends boolean
> = Numeric.RoundResult<
  Value,
  MyDouble,
  MyRoundResultDb<Value>,
  Value extends Expression.Any ? Expression.NullabilityOf<Value> : "never",
  "mysql",
  WithScale
>

const baseDb = (db: Expression.DbType.Any): Expression.DbType.Any =>
  isDomain(db) ? baseDb(db.base) : db

const category = (value: Numeric.Input): "integer" | "exact" | "approximate" => {
  if (typeof value === "number") return "approximate"
  const db = baseDb(value[Expression.TypeId].dbType)
  if (db.kind === "int" || db.kind === "integer" || db.kind === "bigint" ||
    db.kind === "tinyint" || db.kind === "smallint" || db.kind === "mediumint") {
    return "integer"
  }
  if (db.kind === "numeric" || db.kind === "decimal" || db.kind === "dec" || db.kind === "fixed") {
    return "exact"
  }
  return "approximate"
}

const resultDb = (categoryValue: "integer" | "exact" | "approximate") => {
  if (categoryValue === "integer") return mysqlDatatypes.bigint()
  if (categoryValue === "exact") return mysqlDatatypes.decimal()
  return mysqlDatatypes.double()
}

const mergedCategory = (
  left: Numeric.Input,
  right: Numeric.Input
): "integer" | "exact" | "approximate" => {
  const categories = [category(left), category(right)]
  return categories.includes("approximate")
    ? "approximate"
    : categories.includes("exact") ? "exact" : "integer"
}

export const modulo = <
  Left extends Numeric.Input,
  Right extends Numeric.Input
>(
  left: Left & MyNumericConstraint<NoInfer<Left>, "modulo">,
  right: Right & MyNumericConstraint<NoInfer<Right>, "modulo">
): MyModuloResult<Left, Right> =>
  (Numeric.modulo as any)(left, right, {
    dialect: "mysql",
    literalDb: mysqlDatatypes.double(),
    resultDb: resultDb(mergedCategory(left, right)) as MyModuloResultDb<Left, Right>,
    nullability: Numeric.nullableForZeroDivisor(left, right) as Numeric.ZeroDivisorNullability<Left, Right, MyDouble, "mysql">
  }) as MyModuloResult<Left, Right>

const roundRuntime = (
  value: Numeric.Input,
  scale?: number
): Expression.Any => {
  return Numeric.round(value, scale, {
    dialect: "mysql",
    literalDb: mysqlDatatypes.double(),
    scaleDb: mysqlDatatypes.bigint(),
    resultDb: resultDb(category(value)),
    nullability: typeof value === "number" ? "never" : value[Expression.TypeId].nullability
  }) as Expression.Any
}

export const round: {
  <Value extends Numeric.Input>(
    value: Value & MyNumericConstraint<NoInfer<Value>, "round">
  ): MyRoundResult<Value, false>
  <Value extends Numeric.Input>(
    value: Value & MyNumericConstraint<NoInfer<Value>, "round">,
    scale: number
  ): MyRoundResult<Value, true>
} = roundRuntime as any
