// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1537-1555, 1559-1568, 1574-1580

// README.md:1537-1555
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


{
  // README.md:1559-1568
  const executor = Pg.Executor.make()

  const maybeUser = executor.executeOption(readUsers)
  const oneUser = executor.executeExactlyOne(readUsers)
  const atLeastOneUser = executor.executeNonEmpty(readUsers)
  const ignoredRows = executor.executeVoid(readUsers)
  const result = executor.executeResult(readUsers)
  // result.rows plus affectedRows / insertId when the driver provides them
}

{
  // README.md:1574-1580
  const prepared = executor.prepare(readUsers)
  const firstRun = prepared.execute
  const nextRun = prepared.execute

  const queryPlan = executor.explain(readUsers, { format: "json" })
}

export {};
