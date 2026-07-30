import * as Numeric from "../../internal/dialect-numeric.js"
import * as Expression from "../../internal/scalar.js"
import { postgresDatatypes, postgresDatatypeFamilies } from "../datatypes/index.js"

type PgNumericDb<
  Kind extends "int2" | "int4" | "int8" | "numeric" | "float8",
  Runtime extends "number" | "bigintString" | "decimalString"
> = Expression.DbType.Base<"postgres", Kind> & {
  readonly family: "numeric"
  readonly runtime: Runtime
  readonly compareGroup: "numeric"
  readonly castTargets: typeof postgresDatatypeFamilies.numeric.castTargets
  readonly implicitTargets: readonly []
  readonly traits: { readonly ordered: true }
}

type PgInt2 = PgNumericDb<"int2", "number">
type PgInt4 = PgNumericDb<"int4", "number">
type PgInt8 = PgNumericDb<"int8", "bigintString">
type PgNumeric = PgNumericDb<"numeric", "decimalString">
type PgFloat8 = PgNumericDb<"float8", "number">

type IsAny<Value> = 0 extends (1 & Value) ? true : false

type BaseDb<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
    ? BaseDb<Base>
    : Db

type PgModuloCategory<Db extends Expression.DbType.Any> =
  BaseDb<Db> extends infer Base extends Expression.DbType.Any
    ? Base["dialect"] extends "standard"
      ? Base["kind"] extends "int" | "integer" ? "int4"
        : Base["kind"] extends "bigint" ? "int8"
          : Base["kind"] extends "numeric" | "decimal" ? "numeric"
            : never
      : Base["dialect"] extends "postgres"
        ? Base["kind"] extends "int2" | "int4" | "int8" | "numeric"
          ? Base["kind"]
          : never
        : never
    : never

type PgRoundCategory<Db extends Expression.DbType.Any> =
  BaseDb<Db> extends infer Base extends Expression.DbType.Any
    ? Base["dialect"] extends "standard"
      ? Base["kind"] extends "numeric" | "decimal" ? "exact"
        : Base["kind"] extends "int" | "integer" | "bigint" ? "integer"
          : Base["kind"] extends "real" ? "approximate"
            : never
      : Base["dialect"] extends "postgres"
        ? Base["kind"] extends "numeric" ? "exact"
          : Base["kind"] extends "int2" | "int4" | "int8" ? "integer"
            : Base["kind"] extends "float4" | "float8" ? "approximate"
              : never
        : never
    : never

type NumericInputError<
  Operation extends "modulo" | "round",
  Db extends Expression.DbType.Any,
  Expected extends string
> = {
  readonly __effect_qb_error__: "effect-qb: unsupported postgres numeric input"
  readonly __effect_qb_operation__: Operation
  readonly __effect_qb_db_type__: Db
  readonly __effect_qb_expected__: Expected
  readonly __effect_qb_hint__: "Use Cast.to(...) with a supported Type or Pg.Type witness"
}

type IntegerLiteralError<Value extends number> = {
  readonly __effect_qb_error__: "effect-qb: postgres modulo number literals must be integers"
  readonly __effect_qb_value__: Value
  readonly __effect_qb_hint__: "Use Cast.to(value, Type.numeric()) for exact fractional modulo"
}

type PgModuloConstraint<Value extends Numeric.Input> =
  IsAny<Value> extends true ? unknown
    : Numeric.DialectConstraint<Value, PgInt4, "postgres"> & (
      Value extends number
        ? number extends Value
          ? IntegerLiteralError<Value>
          : `${Value}` extends `${bigint}` ? unknown : IntegerLiteralError<Value>
        : PgModuloCategory<Numeric.DbTypeOfInput<Value, PgInt4, "postgres">> extends never
          ? NumericInputError<
              "modulo",
              Numeric.DbTypeOfInput<Value, PgInt4, "postgres">,
              "smallint, integer, bigint, or numeric"
            >
          : unknown
    )

type PgRoundConstraint<Value extends Numeric.Input> =
  IsAny<Value> extends true ? unknown
    : Numeric.DialectConstraint<Value, PgFloat8, "postgres"> & (
      PgRoundCategory<Numeric.DbTypeOfInput<Value, PgFloat8, "postgres">> extends never
        ? NumericInputError<
            "round",
            Numeric.DbTypeOfInput<Value, PgFloat8, "postgres">,
            "smallint, integer, bigint, numeric, real, or double precision"
          >
        : unknown
    )

type PgScaledRoundConstraint<Value extends Numeric.Input> =
  PgRoundConstraint<Value> &
    (PgRoundCategory<Numeric.DbTypeOfInput<Value, PgFloat8, "postgres">> extends "approximate"
      ? NumericInputError<
          "round",
          Numeric.DbTypeOfInput<Value, PgFloat8, "postgres">,
          "numeric or integer when a scale is provided"
        >
      : unknown)

type PgModuloResultCategory<
  Left extends Numeric.Input,
  Right extends Numeric.Input
