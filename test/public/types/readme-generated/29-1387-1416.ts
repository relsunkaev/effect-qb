// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1387-1416

// README.md:1387-1416
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

const helloPosts = Q.select({
  title: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.eq(posts.title, "hello"))
)

type HelloPostsRow = Q.ResultRow<typeof helloPosts>
// {
//   title: string
//   upperTitle: string
// }

export {};
