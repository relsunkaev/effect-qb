import { isDomain } from "../../internal/datatypes/guards.js"
import * as Numeric from "../../internal/dialect-numeric.js"
import * as Expression from "../../internal/scalar.js"
import { sqliteDatatypes } from "../datatypes/index.js"

type SqInteger = ReturnType<typeof sqliteDatatypes.integer>
type SqBigInt = ReturnType<typeof sqliteDatatypes.bigint>
type SqDouble = ReturnType<typeof sqliteDatatypes.double>

type IsAny<Value> = 0 extends (1 & Value) ? true : false

type BaseDb<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
    ? BaseDb<Base>
    : Db

type SqNumericCategory<Db extends Expression.DbType.Any> =
  BaseDb<Db> extends infer Base extends Expression.DbType.Any
    ? Base["dialect"] extends "standard" | "sqlite"
      ? Base["kind"] extends "int" | "integer" ? "integer"
        : Base["kind"] extends "bigint" ? "bigint"
          : Base["kind"] extends "numeric" | "decimal" ? "exact"
            : Base["kind"] extends "real" | "double" ? "approximate"
              : never
      : never
    : never

type NumericInputError<
  Operation extends "modulo" | "round",
  Db extends Expression.DbType.Any
> = {
  readonly __effect_qb_error__: "effect-qb: unsupported sqlite numeric input"
  readonly __effect_qb_operation__: Operation
  readonly __effect_qb_db_type__: Db
  readonly __effect_qb_expected__: "an integer, numeric, decimal, real, or double database type"
  readonly __effect_qb_hint__: "Use Cast.to(...) with a supported Type or Sq.Type witness"
}

type SqNumericConstraint<
  Value extends Numeric.Input,
  Operation extends "modulo" | "round"
> =
  IsAny<Value> extends true ? unknown
    : Numeric.DialectConstraint<Value, SqDouble, "sqlite"> & (
      SqNumericCategory<Numeric.DbTypeOfInput<Value, SqDouble, "sqlite">> extends never
        ? NumericInputError<Operation, Numeric.DbTypeOfInput<Value, SqDouble, "sqlite">>
        : unknown
    )

type SqModuloResultDb<
  Left extends Numeric.Input,
  Right extends Numeric.Input
> =
  SqNumericCategory<Numeric.DbTypeOfInput<Left, SqDouble, "sqlite">> extends infer LeftCategory
    ? SqNumericCategory<Numeric.DbTypeOfInput<Right, SqDouble, "sqlite">> extends infer RightCategory
      ? Exclude<LeftCategory | RightCategory, "integer" | "bigint"> extends never
        ? "bigint" extends LeftCategory | RightCategory ? SqBigInt : SqInteger
        : SqDouble
      : never
    : never

type SqModuloResult<
  Left extends Numeric.Input,
  Right extends Numeric.Input
> = Numeric.BinaryResult<
  Left,
  Right,
  SqDouble,
  SqModuloResultDb<Left, Right>,
  Numeric.ZeroDivisorNullability<Left, Right, SqDouble, "sqlite">,
  "sqlite"
>

type SqRoundResult<
  Value extends Numeric.Input,
  WithScale extends boolean
> = Numeric.RoundResult<
  Value,
  SqDouble,
  SqDouble,
  Value extends Expression.Any ? Expression.NullabilityOf<Value> : "never",
  "sqlite",
  WithScale
>

const baseDb = (db: Expression.DbType.Any): Expression.DbType.Any =>
  isDomain(db) ? baseDb(db.base) : db

const category = (value: Numeric.Input): "integer" | "bigint" | "exact" | "approximate" => {
  if (typeof value === "number") return "approximate"
  const db = baseDb(value[Expression.TypeId].dbType)
  if (db.kind === "int" || db.kind === "integer") return "integer"
  if (db.kind === "bigint") return "bigint"
  if (db.kind === "numeric" || db.kind === "decimal") return "exact"
  return "approximate"
}

const moduloResultDb = (left: Numeric.Input, right: Numeric.Input) => {
  const categories = [category(left), category(right)]
  if (categories.every((value) => value === "integer" || value === "bigint")) {
    return categories.includes("bigint")
      ? sqliteDatatypes.bigint()
      : sqliteDatatypes.integer()
  }
  return sqliteDatatypes.double()
}

export const modulo = <
  Left extends Numeric.Input,
  Right extends Numeric.Input
>(
  left: Left & SqNumericConstraint<NoInfer<Left>, "modulo">,
  right: Right & SqNumericConstraint<NoInfer<Right>, "modulo">
): SqModuloResult<Left, Right> =>
  (Numeric.modulo as any)(left, right, {
    dialect: "sqlite",
    literalDb: sqliteDatatypes.double(),
    resultDb: moduloResultDb(left, right) as SqModuloResultDb<Left, Right>,
    nullability: Numeric.nullableForZeroDivisor(left, right) as Numeric.ZeroDivisorNullability<Left, Right, SqDouble, "sqlite">
  }) as SqModuloResult<Left, Right>

export function round<Value extends Numeric.Input>(
  value: Value & SqNumericConstraint<NoInfer<Value>, "round">
): SqRoundResult<Value, false>
export function round<Value extends Numeric.Input>(
  value: Value & SqNumericConstraint<NoInfer<Value>, "round">,
  scale: number
): SqRoundResult<Value, true>
export function round(
  value: Numeric.Input,
  scale?: number
): SqRoundResult<Numeric.Input, boolean> {
  return Numeric.round(value, scale, {
    dialect: "sqlite",
    literalDb: sqliteDatatypes.double(),
    scaleDb: sqliteDatatypes.integer(),
    resultDb: sqliteDatatypes.double(),
    nullability: typeof value === "number" ? "never" : value[Expression.TypeId].nullability
  }) as SqRoundResult<Numeric.Input, boolean>
}
