// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1033-1060

// README.md:1033-1060
import { Column, Function, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const posts = Table.make("posts", {
  id: Column.uuid().pipe(Column.primaryKey),
  userId: Column.uuid(),
  title: Column.text().pipe(Column.nullable)
})

const postCount = Function.count(posts.id)

const report = Query.select({
  label: Function.concat(Function.lower(users.email), "-user"),
  postCount,
  latestTitle: Function.max(posts.title)
}).pipe(
  Query.from(users),
  Query.leftJoin(posts, Query.eq(users.id, posts.userId)),
  Query.groupBy(users.email),
  Query.having(Query.gt(postCount, 0))
)
// select (lower("users"."email") || $1) as "label", count("posts"."id") as "postCount", max("posts"."title") as "latestTitle" from "users" left join "posts" on ("users"."id" = "posts"."userId") group by "users"."email" having (count("posts"."id") > $2)

export {};
