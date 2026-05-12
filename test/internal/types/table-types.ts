import * as Schema from "effect/Schema"
import type * as SqlClient from "@effect/sql/SqlClient"
import type * as Effect from "effect/Effect"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import { Column as C, Query as Q, Function as F, Table } from "#postgres"
import * as Executor from "#internal/executor.ts"
import * as Expression from "#internal/scalar.ts"
import * as Plan from "#internal/row-set.ts"
import * as Renderer from "#internal/renderer.ts"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey, C.generated(Q.literal("generated-user-id"))),
  email: C.text().pipe(C.unique),
  bio: C.text().pipe(C.nullable),
  createdAt: C.timestamp().pipe(C.default(F.localTimestamp()))
}).pipe(
  Table.index(["email", "createdAt"])
)

const analytics = Postgres.schema("analytics")
const events = analytics.table("events", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid()
})
const badPostgresSchemaMysqlColumn = analytics.table("bad_postgres_schema_mysql_column", {
  // @ts-expect-error postgres schema tables require postgres columns
  id: Mysql.Column.uuid()
})
void badPostgresSchemaMysqlColumn

const schemaTablePrimaryKey = analytics.table("schema_table_primary_key", {
  id: C.uuid(),
  slug: C.text(),
  name: C.text()
}, Table.primaryKey(["id", "slug"] as const))
type SchemaTablePrimaryKeyUpdate = Schema.Schema.Type<typeof schemaTablePrimaryKey.schemas.update>
const schemaTablePrimaryKeyUpdate: SchemaTablePrimaryKeyUpdate = { name: "updated" }
// @ts-expect-error schema table primary key options should update the derived update schema
const badSchemaTablePrimaryKeyUpdate: SchemaTablePrimaryKeyUpdate = { id: "not-allowed" }
void schemaTablePrimaryKey
void schemaTablePrimaryKeyUpdate
void badSchemaTablePrimaryKeyUpdate

const badSchemaTableIndexOption = Table.index("missing")
// @ts-expect-error schema-scoped table option columns must exist on the declared table
const badSchemaTableOptionColumn = analytics.table("bad_schema_table_option_column", { id: C.uuid() }, badSchemaTableIndexOption)
void badSchemaTableOptionColumn

const schemaTableNullablePrimaryKeyOption = Table.primaryKey("slug")
// @ts-expect-error schema-scoped table primary key columns cannot be nullable
const badSchemaTablePrimaryKeyNullable = analytics.table("bad_schema_table_primary_key_nullable", { slug: C.text().pipe(C.nullable) }, schemaTableNullablePrimaryKeyOption)
void badSchemaTablePrimaryKeyNullable

const auditLog = Table.make("audit_log", {
  createdAt: C.timestamp().pipe(C.default(F.now())),
  publishedAt: C.timestamptz().pipe(C.default(F.now()))
})
const datedEvents = Table.make("dated_events", {
  happenedOn: C.date().pipe(C.schema(Schema.DateFromString))
})

type UserInsert = Schema.Schema.Type<typeof users.schemas.insert>
type UserUpdate = Schema.Schema.Type<typeof users.schemas.update>
type UserExpressionDbType = typeof users.id[typeof Expression.TypeId]["dbType"]
type UserPlanSelection = typeof users[typeof Plan.TypeId]["selection"]
type EventsSchemaName = typeof events extends Table.TableDefinition<any, any, any, any, infer SchemaName>
  ? SchemaName
  : never
type UsersSchemaName = typeof users extends Table.TableDefinition<any, any, any, any, infer SchemaName>
  ? SchemaName
  : never
type DatedEventSelect = Schema.Schema.Type<typeof datedEvents.schemas.select>
type AuditLogInsert = Schema.Schema.Type<typeof auditLog.schemas.insert>

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
const goodAuditInsert: AuditLogInsert = {}
void goodAuditInsert

const uuidKind: UserExpressionDbType["kind"] = "uuid"
const selectedId = (null as never as UserPlanSelection).id
const analyticsSchemaName: EventsSchemaName = "analytics"
const publicSchemaName: UsersSchemaName = "public"
const datedEvent: DatedEventSelect = {
  happenedOn: new Date()
}
const badDatedEvent: DatedEventSelect = {
  // @ts-expect-error schema pipes should update the declared select schema
  happenedOn: "2026-03-20"
}
// @ts-expect-error schema input must accept the column's canonical runtime value
C.int().pipe(C.schema(Schema.DateFromString))
void uuidKind
void selectedId
void analyticsSchemaName
void publicSchemaName
void datedEvent
void badDatedEvent

