// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1357-1378

// README.md:1357-1378
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text().pipe(Column.unique),
  displayName: Column.text()
})

const upserted = Query.upsert(
  users,
  { id: "user-id", email: "ada@example.com", displayName: "Ada" },
  "email",
  { displayName: "Ada Lovelace" }
).pipe(
  Query.returning({ id: users.id, email: users.email })
)

// returning(...) is rendered/executed by a dialect that supports it.
const rendered = Pg.Renderer.make().render(upserted)

export {};
