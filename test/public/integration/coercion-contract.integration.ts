import { expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import * as Effect from "effect/Effect"
import * as SqlClient from "effect/unstable/sql/SqlClient"

import { Cast, Query as Q, Type } from "#standard"
import * as Pg from "#postgres"
import * as My from "#mysql"
import * as Sq from "#sqlite"
import { runMysql, runPostgres } from "./helpers.ts"

test("postgres distinguishes explicit casts from comparison conversion", async () => {
  const result = await runPostgres(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const value = yield* Pg.Executor.make().execute(Q.select({
      fractional: Cast.to(2.675, Type.numeric())
    })).pipe(Pg.Executor.exactlyOne)
    const unsupported = yield* Effect.result(sql`select cast(true as numeric)`)
    const comparison = yield* Effect.result(sql`select cast('1' as text) = 1`)
    const explicit = yield* sql`select cast(cast('1' as text) as integer) = 1 as value`
    return { value, unsupported, comparison, explicit }
  }))
  expect(result.value).toEqual({ fractional: "2.675" })
  expect(result.unsupported._tag).toBe("Failure")
  expect(result.comparison._tag).toBe("Failure")
  expect(result.explicit).toEqual([{ value: true }])
})

test("mysql decimal casts use scale zero and SELECT conversion survives strict mode", async () => {
  for (const mode of ["", "STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION"]) {
    const result = await runMysql(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      return yield* sql.withTransaction(Effect.gen(function*() {
        const [previous] = yield* sql<{ mode: string }>`select @@session.sql_mode as mode`
        yield* sql`set session sql_mode = ${mode}`
        return yield* Effect.gen(function*() {
          const value = yield* My.Executor.make().execute(Q.select({
            fractional: Cast.to(2.675, Type.decimal())
          })).pipe(My.Executor.exactlyOne)
          const comparison = yield* sql`select 'not a number' = 0 as value`
          return { value, comparison }
        }).pipe(Effect.ensuring(sql`set session sql_mode = ${previous!.mode}`.pipe(Effect.orDie)))
      }))
    }))
    expect(result.value).toEqual({ fractional: "3" })
    expect(result.comparison).toEqual([{ value: 1 }])
  }
})

test("sqlite expression casts differ from STRICT storage checks", async () => {
  const result = await Effect.runPromise(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const value = yield* Sq.Executor.make().execute(Q.select({
      fractional: Cast.to(2.675, Type.numeric())
    })).pipe(Sq.Executor.exactlyOne)
    const cast = yield* sql`select cast('not a number' as integer) as value, cast(2.675 as numeric) as fractional`
    const comparison = yield* sql`select '1' = 1 as value`
    yield* sql`create table strict_values (value integer) strict`
    yield* sql`insert into strict_values values ('1')`
    const invalid = yield* Effect.result(sql`insert into strict_values values ('not a number')`)
    const stored = yield* sql`select value, typeof(value) as kind from strict_values`
    return { value, cast, comparison, invalid, stored }
  }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true }))))
  expect(result.value).toEqual({ fractional: "2.675" })
  expect(result.cast).toEqual([{ value: 0, fractional: 2.675 }])
  expect(result.comparison).toEqual([{ value: 0 }])
  expect(result.invalid._tag).toBe("Failure")
  expect(result.stored).toEqual([{ value: 1, kind: "integer" }])
})
