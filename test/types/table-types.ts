import type * as Schema from "effect/Schema"
import type * as SqlClient from "@effect/sql/SqlClient"
import type * as Effect from "effect/Effect"

import * as Mysql from "../../src/mysql.ts"
import * as Postgres from "../../src/postgres.ts"
import { Column as C, Executor, Expression, Plan, Query as Q, Renderer, Table } from "../../src/index.ts"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey, C.generated),
  email: C.text().pipe(C.unique),
  bio: C.text().pipe(C.nullable),
  createdAt: C.timestamp().pipe(C.hasDefault)
}).pipe(
  Table.index(["email", "createdAt"] as const)
)

type UserInsert = Schema.Schema.Type<typeof users.schemas.insert>
type UserUpdate = Schema.Schema.Type<typeof users.schemas.update>
type UserExpressionDbType = typeof users.id[typeof Expression.TypeId]["dbType"]
type UserPlanSelection = typeof users[typeof Plan.TypeId]["selection"]

const goodInsert: UserInsert = {
  email: "alice@example.com"
}
const goodNullableInsert: UserInsert = {
  email: "alice@example.com",
  bio: null
}
const goodUpdate: UserUpdate = {
  email: "new@example.com",
  bio: null
}

void goodInsert
void goodNullableInsert
void goodUpdate

const uuidKind: UserExpressionDbType["kind"] = "uuid"
const selectedId = (null as never as UserPlanSelection).id
void uuidKind
void selectedId

const query = Q.select({
  id: users.id,
  emailMatches: Q.eq(users.email, Q.literal("alice@example.com")),
  bioMissing: Q.isNull(users.bio),
  kind: Q.literal("user")
}).pipe(Q.from(users))

const querySelection = query[Plan.TypeId].selection
const queryAvailable = query[Plan.TypeId].available.users.name
const queryAvailableMode: (typeof query)[typeof Plan.TypeId]["available"]["users"]["mode"] = "required"
const queryLiteralKind: typeof querySelection.kind[typeof Expression.TypeId]["dbType"]["kind"] = "text"
const queryPredicateRuntime: typeof querySelection.emailMatches[typeof Expression.TypeId]["runtime"] = true
void querySelection
void queryAvailable
void queryAvailableMode
void queryLiteralKind
void queryPredicateRuntime

// @ts-expect-error generated columns are omitted from insert
const badInsertId: UserInsert = { id: "not-allowed", email: "alice@example.com" }

// @ts-expect-error primary keys are omitted from update
const badUpdateId: UserUpdate = { id: "not-allowed" }

// @ts-expect-error required insert fields stay required
const missingEmail: UserInsert = {}

const orgs = Table.make("orgs", {
  id: C.uuid().pipe(C.primaryKey),
  name: C.text()
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text()
})

const members = Table.make("members", {
  id: C.uuid().pipe(C.primaryKey),
  orgId: C.uuid().pipe(C.references(() => orgs.id))
})

void members
void posts

const filtered = Q.select({
  userId: users.id,
  postId: posts.id,
  postTitleUpper: Q.upper(posts.title)
}).pipe(
  Q.where(Q.eq(users.email, "alice@example.com")),
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
  Q.where(true)
)

const filteredPostsAvailable = filtered[Plan.TypeId].available.posts.name
const filteredUsersAvailable = filtered[Plan.TypeId].available.users.name
const filteredPostMode: (typeof filtered)[typeof Plan.TypeId]["available"]["posts"]["mode"] = "required"
const coercedPredicate = Q.eq(users.email, "alice@example.com")
const coercedRightKind: typeof coercedPredicate[typeof Expression.TypeId]["dbType"]["kind"] = "bool"
void filteredPostsAvailable
void filteredUsersAvailable
void filteredPostMode
void coercedRightKind

const leftJoined = Q.select({
  userId: users.id,
  postId: posts.id,
  postTitleUpper: Q.upper(posts.title),
  loweredPostTitle: Q.lower(posts.title),
  decoratedPostTitle: Q.concat(Q.upper(posts.title), "-x"),
  fallbackPostTitle: Q.coalesce(Q.upper(posts.title), Q.literal("NONE"))
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, true)
)

