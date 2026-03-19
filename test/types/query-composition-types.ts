import type * as Effect from "effect/Effect"

import { Column as C, Executor, Query as Q, Renderer, Table } from "../../src/index.ts"
import type {
  BrandedErrorOf,
  BrandedHintOf,
  BrandedMissingSourcesOf,
  BrandedStatementOf
} from "../helpers/branded-error.ts"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text()
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

const invalidCorrelatedExistsPlan = Q.select({
  hasPosts: Q.exists(correlatedExistsSubquery)
})

type InvalidCorrelatedExistsPlan = Q.CompletePlan<typeof invalidCorrelatedExistsPlan>
const correlatedMissingSource: BrandedMissingSourcesOf<InvalidCorrelatedExistsPlan> = "users"
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
const lateralRequirementMessage: BrandedErrorOf<LateralRequirementError> =
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
  Q.having(true)
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
const invalidGroupedWindowError: BrandedErrorOf<InvalidGroupedWindowPlan> =
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
const incompletePlanError: BrandedErrorOf<IncompletePlanError> =
  "effect-qb: query references sources that are not yet in scope"
const incompletePlanMissingSource: BrandedMissingSourcesOf<IncompletePlanError> = "users"
const incompletePlanHint: BrandedHintOf<IncompletePlanError> =
  "Add from(...) or a join for each referenced source before render or execute"
void incompletePlanError
void incompletePlanMissingSource
void incompletePlanHint

// @ts-expect-error incomplete plans are not renderable
const incompleteRendered = Renderer.make("postgres").render(incomplete)
void incompleteRendered

const rendered = Renderer.make("postgres").render(windowPlan)
type RenderedRow = Renderer.RowOf<typeof rendered>
const renderedRow: RenderedRow = {
  userId: "user-1",
  rowNumber: 1,
  rankedTitle: 2,
  postCount: 3,
  latestTitle: null
}
void renderedRow

const executor = Executor.make("postgres", <PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any, any, any>>(
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
