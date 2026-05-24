// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1408-1447

// README.md:1408-1447
import { Column as C, Query as Q, Table } from "effect-qb"
import * as Effect from "effect/Effect"
import { Executor } from "effect-qb/postgres"

class EmailAlreadyTaken extends Error {
  constructor(readonly details: {
    readonly constraint?: string
    readonly table?: string
  }) {
    super("Email already taken")
  }
}

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

const rows = executor.execute(plan).pipe(
  Effect.catchTag("@postgres/integrity-constraint-violation/unique-violation", (error) =>
    Effect.fail(new EmailAlreadyTaken({
      constraint: error.constraintName,
      table: error.tableName
    }))
  )
)

export {};
