// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1223-1265

// README.md:1223-1265
import * as Effect from "effect/Effect"
import * as Pg from "effect-qb/postgres"
import { Column as C, Executor, Query as Q, Table } from "effect-qb/postgres"

class InvalidUserId extends Error {
  constructor(readonly details: {
    readonly value: string
  }) {
    super("Invalid user id")
  }
}

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const badUserId = Pg.Cast.to("not-a-uuid", Pg.Type.uuid())

const plan = Q.select({
  id: users.id,
  email: users.email
}).pipe(
  Q.from(users),
  Q.where(Q.eq(users.id, badUserId))
)

const executor = Executor.make()

const rows = executor.execute(plan).pipe(
  Effect.catchTag("@postgres/data-exception/invalid-text-representation", () =>
    Effect.fail(new InvalidUserId({ value: "not-a-uuid" }))
  )
)

executor.execute(plan).pipe(
  // @ts-expect-error read plans do not expose write-only errors
  Effect.catchTag("@postgres/integrity-constraint-violation/unique-violation", (error) =>
    Effect.fail(error)
  )
)

export {};
