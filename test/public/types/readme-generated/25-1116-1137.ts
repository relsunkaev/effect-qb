// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1116-1137

// README.md:1116-1137
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  active: Column.boolean()
})

const activeEmails = Query.select({ email: users.email }).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, true))
)

const inactiveEmails = Query.select({ email: users.email }).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, false))
)

const allEmails = Query.unionAll(activeEmails, inactiveEmails)
// (select "users"."email" as "email" from "users" where ("users"."active" = $1)) union all (select "users"."email" as "email" from "users" where ("users"."active" = $2))

export {};
