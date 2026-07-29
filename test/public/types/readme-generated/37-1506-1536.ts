// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1506-1536

// README.md:1506-1536
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

const executor = Pg.Executor.make()
const rowsEffect = executor.execute(readUsers)
const rowStream = executor.stream(readUsers)

const rows = executor.execute(readUsers)
const maybeUser = rows.pipe(Pg.Executor.atMostOne)
const oneUser = rows.pipe(Pg.Executor.exactlyOne)
const atLeastOneUser = rows.pipe(Pg.Executor.nonEmpty)
const result = executor.executeResult(readUsers)
// result.rows plus affectedRows / insertId when the driver provides them

const prepared = executor.prepare(readUsers)
const firstRun = prepared.execute
const preparedOne = prepared.execute.pipe(Pg.Executor.exactlyOne)

const queryPlan = executor.explain(readUsers, { format: "json" })

export {};
