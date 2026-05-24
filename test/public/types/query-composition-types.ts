import * as Std from "effect-qb"
import type * as Effect from "effect/Effect"

import { Executor, Query as Q, Function as F, Renderer } from "effect-qb/postgres"
import type {
  BrandedErrorOf,
  BrandedHintOf,
  BrandedMissingSourcesOf,
  BrandedStatementOf
} from "../../helpers/branded-error.ts"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text()
})

const posts = Std.Table.make("posts", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  userId: Std.Column.uuid(),
  title: Std.Column.text()
})

const dottedGroupingTable = Std.Table.make("a.b", {
  status: Std.Column.text()
})

const splitGroupingTable = Std.Table.make("a", {
  "b.status": Std.Column.text()
})

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

const groupedExistsPlan = Q.select({
  hasPosts: Q.exists(correlatedExistsSubquery),
  userCount: F.count(users.id)
}).pipe(
  Q.from(users),
  Q.groupBy(Q.exists(correlatedExistsSubquery))
)

const completeGroupedExistsPlan: Q.CompletePlan<typeof groupedExistsPlan> = groupedExistsPlan
void completeGroupedExistsPlan

const invalidCorrelatedExistsPlan = Q.select({
  hasPosts: Q.exists(correlatedExistsSubquery)
})

type InvalidCorrelatedExistsPlan = Q.CompletePlan<typeof invalidCorrelatedExistsPlan>
const correlatedMissingSource: BrandedMissingSourcesOf<InvalidCorrelatedExistsPlan> = "users"
void correlatedMissingSource

const insertExistsSubquery = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com"
})

// @ts-expect-error exists subqueries only accept select-like plans
const invalidInsertExists = Q.exists(insertExistsSubquery)
void invalidInsertExists

const derivedSourceSubquery = Q.select({
  userId: posts.userId,
  title: posts.title
}).pipe(
  Q.from(posts),
  Q.where(Q.isNotNull(posts.title))
)

const derivedSource = Q.as(derivedSourceSubquery, "active_posts")
declare const dynamicSourceAlias: string
// @ts-expect-error derived source aliases must be literal strings
Q.as(derivedSourceSubquery, dynamicSourceAlias)
// @ts-expect-error derived source aliases must be non-empty
Q.as(derivedSourceSubquery, "")
// @ts-expect-error curried derived source aliases must be literal strings
Q.as(dynamicSourceAlias)(derivedSourceSubquery)
// @ts-expect-error curried derived source aliases must be non-empty
Q.as("")(derivedSourceSubquery)

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

const cteSource = cteSourceSubquery.pipe(Q.with("active_posts"))
// @ts-expect-error CTE aliases must be literal strings
cteSourceSubquery.pipe(Q.with(dynamicSourceAlias))
// @ts-expect-error CTE aliases must be non-empty
cteSourceSubquery.pipe(Q.with(""))

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

const recursiveCteSource = cteSourceSubquery.pipe(Q.withRecursive("recursive_posts"))
// @ts-expect-error recursive CTE aliases must be literal strings
cteSourceSubquery.pipe(Q.withRecursive(dynamicSourceAlias))
// @ts-expect-error recursive CTE aliases must be non-empty
cteSourceSubquery.pipe(Q.withRecursive(""))
const recursiveCteFlag: typeof recursiveCteSource["recursive"] = true
void recursiveCteFlag

const lateralPosts = Q.select({
    postId: posts.id,
    userId: posts.userId
  }).pipe(
    Q.from(posts),
    Q.where(Q.eq(posts.userId, users.id)),
    Q.lateral("user_posts")
  )
// @ts-expect-error lateral aliases must be literal strings
Q.lateral(dynamicSourceAlias)(cteSourceSubquery)
// @ts-expect-error lateral aliases must be non-empty
Q.lateral("")(cteSourceSubquery)

type LateralRequired = Q.SourceRequiredOf<typeof lateralPosts>
const lateralRequired: LateralRequired = "users"
void lateralRequired

type LateralRequirementError = Q.SourceRequirementError<typeof lateralPosts>
const lateralRequirementMessage: BrandedErrorOf<LateralRequirementError> =
  "effect-qb: correlated source requires outer-scope tables to be in scope first"
void lateralRequirementMessage

Q.select({
  userId: users.id
}).pipe(
  // @ts-expect-error correlated sources cannot start a query
  Q.from(lateralPosts)
)

Q.select({
  anchorId: posts.id,
  postId: lateralPosts.postId
}).pipe(
  Q.from(posts),
  // @ts-expect-error correlated sources cannot be joined before their outer dependencies are in scope
  Q.innerJoin(lateralPosts, Q.eq(lateralPosts.userId, posts.userId))
)

