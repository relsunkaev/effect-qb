import { Column as C, Query as Q, Function as F, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  status: C.text(),
  title: C.text().pipe(C.nullable)
})

const nullFiltered = Q.select({
  title: posts.title,
  upperTitle: F.upper(posts.title)
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
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.not(Q.isNull(posts.title)))
)

type ConservativeNotNullRow = Q.ResultRow<typeof conservativeNotNull>
const conservativeTitle: ConservativeNotNullRow["title"] = "hello"
// @ts-expect-error not(isNull(...)) should narrow the filtered column itself
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

const promotedJoinNullableColumn = Q.select({
  userId: users.id,
  postTitle: posts.title
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.where(Q.isNotNull(posts.id))
)

type PromotedJoinNullableColumnRow = Q.ResultRow<typeof promotedJoinNullableColumn>
const promotedNullableUserId: PromotedJoinNullableColumnRow["userId"] = "user-id"
const promotedNullablePostTitle: PromotedJoinNullableColumnRow["postTitle"] = "hello"
const promotedNullableNullPostTitle: PromotedJoinNullableColumnRow["postTitle"] = null
void promotedNullableUserId
void promotedNullablePostTitle
void promotedNullableNullPostTitle

const promotedByEquality = Q.select({
  userId: users.id,
  postTitle: posts.title,
  upperPostTitle: F.upper(posts.title)
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

const promotedByIn = Q.select({
  title: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.in(posts.title, "draft", "published"))
)

type PromotedByInRow = Q.ResultRow<typeof promotedByIn>
const promotedInTitle: PromotedByInRow["title"] = "draft"
const promotedInUpperTitle: PromotedByInRow["upperTitle"] = "DRAFT"
// @ts-expect-error IN over literals should imply the filtered column is non-null
const promotedInNullTitle: PromotedByInRow["title"] = null
// @ts-expect-error derived expressions should inherit the non-null proof from IN
const promotedInNullUpperTitle: PromotedByInRow["upperTitle"] = null
void promotedInTitle
void promotedInUpperTitle
void promotedInNullTitle
void promotedInNullUpperTitle

const promotedByNotIn = Q.select({
  title: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.notIn(posts.title, "archived", "deleted"))
)

type PromotedByNotInRow = Q.ResultRow<typeof promotedByNotIn>
const promotedNotInTitle: PromotedByNotInRow["title"] = "draft"
const promotedNotInUpperTitle: PromotedByNotInRow["upperTitle"] = "DRAFT"
// @ts-expect-error NOT IN over literals should also imply the filtered column is non-null
const promotedNotInNullTitle: PromotedByNotInRow["title"] = null
// @ts-expect-error derived expressions should inherit the non-null proof from NOT IN
const promotedNotInNullUpperTitle: PromotedByNotInRow["upperTitle"] = null
void promotedNotInTitle
void promotedNotInUpperTitle
void promotedNotInNullTitle
void promotedNotInNullUpperTitle
