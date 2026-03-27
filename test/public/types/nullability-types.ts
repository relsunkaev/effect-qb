import { Column as C, Scalar as E, Query as Q, Function as F, Table } from "effect-qb/postgres"

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
  fallbackTitle: F.coalesce(posts.title, Q.literal("missing"))
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
  maxTitle: F.max(posts.title),
  minTitle: F.min(posts.title),
  postCount: F.count(posts.id)
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
  fallbackComment: F.coalesce(null, comments.body, Q.literal("none"))
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

const promotedAcrossTwoLeftJoins = Q.select({
  userId: users.id,
  postId: posts.id,
  commentId: comments.id,
  commentBody: comments.body
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.leftJoin(comments, Q.eq(posts.id, comments.postId)),
  Q.where(Q.isNotNull(comments.id))
)

type PromotedAcrossTwoLeftJoinsRow = Q.ResultRow<typeof promotedAcrossTwoLeftJoins>
const promotedAcrossTwoJoinsUserId: PromotedAcrossTwoLeftJoinsRow["userId"] = "user-id"
const promotedAcrossTwoJoinsPostId: PromotedAcrossTwoLeftJoinsRow["postId"] = "post-id"
const promotedAcrossTwoJoinsCommentId: PromotedAcrossTwoLeftJoinsRow["commentId"] = "comment-id"
const promotedAcrossTwoJoinsCommentBody: PromotedAcrossTwoLeftJoinsRow["commentBody"] = "body"
// @ts-expect-error deepest join presence should also promote intermediate join sources
const promotedAcrossTwoJoinsNullPostId: PromotedAcrossTwoLeftJoinsRow["postId"] = null
// @ts-expect-error deepest join presence should promote the deepest joined source itself
const promotedAcrossTwoJoinsNullCommentId: PromotedAcrossTwoLeftJoinsRow["commentId"] = null
void promotedAcrossTwoJoinsUserId
void promotedAcrossTwoJoinsPostId
void promotedAcrossTwoJoinsCommentId
void promotedAcrossTwoJoinsCommentBody
void promotedAcrossTwoJoinsNullPostId
void promotedAcrossTwoJoinsNullCommentId

const promotedFromRequiredDeepJoin = Q.select({
  userId: users.id,
  postId: posts.id,
  commentId: comments.id,
  commentBody: comments.body
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.innerJoin(comments, Q.eq(posts.id, comments.postId))
)

type PromotedFromRequiredDeepJoinRow = Q.ResultRow<typeof promotedFromRequiredDeepJoin>
const promotedFromRequiredDeepJoinUserId: PromotedFromRequiredDeepJoinRow["userId"] = "user-id"
const promotedFromRequiredDeepJoinPostId: PromotedFromRequiredDeepJoinRow["postId"] = "post-id"
const promotedFromRequiredDeepJoinCommentId: PromotedFromRequiredDeepJoinRow["commentId"] = "comment-id"
const promotedFromRequiredDeepJoinCommentBody: PromotedFromRequiredDeepJoinRow["commentBody"] = "body"
// @ts-expect-error required downstream joins should also promote optional upstream join sources
const promotedFromRequiredDeepJoinNullPostId: PromotedFromRequiredDeepJoinRow["postId"] = null
// @ts-expect-error inner joins should keep the joined source itself non-null
const promotedFromRequiredDeepJoinNullCommentId: PromotedFromRequiredDeepJoinRow["commentId"] = null
void promotedFromRequiredDeepJoinUserId
void promotedFromRequiredDeepJoinPostId
void promotedFromRequiredDeepJoinCommentId
void promotedFromRequiredDeepJoinCommentBody
void promotedFromRequiredDeepJoinNullPostId
void promotedFromRequiredDeepJoinNullCommentId

const filteredOptionalSource = Q.select({
  userId: users.id,
  postId: posts.id,
  postTitle: posts.title,
  upperPostTitle: F.upper(posts.title)
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
// @ts-expect-error source promotion should make non-null joined columns non-null
const filteredNullPostId: FilteredOptionalSourceRow["postId"] = null
// @ts-expect-error isNotNull should also remove null from the filtered column itself
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

const absentAcrossDependentLeftJoins = Q.select({
  userId: users.id,
  postId: posts.id,
  postTitle: posts.title,
  commentId: comments.id,
  commentBody: comments.body
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.leftJoin(comments, Q.eq(posts.id, comments.postId)),
  Q.where(Q.isNull(posts.id))
)

type AbsentAcrossDependentLeftJoinsRow = Q.ResultRow<typeof absentAcrossDependentLeftJoins>
const absentAcrossDependentUserId: AbsentAcrossDependentLeftJoinsRow["userId"] = "user-id"
const absentAcrossDependentPostId: AbsentAcrossDependentLeftJoinsRow["postId"] = null
const absentAcrossDependentPostTitle: AbsentAcrossDependentLeftJoinsRow["postTitle"] = null
const absentAcrossDependentCommentId: AbsentAcrossDependentLeftJoinsRow["commentId"] = null
const absentAcrossDependentCommentBody: AbsentAcrossDependentLeftJoinsRow["commentBody"] = null
// @ts-expect-error isNull on the parent optional join should collapse that source to null
const absentAcrossDependentBadPostId: AbsentAcrossDependentLeftJoinsRow["postId"] = "post-id"
// @ts-expect-error dependent left joins should also collapse to null
const absentAcrossDependentBadCommentId: AbsentAcrossDependentLeftJoinsRow["commentId"] = "comment-id"
// @ts-expect-error non-null comment payloads should collapse with the absent source
const absentAcrossDependentBadCommentBody: AbsentAcrossDependentLeftJoinsRow["commentBody"] = "body"
void absentAcrossDependentUserId
void absentAcrossDependentPostId
void absentAcrossDependentPostTitle
void absentAcrossDependentCommentId
void absentAcrossDependentCommentBody
void absentAcrossDependentBadPostId
void absentAcrossDependentBadCommentId
void absentAcrossDependentBadCommentBody

const normalizedTitleExpr = Q.case()
  .when(Q.isNotNull(posts.title), F.upper(posts.title))
  .else("missing")

type SearchedCaseTitle = E.RuntimeOf<typeof normalizedTitleExpr>
const searchedCaseTitle: SearchedCaseTitle = "HELLO"
const searchedCaseNullTitle: SearchedCaseTitle = null
void searchedCaseTitle
void searchedCaseNullTitle
