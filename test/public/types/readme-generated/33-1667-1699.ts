// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1667-1699

// README.md:1667-1699
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const invalidGroupedPlan = Q.select({
  userId: users.id,
  title: posts.title,
  postCount: F.count(posts.id)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.id)
)

type InvalidGroupedPlan = Q.CompletePlan<typeof invalidGroupedPlan>
// {
//   __effect_qb_error__: "effect-qb: invalid grouped selection"
//   __effect_qb_hint__:
//     "Scalar selections must be covered by groupBy(...) when aggregates are present"
// }

export {};
