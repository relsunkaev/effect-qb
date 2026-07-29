// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1245-1278

// README.md:1245-1278
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
  }),
  previousPost: Function.lag(posts.id, {
    spec: {
      partitionBy: [posts.userId],
      orderBy: [{ value: posts.id, direction: "asc" }]
    }
  }),
  firstPost: Function.firstValue(posts.id, {
    partitionBy: [posts.userId],
    orderBy: [{ value: posts.id, direction: "asc" }],
    frame: {
      unit: "rows",
      start: "unboundedPreceding",
      end: "currentRow"
    }
  })
}).pipe(Query.from(posts))

export {};
