// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 132-159

// README.md:132-159
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

const postgres = Pg.Renderer.make().render(readAccounts)
// postgres.sql:
// select "accounts"."id" as "id", "accounts"."email" as "email" from "accounts"

const mysql = My.Renderer.make().render(readAccounts)
// mysql.sql:
// select `accounts`.`id` as `id`, `accounts`.`email` as `email` from `accounts`

const sqlite = Sq.Renderer.make().render(readAccounts)
// sqlite.sql:
// select "accounts"."id" as "id", "accounts"."email" as "email" from "accounts"

export {};
