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

const comments = Table.make("comments", {
  id: C.uuid().pipe(C.primaryKey),
  postId: C.uuid(),
  body: C.text()
})

const basePlan = Q.select({
  userId: users.id
}).pipe(
  Q.from(users)
)

type BaseRow = Q.ResultRow<typeof basePlan>
const baseUserId: BaseRow["userId"] = "user-id"
// @ts-expect-error base-source fields should not be nullable
const baseNullUserId: BaseRow["userId"] = null
void baseUserId
void baseNullUserId

const leftJoined = Q.select({
  userId: users.id,
  postId: posts.id,
  missingTitle: Q.isNull(posts.title),
  presentTitle: Q.isNotNull(posts.title),
  fallbackTitle: Q.coalesce(posts.title, Q.literal("missing"))
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId))
)

type LeftJoinedRow = Q.ResultRow<typeof leftJoined>
const baseJoinedUserId: LeftJoinedRow["userId"] = "user-id"
const nullablePostId: LeftJoinedRow["postId"] = null
const missingTitle: LeftJoinedRow["missingTitle"] = true
const presentTitle: LeftJoinedRow["presentTitle"] = false
const fallbackTitle: LeftJoinedRow["fallbackTitle"] = "missing"
// @ts-expect-error isNull should remain a non-null boolean
const nullMissingTitle: LeftJoinedRow["missingTitle"] = null
void nullablePostId
void baseJoinedUserId
void missingTitle
void presentTitle
void fallbackTitle
void nullMissingTitle

const aggregatedLeftJoined = Q.select({
  userId: users.id,
  maxTitle: Q.max(posts.title),
  minTitle: Q.min(posts.title),
  postCount: Q.count(posts.id)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.id)
)

type AggregatedLeftJoinedRow = Q.ResultRow<typeof aggregatedLeftJoined>
const aggregatedUserId: AggregatedLeftJoinedRow["userId"] = "user-id"
const maxTitle: AggregatedLeftJoinedRow["maxTitle"] = null
const minTitle: AggregatedLeftJoinedRow["minTitle"] = null
const postCount: AggregatedLeftJoinedRow["postCount"] = 0
// @ts-expect-error count should remain non-null
const nullPostCount: AggregatedLeftJoinedRow["postCount"] = null
void maxTitle
void minTitle
void postCount
void aggregatedUserId
void nullPostCount

const twoOptionalSources = Q.select({
  userId: users.id,
  commentId: comments.id,
  commentBody: comments.body,
  fallbackComment: Q.coalesce(null, comments.body, Q.literal("none"))
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.leftJoin(comments, Q.eq(posts.id, comments.postId))
)

type TwoOptionalRow = Q.ResultRow<typeof twoOptionalSources>
const optionalUserId: TwoOptionalRow["userId"] = "user-id"
const nullableCommentId: TwoOptionalRow["commentId"] = null
const nullableCommentBody: TwoOptionalRow["commentBody"] = null
const fallbackComment: TwoOptionalRow["fallbackComment"] = "none"
// @ts-expect-error coalesce should still seal nullability across multiply-optional sources
const nullFallbackComment: TwoOptionalRow["fallbackComment"] = null
void nullableCommentId
void nullableCommentBody
void fallbackComment
void optionalUserId
void nullFallbackComment

const filteredOptionalSource = Q.select({
  userId: users.id,
  postId: posts.id,
  postTitle: posts.title,
  upperPostTitle: Q.upper(posts.title)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.where(Q.isNotNull(posts.title))
)

type FilteredOptionalSourceRow = Q.ResultRow<typeof filteredOptionalSource>
const filteredUserId: FilteredOptionalSourceRow["userId"] = "user-id"
const filteredPostId: FilteredOptionalSourceRow["postId"] = "post-id"
const filteredPostTitle: FilteredOptionalSourceRow["postTitle"] = "hello"
const filteredUpperPostTitle: FilteredOptionalSourceRow["upperPostTitle"] = "HELLO"
const filteredNullPostId: FilteredOptionalSourceRow["postId"] = null
const filteredNullPostTitle: FilteredOptionalSourceRow["postTitle"] = null
// @ts-expect-error source promotion should remove null from derived expressions
const filteredNullUpperPostTitle: FilteredOptionalSourceRow["upperPostTitle"] = null
void filteredUserId
void filteredPostId
void filteredPostTitle
void filteredUpperPostTitle
void filteredNullPostId
void filteredNullPostTitle
void filteredNullUpperPostTitle

const searchedCasePlan = Q.select({
  userId: users.id,
  normalizedTitle: Q.case()
    .when(Q.isNotNull(posts.title), Q.upper(posts.title))
    .else("missing")
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId))
)

type SearchedCaseRow = Q.ResultRow<typeof searchedCasePlan>
const searchedCaseUserId: SearchedCaseRow["userId"] = "user-id"
const searchedCaseTitle: SearchedCaseRow["normalizedTitle"] = "HELLO"
// @ts-expect-error searched CASE with a non-null else should resolve to string
const searchedCaseNullTitle: SearchedCaseRow["normalizedTitle"] = null
void searchedCaseUserId
void searchedCaseTitle
void searchedCaseNullTitle
