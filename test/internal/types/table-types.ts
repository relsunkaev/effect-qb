import * as StdRoot from "#standard"
import { Column as PgColumn } from "effect-qb/postgres"
import * as Std from "effect-qb"
import * as Schema from "effect/Schema"
import type * as SqlClient from "effect/unstable/sql/SqlClient"
import type * as Effect from "effect/Effect"
import type * as BigDecimal from "effect/BigDecimal"
import type * as Duration from "effect/Duration"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import { Query as Q, Function as F } from "#standard"
import * as Executor from "#internal/executor.ts"
import * as Expression from "#internal/scalar.ts"
import * as Plan from "#internal/row-set.ts"
import * as Renderer from "#internal/renderer.ts"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey, Std.Column.generated(Q.literal("generated-user-id"))),
  email: Std.Column.text().pipe(Std.Column.unique),
  bio: Std.Column.text().pipe(Std.Column.nullable),
  createdAt: Std.Column.timestamp().pipe(Std.Column.default(F.localTimestamp()))
}).pipe(
  Std.Table.index((table) => [table.email, table.createdAt])
)

const analytics = Postgres.Schema.make("analytics")
const events = analytics.table("events", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  userId: Std.Column.uuid()
})
const badPostgresSchemaMysqlColumn = analytics.table("bad_postgres_schema_mysql_column", {
  // @ts-expect-error postgres schema tables require postgres columns
  id: Mysql.Column.custom(Schema.String, Mysql.Datatypes.mysqlDatatypes.text())
})
void badPostgresSchemaMysqlColumn

const schemaTablePrimaryKeyBase = analytics.table("schema_table_primary_key", {
  id: Std.Column.uuid(),
  slug: Std.Column.text(),
  name: Std.Column.text()
})
const schemaTablePrimaryKey = schemaTablePrimaryKeyBase.pipe(
  Std.Table.primaryKey<
    typeof schemaTablePrimaryKeyBase,
    readonly [typeof schemaTablePrimaryKeyBase.id, typeof schemaTablePrimaryKeyBase.slug]
  >((table) => [table.id, table.slug] as const)
)
type SchemaTablePrimaryKeyUpdate = Std.Table.UpdateOf<typeof schemaTablePrimaryKey>
const schemaTablePrimaryKeyUpdate: SchemaTablePrimaryKeyUpdate = { name: "updated" }
// @ts-expect-error schema table primary key options should update the derived update schema
const badSchemaTablePrimaryKeyUpdate: SchemaTablePrimaryKeyUpdate = { id: "not-allowed" }
void schemaTablePrimaryKey
void schemaTablePrimaryKeyUpdate
void badSchemaTablePrimaryKeyUpdate

const badSchemaTableOptionColumnBase = analytics.table("bad_schema_table_option_column", { id: Std.Column.uuid() })
// @ts-expect-error schema-scoped table option columns must exist on the declared table
const badSchemaTableOptionColumn = badSchemaTableOptionColumnBase.pipe(Std.Table.index((table: typeof badSchemaTableOptionColumnBase) => table.missing))
void badSchemaTableOptionColumn

const badSchemaTablePrimaryKeyNullableBase = analytics.table("bad_schema_table_primary_key_nullable", { slug: Std.Column.text().pipe(Std.Column.nullable) })
const badSchemaTablePrimaryKeyNullable = badSchemaTablePrimaryKeyNullableBase.pipe(
  Std.Table.primaryKey<
    typeof badSchemaTablePrimaryKeyNullableBase,
    typeof badSchemaTablePrimaryKeyNullableBase.slug
  >((table) => table.slug)
)
void badSchemaTablePrimaryKeyNullable

