import * as Std from "effect-qb"
import { Query as Q, Function as F } from "effect-qb/postgres"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text()
})

const posts = Std.Table.make("posts", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  userId: Std.Column.uuid(),
  status: Std.Column.text(),
  title: Std.Column.text().pipe(Std.Column.nullable)
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
