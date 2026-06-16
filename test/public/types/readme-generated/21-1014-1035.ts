// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1014-1035

// README.md:1014-1035
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const readUsers = Query.select({
  id: users.id,
  email: users.email
}).pipe(Query.from(users))

const rendered = Pg.Renderer.make().render(readUsers)

// rendered.sql:
// select "users"."id" as "id", "users"."email" as "email" from "users"
// rendered.params:
// []


export {};
