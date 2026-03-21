import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text()
})

const leftJoined = Q.select({
  userId: users.id,
  postTitle: posts.title,
  loweredTitle: Q.lower(posts.title),
  fallbackTitle: Q.coalesce(posts.title, Q.literal("missing"))
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId))
)

type LeftJoinedRow = Q.ResultRow<typeof leftJoined>
const nullableJoinedField: LeftJoinedRow["postTitle"] = null
const nullableDerivedField: LeftJoinedRow["loweredTitle"] = null
const nonNullFallback: LeftJoinedRow["fallbackTitle"] = "missing"
// @ts-expect-error coalesce with a non-null fallback should not stay nullable
const nullFallback: LeftJoinedRow["fallbackTitle"] = null
void nullableJoinedField
void nullableDerivedField
void nonNullFallback
void nullFallback

const variadicFallbackPlan = Q.select({
  userId: users.id,
  fallbackTitle: Q.coalesce(null, posts.title, Q.literal("missing"))
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId))
)

type VariadicFallbackRow = Q.ResultRow<typeof variadicFallbackPlan>
const variadicFallback: VariadicFallbackRow["fallbackTitle"] = "missing"
// @ts-expect-error variadic coalesce with a non-null fallback should not stay nullable
const variadicNullFallback: VariadicFallbackRow["fallbackTitle"] = null
void variadicFallback
void variadicNullFallback

const innerJoined = Q.select({
  userId: users.id,
  postId: posts.id,
  postTitle: posts.title
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId))
)

type InnerJoinedRow = Q.ResultRow<typeof innerJoined>
const innerJoinedPostId: InnerJoinedRow["postId"] = "post-id"
const innerJoinedTitle: InnerJoinedRow["postTitle"] = "title"
// @ts-expect-error inner joins should not make joined non-null columns nullable
const innerJoinedNullPostId: InnerJoinedRow["postId"] = null
void innerJoinedTitle
void innerJoinedPostId
void innerJoinedNullPostId

const rightJoined = Q.select({
  userId: users.id,
  postId: posts.id
}).pipe(
  Q.from(users),
  Q.rightJoin(posts, Q.eq(users.id, posts.userId))
)

type RightJoinedRow = Q.ResultRow<typeof rightJoined>
const rightJoinedUserId: RightJoinedRow["userId"] = null
const rightJoinedPostId: RightJoinedRow["postId"] = "post-id"
// @ts-expect-error right joins should keep the joined source non-null
const rightJoinedNullPostId: RightJoinedRow["postId"] = null
void rightJoinedUserId
void rightJoinedPostId
void rightJoinedNullPostId

const fullJoined = Q.select({
  userId: users.id,
  postId: posts.id
}).pipe(
  Q.from(users),
  Q.fullJoin(posts, Q.eq(users.id, posts.userId))
)

type FullJoinedRow = Q.ResultRow<typeof fullJoined>
const fullJoinedUserId: FullJoinedRow["userId"] = null
const fullJoinedPostId: FullJoinedRow["postId"] = null
void fullJoinedUserId
void fullJoinedPostId

const crossJoined = Q.select({
  userId: users.id,
  postId: posts.id
}).pipe(
  Q.from(users),
  Q.crossJoin(posts)
)

type CrossJoinedRow = Q.ResultRow<typeof crossJoined>
const crossJoinedUserId: CrossJoinedRow["userId"] = "user-id"
const crossJoinedPostId: CrossJoinedRow["postId"] = "post-id"
// @ts-expect-error cross joins should not introduce nullable joined fields
const crossJoinedNullPostId: CrossJoinedRow["postId"] = null
void crossJoinedUserId
void crossJoinedPostId
void crossJoinedNullPostId

const paginatedPlan = Q.select({
  userId: users.id
}).pipe(
  Q.from(users),
  Q.distinct(),
  Q.limit(5),
  Q.offset(10)
)

type PaginatedRow = Q.ResultRow<typeof paginatedPlan>
const paginatedUserId: PaginatedRow["userId"] = "user-1"
void paginatedUserId
