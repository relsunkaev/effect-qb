import type * as Effect from "effect/Effect"

import { Column as C, Executor, Plan, Query as Q, Renderer, Table } from "../../src/index.ts"

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

const predicateSurfacePlan = Q.select({
  userId: users.id
}).pipe(
  Q.from(users)
)

type PredicateSurfaceRow = Q.ResultRow<typeof predicateSurfacePlan>
const predicateSurfaceUserId: PredicateSurfaceRow["userId"] = "user-1"
void predicateSurfaceUserId

const predicateSurfaceApplied = Q.where(Q.and(
  Q.neq(users.id, 1),
  Q.lt(users.id, 2),
  Q.lte(users.id, 3),
  Q.gt(users.id, 0),
  Q.gte(users.id, 0),
  Q.like(users.email, "%@example.com"),
  Q.ilike(users.email, "%@EXAMPLE.COM%"),
  Q.between(users.id, 4, 6),
  Q.in(users.id, 7, 8, 9)
))(predicateSurfacePlan)
void predicateSurfaceApplied

const aliasPlan = Q.select({
  profile: {
    id: Q.as(users.id, "user_identifier"),
    email: Q.as(Q.lower(users.email), "email_lower")
  }
}).pipe(
  Q.from(users)
)

type AliasRow = Q.ResultRow<typeof aliasPlan>
const aliasRow: AliasRow = {
  profile: {
    id: "user-1",
    email: "alice@example.com"
  }
}
void aliasRow

const existsSubquery = Q.select({
  id: posts.id
}).pipe(
  Q.from(posts)
)

const existsPlan = Q.select({
  hasPosts: Q.exists(existsSubquery)
})

type ExistsRow = Q.ResultRow<typeof existsPlan>
const existsValue: ExistsRow["hasPosts"] = true
// @ts-expect-error exists subqueries should resolve to a non-null boolean
const nullExistsValue: ExistsRow["hasPosts"] = null
void existsValue
void nullExistsValue

const correlatedExistsSubquery = Q.select({
  id: posts.id
}).pipe(
  Q.from(posts),
  Q.where(Q.eq(posts.userId, users.id))
)

const correlatedExistsPlan = Q.select({
  userId: users.id,
  hasPosts: Q.exists(correlatedExistsSubquery)
}).pipe(
  Q.from(users)
)

type CorrelatedExistsRow = Q.ResultRow<typeof correlatedExistsPlan>
const correlatedExistsValue: CorrelatedExistsRow["hasPosts"] = true
void correlatedExistsValue

const invalidCorrelatedExistsPlan = Q.select({
  hasPosts: Q.exists(correlatedExistsSubquery)
})

type InvalidCorrelatedExistsPlan = Q.CompletePlan<typeof invalidCorrelatedExistsPlan>
const correlatedMissingSource: InvalidCorrelatedExistsPlan["__effect_qb_missing_sources__"] = "users"
void correlatedMissingSource

const derivedSourceSubquery = Q.select({
  userId: posts.userId,
  title: posts.title
}).pipe(
  Q.from(posts),
  Q.where(Q.isNotNull(posts.title))
)

const derivedSource = Q.as(derivedSourceSubquery, "active_posts")

const derivedSourcePlan = Q.select({
  userId: users.id,
  title: derivedSource.title
}).pipe(
  Q.from(users),
  Q.innerJoin(derivedSource, Q.eq(users.id, derivedSource.userId))
)

type DerivedSourceRow = Q.ResultRow<typeof derivedSourcePlan>
const derivedSourceTitle: DerivedSourceRow["title"] = "hello"
// @ts-expect-error derived subquery output is non-null after the inner where
const derivedSourceNullTitle: DerivedSourceRow["title"] = null
void derivedSourceTitle
void derivedSourceNullTitle

type DerivedSourceCapabilities = Q.CapabilitiesOfPlan<typeof derivedSourcePlan>
const derivedSourceCapability: DerivedSourceCapabilities = "read"
void derivedSourceCapability

const invalidDerivedSource = Q.select({
  userId: posts.userId
}).pipe(
  Q.from(posts)
)

