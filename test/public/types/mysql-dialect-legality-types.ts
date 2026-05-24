import * as Std from "effect-qb"
import { Query as Q } from "effect-qb/mysql"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text()
})

const posts = Std.Table.make("posts", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  userId: Std.Column.uuid()
})

// @ts-expect-error MySQL select statements require at least one selected expression.
Q.select({})

// @ts-expect-error MySQL select statements require at least one selected expression.
Q.select()

// @ts-expect-error MySQL select statements require a projection object.
Q.select(Q.literal(1))

// @ts-expect-error MySQL nested selections must project at least one expression.
Q.select({ nested: {} })

const fullJoinPlan = Q.select({
  userId: users.id,
  postId: posts.id
}).pipe(
  Q.from(users),
  // @ts-expect-error MySQL does not support FULL OUTER JOIN syntax.
  Q.fullJoin(posts, Q.eq(users.id, posts.userId))
)

const restartIdentityTruncate = Q.truncate(users, {
  // @ts-expect-error MySQL TRUNCATE does not support PostgreSQL restart identity/cascade options.
  restartIdentity: true
})

Std.Column.text().pipe(Std.Column.unique.options({ name: "users_email_key" }))

Std.Column.text().pipe(Std.Column.unique.options({
  // @ts-expect-error MySQL unique constraints do not support PostgreSQL NULLS NOT DISTINCT.
  nullsNotDistinct: true
}))

Std.Column.text().pipe(Std.Column.unique.options({
  // @ts-expect-error MySQL unique constraints do not support deferrable mode.
  deferrable: true
}))

const unsupportedCreateIndexOption = Q.createIndex(users, ["id", "email"] as const, {
  // @ts-expect-error MySQL CREATE INDEX does not support IF NOT EXISTS.
  ifNotExists: true
})

const unsupportedDropIndexOption = Q.dropIndex(users, ["id", "email"] as const, {
  // @ts-expect-error MySQL DROP INDEX does not support IF EXISTS.
  ifExists: true
})

const returningMutation = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com"
}).pipe(
  // @ts-expect-error MySQL mutation statements should not expose PostgreSQL-style RETURNING projections.
  Q.returning({
    id: users.id
  })
)

const lockedPlan = Q.select({
  id: users.id
}).pipe(
  Q.from(users),
  Q.lock("update", { skipLocked: true })
)

Q.select({
  id: users.id
}).pipe(
  Q.from(users),
  // @ts-expect-error lock options cannot specify both nowait and skipLocked
  Q.lock("update", { nowait: true, skipLocked: true })
)

// @ts-expect-error MySQL update statements require at least one assignment.
Q.update(users, {})

// @ts-expect-error MySQL multi-table update statements require at least one assignment.
Q.update([users, posts] as const, { users: {} })

Q.upsert(users, {
  id: "user-id",
  email: "alice@example.com"
}, ["id"] as const,
  // @ts-expect-error MySQL upsert update values require at least one assignment.
  {})

const stringConflictUpsert = Q.upsert(users, {
  id: "user-id",
  email: "alice@example.com"
}, "id", {
  email: Q.excluded(users.email)
})

const insertCtePlan = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com"
})

// @ts-expect-error MySQL CTE sources only support select-like plans.
const insertCte = Q.with("inserted_users")(insertCtePlan)

// @ts-expect-error MySQL does not support MERGE syntax.
const mergePlan = Q.merge(users, posts, Q.eq(users.id, posts.userId), {
  whenMatched: {
    delete: true
  }
})

void fullJoinPlan
void restartIdentityTruncate
void unsupportedCreateIndexOption
void unsupportedDropIndexOption
void returningMutation
void lockedPlan
void stringConflictUpsert
void insertCte
void mergePlan
