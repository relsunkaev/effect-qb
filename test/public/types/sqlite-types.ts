import * as Std from "effect-qb"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Json, Query as Q } from "effect-qb"
import { Executor, Json as SqliteJson, Query as SqliteQuery, Renderer, Type as SqliteType } from "effect-qb/sqlite"
import { Executor as PostgresExecutor } from "effect-qb/postgres"

const users = Std.Table.make("users", {
  id: Std.Column.text().pipe(Std.Column.primaryKey),
  email: Std.Column.text().pipe(Std.Column.unique),
  visits: Std.Column.int(),
  payload: Std.Column.json(Schema.Struct({
    tags: Schema.Array(Schema.String)
  }))
})

const nonUniqueUsers = Std.Table.make("non_unique_users", {
  id: Std.Column.text().pipe(Std.Column.primaryKey),
  email: Std.Column.text(),
  visits: Std.Column.int(),
  payload: Std.Column.json(Schema.Struct({
    tags: Schema.Array(Schema.String)
  }))
})

const posts = Std.Table.make("posts", {
  id: Std.Column.text().pipe(Std.Column.primaryKey),
  userId: Std.Column.text()
})

// @ts-expect-error sqlite custom db type names must be non-empty
Std.Type.custom("")

// @ts-expect-error portable text types come from the root Type namespace
SqliteType.text()
// @ts-expect-error portable json types come from the root Type namespace
SqliteType.json()
// @ts-expect-error portable datetime types come from the root Type namespace
SqliteType.datetime()

SqliteType.clob()
SqliteType.double()

Q.select({})

Q.select()

// @ts-expect-error sqlite select statements require a projection object
Q.select(Q.literal(1))

// @ts-expect-error sqlite nested selections must project at least one expression
Q.select({ nested: {} })

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

postgresExecutor.execute(selectUsers)

const userInsert = {
  id: "user-1",
  email: "alice@example.com",
  visits: 1,
  payload: {
    tags: ["sqlite"]
  }
} satisfies Q.MutationInputOf<Std.Table.InsertOf<typeof users>>
userInsert

Std.Column.text().pipe(Std.Column.unique.options({ name: "users_email_key" }))

Std.Column.text().pipe(Std.Column.unique.options({
  // @ts-expect-error sqlite unique constraints do not support PostgreSQL NULLS NOT DISTINCT.
  nullsNotDistinct: true
}))

Std.Column.text().pipe(Std.Column.unique.options({
  // @ts-expect-error sqlite unique constraints do not support deferrable mode.
  deferrable: true
}))

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
  Q.onConflict("id", {
    update: {
      email: Q.excluded(users.email)
    }
  })
)

Q.insert(nonUniqueUsers, userInsert).pipe(
  // @ts-expect-error sqlite conflict targets must match a primary key, unique constraint, or unique index
  Q.onConflict("email", {
    update: {
      visits: Q.excluded(nonUniqueUsers.visits)
    }
  })
)

Q.insert(users, userInsert).pipe(
  // @ts-expect-error sqlite returning selections require at least one selected expression
  Q.returning({})
)

Q.insert(users, userInsert).pipe(
  // @ts-expect-error sqlite returning selections require a projection object
  Q.returning(users.id)
)

Q.insert(users, userInsert).pipe(
  // @ts-expect-error sqlite returning nested selections must project at least one expression
  Q.returning({ nested: {} })
)

Q.insert(users, userInsert).pipe(
  SqliteQuery.onConflict({
    columns: ["email"] as const,
    where: Q.isNotNull(users.email)
  }, {
    update: {
      visits: Q.excluded(users.visits)
    },
    where: Q.gt(Q.excluded(users.visits), Q.excluded(users.visits))
  })
)

Q.insert(users, userInsert).pipe(
  Q.onConflict(["id"] as const, {
    // @ts-expect-error sqlite conflict action predicates require update assignments
    where: Q.isNotNull(users.email)
  })
)

Q.insert(users, userInsert).pipe(
  // @ts-expect-error sqlite conflict update actions require at least one assignment
  Q.onConflict(["id"] as const, {
    update: {}
  })
)

Q.upsert(users, userInsert, ["id"] as const,
  // @ts-expect-error sqlite upsert update values require at least one assignment
  {})

Q.upsert(users, userInsert,
  // @ts-expect-error sqlite upsert conflict columns must exist on the target table
  ["missing"] as const, {
    email: Q.excluded(users.email)
  })

Q.upsert(users, userInsert, "id", {
  email: Q.excluded(users.email)
})

Q.upsert(nonUniqueUsers, userInsert,
// @ts-expect-error sqlite upsert conflict targets must match a primary key, unique constraint, or unique index
"email", {
  visits: Q.excluded(nonUniqueUsers.visits)
})

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

Q.lock("update")(selectUsers)

Q.unionAll(selectUsers, selectUsers)

const ids = Q.select({
  id: users.id
}).pipe(Q.from(users))

Q.like(users.email, "%@example.com")
Q.ilike(users.email, "%@example.com")
Q.inSubquery(users.id, ids)
Json.get(users.payload, Json.key("tags"))
Json.pathExists(Json.get(users.payload, Json.key("tags")), Json.index(0))
// @ts-expect-error sqlite SQL/JSON path predicates require non-empty string paths
Json.pathExists(users.payload, "")
SqliteJson.insert(users.payload, Json.key("source"), "imported")

const tagsExpr = Json.get(users.payload, Json.key("tags"))

// @ts-expect-error sqlite json.insert does not support array index paths
SqliteJson.insert(tagsExpr, Json.index(0), "city")

Q.regexMatch(users.email, ".*@example.com")

Q.regexIMatch(users.email, ".*@example.com")

Q.regexNotMatch(users.email, ".*@example.com")

Q.regexNotIMatch(users.email, ".*@example.com")

Q.compareAny(users.id, ids, "eq")

Q.compareAll(users.id, ids, "eq")

// @ts-expect-error sqlite does not support container contains predicates
Q.contains(users.payload, users.payload)

// @ts-expect-error sqlite does not support container contained-by predicates
Q.containedBy(users.payload, users.payload)

// @ts-expect-error sqlite does not support container overlap predicates
Q.overlaps(users.payload, users.payload)

Q.intersectAll(selectUsers, selectUsers)

Q.exceptAll(selectUsers, selectUsers)

// @ts-expect-error sqlite does not support mutation order/limit clauses
Q.orderBy(users.email)(Q.update(users, { visits: 3 }))

// @ts-expect-error sqlite update statements require at least one assignment
Q.update(users, {})

// @ts-expect-error sqlite does not support mysql-style multi-table updates
Q.update([users, users] as const, { users: { visits: 3 } })

Q.innerJoin(posts, Q.eq(users.id, posts.userId))(Q.delete(users))

Q.truncate(users)

Q.transaction()

Q.transaction({ isolationLevel: "serializable" })

Q.transaction({ readOnly: true })
