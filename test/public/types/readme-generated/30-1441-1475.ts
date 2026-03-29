// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1441-1475

// README.md:1441-1475
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

const promotedJoinedPosts = Q.select({
  userId: users.id,
  postId: posts.id,
  postTitle: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.where(Q.eq(posts.title, "hello"))
)

type PromotedJoinedPostsRow = Q.ResultRow<typeof promotedJoinedPosts>
// {
//   userId: string
//   postId: string
//   postTitle: string
//   upperTitle: string
// }

export {};
