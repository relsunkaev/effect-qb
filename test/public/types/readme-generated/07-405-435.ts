// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 405-435

// README.md:405-435
import { Column as C, Function as F, Query as Q, Table } from "effect-qb"
import { Json as J } from "effect-qb/postgres"

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const draftOrPublishedPosts = Q.select({
  title: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.in(posts.title, "draft", "published"))
)

type LogicalRow = Q.ResultRow<typeof draftOrPublishedPosts>
// {
//   title: string
//   upperTitle: string
// }

type RuntimeRow = Q.RuntimeResultRow<typeof draftOrPublishedPosts>
// {
//   title: string | null
//   upperTitle: string | null
// }

export {};
