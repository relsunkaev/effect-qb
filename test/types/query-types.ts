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

const predicateSurfacePlan = Q.select({
  userId: users.id
}).pipe(
  Q.from(users)
)

type PredicateSurfaceRow = Q.ResultRow<typeof predicateSurfacePlan>
const predicateSurfaceUserId: PredicateSurfaceRow["userId"] = "user-1"
void predicateSurfaceUserId

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

const predicateHelpersPlan = Q.select({
  distinctEmail: Q.isDistinctFrom(users.email, "alice@example.com"),
  sameEmail: Q.isNotDistinctFrom(users.email, "alice@example.com"),
  notInIds: Q.notIn(users.id, 4, 5, 6),
  combined: Q.all(
    Q.eq(users.id, 1),
    Q.any(
      Q.eq(users.email, "alice@example.com"),
      Q.eq(users.email, "bob@example.com")
    )
  ),
  label: Q.match(users.email)
    .when("alice@example.com", "Alice")
    .when("bob@example.com", "Bob")
    .else("Other")
}).pipe(
  Q.from(users)
)

type PredicateHelpersRow = Q.ResultRow<typeof predicateHelpersPlan>
const predicateHelpersDistinct: PredicateHelpersRow["distinctEmail"] = true
const predicateHelpersSame: PredicateHelpersRow["sameEmail"] = true
const predicateHelpersNotIn: PredicateHelpersRow["notInIds"] = true
const predicateHelpersCombined: PredicateHelpersRow["combined"] = true
const predicateHelpersLabelValue: PredicateHelpersRow["label"] = "Other"
const predicateHelpersLabel: string = predicateHelpersLabelValue
void predicateHelpersDistinct
void predicateHelpersSame
void predicateHelpersNotIn
void predicateHelpersCombined
void predicateHelpersLabelValue
void predicateHelpersLabel

// @ts-expect-error distinct is select-only
Q.distinct()(Q.delete(users))

// @ts-expect-error limit is select-only
Q.limit(5)(Q.update(users, {
  email: "updated@example.com"
}))

// @ts-expect-error offset is select-only
Q.offset(10)(Q.insert(users, {
  id: "user-id",
  email: "alice@example.com"
}))

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

const cteSourceSubquery = Q.select({
  userId: posts.userId,
  title: posts.title
}).pipe(
  Q.from(posts),
  Q.where(Q.isNotNull(posts.title))
)

const cteSource = Q.with(cteSourceSubquery, "active_posts")

const cteSourcePlan = Q.select({
  userId: users.id,
  title: cteSource.title
}).pipe(
  Q.from(users),
  Q.innerJoin(cteSource, Q.eq(users.id, cteSource.userId))
)

type CteSourceRow = Q.ResultRow<typeof cteSourcePlan>
const cteSourceTitle: CteSourceRow["title"] = "hello"
void cteSourceTitle

const recursiveCteSource = Q.withRecursive(cteSourceSubquery, "recursive_posts")
const recursiveCteFlag: typeof recursiveCteSource["recursive"] = true
void recursiveCteFlag

const lateralPosts = Q.lateral(
  Q.select({
    postId: posts.id,
    userId: posts.userId
  }).pipe(
    Q.from(posts),
    Q.where(Q.eq(posts.userId, users.id))
  ),
  "user_posts"
)

type LateralRequired = Q.SourceRequiredOf<typeof lateralPosts>
const lateralRequired: LateralRequired = "users"
void lateralRequired

type LateralRequirementError = Q.SourceRequirementError<typeof lateralPosts>
const lateralRequirementMessage: LateralRequirementError["__effect_qb_error__"] =
  "effect-qb: correlated source requires outer-scope tables to be in scope first"
void lateralRequirementMessage

Q.select({
  userId: users.id
}).pipe(
  // @ts-expect-error correlated sources cannot start a query
  Q.from(lateralPosts)
)

const lockPlan = Q.select({
  userId: users.id
}).pipe(
  Q.from(users),
  Q.lock("update", { nowait: true, skipLocked: true })
)

type LockPlanCapabilities = Q.CapabilitiesOfPlan<typeof lockPlan>
const lockPlanCapability: LockPlanCapabilities = "transaction"
void lockPlanCapability

const upsertPlan = Q.upsert(users, {
  id: "user-1",
  email: "alice@example.com"
}, ["id"] as const, {
  email: "alice@example.com"
})

type UpsertStatement = Q.StatementOfPlan<typeof upsertPlan>
const upsertStatement: UpsertStatement = "insert"
type UpsertCapability = Q.CapabilitiesOfPlan<typeof upsertPlan>
const upsertCapability: UpsertCapability = "write"
void upsertStatement
void upsertCapability

Q.upsert(users, {
  id: "user-1",
  email: "alice@example.com"
}, 
// @ts-expect-error upsert conflict columns must exist on the target table
["missing"] as const, {
  email: "alice@example.com"
})

const activeUsers = Q.select({
  email: users.email
}).pipe(
  Q.from(users),
  Q.where(Q.like(users.email, "%@example.com"))
)

