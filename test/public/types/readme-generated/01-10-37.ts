// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 10-37

// README.md:10-37
import { Column, Function, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  displayName: Column.text(),
  active: Column.boolean()
})

const activeUsers = Query.select({
  id: users.id,
  email: Function.lower(users.email)
}).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, true)),
  Query.orderBy(users.email)
)

type ActiveUser = Query.ResultRow<typeof activeUsers>
// { readonly id: string; readonly email: string }

// The plan is portable. Here it is rendered for Postgres.
const rendered = Pg.Renderer.make().render(activeUsers)
// rendered.sql:
// select "users"."id" as "id", lower("users"."email") as "email" from "users" where ("users"."active" = $1) order by "users"."email" asc

export {};
