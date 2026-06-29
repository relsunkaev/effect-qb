// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1297-1316

// README.md:1297-1316
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const createUsers = Query.createTable(users)
// create table "users" ("id" uuid not null, "email" text not null, primary key ("id"))

const createEmailIndex = Query.createIndex(users, ["email"], {
  name: "users_email_idx"
})
// create index "users_email_idx" on "users" ("email")

const dropEmailIndex = Query.dropIndex(users, ["email"], {
  name: "users_email_idx"
})

export {};
