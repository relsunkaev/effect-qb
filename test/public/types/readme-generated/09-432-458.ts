// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 432-458

// README.md:432-458
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

const rendered = Pg.Renderer.make({
  casing: {
    tables: "snake_case",
    columns: "snake_case"
  }
}).render(readUsers)

const sql: string = rendered.sql
const params: readonly unknown[] = rendered.params

void sql
void params

export {};
