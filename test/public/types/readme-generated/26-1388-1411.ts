// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1388-1411

// README.md:1388-1411
import * as Effect from "effect/Effect"
import { Column as C, Executor as PostgresExecutor, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const plan = Q.select({
  id: users.id,
  email: users.email
}).pipe(
  Q.from(users)
)

const executor = PostgresExecutor.make()

const rows = executor.execute(plan).pipe(
  Effect.catchTag("@postgres/unknown/query-requirements", (error) =>
    Effect.fail(error.cause)
  )
)

export {};
