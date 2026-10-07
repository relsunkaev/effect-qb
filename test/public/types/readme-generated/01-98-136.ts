// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 98-136

// README.md:98-136
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect/Effect"
import { Column, Query, Table } from "effect-qb"
import { Executor } from "effect-qb/sqlite"

// Describe the table.
const users = Table.make("users", {
  id: Column.text().pipe(Column.primaryKey),
  email: Column.text(),
  active: Column.boolean()
})
// Build the query; no SQL has run yet.
const activeUsers = Query.select({ id: users.id, email: users.email }).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, true)),
  Query.orderBy(users.id)
)
type ActiveUser = Query.ResultRow<typeof activeUsers>
// { readonly id: string; readonly email: string }

// Create, seed, and read through the SQLite executor.
const executor = Executor.make()
const program = Effect.gen(function* () {
  yield* executor.execute(Query.createTable(users))
  yield* executor.execute(Query.insert(users,
    { id: "ada", email: "ada@example.com", active: true }
  ))
  yield* executor.execute(Query.insert(users,
    { id: "grace", email: "grace@example.com", active: false }
  ))
  return yield* executor.execute(activeUsers)
}).pipe(
  Effect.provide(SqliteClient.layer({ filename: ":memory:" }))
)
const rows = await Effect.runPromise(program)
console.log(rows)
// [{ id: "ada", email: "ada@example.com" }]

export {};