const lateralJoinPlan = Q.select({
  userId: users.id,
  postId: lateralPosts.postId
}).pipe(
  Q.from(users),
  Q.innerJoin(lateralPosts, Q.eq(lateralPosts.userId, users.id))
)
type LateralJoinRow = Q.ResultRow<typeof lateralJoinPlan>
const lateralJoinUserId: LateralJoinRow["userId"] = "00000000-0000-0000-0000-000000000000"
void lateralJoinUserId

const lockPlan = Q.select({
  userId: users.id
}).pipe(
  Q.from(users),
  Q.lock("update", { nowait: true })
)

Q.select({
  userId: users.id
}).pipe(
  Q.from(users),
  // @ts-expect-error lock options cannot specify both nowait and skipLocked
  Q.lock("update", { nowait: true, skipLocked: true })
)

// @ts-expect-error lock mode must be update or share for select statements
Q.lock("exclusive")

type LockPlanCapabilities = Q.CapabilitiesOfPlan<typeof lockPlan>
const lockPlanCapability: LockPlanCapabilities = "transaction"
void lockPlanCapability

const upsertPlan = Q.upsert(users, {
  id: "user-1",
  email: "alice@example.com"
}, ["id"] as const, {
  email: "alice@example.com"
})

const upsertStringConflictPlan = Q.upsert(users, {
  id: "user-1",
  email: "alice@example.com"
}, "id", {
  email: "alice@example.com"
})

type UpsertStatement = Q.StatementOfPlan<typeof upsertPlan>
const upsertStatement: UpsertStatement = "insert"
type UpsertCapability = Q.CapabilitiesOfPlan<typeof upsertPlan>
const upsertCapability: UpsertCapability = "write"
void upsertStatement
void upsertCapability
void upsertStringConflictPlan

Q.upsert(users, {
  id: "user-1",
  email: "alice@example.com"
}, ["id"] as const,
  // @ts-expect-error upsert update values require at least one assignment
  {})

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

const setPosts = Std.Table.make("set_posts", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  title: Std.Column.text().pipe(Std.Column.nullable)
})

const titledSetPosts = Q.select({
  title: setPosts.title
}).pipe(
  Q.from(setPosts),
  Q.where(Q.isNotNull(setPosts.title))
)

const archivedTitledSetPosts = Q.select({
  title: setPosts.title
}).pipe(
  Q.from(setPosts),
  Q.where(Q.isNotNull(setPosts.title))
)

const unionTitledPosts = Q.unionAll(titledSetPosts, archivedTitledSetPosts)
type UnionTitledPostsRow = Q.ResultRow<typeof unionTitledPosts>
const unionTitle: UnionTitledPostsRow["title"] = "hello"
// @ts-expect-error set operator result rows should preserve narrowed operand output
const unionNullTitle: UnionTitledPostsRow["title"] = null
void unionTitle
void unionNullTitle

const nullableTitledSetPosts = Q.select({
  title: setPosts.title
}).pipe(
  Q.from(setPosts)
)

const unsafelyNarrowedUnion = Q.unionAll(titledSetPosts, nullableTitledSetPosts)
type UnsafelyNarrowedUnionRow = Q.ResultRow<typeof unsafelyNarrowedUnion>
const unsafelyNarrowedUnionNullTitle: UnsafelyNarrowedUnionRow["title"] = null
void unsafelyNarrowedUnion
void unsafelyNarrowedUnionNullTitle

const incompleteSetOperand = Q.select({
  email: users.email
})

// @ts-expect-error set operator operands must be source-complete
const incompleteSetRight = Q.union(activeUsers, incompleteSetOperand)
// @ts-expect-error set operator operands must be source-complete
const incompleteSetLeft = Q.union(incompleteSetOperand, activeUsers)

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
void incompleteSetRight
void incompleteSetLeft

const mismatchedSetOperand = Q.select({
  postId: posts.id
}).pipe(
  Q.from(posts)
)

type MismatchedSetOperandError = Q.SetCompatibleRightPlan<typeof activeUsers, typeof mismatchedSetOperand, "postgres">
const mismatchedSetOperandMessage: BrandedErrorOf<MismatchedSetOperandError> =
  "effect-qb: set operator operands must have matching result rows"
const mismatchedSetOperandHint: BrandedHintOf<MismatchedSetOperandError> =
  "Project the same nested object shape and compatible nullability from each operand"
void mismatchedSetOperandMessage
void mismatchedSetOperandHint

const insertedUser = Q.insert(users, {
  id: "user-1",
  email: "alice@example.com"
})

type InvalidSetOperandStatement = Q.SetCompatiblePlan<typeof insertedUser, "postgres">
const invalidSetOperandStatement: BrandedStatementOf<InvalidSetOperandStatement> = "insert"
void invalidSetOperandStatement

