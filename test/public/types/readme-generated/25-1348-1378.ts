// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1348-1378

// README.md:1348-1378
import { Column as C, Query as Q, Executor as PostgresExecutor, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const readPlan = Q.select({
  id: users.id,
  email: users.email
}).pipe(
  Q.from(users)
)

const writePlan = Q.insert(users, {
  id: "user-1",
  email: "alice@example.com"
}).pipe(
  Q.returning({
    id: users.id,
    email: users.email
  })
)

type ReadError =
  PostgresExecutor.PostgresQueryError<typeof readPlan>

type WriteError =
  PostgresExecutor.PostgresQueryError<typeof writePlan>

export {};