const archivedUsers = Q.select({
  email: users.email
}).pipe(
  Q.from(users),
  Q.where(Q.eq(users.email, "archived@example.com"))
)

const unionPlan = Q.union(activeUsers, archivedUsers)
const intersectPlan = Q.intersect(activeUsers, archivedUsers)
const exceptPlan = Q.except(activeUsers, archivedUsers)

type UnionRow = Q.ResultRow<typeof unionPlan>
const unionEmail: UnionRow["email"] = "alice@example.com"
type UnionStatement = Q.StatementOfPlan<typeof unionPlan>
const unionStatement: UnionStatement = "set"
type UnionCapability = Q.CapabilitiesOfPlan<typeof unionPlan>
const unionCapability: UnionCapability = "read"
void unionEmail
void unionStatement
void unionCapability
void intersectPlan
void exceptPlan

const mismatchedSetOperand = Q.select({
  postId: posts.id
}).pipe(
  Q.from(posts)
)

type MismatchedSetOperandError = Q.SetCompatibleRightPlan<typeof activeUsers, typeof mismatchedSetOperand, "postgres">
const mismatchedSetOperandMessage: MismatchedSetOperandError["__effect_qb_error__"] =
  "effect-qb: set operator operands must have matching result rows"
const mismatchedSetOperandHint: MismatchedSetOperandError["__effect_qb_hint__"] =
  "Project the same nested object shape and compatible nullability from each operand"
void mismatchedSetOperandMessage
void mismatchedSetOperandHint

const insertedUser = Q.insert(users, {
  id: "user-1",
  email: "alice@example.com"
})

type InvalidSetOperandStatement = Q.SetCompatiblePlan<typeof insertedUser, "postgres">
const invalidSetOperandStatement: InvalidSetOperandStatement["__effect_qb_statement__"] = "insert"
void invalidSetOperandStatement

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

const windowPlan = Q.select({
  userId: users.id,
  rowNumber: Q.rowNumber({
    partitionBy: [users.id],
    orderBy: [{ value: posts.id, direction: "asc" }]
  }),
  rankedTitle: Q.rank({
    partitionBy: [users.id],
    orderBy: [{ value: Q.lower(posts.title), direction: "desc" }]
  }),
  postCount: Q.over(Q.count(posts.id), {
    partitionBy: [users.id],
    orderBy: [{ value: posts.id, direction: "asc" }]
  }),
  latestTitle: Q.over(Q.max(posts.title), {
    partitionBy: [users.id]
  })
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId))
)

type WindowRow = Q.ResultRow<typeof windowPlan>
const windowRowNumber: WindowRow["rowNumber"] = 1
const windowRankedTitle: WindowRow["rankedTitle"] = 2
const windowPostCount: WindowRow["postCount"] = 3
const nullableWindowTitle: WindowRow["latestTitle"] = null
// @ts-expect-error row_number should be non-null
const nullWindowRowNumber: WindowRow["rowNumber"] = null
void windowRowNumber
void windowRankedTitle
void windowPostCount
void nullableWindowTitle
void nullWindowRowNumber

type WindowRuntimeRow = Q.RuntimeResultRow<typeof windowPlan>
const runtimeWindowTitle: WindowRuntimeRow["latestTitle"] = null
void runtimeWindowTitle

const invalidGroupedWindowPlan = Q.select({
  email: users.email,
  rowNumber: Q.rowNumber({
    orderBy: [{ value: users.id, direction: "asc" }]
  }),
  postCount: Q.count(posts.id)
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.email)
)

type InvalidGroupedWindowPlan = Q.CompletePlan<typeof invalidGroupedWindowPlan>
const invalidGroupedWindowError: InvalidGroupedWindowPlan["__effect_qb_error__"] =
  "effect-qb: invalid grouped selection"
void invalidGroupedWindowError

// @ts-expect-error over requires an aggregate input
const invalidWindowAggregate = Q.over(users.email, {
  partitionBy: [users.id]
})
void invalidWindowAggregate

// @ts-expect-error ranking window functions require at least one ordering term
const invalidRowNumber = Q.rowNumber({
  partitionBy: [users.id]
})
void invalidRowNumber

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

const rightJoinUserMode: typeof rightJoined[typeof Plan.TypeId]["available"]["users"]["mode"] = "optional"
const rightJoinPostMode: typeof rightJoined[typeof Plan.TypeId]["available"]["posts"]["mode"] = "required"
const fullJoinUserMode: typeof fullJoined[typeof Plan.TypeId]["available"]["users"]["mode"] = "optional"
const fullJoinPostMode: typeof fullJoined[typeof Plan.TypeId]["available"]["posts"]["mode"] = "optional"
const crossJoinPostMode: typeof crossJoined[typeof Plan.TypeId]["available"]["posts"]["mode"] = "required"
void rightJoinUserMode
void rightJoinPostMode
void fullJoinUserMode
void fullJoinPostMode
void crossJoinPostMode