const auditLog = Std.Table.make("audit_log", {
  createdAt: Std.Column.timestamp().pipe(Std.Column.default(Std.Function.localTimestamp())),
  publishedAt: PgColumn.timestamptz().pipe(Std.Column.default(F.now()))
})
const datedEvents = Std.Table.make("dated_events", {
  happenedOn: Std.Column.date().pipe(Std.Column.schema(Schema.DateFromString))
})
const codecEvents = Std.Table.make("codec_events", {
  bigCounter: PgColumn.int8().pipe(Std.Column.schema(Schema.BigIntFromString)),
  amount: Std.Column.number().pipe(Std.Column.schema(Schema.BigDecimalFromString)),
  activeFor: PgColumn.interval().pipe(Std.Column.schema(Schema.DurationFromString)),
  payloadBase64: PgColumn.bytea().pipe(Std.Column.schema(Schema.flip(Schema.Uint8ArrayFromBase64)))
})
const defaultCodecEvents = Std.Table.make("default_codec_events", {
  bigCounter: PgColumn.int8(),
  amount: Std.Column.number(),
  activeFor: PgColumn.interval(),
  payload: PgColumn.bytea()
})

type UserInsert = Std.Table.InsertOf<typeof users>
type UserUpdate = Std.Table.UpdateOf<typeof users>
type UserExpressionDbType = typeof users.id[typeof Expression.TypeId]["dbType"]
type UserPlanSelection = typeof users[typeof Plan.TypeId]["selection"]
type EventsSchemaName = typeof events extends Std.Table.TableDefinition<any, any, any, any, infer SchemaName>
  ? SchemaName
  : never
type UsersSchemaName = typeof users extends Std.Table.TableDefinition<any, any, any, any, infer SchemaName>
  ? SchemaName
  : never
type DatedEventSelect = Std.Table.SelectOf<typeof datedEvents>
type AuditLogInsert = Std.Table.InsertOf<typeof auditLog>
type CodecEventSelect = Std.Table.SelectOf<typeof codecEvents>
type DefaultCodecEventSelect = Std.Table.SelectOf<typeof defaultCodecEvents>

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
const codecEvent: CodecEventSelect = {
  bigCounter: 42n,
  amount: null as never as BigDecimal.BigDecimal,
  activeFor: null as never as Duration.Duration,
  payloadBase64: "AQID"
}
const defaultPayload: DefaultCodecEventSelect["payload"] = new Uint8Array([1, 2, 3])
// @ts-expect-error opt-in BigIntFromString must be explicit; int8 defaults to canonical string output
const defaultBigCounter: DefaultCodecEventSelect["bigCounter"] = 42n
// @ts-expect-error opt-in BigDecimalFromString must be explicit; numeric defaults to canonical string output
const defaultAmount: DefaultCodecEventSelect["amount"] = null as never as BigDecimal.BigDecimal
// @ts-expect-error opt-in DurationFromString must be explicit; interval defaults to string output
const defaultActiveFor: DefaultCodecEventSelect["activeFor"] = null as never as Duration.Duration
// @ts-expect-error bytea defaults to Uint8Array, not base64 text
const defaultPayloadBase64: DefaultCodecEventSelect["payload"] = "AQID"
// @ts-expect-error schema input must accept the column's canonical runtime value
Std.Column.int().pipe(Std.Column.schema(Schema.DateFromString))
void uuidKind
void selectedId
void analyticsSchemaName
void publicSchemaName
void datedEvent
void badDatedEvent
void codecEvent
void defaultPayload
void defaultBigCounter
void defaultAmount
void defaultActiveFor
void defaultPayloadBase64

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

const orgs = Std.Table.make("orgs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  name: Std.Column.text()
})

const posts = Std.Table.make("posts", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  userId: Std.Column.uuid(),
  title: Std.Column.text()
})