const leftJoinedPostSource = leftJoined[Plan.TypeId].available.posts.name
const leftJoinedPostMode: (typeof leftJoined)[typeof Plan.TypeId]["available"]["posts"]["mode"] = "optional"
type LeftJoinedRow = Q.ResultRow<typeof leftJoined>
const leftJoinedNullPostId: LeftJoinedRow["postId"] = null
const leftJoinedNullPostTitleUpper: LeftJoinedRow["postTitleUpper"] = null
const leftJoinedNullLoweredPostTitle: LeftJoinedRow["loweredPostTitle"] = null
const leftJoinedDecoratedPostTitle: LeftJoinedRow["decoratedPostTitle"] = null
const leftJoinedFallbackPostTitle: LeftJoinedRow["fallbackPostTitle"] = "NONE"
const leftJoinedUserId: LeftJoinedRow["userId"] = "user-id"
void leftJoinedPostSource
void leftJoinedPostMode
void leftJoinedNullPostId
void leftJoinedNullPostTitleUpper
void leftJoinedNullLoweredPostTitle
void leftJoinedDecoratedPostTitle
void leftJoinedFallbackPostTitle
void leftJoinedUserId

type FilteredRow = Q.ResultRow<typeof filtered>
const filteredPostId: FilteredRow["postId"] = "post-id"
const filteredPostTitleUpper: FilteredRow["postTitleUpper"] = "POST TITLE"
// @ts-expect-error inner joins do not make joined columns nullable
const filteredNullPostId: FilteredRow["postId"] = null
// @ts-expect-error inner joins do not make derived joined expressions nullable
const filteredNullPostTitleUpper: FilteredRow["postTitleUpper"] = null
void filteredPostTitleUpper

const renderer = Renderer.make("postgres")

const rendered = renderer.render(leftJoined)
type RenderedLeftJoinedRow = Renderer.RowOf<typeof rendered>
const renderedNullPost: RenderedLeftJoinedRow["postId"] = null
const renderedNullPostTitleUpper: RenderedLeftJoinedRow["postTitleUpper"] = null
const renderedFallbackPostTitle: RenderedLeftJoinedRow["fallbackPostTitle"] = "NONE"
void rendered
void renderedNullPost
void renderedNullPostTitleUpper
void renderedFallbackPostTitle

const executor = Executor.make("postgres", <PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any>>(
  plan: Q.DialectCompatiblePlan<PlanValue, "postgres">
): Effect.Effect<Q.ResultRows<PlanValue>, never, never> => {
  void plan
  return null as never
})

const executed = executor.execute(leftJoined)
type ExecutedRows = Effect.Effect.Success<typeof executed>
const executedRow: ExecutedRows[number] = {
  userId: "user-id",
  postId: null,
  postTitleUpper: null,
  loweredPostTitle: null,
  decoratedPostTitle: null,
  fallbackPostTitle: "NONE"
}
void executed
void executedRow

const nestedPlan = Q.select({
  profile: {
    id: users.id,
    email: users.email
  }
}).pipe(
  Q.from(users)
)

const runtimeRenderer = Renderer.make("postgres")
const runtimeDriver = Executor.driver("postgres", <Row>(
  query: Renderer.RenderedQuery<Row, "postgres">
): Effect.Effect<ReadonlyArray<Executor.FlatRow>, never, never> => {
  void query
  return null as never
})

const pipelineExecutor = Executor.fromDriver(runtimeRenderer, runtimeDriver)
const pipelineRows = pipelineExecutor.execute(nestedPlan)
type PipelineRows = Effect.Effect.Success<typeof pipelineRows>
const pipelineRow: PipelineRows[number] = {
  profile: {
    id: "user-id",
    email: "alice@example.com"
  }
}
void pipelineRows
void pipelineRow

