// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1211-1227, 1252-1259

// README.md:1211-1227
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.text().pipe(Column.primaryKey),
  email: Column.text()
})
const readUsers = Query.select({ id: users.id, email: users.email }).pipe(Query.from(users))
const findAda = readUsers.pipe(Query.where(Query.eq(users.id, "ada")))
const executor = Pg.Executor.make()

const rowsEffect = executor.execute(readUsers)
const userEffect = executor.execute(findAda).pipe(Pg.Executor.exactlyOne)
const optionalUserEffect = executor.execute(findAda).pipe(Pg.Executor.atMostOne)
const rowStream = executor.stream(readUsers)

{
  // README.md:1252-1259
  const prepared = executor.prepare(readUsers)
  const firstRun = prepared.execute
  const secondRun = prepared.execute
  const preparedUser = executor.prepare(findAda).execute.pipe(Pg.Executor.exactlyOne)
  const resultEffect = executor.executeResult(readUsers)
  const queryPlanEffect = executor.explain(readUsers, { format: "json" })
}

export {};