> =
  PgModuloCategory<Numeric.DbTypeOfInput<Left, PgInt4, "postgres">> extends infer LeftCategory
    ? PgModuloCategory<Numeric.DbTypeOfInput<Right, PgInt4, "postgres">> extends infer RightCategory
      ? "numeric" extends LeftCategory | RightCategory ? "numeric"
        : "int8" extends LeftCategory | RightCategory ? "int8"
          : "int4" extends LeftCategory | RightCategory ? "int4"
            : "int2"
      : never
    : never

type PgModuloResultDb<
  Left extends Numeric.Input,
  Right extends Numeric.Input
> = PgModuloResultCategory<Left, Right> extends "numeric" ? PgNumeric
  : PgModuloResultCategory<Left, Right> extends "int8" ? PgInt8
    : PgModuloResultCategory<Left, Right> extends "int4" ? PgInt4
      : PgInt2

type PgRoundResultDb<Value extends Numeric.Input> =
  PgRoundCategory<Numeric.DbTypeOfInput<Value, PgFloat8, "postgres">> extends "exact"
    ? PgNumeric
    : PgFloat8

type PgModuloResult<
  Left extends Numeric.Input,
  Right extends Numeric.Input
> = Numeric.BinaryResult<
  Left,
  Right,
  PgInt4,
  PgModuloResultDb<Left, Right>,
  Numeric.BinaryNullability<Left, Right, PgInt4, "postgres">,
  "postgres"
>

type PgRoundResult<
  Value extends Numeric.Input,
  ResultDb extends Expression.DbType.Any,
  WithScale extends boolean
> = Numeric.RoundResult<
  Value,
  PgFloat8,
  ResultDb,
  Value extends Expression.Any ? Expression.NullabilityOf<Value> : "never",
  "postgres",
  WithScale
>

const baseDb = (db: Expression.DbType.Any): Expression.DbType.Any =>
  "base" in db ? baseDb(db.base) : db

const moduloCategory = (value: Numeric.Input): "int2" | "int4" | "int8" | "numeric" => {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) {
      throw new Error("postgres modulo number literals must fit a signed int4")
    }
    return "int4"
  }
  const db = baseDb(value[Expression.TypeId].dbType)
  if (db.dialect === "standard") {
    if (db.kind === "bigint") return "int8"
    if (db.kind === "numeric" || db.kind === "decimal") return "numeric"
    return "int4"
  }
  return db.kind as "int2" | "int4" | "int8" | "numeric"
}

const moduloResultDb = (left: Numeric.Input, right: Numeric.Input) => {
  const categories = [moduloCategory(left), moduloCategory(right)]
  if (categories.includes("numeric")) return postgresDatatypes.numeric()
  if (categories.includes("int8")) return postgresDatatypes.int8()
  if (categories.includes("int4")) return postgresDatatypes.int4()
  return postgresDatatypes.int2()
}

const roundCategory = (value: Numeric.Input): "exact" | "integer" | "approximate" => {
  if (typeof value === "number") return "approximate"
  const db = baseDb(value[Expression.TypeId].dbType)
  if (db.kind === "numeric" || db.kind === "decimal") return "exact"
  if (db.kind === "int" || db.kind === "integer" || db.kind === "bigint" ||
    db.kind === "int2" || db.kind === "int4" || db.kind === "int8") {
    return "integer"
  }
  return "approximate"
}

export const modulo = <
  Left extends Numeric.Input,
  Right extends Numeric.Input
>(
  left: Left & PgModuloConstraint<NoInfer<Left>>,
  right: Right & PgModuloConstraint<NoInfer<Right>>
): PgModuloResult<Left, Right> =>
  (Numeric.modulo as any)(left, right, {
    dialect: "postgres",
    literalDb: postgresDatatypes.int4(),
    resultDb: moduloResultDb(left, right) as PgModuloResultDb<Left, Right>,
    nullability: Numeric.binaryInputNullability(left, right) as Numeric.BinaryNullability<Left, Right, PgInt4, "postgres">
  }) as PgModuloResult<Left, Right>

const roundRuntime = (
  value: Numeric.Input,
  scale?: number
): Expression.Any => {
  const category = roundCategory(value)
  if (scale !== undefined && category === "approximate") {
    throw new Error("postgres round with a scale requires a numeric or integer input")
  }
  const resultDb = scale !== undefined || category === "exact"
    ? postgresDatatypes.numeric()
    : postgresDatatypes.float8()
  return Numeric.round(value, scale, {
    dialect: "postgres",
    literalDb: postgresDatatypes.float8(),
    scaleDb: postgresDatatypes.int4(),
    resultDb,
    nullability: typeof value === "number" ? "never" : value[Expression.TypeId].nullability
  }) as Expression.Any
}

export const round: {
  <Value extends Numeric.Input>(
    value: Value & PgRoundConstraint<NoInfer<Value>>
  ): PgRoundResult<Value, PgRoundResultDb<Value>, false>
  <Value extends Numeric.Input>(
    value: Value & PgScaledRoundConstraint<NoInfer<Value>>,
    scale: number
  ): PgRoundResult<Value, PgNumeric, true>
} = roundRuntime as any
