import * as Schema from "effect/Schema"

import { Cast, Column, Function, Query, Scalar, Table, Type } from "effect-qb"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2)
    ? (<Value>() => Value extends Right ? 1 : 2) extends
        (<Value>() => Value extends Left ? 1 : 2)
      ? true
      : false
    : false

type Assert<Value extends true> = Value

const values = Table.make("numeric_values", {
  integer: Column.int(),
  nullableInteger: Column.int().pipe(Column.nullable),
  bigint: Column.bigint(),
  exact: Column.number({ precision: 12, scale: 3 }),
  approximate: Column.real(),
  text: Column.text()
})

const pgValues = Table.make("pg_numeric_values", {
  small: Pg.Column.custom(Schema.Number, Pg.Type.int2()),
  integer: Pg.Column.custom(Schema.Number, Pg.Type.int4()),
  bigint: Pg.Column.custom(Schema.String, Pg.Type.int8()),
  approximate: Pg.Column.custom(Schema.Number, Pg.Type.float8())
})

const myValues = Table.make("my_numeric_values", {
  integer: My.Column.custom(Schema.Number, My.Type.tinyint()),
  approximate: My.Column.custom(Schema.Number, My.Type.double())
})

const sqValues = Table.make("sq_numeric_values", {
  approximate: Sq.Column.custom(Schema.Number, Sq.Type.double())
})

// PostgreSQL modulo promotes supported integer kinds and exact numeric, but
// intentionally rejects approximate operands.
const pgSmallModulo = Pg.Function.modulo(pgValues.small, pgValues.small)
const pgMixedIntegerModulo = Pg.Function.modulo(pgValues.small, values.integer)
const pgBigModulo = Pg.Function.modulo(values.bigint, pgValues.integer)
const pgExactModulo = Pg.Function.modulo(
  Cast.to(values.approximate, Type.numeric()),
  Cast.to(2, Type.numeric())
)

type _PgSmallDb = Assert<Equal<Scalar.DbTypeOf<typeof pgSmallModulo>["kind"], "int2">>
type _PgMixedIntegerDb = Assert<Equal<Scalar.DbTypeOf<typeof pgMixedIntegerModulo>["kind"], "int4">>
type _PgBigDb = Assert<Equal<Scalar.DbTypeOf<typeof pgBigModulo>["kind"], "int8">>
type _PgBigRuntime = Assert<Equal<Scalar.RuntimeOf<typeof pgBigModulo>, Scalar.BigIntString>>
type _PgExactDb = Assert<Equal<Scalar.DbTypeOf<typeof pgExactModulo>["kind"], "numeric">>
type _PgExactRuntime = Assert<Equal<Scalar.RuntimeOf<typeof pgExactModulo>, Scalar.DecimalString>>
type _PgModuloNullability = Assert<Equal<Scalar.NullabilityOf<typeof pgExactModulo>, "never">>
type _PgModuloDialect = Assert<Equal<typeof pgExactModulo[typeof Scalar.TypeId]["dialect"], "postgres">>

// PostgreSQL one-argument integer/float rounding returns float8. Exact numeric
// stays numeric, and the scale overload converts integer inputs to numeric.
const pgIntegerRound = Pg.Function.round(values.integer)
const pgFloatRound = Pg.Function.round(pgValues.approximate)
const pgExactRound = Pg.Function.round(Cast.to(values.approximate, Type.numeric()), 2)
const pgScaledIntegerRound = Pg.Function.round(values.integer, 2)
const pgNullableRound = Pg.Function.round(values.nullableInteger)

type _PgIntegerRoundDb = Assert<Equal<Scalar.DbTypeOf<typeof pgIntegerRound>["kind"], "float8">>
type _PgFloatRoundRuntime = Assert<Equal<Scalar.RuntimeOf<typeof pgFloatRound>, number>>
type _PgExactRoundDb = Assert<Equal<Scalar.DbTypeOf<typeof pgExactRound>["kind"], "numeric">>
type _PgExactRoundRuntime = Assert<Equal<Scalar.RuntimeOf<typeof pgExactRound>, Scalar.DecimalString>>
type _PgScaledIntegerRoundDb = Assert<Equal<Scalar.DbTypeOf<typeof pgScaledIntegerRound>["kind"], "numeric">>
type _PgRoundNullability = Assert<Equal<Scalar.NullabilityOf<typeof pgNullableRound>, "maybe">>

// @ts-expect-error PostgreSQL modulo has no float4/float8 overload
Pg.Function.modulo(pgValues.approximate, pgValues.integer)
// @ts-expect-error PostgreSQL raw modulo literals must be integers
Pg.Function.modulo(5.5, 2)
// @ts-expect-error PostgreSQL round(float8, scale) is not defined
Pg.Function.round(pgValues.approximate, 2)
// @ts-expect-error text is not a PostgreSQL numeric input
Pg.Function.round(values.text)

// MySQL returns BIGINT for integer operations, DECIMAL for exact operands, and
// DOUBLE when an approximate operand participates. Modulo becomes nullable
// when the divisor is not statically known to be non-zero.
const myIntegerModulo = My.Function.modulo(myValues.integer, values.integer)
const myExactModulo = My.Function.modulo(values.exact, values.integer)
const myApproximateModulo = My.Function.modulo(myValues.approximate, values.exact)
const myZeroModulo = My.Function.modulo(myValues.integer, 0)
const myIntegerRound = My.Function.round(values.integer)
const myExactRound = My.Function.round(Cast.to(values.approximate, Type.decimal()), 2)
const myApproximateRound = My.Function.round(myValues.approximate, 2)
const myNullableRound = My.Function.round(values.nullableInteger)

