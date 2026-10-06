// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1174-1187

// README.md:1174-1187
import * as Effect from "effect/Effect"
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", { email: Column.text() })
const readUsers = Query.select({ email: users.email }).pipe(Query.from(users))
const reportDecodeError = (error: Pg.Executor.RowDecodeError) =>
  Effect.logError(Pg.Executor.formatRowDecodeError(error))

const checkedRead = Pg.Executor.make().execute(readUsers).pipe(
  Effect.tapErrorTag("RowDecodeError", reportDecodeError)
)

export {};
