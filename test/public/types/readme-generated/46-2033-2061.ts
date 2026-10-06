// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 2033-2061

// README.md:2033-2061
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.text().pipe(Column.primaryKey),
  email: Column.text(),
  active: Column.boolean(),
  visits: Column.int()
})
const posts = Table.make("posts", {
  id: Column.text().pipe(Column.primaryKey),
  userId: Column.text()
})
const userPosts = Query.select({ id: posts.id }).pipe(
  Query.from(posts),
  Query.where(Query.eq(posts.userId, users.id))
)
const base = Query.select({ id: users.id, email: users.email }).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, true)),
  Query.where(Query.exists(userPosts))
)
const firstPage = base.pipe(Query.orderBy(users.id), Query.limit(20))
const frequentAuthors = base.pipe(
  Query.where(Query.gte(users.visits, 3)),
  Query.orderBy(users.id)
)
// base is unchanged; neither branch needs to rebuild the correlated subquery.

export {};
