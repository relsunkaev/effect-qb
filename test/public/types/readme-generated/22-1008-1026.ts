// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1008-1026

// README.md:1008-1026
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  status: Column.text()
})

const labelled = Query.select({
  id: users.id,
  tier: Query.case()
    .when(Query.eq(users.status, "active"), "current")
    .else("other"),
  label: Query.match(users.status)
    .when("active", "Active")
    .when("archived", "Archived")
    .else("Unknown")
}).pipe(Query.from(users))

export {};