const invalidDerivedSource = Q.select({
  userId: posts.userId
}).pipe(
  Q.from(posts)
)

type InvalidDerivedSourceError = Q.DerivedSourceRequiredError<typeof invalidDerivedSource>
const invalidDerivedSourceHint: BrandedHintOf<InvalidDerivedSourceError> =
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
  postCount: F.count(posts.id)
}).pipe(
  Q.from(posts),
  Q.groupBy(posts.userId)
)

// @ts-expect-error exists requires aggregation-compatible nested plans
const invalidGroupedExists = Q.exists(invalidGroupedExistsSubquery)
void invalidGroupedExists

const aggregatePlan = Q.select({
  email: users.email,
  postCount: F.count(posts.id)
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.email),
  Q.having(true)
)

type AggregatePlanCapabilities = Q.CapabilitiesOfPlan<typeof aggregatePlan>
const aggregateCapability: AggregatePlanCapabilities = "read"
void aggregateCapability

const regexGroupedPlan = Q.select({
  matchesExample: Q.regexMatch(users.email, "@example\\.com$"),
  userCount: F.count(users.id)
}).pipe(
  Q.from(users),
  Q.groupBy(Q.regexMatch(users.email, "@example\\.com$"))
)

const completeRegexGroupedPlan: Q.CompletePlan<typeof regexGroupedPlan> = regexGroupedPlan
void completeRegexGroupedPlan

const collatedGroupedPlan = Q.select({
  collatedEmail: Q.collate(users.email, "C"),
  userCount: F.count(users.id)
}).pipe(
  Q.from(users),
  Q.groupBy(Q.collate(users.email, "C"))
)

const completeCollatedGroupedPlan: Q.CompletePlan<typeof collatedGroupedPlan> = collatedGroupedPlan
void completeCollatedGroupedPlan

const invalidCollatedGroupedPlan = Q.select({
  collatedEmail: Q.collate(users.email, "C"),
  userCount: F.count(users.id)
}).pipe(
  Q.from(users),
  Q.groupBy(users.email)
)

type InvalidCollatedGroupedPlan = Q.CompletePlan<typeof invalidCollatedGroupedPlan>
const invalidCollatedGroupedError: BrandedErrorOf<InvalidCollatedGroupedPlan> =
  "effect-qb: invalid grouped selection"
void invalidCollatedGroupedError

const invalidDottedGroupedPlan = Q.select({
  splitStatus: splitGroupingTable["b.status"],
  statusCount: F.count(dottedGroupingTable.status)
}).pipe(
  Q.from(splitGroupingTable),
  Q.crossJoin(dottedGroupingTable),
  Q.groupBy(dottedGroupingTable.status)
)

type InvalidDottedGroupedPlan = Q.CompletePlan<typeof invalidDottedGroupedPlan>
const invalidDottedGroupedError: BrandedErrorOf<InvalidDottedGroupedPlan> =
  "effect-qb: invalid grouped selection"
void invalidDottedGroupedError

