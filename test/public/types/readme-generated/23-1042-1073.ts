// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1042-1073

// README.md:1042-1073
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const posts = Table.make("posts", {
  id: Column.uuid().pipe(Column.primaryKey),
  userId: Column.uuid(),
  title: Column.text().pipe(Column.nullable)
})

const activePosts = Query.select({
  userId: posts.userId,
  title: posts.title
}).pipe(
  Query.from(posts),
  Query.where(Query.isNotNull(posts.title)),
  Query.with("active_posts")
)

const usersWithActivePosts = Query.select({
  email: users.email,
  title: activePosts.title
}).pipe(
  Query.from(users),
  Query.innerJoin(activePosts, Query.eq(users.id, activePosts.userId))
)
// with "active_posts" as (select "posts"."userId" as "userId", "posts"."title" as "title" from "posts" where ("posts"."title" is not null)) select "users"."email" as "email", "active_posts"."title" as "title" from "users" inner join "active_posts" on ("users"."id" = "active_posts"."userId")

export {};