type InvalidDerivedSourceError = Q.DerivedSourceRequiredError<typeof invalidDerivedSource>
const invalidDerivedSourceHint: InvalidDerivedSourceError["__effect_qb_hint__"] =
  "Wrap the nested plan in as(subquery, alias) before passing it to from(...) or a join"
void invalidDerivedSourceHint

Q.select({
  userId: users.id
}).pipe(
  // @ts-expect-error subqueries must be aliased before they can be used as a source
  Q.from(invalidDerivedSource)
)

const invalidGroupedExistsSubquery = Q.select({
  userId: posts.userId,
  title: posts.title,
  postCount: Q.count(posts.id)
}).pipe(
  Q.from(posts),
  Q.groupBy(posts.userId)
)

// @ts-expect-error exists requires aggregation-compatible nested plans
const invalidGroupedExists = Q.exists(invalidGroupedExistsSubquery)
void invalidGroupedExists

const aggregatePlan = Q.select({
  email: users.email,
  postCount: Q.count(posts.id)
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.email),
  Q.having(Q.eq(Q.count(posts.id), 1))
)

type AggregatePlanCapabilities = Q.CapabilitiesOfPlan<typeof aggregatePlan>
const aggregateCapability: AggregatePlanCapabilities = "read"
void aggregateCapability

type ManualCapabilityUnion = Q.MergeCapabilities<"read", "write">
const manualReadCapability: ManualCapabilityUnion = "read"
const manualWriteCapability: ManualCapabilityUnion = "write"
type TupleCapabilityUnion = Q.MergeCapabilityTuple<["read", "write", "read"]>
const tupleCapabilityRead: TupleCapabilityUnion = "read"
const tupleCapabilityWrite: TupleCapabilityUnion = "write"
void manualReadCapability
void manualWriteCapability
void tupleCapabilityRead
void tupleCapabilityWrite

const completeAggregatePlan: Q.CompletePlan<typeof aggregatePlan> = aggregatePlan
void completeAggregatePlan

Q.select({
  email: users.email
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
  // @ts-expect-error aggregate predicates are not accepted in where
  Q.where(Q.eq(Q.count(posts.id), 1))
)

const incomplete = Q.select({
  userId: users.id
})

type IncompletePlanError = Q.CompletePlan<typeof incomplete>
const incompletePlanError: IncompletePlanError["__effect_qb_error__"] =
  "effect-qb: query references sources that are not yet in scope"
const incompletePlanMissingSource: IncompletePlanError["__effect_qb_missing_sources__"] = "users"
const incompletePlanHint: IncompletePlanError["__effect_qb_hint__"] =
  "Add from(...) or a join for each referenced source before render or execute"
void incompletePlanError
void incompletePlanMissingSource
void incompletePlanHint

// @ts-expect-error incomplete plans are not renderable
const incompleteRendered = Renderer.make("postgres").render(incomplete)
void incompleteRendered

const rendered = Renderer.make("postgres").render(innerJoined)
type RenderedRow = Renderer.RowOf<typeof rendered>
const renderedRow: RenderedRow = {
  userId: "user-1",
  postId: "post-1",
  postTitle: "hello"
}
void renderedRow

const executor = Executor.make("postgres", <PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any, any, any>>(
  plan: Q.DialectCompatiblePlan<PlanValue, "postgres">
): Effect.Effect<any, never, never> => {
  void plan
  return null as never
})

const executed = executor.execute(innerJoined)
type ExecutedRows = Effect.Effect.Success<typeof executed>
const executedRow: ExecutedRows[number] = {
  userId: "user-1",
  postId: "post-1",
  postTitle: "hello"
}
void executedRow

const manager = Table.alias(users, "manager")
const report = Table.alias(users, "report")
const aliasedPlan = Q.select({
  managerId: manager.id,
  reportId: report.id
}).pipe(
  Q.from(manager),
  Q.leftJoin(report, Q.eq(report.id, manager.id))
)

const managerSourceName: typeof aliasedPlan[typeof Plan.TypeId]["available"]["manager"]["name"] = "manager"
const reportSourceMode: typeof aliasedPlan[typeof Plan.TypeId]["available"]["report"]["mode"] = "optional"
void managerSourceName
void reportSourceMode
