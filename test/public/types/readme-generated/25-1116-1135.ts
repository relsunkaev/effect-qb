// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1116-1135

// README.md:1116-1135
import { Column, Query, Table } from "effect-qb"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const plan = Query.select({
  id: users.id,
  email: users.email
}).pipe(Query.from(users))

Pg.Renderer.make().render(plan)
My.Renderer.make().render(plan)
Sq.Renderer.make().render(plan)

export {};
