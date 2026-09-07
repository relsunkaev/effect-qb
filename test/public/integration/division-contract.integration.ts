import { expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import * as Effect from "effect/Effect"
import * as SqlClient from "effect/unstable/sql/SqlClient"

import { runMysql, runPostgres } from "./helpers.ts"

test("postgres division preserves integral truncation and numeric driver types", async () => {
  const result = await runPostgres(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const values = yield* sql`select
      5::int4 / 2::int4 as integer_value,
      -5::int4 / 2::int4 as negative_value,
      5::int8 / 2::int8 as bigint_value,
      5::numeric / 2::numeric as exact_value,
      5::float8 / 2::int4 as approximate_value,
      pg_typeof(5::int2 / 2::int2)::text as small_type,
      pg_typeof(5::int4 / 2::int8)::text as mixed_integer_type,
      pg_typeof(5::numeric / 2::float4)::text as mixed_float_type`
    const zero = []
    for (const type of ["int4", "numeric", "float8"]) {
      zero.push(yield* Effect.result(sql.unsafe(`select 5::${type} / 0::${type}`)))
    }
    return { values, zero }
  }))
  expect(result.values).toEqual([{
    integer_value: 2, negative_value: -2, bigint_value: "2",
    exact_value: "2.5000000000000000", approximate_value: 2.5,
    small_type: "smallint", mixed_integer_type: "bigint", mixed_float_type: "double precision"
  }])
  expect(result.zero.map((entry) => entry._tag)).toEqual(["Failure", "Failure", "Failure"])
})

test("mysql division result scale follows the session increment", async () => {
  for (const increment of [4, 6]) {
    const result = await runMysql(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      return yield* sql.withTransaction(Effect.gen(function*() {
        const [previous] = yield* sql<{ value: number }>`select @@session.div_precision_increment as value`
        yield* sql`set session div_precision_increment = cast(${increment} as unsigned)`
        return yield* sql`select 5 / 2 as integer_value, -5 / 2 as negative_value,
          5.0 / 2.0 as exact_value, 5e0 / 2 as approximate_value,
          5 / 0 as integer_zero, 5.0 / 0 as exact_zero, 5e0 / 0 as approximate_zero,
          5 div 2 as integer_quotient`
          .pipe(Effect.ensuring(sql`set session div_precision_increment = cast(${previous!.value} as unsigned)`.pipe(Effect.orDie)))
      }))
    }))
    expect(result).toEqual([{
      integer_value: increment === 4 ? "2.5000" : "2.500000",
      negative_value: increment === 4 ? "-2.5000" : "-2.500000",
      exact_value: increment === 4 ? "2.50000" : "2.5000000",
      approximate_value: 2.5, integer_zero: null, exact_zero: null, approximate_zero: null,
      integer_quotient: 2
    }])
  }
})

test("sqlite division follows stored values rather than NUMERIC declarations", async () => {
  const result = await Effect.runPromise(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    return yield* sql`select 5 / 2 as integer_value, -5 / 2 as negative_value,
      cast(5 as numeric) / cast(2 as numeric) as numeric_integer,
      cast(5.5 as numeric) / cast(2 as numeric) as numeric_real,
      cast(5 as real) / 2 as approximate_value,
      5 / 0 as integer_zero, 5.5 / 0 as real_zero,
      typeof((-9223372036854775807 - 1) / -1) as overflow_type`
  }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true }))))
  expect(result).toEqual([{
    integer_value: 2, negative_value: -2, numeric_integer: 2, numeric_real: 2.75,
    approximate_value: 2.5, integer_zero: null, real_zero: null, overflow_type: "real"
  }])
})

test("mysql division API decodes exact and approximate results through the executor", async () => {
  const { Cast, Query, Type } = await import("#standard")
  const My = await import("#mysql")
  const values = await runMysql(Effect.gen(function*() {
    const integer = Cast.to(5, Type.int())
    const divisor = Cast.to(2, Type.int())
    return yield* My.Executor.make().execute(Query.select({
      integral: My.Function.divide(integer, divisor),
      approximate: My.Function.divide(integer, 2),
      zero: My.Function.divide(integer, 0),
      rounded: My.Function.round(My.Function.divide(integer, divisor), 1)
    })).pipe(My.Executor.exactlyOne)
  }))
  expect(values).toEqual({ integral: "2.5", approximate: 2.5, zero: null, rounded: "2.5" })
})

test("sqlite division API preserves truncation and overflow promotion", async () => {
  const { Cast, Query, Type } = await import("#standard")
  const Sq = await import("#sqlite")
  const values = await Effect.runPromise(Effect.gen(function*() {
    const integer = Cast.to(5, Type.int())
    return yield* Sq.Executor.make().execute(Query.select({
      integral: Sq.Function.divide(integer, Cast.to(2, Type.int())),
      literal: Sq.Function.divide(integer, 2),
      approximate: Sq.Function.divide(integer, Cast.to(2, Sq.Type.double())),
      exact: Sq.Function.divide(Cast.to(5.5, Type.numeric()), Cast.to(2, Type.numeric())),
      overflow: Sq.Function.divide(Cast.to("-9223372036854775808", Type.bigint()), Cast.to(-1, Type.int())),
      zero: Sq.Function.divide(integer, 0),
      rounded: Sq.Function.round(Sq.Function.divide(integer, 2), 1)
    })).pipe(Sq.Executor.exactlyOne)
  }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true }))))
  expect(values).toEqual({
    integral: 2, literal: 2, approximate: 2.5, exact: 2.75, overflow: 9223372036854775808,
    zero: null, rounded: 2
  })
})
