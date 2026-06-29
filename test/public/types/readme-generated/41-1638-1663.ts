// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1638-1663

// README.md:1638-1663
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  displayName: Column.text(),
  active: Column.boolean()
})

const page = Query.select({
  id: users.id,
  email: users.email,
  displayName: users.displayName
}).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, true)),
  Query.orderBy(users.email),
  Query.limit(20),
  Query.offset(40)
)

const rendered = Pg.Renderer.make().render(page)
// select "users"."id" as "id", "users"."email" as "email", "users"."displayName" as "displayName" from "users" where ("users"."active" = $1) order by "users"."email" asc limit $2 offset $3

export {};
