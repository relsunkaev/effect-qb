import { Column as C, Query as Q, Table } from "../../src/index.ts"

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
  postCount: Q.count(posts.id)
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.email),
  Q.having(Q.eq(Q.count(posts.id), 1))
)

const completeHavingPlan: Q.CompletePlan<typeof havingPlan> = havingPlan
void completeHavingPlan