const explicitAliasPlan = Q.select({
  profile: {
    id: Q.as(users.id, "user_identifier"),
    email: Q.as(Q.lower(users.email), "email_lower")
  },
  kind: Q.as("user", "kind_label")
}).pipe(
  Q.from(users)
)

type ExplicitAliasRow = Q.ResultRow<typeof explicitAliasPlan>
const explicitAliasRow: ExplicitAliasRow = {
  profile: {
    id: "user-id",
    email: "alice@example.com"
  },
  kind: "user"
}
const explicitAliasRendered = renderer.render(explicitAliasPlan)
const explicitAliasProjectionAlias: typeof explicitAliasRendered.projections[number]["alias"] = "user_identifier"
void explicitAliasRow
void explicitAliasRendered
void explicitAliasProjectionAlias

const sqlClientExecutor = Executor.fromSqlClient(runtimeRenderer)
const sqlClientRows = sqlClientExecutor.execute(nestedPlan)
type SqlClientRows = Effect.Effect.Success<typeof sqlClientRows>
const sqlClientRow: SqlClientRows[number] = {
  profile: {
    id: "user-id",
    email: "alice@example.com"
  }
}
type SqlClientContext = Effect.Effect.Context<typeof sqlClientRows>
const sqlClientContext: SqlClientContext = null as never as SqlClient.SqlClient
void sqlClientRows
void sqlClientRow
void sqlClientContext

const aggregatePlan = Q.select({
  emailUpper: Q.upper(users.email),
  postCount: Q.count(posts.id),
  maxPostTitle: Q.max(posts.title),
  minPostTitle: Q.min(posts.title),
  fallbackTitle: Q.coalesce(Q.max(posts.title), Q.literal("NONE"))
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.and(Q.eq(users.id, posts.userId), Q.not(false))),
  Q.groupBy(users.email),
  Q.orderBy(Q.count(posts.id), "desc"),
  Q.orderBy(Q.lower(users.email))
)

type AggregateRow = Q.ResultRow<typeof aggregatePlan>
const aggregateRow: AggregateRow = {
  emailUpper: "ALICE@EXAMPLE.COM",
  postCount: 1,
  maxPostTitle: null,
  minPostTitle: null,
  fallbackTitle: "NONE"
}
const completeAggregatePlan: Q.CompletePlan<typeof aggregatePlan> = aggregatePlan
void aggregateRow
void completeAggregatePlan

const aggregatePredicate = Q.eq(Q.count(posts.id), 1)
const aggregatePredicateAggregation: typeof aggregatePredicate[typeof Expression.TypeId]["aggregation"] = "aggregate"
void aggregatePredicateAggregation

// @ts-expect-error aggregate predicates are not valid in where
const badAggregateWhere = Q.where(aggregatePredicate)

const invalidAggregatePlan = Q.select({
  email: users.email,
  postCount: Q.count(posts.id)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, true)
)

// @ts-expect-error selecting grouped and aggregate expressions without groupBy is invalid
const badAggregateComplete: Q.CompletePlan<typeof invalidAggregatePlan> = invalidAggregatePlan

// @ts-expect-error nullable columns cannot become primary keys
const badNullablePrimaryKey = C.text().pipe(C.nullable, C.primaryKey)

// @ts-expect-error primary keys cannot become nullable
const badPrimaryKeyNullable = C.text().pipe(C.primaryKey, C.nullable)

// @ts-expect-error generated and hasDefault are mutually exclusive
const badGeneratedDefault = C.text().pipe(C.generated, C.hasDefault)

const badReferenceType = Table.make("bad_reference", {
  // @ts-expect-error references require compatible base select types
  userId: C.int().pipe(C.references(() => orgs.id))
})

// @ts-expect-error unknown columns are rejected for indexes
const badIndex = Table.index(["missing"] as const)(Table.make("bad_index", {
  id: C.uuid()
}))

// @ts-expect-error nullable columns cannot participate in table primary keys
const badCompositePrimaryKey = Table.primaryKey(["id", "slug"] as const)(Table.make("bad_pk", {
  id: C.uuid(),
  slug: C.text().pipe(C.nullable)
}))

