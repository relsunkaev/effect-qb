// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1526-1567

// README.md:1526-1567
import { Column as C, Function as F, Json as J, Query as Q, Table } from "effect-qb/postgres"

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

const comments = Table.make("comments", {
  id: C.uuid().pipe(C.primaryKey),
  postId: C.uuid(),
  body: C.text()
})

const absentAcrossDependentLeftJoins = Q.select({
  userId: users.id,
  postId: posts.id,
  commentId: comments.id,
  commentBody: comments.body
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.leftJoin(comments, Q.eq(posts.id, comments.postId)),
  Q.where(Q.isNull(posts.id))
)

type AbsentAcrossDependentLeftJoinsRow = Q.ResultRow<typeof absentAcrossDependentLeftJoins>
// {
//   userId: string
//   postId: null
//   commentId: null
//   commentBody: null
// }

export {};