const query = Q.select({
  id: users.id,
  emailMatches: Q.literal(true),
  bioMissing: Q.isNull(users.bio),
  kind: Q.literal("user")
}).pipe(Q.from(users))

const querySelection = query[Plan.TypeId].selection
const queryAvailable = query[Plan.TypeId].available.users.name
const queryAvailableMode: (typeof query)[typeof Plan.TypeId]["available"]["users"]["mode"] = "required"
const queryLiteralKind: typeof querySelection.kind[typeof Expression.TypeId]["dbType"]["kind"] = "text"
const queryLiteralRuntime: typeof querySelection.kind[typeof Expression.TypeId]["runtime"] = "user"
const queryPredicateRuntime: typeof querySelection.emailMatches[typeof Expression.TypeId]["runtime"] = true
void querySelection
void queryAvailable
void queryAvailableMode
void queryLiteralKind
void queryLiteralRuntime
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
  postTitleUpper: posts.title
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId))
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
  postTitleUpper: F.upper(posts.title),
  loweredPostTitle: F.lower(posts.title),
  decoratedPostTitle: F.concat(F.upper(posts.title), "-x"),
  fallbackPostTitle: F.coalesce(F.upper(posts.title), Q.literal("NONE"))
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
const filteredPostTitleUpper: FilteredRow["postTitleUpper"] = "post title"
// @ts-expect-error inner joins do not make joined columns nullable
const filteredNullPostId: FilteredRow["postId"] = null
// @ts-expect-error inner joins do not make derived joined expressions nullable
const filteredNullPostTitleUpper: FilteredRow["postTitleUpper"] = null
void filteredPostTitleUpper

const renderer = Postgres.Renderer.make()

const rendered = renderer.render(leftJoined)
type RenderedLeftJoinedRow = Renderer.RowOf<typeof rendered>
const renderedNullPost: RenderedLeftJoinedRow["postId"] = null
const renderedNullPostTitleUpper: RenderedLeftJoinedRow["postTitleUpper"] = null
const renderedFallbackPostTitle: RenderedLeftJoinedRow["fallbackPostTitle"] = "NONE"
void rendered
void renderedNullPost
void renderedNullPostTitleUpper
void renderedFallbackPostTitle

const executor = Executor.make("postgres", <PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any, any, any>>(
  plan: Q.DialectCompatiblePlan<PlanValue, "postgres">
): Effect.Effect<any, never, never> => {
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

const runtimeRenderer = Postgres.Renderer.make()
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
    id: users.id.pipe(Q.as("user_identifier")),
    email: F.lower(users.email).pipe(Q.as("email_lower"))
  }
}).pipe(
  Q.from(users)
)

type ExplicitAliasRow = Q.ResultRow<typeof explicitAliasPlan>
const explicitAliasRow: ExplicitAliasRow = {
  profile: {
    id: "user-id",
    email: "alice@example.com"
  }
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
  emailUpper: F.upper(users.email),
  postCount: F.count(posts.id),
  maxPostTitle: F.max(posts.title),
  minPostTitle: F.min(posts.title),
  fallbackTitle: F.coalesce(F.max(posts.title), Q.literal("NONE"))
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.and(Q.eq(users.id, posts.userId), Q.not(false))),
  Q.groupBy(F.upper(users.email)),
  Q.orderBy(F.count(posts.id), "desc"),
  Q.orderBy(F.upper(users.email))
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

const aggregatePredicate = F.count(posts.id)
const aggregatePredicateKind: typeof aggregatePredicate[typeof Expression.TypeId]["kind"] = "aggregate"
void aggregatePredicateKind

// @ts-expect-error aggregate predicates are not valid in where
const badAggregateWhere = Q.where(aggregatePredicate)

const invalidAggregatePlan = Q.select({
  email: users.email,
  postCount: F.count(posts.id)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, true)
)