const members = Std.Table.make("members", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  orgId: Std.Column.uuid().pipe(Std.Column.references(() => orgs.id))
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
const coercedRightKind: typeof coercedPredicate[typeof Expression.TypeId]["dbType"]["kind"] = "boolean"
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
type ExecutedRows = Effect.Success<typeof executed>
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
type PipelineRows = Effect.Success<typeof pipelineRows>
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
type SqlClientRows = Effect.Success<typeof sqlClientRows>
const sqlClientRow: SqlClientRows[number] = {
  profile: {
    id: "user-id",
    email: "alice@example.com"
  }
}
type SqlClientContext = Effect.Services<typeof sqlClientRows>
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
const badNullablePrimaryKey = Std.Column.text().pipe(Std.Column.nullable, Std.Column.primaryKey)

// @ts-expect-error primary keys cannot become nullable
const badPrimaryKeyNullable = Std.Column.text().pipe(Std.Column.primaryKey, Std.Column.nullable)

const badGeneratedDefault = Std.Column.text().pipe(
  Std.Column.generated(Q.literal("generated")),
  // @ts-expect-error generated and default are mutually exclusive
  Std.Column.default(Q.literal("default"))
)

const badReferenceType = Std.Table.make("bad_reference", {
  // @ts-expect-error references require compatible base select types
  userId: Std.Column.int().pipe(Std.Column.references(() => orgs.id))
})

// @ts-expect-error table indexes require at least one column
const emptyIndex = Std.Table.index((table) => [])

// @ts-expect-error table unique constraints require at least one column
const emptyUnique = Std.Table.unique((table) => [])

// @ts-expect-error table primary keys require at least one column
const emptyTablePrimaryKey = Std.Table.primaryKey((table) => [])

// @ts-expect-error table foreign keys require at least one local column
const emptyForeignKey = Std.Table.foreignKey((table) => [], () => orgs.id)

void emptyIndex
void emptyUnique
void emptyTablePrimaryKey
void emptyForeignKey

const badForeignKeyArityBase = Std.Table.make("bad_fk_arity", {
  orgId: Std.Column.uuid(),
  role: Std.Column.text()
})
const badForeignKeyArity = badForeignKeyArityBase.pipe(
  Std.Table.foreignKey<
    typeof badForeignKeyArityBase,
    readonly [typeof badForeignKeyArityBase.orgId, typeof badForeignKeyArityBase.role],
    typeof orgs.id
  >(
    (table) => [table.orgId, table.role] as const,
    // @ts-expect-error foreign keys must reference the same number of columns
    () => orgs.id
  )
)
void badForeignKeyArity

// @ts-expect-error foreign keys must reference columns on the target table
const badForeignKeyReferencedColumn = Std.Table.foreignKey((table) => table.orgId, () => orgs.missing)(Std.Table.make("bad_fk_referenced_column", {
  orgId: Std.Column.uuid()
}))
void badForeignKeyReferencedColumn

const badRichForeignKeyLocalColumnBase = Std.Table.make("bad_rich_fk_local_column", {
  orgId: Std.Column.uuid()
})
const badRichForeignKeyLocalColumn = badRichForeignKeyLocalColumnBase.pipe(
  // @ts-expect-error rich foreign key local columns must exist on the source table
  StdRoot.Table.foreignKey((table: typeof badRichForeignKeyLocalColumnBase) => table.missing, () => orgs.id)
)
void badRichForeignKeyLocalColumn

// @ts-expect-error rich foreign keys must reference columns on the target table
const badRichForeignKeyReferencedColumn = StdRoot.Table.foreignKey((table) => table.orgId, () => orgs.missing)(Std.Table.make("bad_rich_fk_referenced_column", {
  orgId: Std.Column.uuid()
}))
void badRichForeignKeyReferencedColumn

const badRichPrimaryKeyColumnBase = Std.Table.make("bad_rich_primary_key_column", {
  id: Std.Column.uuid()
})
const badRichPrimaryKeyColumn = badRichPrimaryKeyColumnBase.pipe(
  // @ts-expect-error rich primary key columns must exist on the target table
  Std.Table.primaryKey((table: typeof badRichPrimaryKeyColumnBase) => table.missing)
)
void badRichPrimaryKeyColumn

const badRichPrimaryKeyNullableBase = Std.Table.make("bad_rich_primary_key_nullable", {
  slug: Std.Column.text().pipe(Std.Column.nullable)
})
const badRichPrimaryKeyNullable = badRichPrimaryKeyNullableBase.pipe(
  Std.Table.primaryKey<
    typeof badRichPrimaryKeyNullableBase,
    typeof badRichPrimaryKeyNullableBase.slug
  >((table) => table.slug)
)
void badRichPrimaryKeyNullable

const badRichUniqueColumnBase = Std.Table.make("bad_rich_unique_column", {
  id: Std.Column.uuid()
})
const badRichUniqueColumn = badRichUniqueColumnBase.pipe(
  // @ts-expect-error rich unique columns must exist on the target table
  Std.Table.unique((table: typeof badRichUniqueColumnBase) => table.missing)
)
void badRichUniqueColumn

const badRichIndexColumnBase = Std.Table.make("bad_rich_index_column", {
  id: Std.Column.uuid()
})
const badRichIndexColumn = badRichIndexColumnBase.pipe(
  // @ts-expect-error rich index columns must exist on the target table
  StdRoot.Table.index((table: typeof badRichIndexColumnBase) => table.missing)
)
void badRichIndexColumn

const badRichIndexIncludeBase = Std.Table.make("bad_rich_index_include", {
  id: Std.Column.uuid()
})
const badRichIndexInclude = badRichIndexIncludeBase.pipe(
  StdRoot.Table.index((table: typeof badRichIndexIncludeBase) => table.id).pipe(
    // @ts-expect-error rich index included columns must exist on the target table
    Postgres.Index.include((table: typeof badRichIndexIncludeBase) => table.missing)
  )
)
void badRichIndexInclude

const badRichIndexKeyBase = Std.Table.make("bad_rich_index_key", {
  id: Std.Column.uuid()
})
const badRichIndexKey = badRichIndexKeyBase.pipe(
  StdRoot.Table.index((table: typeof badRichIndexKeyBase) => table.id).pipe(
    // @ts-expect-error rich index key columns must exist on the target table
    Postgres.Index.key((table: typeof badRichIndexKeyBase) => table.missing)
  )
)
void badRichIndexKey

const badIndexBase = Std.Table.make("bad_index", {
  id: Std.Column.uuid()
})
const badIndex = badIndexBase.pipe(
  // @ts-expect-error unknown columns are rejected for indexes
  Std.Table.index((table: typeof badIndexBase) => table.missing)
)

// @ts-expect-error table checks require expressions, not raw SQL strings
const badCheck = Std.Table.check("role_not_empty", "role <> ''")

const badCompositePrimaryKeyBase = Std.Table.make("bad_pk", {
  id: Std.Column.uuid(),
  slug: Std.Column.text().pipe(Std.Column.nullable)
})
const badCompositePrimaryKey = badCompositePrimaryKeyBase.pipe(
  Std.Table.primaryKey<
    typeof badCompositePrimaryKeyBase,
    readonly [typeof badCompositePrimaryKeyBase.id, typeof badCompositePrimaryKeyBase.slug]
  >((table) => [table.id, table.slug] as const)
)

// @ts-expect-error where only accepts boolean predicates
const badWhere = Q.where("nope")

// @ts-expect-error joins require a base source to already exist
const badJoin = Q.select({ postId: posts.id }).pipe(Q.innerJoin(posts, true))

const badDuplicateJoin = Q.select({ userId: users.id }).pipe(
  Q.from(users),
  // @ts-expect-error duplicate source names must be aliased before joining
  Q.innerJoin(users, Q.eq(users.id, users.id))
)
void badDuplicateJoin

class UsersClass extends Std.Table.Class<UsersClass>("users_class")({
  id: Std.Column.uuid().pipe(Std.Column.primaryKey, Std.Column.generated(Q.literal("generated-user-id"))),
  email: Std.Column.text()
}) {
  static readonly [Std.Table.options] = [Std.Table.index((table) => table.email)]
}

class BadUsersClass extends Std.Table.Class<BadUsersClass>("bad_users_class")({
  id: Std.Column.uuid(),
  slug: Std.Column.text()
}) {}

// @ts-expect-error class table option columns must exist on the declared table
const badUsersClassIndexOptions: typeof BadUsersClass[typeof Std.Table.options] = [Std.Table.index((table) => table.missing)]

// @ts-expect-error class table unique option columns must exist on the declared table
const badUsersClassUniqueOptions: typeof BadUsersClass[typeof Std.Table.options] = [Std.Table.unique((table) => table.missing)]

const classColumn = UsersClass.id
void classColumn

// @ts-expect-error class table options do not support table-level primary keys
const badUsersClassOptions: typeof BadUsersClass[typeof Std.Table.options] = [Std.Table.primaryKey((table) => [table.id, table.slug])]
void badUsersClassOptions

const manager = Std.Table.alias(users, "manager")
const report = Std.Table.alias(users, "report")

// @ts-expect-error aliased query sources cannot accept schema-level table options
const badAliasOption = Std.Table.index((table) => table.email)(manager)

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

const mysqlUsers = Std.Table.make("mysql_users", {
  id: Mysql.Column.custom(Schema.String.check(Schema.isUUID()), Mysql.Datatypes.mysqlDatatypes.uuid()),
  email: Mysql.Column.custom(Schema.String, Mysql.Datatypes.mysqlDatatypes.text())
})
const mysqlOrgs = Std.Table.make("mysql_orgs", {
  id: Mysql.Column.custom(Schema.String.check(Schema.isUUID()), Mysql.Datatypes.mysqlDatatypes.uuid()),
  name: Mysql.Column.custom(Schema.String, Mysql.Datatypes.mysqlDatatypes.text())
})
const mysqlSchemaTablePrimaryKeyBase = Std.Table.make("mysql_schema_table_primary_key", {
  id: Std.Column.uuid(),
  slug: Std.Column.text(),
  name: Std.Column.text()
}, "tenant")
const mysqlSchemaTablePrimaryKey = mysqlSchemaTablePrimaryKeyBase.pipe(
  Std.Table.primaryKey<
    typeof mysqlSchemaTablePrimaryKeyBase,
    readonly [typeof mysqlSchemaTablePrimaryKeyBase.id, typeof mysqlSchemaTablePrimaryKeyBase.slug]
  >((table) => [table.id, table.slug] as const)
)
type MysqlSchemaTablePrimaryKeyUpdate = Std.Table.UpdateOf<typeof mysqlSchemaTablePrimaryKey>
const mysqlSchemaTablePrimaryKeyUpdate: MysqlSchemaTablePrimaryKeyUpdate = { name: "updated" }
// @ts-expect-error mysql schema table primary key options should update the derived update schema
const badMysqlSchemaTablePrimaryKeyUpdate: MysqlSchemaTablePrimaryKeyUpdate = { id: "not-allowed" }
void mysqlSchemaTablePrimaryKey
void mysqlSchemaTablePrimaryKeyUpdate
void badMysqlSchemaTablePrimaryKeyUpdate

const badMysqlSchemaTableOptionColumnBase = Std.Table.make("bad_mysql_schema_table_option_column", { id: Std.Column.uuid() }, "tenant")
const badMysqlSchemaTableOptionColumn = badMysqlSchemaTableOptionColumnBase.pipe(
  // @ts-expect-error mysql schema table option columns must exist on the declared table
  Std.Table.index((table: typeof badMysqlSchemaTableOptionColumnBase) => table.missing)
)
void badMysqlSchemaTableOptionColumn

const badMysqlForeignKeyLocalColumnBase = Std.Table.make("bad_mysql_fk_local_column", {
  orgId: Std.Column.uuid()
})
const badMysqlForeignKeyLocalColumn = badMysqlForeignKeyLocalColumnBase.pipe(
  // @ts-expect-error mysql foreign key local columns must exist on the source table
  Std.Table.foreignKey((table: typeof badMysqlForeignKeyLocalColumnBase) => table.missing, () => mysqlOrgs.id)
)
void badMysqlForeignKeyLocalColumn

// @ts-expect-error mysql foreign keys must reference columns on the target table
const badMysqlForeignKeyReferencedColumn = Std.Table.foreignKey((table) => table.orgId, () => mysqlOrgs.missing)(Std.Table.make("bad_mysql_fk_referenced_column", {
  orgId: Std.Column.uuid()
}))
void badMysqlForeignKeyReferencedColumn

const postgresUsers = Std.Table.make("postgres_users", {
  id: Postgres.Column.custom(Schema.String.check(Schema.isUUID()), Postgres.Type.custom("uuid")),
  email: Postgres.Column.custom(Schema.String, Postgres.Type.citext())
})

const badPostgresFromMysql = StdRoot.Query.select({
  id: mysqlUsers.id
}).pipe(
  StdRoot.Query.from(mysqlUsers)
)
void badPostgresFromMysql

const badMysqlFromPostgres = StdRoot.Query.select({
  id: postgresUsers.id
}).pipe(
  StdRoot.Query.from(postgresUsers)
)
void badMysqlFromPostgres

const badPostgresJoinMysql = StdRoot.Query.select({
  id: postgresUsers.id
}).pipe(
  StdRoot.Query.from(postgresUsers),
  StdRoot.Query.innerJoin(mysqlUsers, StdRoot.Query.literal(true))
)
void badPostgresJoinMysql

const badMysqlJoinPostgres = StdRoot.Query.select({
  id: mysqlUsers.id
}).pipe(
  StdRoot.Query.from(mysqlUsers),
  StdRoot.Query.innerJoin(postgresUsers, StdRoot.Query.literal(true))
)
void badMysqlJoinPostgres

// @ts-expect-error postgres mutations cannot target mysql tables
const badPostgresInsertMysql = StdRoot.Query.insert(mysqlUsers, {
  email: "alice@example.com"
})
void badPostgresInsertMysql

// @ts-expect-error mysql mutations cannot target postgres tables
const badMysqlInsertPostgres = StdRoot.Query.insert(postgresUsers, {
  email: "alice@example.com"
})
void badMysqlInsertPostgres

const badPostgresUpdateMysql = StdRoot.Query.update(mysqlUsers, {
  email: "alice@example.com"
})
void badPostgresUpdateMysql

const badMysqlDeletePostgres = StdRoot.Query.delete(postgresUsers)
void badMysqlDeletePostgres

const badPostgresTruncateMysql = StdRoot.Query.truncate(mysqlUsers)
void badPostgresTruncateMysql

const badPostgresCreateTableMysql = StdRoot.Query.createTable(mysqlUsers)
void badPostgresCreateTableMysql

const badMysqlCreateTablePostgres = StdRoot.Query.createTable(postgresUsers)
void badMysqlCreateTablePostgres

const badPostgresCreateIndexMysql = StdRoot.Query.createIndex(mysqlUsers, ["email"] as const)
void badPostgresCreateIndexMysql

const badPostgresPredicateMysql = StdRoot.Query.eq(mysqlUsers.email, "alice@example.com")
void badPostgresPredicateMysql

const badMysqlPredicatePostgres = StdRoot.Query.eq(postgresUsers.email, "alice@example.com")
void badMysqlPredicatePostgres

// @ts-expect-error postgres mutation values cannot use mysql expressions
const badPostgresMutationMysqlExpression = StdRoot.Query.insert(postgresUsers, {
  email: StdRoot.Query.literal("alice@example.com")
})
void badPostgresMutationMysqlExpression

const widenedPostgresInsertMysqlEmail: StdRoot.Query.MutationInputOf<Std.Table.InsertOf<typeof users>>["email"] =
  StdRoot.Query.literal("alice@example.com")
void widenedPostgresInsertMysqlEmail

const widenedPostgresInsertPostgresEmail: StdRoot.Query.MutationInputOf<Std.Table.InsertOf<typeof users>>["email"] =
  StdRoot.Query.literal("alice@example.com")
void widenedPostgresInsertPostgresEmail

const widenedPostgresWhereMysqlPredicate: StdRoot.Query.PredicateInput = StdRoot.Query.literal(true)
const widenedPostgresWhereMysqlPlan = StdRoot.Query.select({
  id: users.id
}).pipe(
  StdRoot.Query.from(users),
  StdRoot.Query.where(widenedPostgresWhereMysqlPredicate)
)
const widenedPostgresWhereMysqlRendered = Postgres.Renderer.make().render(
  // @ts-expect-error widened predicate inputs must still preserve expression dialect
  widenedPostgresWhereMysqlPlan
)
void widenedPostgresWhereMysqlRendered

const badPostgresMergeMysqlTarget = StdRoot.Query.merge(mysqlUsers, postgresUsers, StdRoot.Query.literal(true), {
  whenMatched: {
    delete: true
  }
})
void badPostgresMergeMysqlTarget

const badPostgresMergeMysqlSource = StdRoot.Query.merge(postgresUsers, mysqlUsers, StdRoot.Query.literal(true), {
  whenMatched: {
    delete: true
  }
})
void badPostgresMergeMysqlSource

const badPostgresValuesMysqlExpression = StdRoot.Query.values([
  { email: StdRoot.Query.literal("alice@example.com") }
] as const)
void badPostgresValuesMysqlExpression

const badMysqlValuesPostgresExpression = StdRoot.Query.values([
  { email: StdRoot.Query.literal("alice@example.com") }
] as const)
void badMysqlValuesPostgresExpression

const badPostgresUnnestMysqlExpression = StdRoot.Query.unnest({
  email: [StdRoot.Query.literal("alice@example.com")] as const
}, "bad_postgres_unnest_mysql_expression")
void badPostgresUnnestMysqlExpression

const badPostgresGenerateSeriesMysqlExpression = Postgres.Query.generateSeries(
  StdRoot.Query.literal(1),
  3,
  1,
  "bad_postgres_generate_series_mysql_expression"
)
void badPostgresGenerateSeriesMysqlExpression

const mysqlDialect: typeof mysqlUsers.id[typeof Expression.TypeId]["dbType"]["dialect"] = "mysql"
const postgresDialect: typeof postgresUsers.id[typeof Expression.TypeId]["dbType"]["dialect"] = "postgres"

const mysqlPlan = StdRoot.Query.select({
  id: mysqlUsers.id
}).pipe(
  StdRoot.Query.from(mysqlUsers)
)
const mysqlLiteral = StdRoot.Query.literal("user")
const mysqlEq = StdRoot.Query.eq(mysqlUsers.email, "alice@example.com")
const mysqlConcat = StdRoot.Function.concat(StdRoot.Function.lower(mysqlUsers.email), "-user")
const postgresPlan = StdRoot.Query.select({
  id: postgresUsers.id
}).pipe(
  StdRoot.Query.from(postgresUsers)
)

const mysqlDerivedSource = StdRoot.Query.as(mysqlPlan, "mysql_derived")
const badPostgresFromMysqlDerived = StdRoot.Query.select({
  id: mysqlDerivedSource.id
}).pipe(
  StdRoot.Query.from(mysqlDerivedSource)
)
void badPostgresFromMysqlDerived

const postgresDerivedSource = StdRoot.Query.as(postgresPlan, "postgres_derived")
const badMysqlFromPostgresDerived = StdRoot.Query.select({
  id: postgresDerivedSource.id
}).pipe(
  StdRoot.Query.from(postgresDerivedSource)
)
void badMysqlFromPostgresDerived

const mysqlCteSource = mysqlPlan.pipe(StdRoot.Query.with("mysql_cte"))
const badPostgresFromMysqlCte = StdRoot.Query.select({
  id: mysqlCteSource.id
}).pipe(
  StdRoot.Query.from(mysqlCteSource)
)
void badPostgresFromMysqlCte

const postgresCteSource = postgresPlan.pipe(StdRoot.Query.with("postgres_cte"))
const badMysqlFromPostgresCte = StdRoot.Query.select({
  id: postgresCteSource.id
}).pipe(
  StdRoot.Query.from(postgresCteSource)
)
void badMysqlFromPostgresCte

const mysqlLateralSource = StdRoot.Query.lateral(mysqlPlan, "mysql_lateral")
const badPostgresFromMysqlLateral = StdRoot.Query.select({
  id: mysqlLateralSource.id
}).pipe(
  StdRoot.Query.from(mysqlLateralSource)
)
void badPostgresFromMysqlLateral

const postgresLateralSource = StdRoot.Query.lateral(postgresPlan, "postgres_lateral")
const badMysqlFromPostgresLateral = StdRoot.Query.select({
  id: postgresLateralSource.id
}).pipe(
  StdRoot.Query.from(postgresLateralSource)
)
void badMysqlFromPostgresLateral

const mysqlRendered = Mysql.Renderer.make().render(mysqlPlan)
const postgresRendered = Postgres.Renderer.make().render(postgresPlan)
const mysqlLiteralDialect: typeof mysqlLiteral[typeof Expression.TypeId]["dbType"]["dialect"] = "standard"
const mysqlEqDialect: typeof mysqlEq[typeof Expression.TypeId]["dbType"]["dialect"] = "standard"
const mysqlConcatDialect: typeof mysqlConcat[typeof Expression.TypeId]["dbType"]["dialect"] = "standard"
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
