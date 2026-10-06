// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1470-1506, 1511-1541

// README.md:1470-1506
import { Column, Function, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const posts = Table.make("posts", {
  id: Column.uuid().pipe(Column.primaryKey),
  userId: Column.uuid(),
  title: Column.text().pipe(Column.nullable),
  publishedAt: Column.datetime().pipe(Column.nullable)
})

const visiblePosts = Query.select({
  userId: users.id,
  postId: posts.id,
  title: posts.title,
  upperTitle: Pg.Function.upper(posts.title)
}).pipe(
  Query.from(users),
  Query.leftJoin(posts, Query.eq(users.id, posts.userId)),
  Query.where(Query.isNotNull(posts.title))
)

type VisiblePostRow = Query.ResultRow<typeof visiblePosts>
// {
//   readonly userId: string
//   readonly postId: string
//   readonly title: string      // isNotNull(posts.title) proves this is not null
//   readonly upperTitle: string
// }
// The title predicate also proves the left-joined posts row exists, so postId is string.


{
  // README.md:1511-1541
  const userPosts = Query.select({
    userId: users.id,
    postId: posts.id,
    title: posts.title,
    publishedAt: posts.publishedAt
  }).pipe(
    Query.from(users),
    Query.leftJoin(posts, Query.eq(users.id, posts.userId))
  )

  type UserPostRow = Query.ResultRow<typeof userPosts>
  // {
  //   readonly userId: string
  //   readonly postId: string | null
  //   readonly title: string | null
  //   readonly publishedAt: string | null
  // }

  const releaseNotes = userPosts.pipe(
    Query.where(Query.eq(posts.title, "Release notes"))
  )

  type ReleaseNoteRow = Query.ResultRow<typeof releaseNotes>
  // {
  //   readonly userId: string
  //   readonly postId: string
  //   readonly title: "Release notes"
  //   readonly publishedAt: string | null
  // }
}

export {};
