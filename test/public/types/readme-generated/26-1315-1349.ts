// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1315-1349

// README.md:1315-1349
import * as Effect from "effect/Effect"
import { Column as C, Executor, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.text().pipe(C.primaryKey),
  email: C.text()
})

const plan = Q.insert(users, {
  id: "user-1",
  email: "alice@example.com"
}).pipe(
  Q.returning({
    id: users.id,
    email: users.email
  })
)

const executor = Executor.make()

const logged = executor.execute(plan).pipe(
  Effect.tapErrorTag(
    "@postgres/integrity-constraint-violation/unique-violation",
    (error) =>
      Effect.logError("query failed", {
        tag: error._tag,
        sql: error.query?.sql,
        params: error.query?.params,
        constraint: error.constraintName,
        raw: error.raw
      })
  )
)

export {};
