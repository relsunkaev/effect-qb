import { Column, Scalar, Table } from "effect-qb"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false
type Assert<Value extends true> = Value

const metrics = Table.make("metrics", {
  intValue: Column.int(),
  bigValue: Column.bigint(),
  exactValue: Column.number(),
  realValue: Column.real(),
  label: Column.text()
})

const pgIntSum = Pg.Function.sum(metrics.intValue)
const pgBigSum = Pg.Function.sum(metrics.bigValue)
const pgIntAvg = Pg.Function.avg(metrics.intValue)
const pgRealSum = Pg.Function.sum(metrics.realValue)
type _PgIntSumDb = Assert<Equal<Scalar.DbTypeOf<typeof pgIntSum>["kind"], "int8">>
type _PgIntSumRuntime = Assert<Equal<NonNullable<Scalar.RuntimeOf<typeof pgIntSum>>, Scalar.BigIntString>>
type _PgBigSumDb = Assert<Equal<Scalar.DbTypeOf<typeof pgBigSum>["kind"], "numeric">>
type _PgBigSumRuntime = Assert<Equal<NonNullable<Scalar.RuntimeOf<typeof pgBigSum>>, Scalar.DecimalString>>
type _PgIntAvgRuntime = Assert<Equal<NonNullable<Scalar.RuntimeOf<typeof pgIntAvg>>, Scalar.DecimalString>>
type _PgRealSumRuntime = Assert<Equal<NonNullable<Scalar.RuntimeOf<typeof pgRealSum>>, number>>

const myIntSum = My.Function.sum(metrics.intValue)
const myIntAvg = My.Function.avg(metrics.intValue)
const myRealSum = My.Function.sum(metrics.realValue)
type _MyIntSumDb = Assert<Equal<Scalar.DbTypeOf<typeof myIntSum>["kind"], "decimal">>
type _MyIntSumRuntime = Assert<Equal<NonNullable<Scalar.RuntimeOf<typeof myIntSum>>, Scalar.DecimalString>>
type _MyIntAvgRuntime = Assert<Equal<NonNullable<Scalar.RuntimeOf<typeof myIntAvg>>, Scalar.DecimalString>>
type _MyRealSumRuntime = Assert<Equal<NonNullable<Scalar.RuntimeOf<typeof myRealSum>>, number>>

const sqIntSum = Sq.Function.sum(metrics.intValue)
const sqBigSum = Sq.Function.sum(metrics.bigValue)
const sqIntAvg = Sq.Function.avg(metrics.intValue)
type _SqIntSumDb = Assert<Equal<Scalar.DbTypeOf<typeof sqIntSum>["kind"], "integer">>
type _SqIntSumRuntime = Assert<Equal<NonNullable<Scalar.RuntimeOf<typeof sqIntSum>>, number>>
type _SqBigSumRuntime = Assert<Equal<NonNullable<Scalar.RuntimeOf<typeof sqBigSum>>, Scalar.BigIntString>>
type _SqIntAvgRuntime = Assert<Equal<NonNullable<Scalar.RuntimeOf<typeof sqIntAvg>>, number>>

// @ts-expect-error PostgreSQL sum rejects nonnumeric database types
Pg.Function.sum(metrics.label)
// @ts-expect-error MySQL avg rejects nonnumeric database types
My.Function.avg(metrics.label)
// @ts-expect-error SQLite sum rejects nonnumeric database types
Sq.Function.sum(metrics.label)
