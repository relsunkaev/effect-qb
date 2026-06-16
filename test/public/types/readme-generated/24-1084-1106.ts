// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1084-1106

// README.md:1084-1106
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const posts = Table.make("posts", {
  id: Column.uuid().pipe(Column.primaryKey),
  userId: Column.uuid()
})

const userPosts = Query.select({ value: posts.id }).pipe(
  Query.from(posts),
  Query.where(Query.eq(posts.userId, users.id))
)

const authors = Query.select({
  email: users.email,
  hasPosts: Query.exists(userPosts)
}).pipe(Query.from(users))

export {};
