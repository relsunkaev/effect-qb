// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1804-1840

// README.md:1804-1840
import { Column, Query, Table } from "effect-qb"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  displayName: Column.text(),
  active: Column.boolean()
})

const activeUsers = Query.select({
  id: users.id,
  email: users.email,
  displayName: users.displayName
}).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, true)),
  Query.orderBy(users.email)
)

type ActiveUserRow = Query.ResultRow<typeof activeUsers>
// {
//   readonly id: string
//   readonly email: string
//   readonly displayName: string
// }

const postgres = Pg.Renderer.make().render(activeUsers)

const mysql = My.Renderer.make().render(activeUsers)

const sqlite = Sq.Renderer.make().render(activeUsers)
// postgres.params, mysql.params, and sqlite.params are [true].

export {};
