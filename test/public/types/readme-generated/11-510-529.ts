// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 510-529

// README.md:510-529
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

const rowsEffect = Pg.Executor.make().execute(readUsers)
const rowStream = Pg.Executor.make().stream(readUsers)

void rowsEffect
void rowStream

export {};
