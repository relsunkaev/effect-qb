import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Column as C, Executor, Query as Q, Renderer, Table } from "effect-qb/sqlite"
import { Executor as PostgresExecutor } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.text().pipe(C.primaryKey),
  email: C.text(),
  visits: C.int(),
  payload: C.json(Schema.Struct({
    tags: Schema.Array(Schema.String)
  }))
})

const selectUsers = Q.select({
  id: users.id,
  email: users.email,
  payload: users.payload
}).pipe(
  Q.from(users),
  Q.where(Q.eq(users.email, "alice@example.com")),
  Q.limit(10)
)

const rendered = Renderer.make().render(selectUsers)
type RenderedRow = Renderer.RowOf<typeof rendered>
const row: RenderedRow = {
  id: "user-1",
  email: "alice@example.com",
  payload: {
    tags: ["sqlite"]
  }
}
row

const sqliteExecutor = Executor.make({
  driver: Executor.driver(() => Effect.succeed([]))
})

sqliteExecutor.execute(selectUsers)
sqliteExecutor.stream(selectUsers)

const postgresExecutor = PostgresExecutor.make({
  driver: PostgresExecutor.driver(() => Effect.succeed([]))
})

// @ts-expect-error sqlite plans are not dialect-compatible with postgres executors
postgresExecutor.execute(selectUsers)

const userInsert = {
  id: "user-1",
  email: "alice@example.com",
  visits: 1,
  payload: {
    tags: ["sqlite"]
  }
} satisfies Q.MutationInputOf<Table.InsertOf<typeof users>>
userInsert

Q.insert(users, userInsert).pipe(
  Q.onConflict(["id"] as const, {
    update: {
      email: Q.excluded(users.email),
      visits: 2
    }
  }),
  Q.returning({
    id: users.id,
    visits: users.visits
  })
)

// @ts-expect-error sqlite does not support mysql mutation lock modifiers
Q.lock("ignore")(Q.update(users, { visits: 3 }))

// @ts-expect-error sqlite does not support mutation order/limit clauses
Q.orderBy(users.email)(Q.update(users, { visits: 3 }))

// @ts-expect-error sqlite does not support mysql-style multi-table updates
Q.update([users, users] as const, { users: { visits: 3 } })
