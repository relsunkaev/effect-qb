// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1385-1411

// README.md:1385-1411
import { Casing, Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("Users", {
  id: Column.uuid().pipe(Column.primaryKey),
  emailAddress: Column.text(),
  createdAt: Column.datetime()
}).pipe(
  Casing.withCasing({
    tables: "snake_case",
    columns: "snake_case"
  })
)

const recent = Query.select({
  id: users.id,
  emailAddress: users.emailAddress
}).pipe(
  Query.from(users),
  Query.orderBy(users.createdAt)
)

// Model keys stay camelCase; physical identifiers render as snake_case.
const rendered = Pg.Renderer.make().render(recent)
// select "users"."id" as "id", "users"."email_address" as "emailAddress" from "users" order by "users"."created_at" asc

export {};
