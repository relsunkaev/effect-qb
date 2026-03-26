import * as Effect from "effect/Effect"
import * as Duration from "effect/Duration"
import * as Redacted from "effect/Redacted"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { MysqlClient } from "@effect/sql-mysql2"
import { PgClient } from "@effect/sql-pg"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"

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

const postgresLockPath = join(process.cwd(), "test", ".postgres-integration.lock")

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })

export const withPostgresLock = async <A>(task: () => Promise<A>): Promise<A> => {
  while (true) {
    try {
      await mkdir(postgresLockPath)
      break
    } catch (error) {
      if ((error as { readonly code?: string }).code !== "EEXIST") {
        throw error
      }
      await sleep(50)
    }
  }

  try {
    return await task()
  } finally {
    await rm(postgresLockPath, { recursive: true, force: true }).catch(() => undefined)
  }
}

export const runPostgres = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(Effect.provide(effect, pgLayer))

export const runMysql = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(Effect.provide(effect, mysqlLayer))

export const execPostgres = <Row extends Record<string, unknown> = Record<string, unknown>>(
  statement: string,
  params?: ReadonlyArray<unknown>
) =>
  withPostgresLock(() =>
    runPostgres(Effect.gen(function*() {
      const sql = yield* Effect.service(SqlClient.SqlClient)
      return yield* sql.unsafe<Row>(statement, params)
    }))
  )

export const execMysql = <Row extends Record<string, unknown> = Record<string, unknown>>(
  statement: string,
  params?: ReadonlyArray<unknown>
) =>
  runMysql(Effect.gen(function*() {
    const sql = yield* Effect.service(SqlClient.SqlClient)
    return yield* sql.unsafe<Row>(statement, params)
  }))
