import * as SqlClient from "@effect/sql/SqlClient"
import { PgClient } from "@effect/sql-pg"
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"

export const providePostgresUrl = <A, E>(
  url: string,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>
): Effect.Effect<A, E | unknown, never> =>
  Effect.provide(effect, PgClient.layer({
    url: Redacted.make(url)
  }))

export const runPostgresUrl = <A, E>(
  url: string,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>
): Promise<A> =>
  Effect.runPromise(providePostgresUrl(url, effect))
