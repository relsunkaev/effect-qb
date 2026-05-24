// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 145-159

// README.md:145-159
import { Column, Function, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const userEmails = Query.select({
  id: users.id,
  email: Function.lower(users.email)
}).pipe(
  Query.from(users)
)

export {};
