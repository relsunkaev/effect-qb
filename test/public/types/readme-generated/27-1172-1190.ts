// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1172-1190

// README.md:1172-1190
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const incoming = Table.make("incoming_users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const merge = Query.merge(users, incoming, Query.eq(users.id, incoming.id), {
  whenMatched: { update: { email: incoming.email } },
  whenNotMatched: { values: { id: incoming.id, email: incoming.email } }
})
// merge into "users" using "incoming_users" on ("users"."id" = "incoming_users"."id") when matched then update set "email" = "incoming_users"."email" when not matched then insert ("id", "email") values ("incoming_users"."id", "incoming_users"."email")

export {};
