// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 125-144

// README.md:125-144
import { Column, Query, Table } from "effect-qb"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

const accounts = Table.make("accounts", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const readAccounts = Query.select({
  id: accounts.id,
  email: accounts.email
}).pipe(Query.from(accounts))

Pg.Renderer.make().render(readAccounts)
My.Renderer.make().render(readAccounts)
Sq.Renderer.make().render(readAccounts)

export {};
