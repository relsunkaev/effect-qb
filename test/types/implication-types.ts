import { Column as C, Query as Q, Table } from "../../src/postgres.ts"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable)
})

const nullFiltered = Q.select({
  title: posts.title,
  upperTitle: Q.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.isNull(posts.title))
)

type NullFilteredRow = Q.ResultRow<typeof nullFiltered>
type NullFilteredRuntimeRow = Q.RuntimeResultRow<typeof nullFiltered>
const nullFilteredTitle: NullFilteredRow["title"] = null
const nullFilteredUpperTitle: NullFilteredRow["upperTitle"] = null
// @ts-expect-error isNull should collapse the selected column to null
const badNullFilteredTitle: NullFilteredRow["title"] = "hello"
// @ts-expect-error derived expressions over an always-null source should also be null
const badNullFilteredUpperTitle: NullFilteredRow["upperTitle"] = "HELLO"
const runtimeNullFilteredTitle: NullFilteredRuntimeRow["title"] = "hello"
const runtimeNullFilteredNullTitle: NullFilteredRuntimeRow["title"] = null
void nullFilteredTitle
void nullFilteredUpperTitle
void badNullFilteredTitle
void badNullFilteredUpperTitle
void runtimeNullFilteredTitle
void runtimeNullFilteredNullTitle

const conservativeNotNull = Q.select({
  title: posts.title,
  upperTitle: Q.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.not(Q.isNull(posts.title)))
)

type ConservativeNotNullRow = Q.ResultRow<typeof conservativeNotNull>
const conservativeTitle: ConservativeNotNullRow["title"] = "hello"
const conservativeNullTitle: ConservativeNotNullRow["title"] = null
const conservativeUpperTitle: ConservativeNotNullRow["upperTitle"] = "HELLO"
// @ts-expect-error derived expressions should still narrow when the direct column refinement is recognized
const conservativeNullUpperTitle: ConservativeNotNullRow["upperTitle"] = null
void conservativeTitle
void conservativeNullTitle
void conservativeUpperTitle
void conservativeNullUpperTitle

const promotedJoin = Q.select({
  userId: users.id,
  postId: posts.id
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.where(Q.isNotNull(posts.id))
)

type PromotedJoinRow = Q.ResultRow<typeof promotedJoin>
type PromotedJoinRuntimeRow = Q.RuntimeResultRow<typeof promotedJoin>
const promotedUserId: PromotedJoinRow["userId"] = "user-id"
const promotedPostId: PromotedJoinRow["postId"] = "post-id"
// @ts-expect-error ResultRow should promote the joined source to non-null
const badPromotedPostId: PromotedJoinRow["postId"] = null
const runtimePromotedPostId: PromotedJoinRuntimeRow["postId"] = null
void promotedUserId
void promotedPostId
void badPromotedPostId
void runtimePromotedPostId

const promotedByEquality = Q.select({
  userId: users.id,
  postTitle: posts.title,
  upperPostTitle: Q.upper(posts.title)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.where(Q.eq(posts.title, users.email))
)

type PromotedByEqualityRow = Q.ResultRow<typeof promotedByEquality>
const promotedByEqualityUserId: PromotedByEqualityRow["userId"] = "user-id"
const promotedByEqualityPostTitle: PromotedByEqualityRow["postTitle"] = "hello"
const promotedByEqualityUpperPostTitle: PromotedByEqualityRow["upperPostTitle"] = "HELLO"
void promotedByEqualityUserId
void promotedByEqualityPostTitle
void promotedByEqualityUpperPostTitle
