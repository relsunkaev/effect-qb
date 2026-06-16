// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1147-1165

// README.md:1147-1165
import { Column, Function, Query, Table } from "effect-qb"

const posts = Table.make("posts", {
  id: Column.uuid().pipe(Column.primaryKey),
  userId: Column.uuid()
})

const ranked = Query.select({
  postId: posts.id,
  rowInUser: Function.rowNumber({
    partitionBy: [posts.userId],
    orderBy: [{ value: posts.id, direction: "asc" }]
  }),
  perUser: Function.over(Function.count(posts.id), {
    partitionBy: [posts.userId]
  })
}).pipe(Query.from(posts))

export {};
