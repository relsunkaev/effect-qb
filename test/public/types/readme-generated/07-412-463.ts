// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 412-463

// README.md:412-463
import type * as Brand from "effect/Brand"
import { Column as C, Expression as E, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey, C.brand),
  email: C.text()
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  authorId: C.uuid(),
  title: C.text()
})

const userPlan = Q.select({
  id: users.id,
  email: users.email
}).pipe(
  Q.from(users)
)

const postPlan = Q.select({
  authorId: posts.authorId.pipe(C.brand),
  title: posts.title
}).pipe(
  Q.from(posts)
)

type UserRow = Q.ResultRow<typeof userPlan>
// UserRow:
// {
//   id: string & Brand.Brand<"users.id">
//   email: string
// }

type PostRow = Q.ResultRow<typeof postPlan>
// PostRow:
// {
//   authorId: string & Brand.Brand<"posts.authorId">
//   title: string
// }

const loadUser = (id: UserRow["id"]) => id

declare const userRow: UserRow
declare const postRow: PostRow

loadUser(userRow.id)
// @ts-expect-error different provenance, even though both values are strings
loadUser(postRow.authorId)

export {};
