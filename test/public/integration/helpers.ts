import * as Effect from "effect/Effect"
import * as Duration from "effect/Duration"
import * as Redacted from "effect/Redacted"
import * as SqlClient from "@effect/sql/SqlClient"
import { MysqlClient } from "@effect/sql-mysql2"
import { PgClient } from "@effect/sql-pg"

const pgLayer = PgClient.layer({
  host: "127.0.0.1",
  port: 55432,
  database: "effect_qb_test",
  username: "effect_qb",
  password: Redacted.make("effect_qb"),
  connectTimeout: Duration.seconds(15)
})

const mysqlLayer = MysqlClient.layer({
  host: "127.0.0.1",
  port: 53306,
  database: "effect_qb_test",
  username: "effect_qb",
  password: Redacted.make("effect_qb")
})

export const runPostgres = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(Effect.provide(effect, pgLayer))

export const runMysql = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(Effect.provide(effect, mysqlLayer))

export const execPostgres = <Row extends Record<string, unknown> = Record<string, unknown>>(
  statement: string,
  params?: ReadonlyArray<unknown>
) =>
  runPostgres(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.unsafe<Row>(statement, params)
  }))

export const execMysql = <Row extends Record<string, unknown> = Record<string, unknown>>(
  statement: string,
  params?: ReadonlyArray<unknown>
) =>
  runMysql(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.unsafe<Row>(statement, params)
  }))