type _MyIntegerModuloDb = Assert<Equal<Scalar.DbTypeOf<typeof myIntegerModulo>["kind"], "bigint">>
type _MyIntegerModuloRuntime = Assert<Equal<Scalar.RuntimeOf<typeof myIntegerModulo>, Scalar.BigIntString>>
type _MyModuloNullability = Assert<Equal<Scalar.NullabilityOf<typeof myIntegerModulo>, "maybe">>
type _MyExactModuloDb = Assert<Equal<Scalar.DbTypeOf<typeof myExactModulo>["kind"], "decimal">>
type _MyExactModuloRuntime = Assert<Equal<Scalar.RuntimeOf<typeof myExactModulo>, Scalar.DecimalString>>
type _MyApproximateModuloDb = Assert<Equal<Scalar.DbTypeOf<typeof myApproximateModulo>["kind"], "double">>
type _MyZeroModuloNullability = Assert<Equal<Scalar.NullabilityOf<typeof myZeroModulo>, "always">>
type _MyIntegerRoundDb = Assert<Equal<Scalar.DbTypeOf<typeof myIntegerRound>["kind"], "bigint">>
type _MyExactRoundDb = Assert<Equal<Scalar.DbTypeOf<typeof myExactRound>["kind"], "decimal">>
type _MyApproximateRoundDb = Assert<Equal<Scalar.DbTypeOf<typeof myApproximateRound>["kind"], "double">>
type _MyRoundNullability = Assert<Equal<Scalar.NullabilityOf<typeof myNullableRound>, "maybe">>

// @ts-expect-error text is not a MySQL numeric input
My.Function.modulo(values.text, values.integer)
// @ts-expect-error expressions from another concrete dialect cannot be mixed in
My.Function.round(pgValues.approximate)

// SQLite integer modulo stays integer, while numeric/real participation is
// conservatively typed as DOUBLE because the runtime storage class can be REAL.
// round(...) always returns DOUBLE.
const sqIntegerModulo = Sq.Function.modulo(values.integer, values.nullableInteger)
const sqBigModulo = Sq.Function.modulo(values.bigint, values.integer)
const sqApproximateModulo = Sq.Function.modulo(values.integer, sqValues.approximate)
const sqZeroModulo = Sq.Function.modulo(values.integer, 0)
const sqIntegerRound = Sq.Function.round(values.integer)
const sqExactRound = Sq.Function.round(values.exact, 2)
const sqNullableRound = Sq.Function.round(values.nullableInteger)

type _SqIntegerModuloDb = Assert<Equal<Scalar.DbTypeOf<typeof sqIntegerModulo>["kind"], "integer">>
type _SqIntegerModuloRuntime = Assert<Equal<Scalar.RuntimeOf<typeof sqIntegerModulo>, number>>
type _SqIntegerModuloNullability = Assert<Equal<Scalar.NullabilityOf<typeof sqIntegerModulo>, "maybe">>
type _SqBigModuloDb = Assert<Equal<Scalar.DbTypeOf<typeof sqBigModulo>["kind"], "bigint">>
type _SqBigModuloRuntime = Assert<Equal<Scalar.RuntimeOf<typeof sqBigModulo>, Scalar.BigIntString>>
type _SqApproximateModuloDb = Assert<Equal<Scalar.DbTypeOf<typeof sqApproximateModulo>["kind"], "double">>
type _SqZeroModuloNullability = Assert<Equal<Scalar.NullabilityOf<typeof sqZeroModulo>, "always">>
type _SqIntegerRoundDb = Assert<Equal<Scalar.DbTypeOf<typeof sqIntegerRound>["kind"], "double">>
type _SqExactRoundRuntime = Assert<Equal<Scalar.RuntimeOf<typeof sqExactRound>, number>>
type _SqRoundNullability = Assert<Equal<Scalar.NullabilityOf<typeof sqNullableRound>, "maybe">>

// @ts-expect-error text is not a SQLite numeric input
Sq.Function.round(values.text)

const pgPlan = Query.select({ value: pgExactRound }).pipe(Query.from(values))
const myPlan = Query.select({ value: myExactRound }).pipe(Query.from(values))
const sqPlan = Query.select({ value: sqExactRound }).pipe(Query.from(values))
Pg.Renderer.make().render(pgPlan)
My.Renderer.make().render(myPlan)
Sq.Renderer.make().render(sqPlan)
// @ts-expect-error a PostgreSQL numeric plan cannot use the MySQL renderer
My.Renderer.make().render(pgPlan)
// @ts-expect-error a MySQL numeric plan cannot use the SQLite renderer
Sq.Renderer.make().render(myPlan)
// @ts-expect-error a SQLite numeric plan cannot use the PostgreSQL renderer
Pg.Renderer.make().render(sqPlan)

// @ts-expect-error round is intentionally not on the portable Function surface
Function.round(values.integer)
// @ts-expect-error modulo is intentionally not on the portable Function surface
Function.modulo(values.integer, values.integer)
