// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 2242-2274

// README.md:2242-2274
import { Column, Function, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.text().pipe(Column.primaryKey),
  email: Column.text()
})
const posts = Table.make("posts", {
  id: Column.text().pipe(Column.primaryKey),
  userId: Column.text(),
  published: Column.boolean()
})
const totals = Query.select({
  userId: posts.userId,
  postCount: Function.count(posts.id)
}).pipe(
  Query.from(posts),
  Query.where(Query.eq(posts.published, true)),
  Query.groupBy(posts.userId),
  Query.having(Query.gte(Function.count(posts.id), 2)),
  Query.with("post_totals")
)
const authors = Query.select({
  email: users.email,
  postCount: totals.postCount
}).pipe(
  Query.from(users),
  Query.innerJoin(totals, Query.eq(users.id, totals.userId)),
  Query.orderBy(users.id)
)
type Author = Query.ResultRow<typeof authors>
// { readonly email: string; readonly postCount: Scalar.BigIntString }

export {};
