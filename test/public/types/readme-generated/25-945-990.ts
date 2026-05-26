// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 945-990

// README.md:945-990
import { Column, Function, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const posts = Table.make("posts", {
  id: Column.uuid().pipe(Column.primaryKey),
  userId: Column.uuid(),
  title: Column.text().pipe(Column.nullable),
  status: Column.text()
})

const visiblePosts = Query.select({
  userId: users.id,
  postId: posts.id,
  title: posts.title,
  upperTitle: Function.upper(posts.title)
}).pipe(
  Query.from(users),
  Query.leftJoin(posts, Query.eq(users.id, posts.userId)),
  Query.where(Query.isNotNull(posts.title))
)

type VisiblePostRow = Query.ResultRow<typeof visiblePosts>

declare const row: VisiblePostRow

const title: string = row.title
const upperTitle: string = row.upperTitle
const postId: string = row.postId

// @ts-expect-error isNotNull(posts.title) proves selected title is not null
const missingTitle: null = row.title

// @ts-expect-error proving the joined post exists also promotes posts.id
const missingPostId: null = row.postId

void title
void upperTitle
void postId
void missingTitle
void missingPostId

export {};
