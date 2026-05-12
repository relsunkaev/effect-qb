import { Column as C, Query as Q, Table } from "effect-qb/mysql"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid()
})

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

const returningMutation = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com"
}).pipe(
  // @ts-expect-error MySQL mutation statements should not expose PostgreSQL-style RETURNING projections.
  Q.returning({
    id: users.id
  })
)

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
void returningMutation
void insertCte
void mergePlan
