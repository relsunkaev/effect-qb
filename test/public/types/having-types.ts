import { Column as C, Query as Q, Function as F, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid()
})

const havingPlan = Q.select({
  email: users.email,
  postCount: F.count(posts.id)
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.email),
  Q.having(Q.isNotNull(F.count(posts.id)))
)

const completeHavingPlan: Q.CompletePlan<typeof havingPlan> = havingPlan
void completeHavingPlan