type InvalidAggregatePlanError = Q.CompletePlan<typeof invalidAggregatePlan>
const invalidAggregateError: InvalidAggregatePlanError["__effect_qb_error__"] =
  "effect-qb: invalid grouped selection"
const invalidAggregateHint: InvalidAggregatePlanError["__effect_qb_hint__"] =
  "Scalar selections must be covered by groupBy(...) when aggregates are present"
void invalidAggregateError
void invalidAggregateHint

// @ts-expect-error selecting grouped and aggregate expressions without groupBy is invalid
const badAggregateComplete: Q.CompletePlan<typeof invalidAggregatePlan> = invalidAggregatePlan

const exactGroupedDerivedPlan = Q.select({
  loweredEmail: F.lower(users.email),
  postCount: F.count(posts.id)
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(F.lower(users.email))
)

const exactGroupedDerivedComplete: Q.CompletePlan<typeof exactGroupedDerivedPlan> = exactGroupedDerivedPlan
void exactGroupedDerivedComplete

const groupedByDerivedButSelectingBase = Q.select({
  email: users.email,
  postCount: F.count(posts.id)
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(F.lower(users.email))
)

// @ts-expect-error grouping a derived expression does not cover the base column
const badDerivedGroupingComplete: Q.CompletePlan<typeof groupedByDerivedButSelectingBase> = groupedByDerivedButSelectingBase

const groupedByBaseButSelectingDerived = Q.select({
  loweredEmail: F.lower(users.email),
  postCount: F.count(posts.id)
}).pipe(
  Q.from(users),
  Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.email)
)

// @ts-expect-error grouping a base column does not cover a derived expression
const badBaseGroupingComplete: Q.CompletePlan<typeof groupedByBaseButSelectingDerived> = groupedByBaseButSelectingDerived

// @ts-expect-error nullable columns cannot become primary keys
const badNullablePrimaryKey = C.text().pipe(C.nullable, C.primaryKey)

// @ts-expect-error primary keys cannot become nullable
const badPrimaryKeyNullable = C.text().pipe(C.primaryKey, C.nullable)

const badGeneratedDefault = C.text().pipe(
  C.generated(Q.literal("generated")),
  // @ts-expect-error generated and default are mutually exclusive
  C.default(Q.literal("default"))
)

const badReferenceType = Table.make("bad_reference", {
  // @ts-expect-error references require compatible base select types
  userId: C.int().pipe(C.references(() => orgs.id))
})

// @ts-expect-error table indexes require at least one column
const emptyIndex = Table.index([] as const)

// @ts-expect-error table unique constraints require at least one column
const emptyUnique = Table.unique([] as const)

// @ts-expect-error table primary keys require at least one column
const emptyTablePrimaryKey = Table.primaryKey([] as const)

// @ts-expect-error table foreign keys require at least one local column
const emptyForeignKey = Table.foreignKey([] as const, () => orgs, ["id"] as const)

void emptyIndex
void emptyUnique
void emptyTablePrimaryKey
void emptyForeignKey

// @ts-expect-error foreign keys must reference the same number of columns
const badForeignKeyArity = Table.foreignKey(["orgId", "role"] as const, () => orgs, ["id"] as const)(Table.make("bad_fk_arity", {
  orgId: C.uuid(),
  role: C.text()
}))
void badForeignKeyArity

// @ts-expect-error foreign keys must reference columns on the target table
const badForeignKeyReferencedColumn = Table.foreignKey("orgId", () => orgs, "missing")(Table.make("bad_fk_referenced_column", {
  orgId: C.uuid()
}))
void badForeignKeyReferencedColumn

const badRichForeignKeyLocalColumnOption = Table.foreignKey({
  columns: ["missing"] as const,
  target: () => orgs,
  referencedColumns: ["id"] as const
})
// @ts-expect-error rich foreign key local columns must exist on the source table
const badRichForeignKeyLocalColumn = badRichForeignKeyLocalColumnOption(Table.make("bad_rich_fk_local_column", {
  orgId: C.uuid()
}))
void badRichForeignKeyLocalColumn

// @ts-expect-error rich foreign keys must reference columns on the target table
const badRichForeignKeyReferencedColumnOption = Table.foreignKey({
  columns: ["orgId"] as const,
  target: () => orgs,
  referencedColumns: ["missing"] as const
})
void badRichForeignKeyReferencedColumnOption

// @ts-expect-error rich primary key columns must exist on the target table
const badRichPrimaryKeyColumn = Table.primaryKey({ columns: ["missing"] as const })(Table.make("bad_rich_primary_key_column", {
  id: C.uuid()
}))
void badRichPrimaryKeyColumn

// @ts-expect-error rich primary key columns cannot be nullable
const badRichPrimaryKeyNullable = Table.primaryKey({ columns: ["slug"] as const })(Table.make("bad_rich_primary_key_nullable", {
  slug: C.text().pipe(C.nullable)
}))
void badRichPrimaryKeyNullable

// @ts-expect-error rich unique columns must exist on the target table
const badRichUniqueColumn = Table.unique({ columns: ["missing"] as const })(Table.make("bad_rich_unique_column", {
  id: C.uuid()
}))
void badRichUniqueColumn

// @ts-expect-error rich indexes require at least one column or key
const badRichIndex = Table.index({ name: "bad_rich_index" })
void badRichIndex

// @ts-expect-error rich index columns must exist on the target table
const badRichIndexColumn = Table.index({ columns: ["missing"] as const })(Table.make("bad_rich_index_column", {
  id: C.uuid()
}))
void badRichIndexColumn

// @ts-expect-error rich index included columns must exist on the target table
const badRichIndexInclude = Table.index({ columns: ["id"] as const, include: ["missing"] as const })(Table.make("bad_rich_index_include", {
  id: C.uuid()
}))
void badRichIndexInclude

// @ts-expect-error rich index key columns must exist on the target table
const badRichIndexKey = Table.index({ keys: [{ column: "missing" }] as const })(Table.make("bad_rich_index_key", {
  id: C.uuid()
}))
void badRichIndexKey

// @ts-expect-error unknown columns are rejected for indexes
const badIndex = Table.index(["missing"])(Table.make("bad_index", {
  id: C.uuid()
}))

// @ts-expect-error table checks require expressions, not raw SQL strings
const badCheck = Table.check("role_not_empty", "role <> ''")

// @ts-expect-error nullable columns cannot participate in table primary keys
const badCompositePrimaryKey = Table.primaryKey(["id", "slug"])(Table.make("bad_pk", {
  id: C.uuid(),
  slug: C.text().pipe(C.nullable)
}))

// @ts-expect-error where only accepts boolean predicates
const badWhere = Q.where("nope")

// @ts-expect-error joins require a base source to already exist
const badJoin = Q.select({ postId: posts.id }).pipe(Q.innerJoin(posts, true))

class UsersClass extends Table.Class<UsersClass>("users_class")({
  id: C.uuid().pipe(C.primaryKey, C.generated(Q.literal("generated-user-id"))),
  email: C.text()
}) {
  static readonly [Table.options] = [Table.index("email")]
}

class BadUsersClass extends Table.Class<BadUsersClass>("bad_users_class")({
  id: C.uuid(),
  slug: C.text()
}) {}

// @ts-expect-error class table option columns must exist on the declared table
const badUsersClassIndexOptions: typeof BadUsersClass[typeof Table.options] = [Table.index("missing")]

// @ts-expect-error class table unique option columns must exist on the declared table
const badUsersClassUniqueOptions: typeof BadUsersClass[typeof Table.options] = [Table.unique("missing")]

const classColumn = UsersClass.id
void classColumn

// @ts-expect-error class table options do not support table-level primary keys
const badUsersClassOptions: typeof BadUsersClass[typeof Table.options] = [Table.primaryKey(["id", "slug"])]
void badUsersClassOptions

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
const mysqlOrgs = Mysql.Table.make("mysql_orgs", {
  id: Mysql.Column.uuid(),
  name: Mysql.Column.text()
})
const mysqlSchema = Mysql.Table.schema("tenant")
const mysqlSchemaTablePrimaryKey = mysqlSchema.table("mysql_schema_table_primary_key", {
  id: Mysql.Column.uuid(),
  slug: Mysql.Column.text(),
  name: Mysql.Column.text()
}, Mysql.Table.primaryKey(["id", "slug"] as const))
type MysqlSchemaTablePrimaryKeyUpdate = Schema.Schema.Type<typeof mysqlSchemaTablePrimaryKey.schemas.update>
const mysqlSchemaTablePrimaryKeyUpdate: MysqlSchemaTablePrimaryKeyUpdate = { name: "updated" }
// @ts-expect-error mysql schema table primary key options should update the derived update schema
const badMysqlSchemaTablePrimaryKeyUpdate: MysqlSchemaTablePrimaryKeyUpdate = { id: "not-allowed" }
void mysqlSchemaTablePrimaryKey
void mysqlSchemaTablePrimaryKeyUpdate
void badMysqlSchemaTablePrimaryKeyUpdate

const badMysqlSchemaTableIndexOption = Mysql.Table.index("missing")
// @ts-expect-error mysql schema-scoped table option columns must exist on the declared table
const badMysqlSchemaTableOptionColumn = mysqlSchema.table("bad_mysql_schema_table_option_column", { id: Mysql.Column.uuid() }, badMysqlSchemaTableIndexOption)
void badMysqlSchemaTableOptionColumn

// @ts-expect-error mysql foreign key local columns must exist on the source table
const badMysqlForeignKeyLocalColumn = Mysql.Table.foreignKey("missing", () => mysqlOrgs, "id")(Mysql.Table.make("bad_mysql_fk_local_column", {
  orgId: Mysql.Column.uuid()
}))
void badMysqlForeignKeyLocalColumn

// @ts-expect-error mysql foreign keys must reference columns on the target table
const badMysqlForeignKeyReferencedColumn = Mysql.Table.foreignKey("orgId", () => mysqlOrgs, "missing")(Mysql.Table.make("bad_mysql_fk_referenced_column", {
  orgId: Mysql.Column.uuid()
}))
void badMysqlForeignKeyReferencedColumn

const postgresUsers = Postgres.Table.make("postgres_users", {
  id: Postgres.Column.uuid(),
  email: Postgres.Column.text()
})

const badPostgresFromMysql = Postgres.Query.select({
  id: mysqlUsers.id
}).pipe(
  // @ts-expect-error postgres queries cannot use mysql sources
  Postgres.Query.from(mysqlUsers)
)
void badPostgresFromMysql

const badMysqlFromPostgres = Mysql.Query.select({
  id: postgresUsers.id
}).pipe(
  // @ts-expect-error mysql queries cannot use postgres sources
  Mysql.Query.from(postgresUsers)
)
void badMysqlFromPostgres

const badPostgresJoinMysql = Postgres.Query.select({
  id: postgresUsers.id
}).pipe(
  Postgres.Query.from(postgresUsers),
  // @ts-expect-error postgres queries cannot join mysql sources
  Postgres.Query.innerJoin(mysqlUsers, Postgres.Query.literal(true))
)
void badPostgresJoinMysql

const badMysqlJoinPostgres = Mysql.Query.select({
  id: mysqlUsers.id
}).pipe(
  Mysql.Query.from(mysqlUsers),
  // @ts-expect-error mysql queries cannot join postgres sources
  Mysql.Query.innerJoin(postgresUsers, Mysql.Query.literal(true))
)
void badMysqlJoinPostgres

// @ts-expect-error postgres mutations cannot target mysql tables
const badPostgresInsertMysql = Postgres.Query.insert(mysqlUsers, {
  email: "alice@example.com"
})
void badPostgresInsertMysql

// @ts-expect-error mysql mutations cannot target postgres tables
const badMysqlInsertPostgres = Mysql.Query.insert(postgresUsers, {
  email: "alice@example.com"
})
void badMysqlInsertPostgres

// @ts-expect-error postgres updates cannot target mysql tables
const badPostgresUpdateMysql = Postgres.Query.update(mysqlUsers, {
  email: "alice@example.com"
})
void badPostgresUpdateMysql

// @ts-expect-error mysql deletes cannot target postgres tables
const badMysqlDeletePostgres = Mysql.Query.delete(postgresUsers)
void badMysqlDeletePostgres

// @ts-expect-error postgres truncate cannot target mysql tables
const badPostgresTruncateMysql = Postgres.Query.truncate(mysqlUsers)
void badPostgresTruncateMysql

// @ts-expect-error postgres ddl cannot target mysql tables
const badPostgresCreateTableMysql = Postgres.Query.createTable(mysqlUsers)
void badPostgresCreateTableMysql

// @ts-expect-error mysql ddl cannot target postgres tables
const badMysqlCreateTablePostgres = Mysql.Query.createTable(postgresUsers)
void badMysqlCreateTablePostgres

// @ts-expect-error postgres ddl indexes cannot target mysql tables
const badPostgresCreateIndexMysql = Postgres.Query.createIndex(mysqlUsers, ["email"] as const)
void badPostgresCreateIndexMysql

// @ts-expect-error postgres predicates cannot use mysql expressions
const badPostgresPredicateMysql = Postgres.Query.eq(mysqlUsers.email, "alice@example.com")
void badPostgresPredicateMysql

// @ts-expect-error mysql predicates cannot use postgres expressions
const badMysqlPredicatePostgres = Mysql.Query.eq(postgresUsers.email, "alice@example.com")
void badMysqlPredicatePostgres

// @ts-expect-error postgres mutation values cannot use mysql expressions
const badPostgresMutationMysqlExpression = Postgres.Query.insert(postgresUsers, {
  email: Mysql.Query.literal("alice@example.com")
})
void badPostgresMutationMysqlExpression

// @ts-expect-error widened postgres mutation inputs cannot hide mysql expressions
const widenedPostgresInsertMysqlEmail: Postgres.Query.MutationInputOf<Postgres.Table.InsertOf<typeof users>>["email"] =
  Mysql.Query.literal("alice@example.com")
void widenedPostgresInsertMysqlEmail

const widenedPostgresInsertPostgresEmail: Postgres.Query.MutationInputOf<Postgres.Table.InsertOf<typeof users>>["email"] =
  Postgres.Query.literal("alice@example.com")
void widenedPostgresInsertPostgresEmail

// @ts-expect-error postgres merge cannot target mysql tables
const badPostgresMergeMysqlTarget = Postgres.Query.merge(mysqlUsers, postgresUsers, Postgres.Query.literal(true), {
  whenMatched: {
    delete: true
  }
})
void badPostgresMergeMysqlTarget

// @ts-expect-error postgres merge cannot use mysql sources
const badPostgresMergeMysqlSource = Postgres.Query.merge(postgresUsers, mysqlUsers, Postgres.Query.literal(true), {
  whenMatched: {
    delete: true
  }
})
void badPostgresMergeMysqlSource

// @ts-expect-error postgres values sources cannot use mysql expressions
const badPostgresValuesMysqlExpression = Postgres.Query.values([
  { email: Mysql.Query.literal("alice@example.com") }
] as const)
void badPostgresValuesMysqlExpression

// @ts-expect-error mysql values sources cannot use postgres expressions
const badMysqlValuesPostgresExpression = Mysql.Query.values([
  { email: Postgres.Query.literal("alice@example.com") }
] as const)
void badMysqlValuesPostgresExpression

// @ts-expect-error postgres unnest sources cannot use mysql expressions
const badPostgresUnnestMysqlExpression = Postgres.Query.unnest({
  email: [Mysql.Query.literal("alice@example.com")] as const
}, "bad_postgres_unnest_mysql_expression")
void badPostgresUnnestMysqlExpression

const badPostgresGenerateSeriesMysqlExpression = Postgres.Query.generateSeries(
  // @ts-expect-error postgres table functions cannot use mysql expressions
  Mysql.Query.literal(1),
  3,
  1,
  "bad_postgres_generate_series_mysql_expression"
)
void badPostgresGenerateSeriesMysqlExpression

const mysqlDialect: typeof mysqlUsers.id[typeof Expression.TypeId]["dbType"]["dialect"] = "mysql"
const postgresDialect: typeof postgresUsers.id[typeof Expression.TypeId]["dbType"]["dialect"] = "postgres"

const mysqlPlan = Mysql.Query.select({
  id: mysqlUsers.id
}).pipe(
  Mysql.Query.from(mysqlUsers)
)
const mysqlLiteral = Mysql.Query.literal("user")
const mysqlEq = Mysql.Query.eq(mysqlUsers.email, "alice@example.com")
const mysqlConcat = Mysql.Function.concat(Mysql.Function.lower(mysqlUsers.email), "-user")
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