// @ts-expect-error where only accepts boolean predicates
const badWhere = Q.where("nope")

// @ts-expect-error joins require a base source to already exist
const badJoin = Q.select({ postId: posts.id }).pipe(Q.innerJoin(posts, true))

class UsersClass extends Table.Class<UsersClass>("users_class")({
  id: C.uuid().pipe(C.primaryKey, C.generated),
  email: C.text()
}) {
  static override readonly [Table.options] = [Table.index("email")]
}

// @ts-expect-error class table options do not support table-level primary keys
class BadUsersClass extends Table.Class<BadUsersClass>("bad_users_class")({
  id: C.uuid(),
  slug: C.text()
}) {
  static override readonly [Table.options] = [Table.primaryKey(["id", "slug"] as const)]
}

const classColumn = UsersClass.id
void classColumn

const manager = Table.alias(users, "manager")
const report = Table.alias(users, "report")

// @ts-expect-error aliased query sources cannot accept schema-level table options
const badAliasOption = Table.index("email")(manager)

const aliasedPlan = Q.select({
  managerId: manager.id,
  reportId: report.id
}).pipe(
  Q.from(manager),
  Q.leftJoin(report, Q.eq(report.id, manager.id))
)

const managerDependencyKey: keyof typeof manager.id[typeof Expression.TypeId]["dependencies"] = "manager"
const reportDependencyKey: keyof typeof report.id[typeof Expression.TypeId]["dependencies"] = "report"
type AliasedRow = Q.ResultRow<typeof aliasedPlan>
const aliasedManagerId: AliasedRow["managerId"] = "user-id"
const aliasedNullReportId: AliasedRow["reportId"] = null
void managerDependencyKey
void reportDependencyKey
void aliasedManagerId
void aliasedNullReportId

const mysqlUsers = Mysql.Table.make("mysql_users", {
  id: Mysql.Column.uuid(),
  email: Mysql.Column.text()
})
const postgresUsers = Postgres.Table.make("postgres_users", {
  id: Postgres.Column.uuid(),
  email: Postgres.Column.text()
})

const mysqlDialect: typeof mysqlUsers.id[typeof Expression.TypeId]["dbType"]["dialect"] = "mysql"
const postgresDialect: typeof postgresUsers.id[typeof Expression.TypeId]["dbType"]["dialect"] = "postgres"

const mysqlPlan = Mysql.Query.select({
  id: mysqlUsers.id
}).pipe(
  Mysql.Query.from(mysqlUsers)
)
const mysqlLiteral = Mysql.Query.literal("user")
const mysqlEq = Mysql.Query.eq(mysqlUsers.email, "alice@example.com")
const mysqlConcat = Mysql.Query.concat(Mysql.Query.lower(mysqlUsers.email), "-user")
const postgresPlan = Postgres.Query.select({
  id: postgresUsers.id
}).pipe(
  Postgres.Query.from(postgresUsers)
)

const mysqlRendered = Mysql.Renderer.make().render(mysqlPlan)
const postgresRendered = Postgres.Renderer.make().render(postgresPlan)
const mysqlLiteralDialect: typeof mysqlLiteral[typeof Expression.TypeId]["dbType"]["dialect"] = "mysql"
const mysqlEqDialect: typeof mysqlEq[typeof Expression.TypeId]["dbType"]["dialect"] = "mysql"
const mysqlConcatDialect: typeof mysqlConcat[typeof Expression.TypeId]["dbType"]["dialect"] = "mysql"
const mysqlRenderedDialect: typeof mysqlRendered.dialect = "mysql"
const postgresRenderedDialect: typeof postgresRendered.dialect = "postgres"
void mysqlDialect
void postgresDialect
void mysqlLiteralDialect
void mysqlEqDialect
void mysqlConcatDialect
void mysqlRendered
void postgresRendered
void mysqlRenderedDialect
void postgresRenderedDialect
void BadUsersClass