const windowPlan = Q.select({
  userId: users.id,
  rowNumber: F.rowNumber({
    partitionBy: [users.id],
    orderBy: [{ value: posts.id, direction: "asc" }]
  }),
  rankedTitle: F.rank({
    partitionBy: [users.id],
    orderBy: [{ value: F.lower(posts.title), direction: "desc" }]
  }),
  postCount: F.over(F.count(posts.id), {
    partitionBy: [users.id],
    orderBy: [{ value: posts.id, direction: "asc" }]
  }),
  latestTitle: F.over(F.max(posts.title), {
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
// @ts-expect-error rowNumber is non-null
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
  rowNumber: F.rowNumber({
    orderBy: [{ value: users.id, direction: "asc" }]
  }),
  postCount: F.count(posts.id)
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.email)
)

type InvalidGroupedWindowPlan = Q.CompletePlan<typeof invalidGroupedWindowPlan>
const invalidGroupedWindowError: BrandedErrorOf<InvalidGroupedWindowPlan> =
  "effect-qb: invalid grouped selection"

const positionalSetLeft = Q.select({
  id: users.id,
  email: users.email
}).pipe(
  Q.from(users)
)

const positionalSetRight = Q.select({
  userId: users.id,
  userEmail: users.email
}).pipe(
  Q.from(users)
)

// @ts-expect-error set operators currently require exact selection shape instead of positional compatibility
const positionalUnion = Q.union(positionalSetLeft, positionalSetRight)

const nestedScalarSubquery = Q.select({
  value: {
    userId: users.id
  }
}).pipe(
  Q.from(users)
)

// @ts-expect-error scalar subqueries currently require one top-level scalar leaf
const nestedScalar = Q.scalar(nestedScalarSubquery)

// @ts-expect-error quantified subqueries currently require one top-level scalar leaf
const nestedScalarMembership = Q.inSubquery(users.id, nestedScalarSubquery)

const nestedSetLeft = Q.select({
  user: {
    id: users.id,
    email: users.email
  }
}).pipe(
  Q.from(users)
)

const nestedSetRight = Q.select({
  account: {
    id: users.id,
    email: users.email
  }
}).pipe(
  Q.from(users)
)

// @ts-expect-error nested object selections must currently match exactly across set operands
const nestedIntersect = Q.intersect(nestedSetLeft, nestedSetRight)

const dottedPathSetLeft = Q.select({
  profile: {
    email: users.email
  }
}).pipe(
  Q.from(users)
)

const dottedPathSetRight = Q.select({
  "profile.email": users.email
}).pipe(
  Q.from(users)
)

// @ts-expect-error nested selection paths and dotted property keys are distinct set operand shapes
const dottedPathUnion = Q.union(dottedPathSetLeft, dottedPathSetRight)

const nullableSetLeft = Q.select({
  title: posts.title
}).pipe(
  Q.from(posts)
)

const nonNullSetRight = Q.select({
  title: Q.literal("writer")
})

// @ts-expect-error compatible nullability widening is currently rejected by exact set-shape equality
const nullableCompatibleUnionAll = Q.unionAll(nullableSetLeft, nonNullSetRight)

void positionalUnion
void nestedScalar
void nestedScalarMembership
void nestedIntersect
void nullableCompatibleUnionAll
void invalidGroupedWindowError

// @ts-expect-error over requires an aggregate input
const invalidWindowAggregate = F.over(users.email, {
  partitionBy: [users.id]
})
void invalidWindowAggregate

// @ts-expect-error ranking window functions require at least one ordering term
const invalidRowNumber = F.rowNumber({
  partitionBy: [users.id]
})
void invalidRowNumber

const invalidWindowDirection = F.rowNumber({
  // @ts-expect-error window order direction must be asc or desc
  orderBy: [{ value: users.id, direction: "sideways" }]
})
void invalidWindowDirection

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
  Q.having(Q.eq(F.count(posts.id), 1))
)

const incomplete = Q.select({
  userId: users.id
})

type IncompletePlanError = Q.CompletePlan<typeof incomplete>
const incompletePlanError: BrandedErrorOf<IncompletePlanError> =
  "effect-qb: query references sources that are not yet in scope"
const incompletePlanMissingSource: BrandedMissingSourcesOf<IncompletePlanError> = "users"
const incompletePlanHint: BrandedHintOf<IncompletePlanError> =
  "Add from(...) or a join for each referenced source before render or execute"
void incompletePlanError
void incompletePlanMissingSource
void incompletePlanHint

// @ts-expect-error incomplete plans are not renderable
const incompleteRendered = Renderer.make().render(incomplete)
void incompleteRendered

// @ts-expect-error derived subqueries must be source-complete
const incompleteDerivedSource = Q.as(incomplete, "missing_users")
void incompleteDerivedSource

// @ts-expect-error cte subqueries must be source-complete
const incompleteCteSource = Q.with("missing_users")(incomplete)
void incompleteCteSource

const mutationReturningPlan = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com"
}).pipe(
  Q.returning({
    id: users.id,
    email: users.email
  })
)

// @ts-expect-error derived table sources only accept select-like plans
const mutationDerivedSource = Q.as(mutationReturningPlan, "inserted_users")
// @ts-expect-error curried derived table sources only accept select-like plans
const mutationCurriedDerivedSource = Q.as("inserted_users")(mutationReturningPlan)
// @ts-expect-error lateral sources only accept select-like plans
const mutationLateralSource = Q.lateral("inserted_users")(mutationReturningPlan)
void mutationDerivedSource
void mutationCurriedDerivedSource
void mutationLateralSource

const rendered = Renderer.make().render(windowPlan)
type RenderedRow = Renderer.RowOf<typeof rendered>
const renderedRow: RenderedRow = {
  userId: "user-1",
  rowNumber: 1,
  rankedTitle: 2,
  postCount: 3,
  latestTitle: null
}
void renderedRow

const executor = Executor.custom(<PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any, any, any>>(
  plan: Q.DialectCompatiblePlan<PlanValue, "postgres">
): Effect.Effect<any, never, never> => {
  void plan
  return null as never
})

const executed = executor.execute(windowPlan)
type ExecutedRows = Effect.Effect.Success<typeof executed>
const executedRow: ExecutedRows[number] = {
  userId: "user-1",
  rowNumber: 1,
  rankedTitle: 2,
  postCount: 3,
  latestTitle: null
}
void executedRow
