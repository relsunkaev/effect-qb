// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 60-93

// README.md:60-93
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect/Effect"
import { Column, Query, Table } from "effect-qb"
import { Executor } from "effect-qb/sqlite"

const users = Table.make("users", {
  id: Column.text().pipe(Column.primaryKey),
  email: Column.text(),
  active: Column.boolean()
})
const activeUsers = Query.select({ id: users.id, email: users.email }).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, true)),
  Query.orderBy(users.id)
)
type ActiveUser = Query.ResultRow<typeof activeUsers>
// { readonly id: string; readonly email: string }

const executor = Executor.make()
const program = executor.execute(Query.createTable(users)).pipe(
  Effect.andThen(executor.execute(Query.insert(users,
    { id: "ada", email: "ada@example.com", active: true }
  ))),
  Effect.andThen(executor.execute(Query.insert(users,
    { id: "grace", email: "grace@example.com", active: false }
  ))),
  Effect.andThen(executor.execute(activeUsers)),
  Effect.provide(SqliteClient.layer({ filename: ":memory:" }))
)
const rows = await Effect.runPromise(program)
console.log(rows)
// [{ id: "ada", email: "ada@example.com" }]

export {};
