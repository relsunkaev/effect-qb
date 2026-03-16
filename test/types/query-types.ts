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

const aggregatePlan = Q.select({
  email: users.email,
  postCount: Q.count(posts.id)
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.email),
  Q.having(Q.eq(Q.count(posts.id), 1))
)

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

const executor = Executor.make("postgres", <PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any>>(
  plan: Q.DialectCompatiblePlan<PlanValue, "postgres">
): Effect.Effect<Q.ResultRows<PlanValue>, never, never> => {
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
