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

C.text().pipe(C.unique.options({ name: "users_email_key" }))

C.text().pipe(C.unique.options({
  // @ts-expect-error sqlite unique constraints do not support PostgreSQL NULLS NOT DISTINCT.
  nullsNotDistinct: true
}))

C.text().pipe(C.unique.options({
  // @ts-expect-error sqlite unique constraints do not support deferrable mode.
  deferrable: true
}))

// @ts-expect-error sqlite does not support lateral sources.
Q.lateral("user_posts")(Q.select({
  id: users.id
}).pipe(Q.from(users)))

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

Q.insert(users, userInsert).pipe(
  Q.onConflict({
    columns: ["email"] as const,
    where: Q.isNotNull(users.email)
  }, {
    update: {
      visits: Q.excluded(users.visits)
    },
    where: Q.gt(Q.excluded(users.visits), 0)
  })
)

Q.insert(users, userInsert).pipe(
  // @ts-expect-error sqlite does not support named conflict constraints
  Q.onConflict({
    constraint: "users_email_key"
  }, {
    update: {
      visits: Q.excluded(users.visits)
    }
  })
)

// @ts-expect-error sqlite does not support mysql mutation lock modifiers
Q.lock("ignore")(Q.update(users, { visits: 3 }))

// @ts-expect-error sqlite does not support row locking
Q.lock("update")(selectUsers)

Q.unionAll(selectUsers, selectUsers)

const ids = Q.select({
  id: users.id
}).pipe(Q.from(users))

Q.like(users.email, "%@example.com")
Q.ilike(users.email, "%@example.com")
Q.inSubquery(users.id, ids)

// @ts-expect-error sqlite does not support regular-expression predicates
Q.regexMatch(users.email, ".*@example.com")

// @ts-expect-error sqlite does not support case-insensitive regular-expression predicates
Q.regexIMatch(users.email, ".*@example.com")

// @ts-expect-error sqlite does not support negated regular-expression predicates
Q.regexNotMatch(users.email, ".*@example.com")

// @ts-expect-error sqlite does not support negated case-insensitive regular-expression predicates
Q.regexNotIMatch(users.email, ".*@example.com")

// @ts-expect-error sqlite does not support ANY quantified comparisons
Q.compareAny(users.id, ids, "eq")

// @ts-expect-error sqlite does not support ALL quantified comparisons
Q.compareAll(users.id, ids, "eq")

// @ts-expect-error sqlite does not support INTERSECT ALL
Q.intersectAll(selectUsers, selectUsers)

// @ts-expect-error sqlite does not support EXCEPT ALL
Q.exceptAll(selectUsers, selectUsers)

// @ts-expect-error sqlite does not support mutation order/limit clauses
Q.orderBy(users.email)(Q.update(users, { visits: 3 }))

// @ts-expect-error sqlite does not support mysql-style multi-table updates
Q.update([users, users] as const, { users: { visits: 3 } })

// @ts-expect-error sqlite does not support truncate statements
Q.truncate(users)

Q.transaction()

// @ts-expect-error sqlite transactions do not support SQL isolation levels
Q.transaction({ isolationLevel: "serializable" })

// @ts-expect-error sqlite transactions do not support read-only mode
Q.transaction({ readOnly: true })
