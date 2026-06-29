import * as StdRoot from "#standard"
import * as Std from "effect-qb"
import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import * as Sqlite from "#sqlite"
import * as Standard from "#standard"
import * as Executor from "#internal/executor.ts"
import * as RootQuery from "#internal/query.ts"
import * as Renderer from "#internal/renderer.ts"

type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2)
    ? (<T>() => T extends B ? 1 : 2) extends
        (<T>() => T extends A ? 1 : 2)
      ? true
      : false
    : false

type Assert<T extends true> = T

type _AssertMergeStandardStandard = Assert<IsExact<RootQuery.MergeDialect<"standard", "standard">, "standard">>
type _AssertMergeStandardPostgres = Assert<IsExact<RootQuery.MergeDialect<"standard", "postgres">, "postgres">>
type _AssertMergeMysqlStandard = Assert<IsExact<RootQuery.MergeDialect<"mysql", "standard">, "mysql">>
type _AssertMergeSqliteSqlite = Assert<IsExact<RootQuery.MergeDialect<"sqlite", "sqlite">, "sqlite">>
type _AssertMergeConflict = Assert<IsExact<
  RootQuery.MergeDialect<"postgres", "mysql">,
  RootQuery.DialectConflictError<"postgres", "mysql">
>>
type _AssertNormalizeStandardPostgres = Assert<IsExact<RootQuery.NormalizeDialect<"standard" | "postgres">, "postgres">>
type _AssertNormalizeConflict = Assert<IsExact<
  RootQuery.NormalizeDialect<"postgres" | "mysql">,
  RootQuery.DialectConflictError<"postgres" | "mysql", "postgres" | "mysql">
>>

const pgUsers = Std.Table.make("users", {
  id: Postgres.Column.custom(Schema.String.check(Schema.isUUID()), Postgres.Type.custom("uuid")).pipe(Std.Column.primaryKey),
  email: Postgres.Column.custom(Schema.String, Postgres.Type.citext())
})

const myUsers = Std.Table.make("users", {
  id: Mysql.Column.custom(Schema.String.check(Schema.isUUID()), Mysql.Datatypes.mysqlDatatypes.uuid()).pipe(Std.Column.primaryKey),
  email: Mysql.Column.custom(Schema.String, Mysql.Datatypes.mysqlDatatypes.text())
})

const stdUsers = Standard.Table.make("users", {
  id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
  email: Standard.Column.text()
})

const pgLiteral = StdRoot.Query.literal("user")
const myLiteral = StdRoot.Query.literal("user")
const pgPredicate = StdRoot.Query.eq(pgUsers.email, "alice@example.com")
const myPredicate = StdRoot.Query.eq(myUsers.email, "alice@example.com")
const pgConcat = StdRoot.Function.concat(StdRoot.Function.lower(pgUsers.email), "-user")
const myConcat = StdRoot.Function.concat(StdRoot.Function.lower(myUsers.email), "-user")

const pgLiteralDialect: StdRoot.Scalar.DbTypeOf<typeof pgLiteral>["dialect"] = "standard"
const myLiteralDialect: StdRoot.Scalar.DbTypeOf<typeof myLiteral>["dialect"] = "standard"
const pgPredicateDialect: StdRoot.Scalar.DbTypeOf<typeof pgPredicate>["dialect"] = "standard"
const myPredicateDialect: StdRoot.Scalar.DbTypeOf<typeof myPredicate>["dialect"] = "standard"
const pgConcatDialect: StdRoot.Scalar.DbTypeOf<typeof pgConcat>["dialect"] = "standard"
const myConcatDialect: StdRoot.Scalar.DbTypeOf<typeof myConcat>["dialect"] = "standard"
const pgLiteralRuntime: StdRoot.Scalar.RuntimeOf<typeof pgLiteral> = "user"
const myLiteralRuntime: StdRoot.Scalar.RuntimeOf<typeof myLiteral> = "user"
const pgTrueLiteral = StdRoot.Query.literal(true)
const myTrueLiteral = StdRoot.Query.literal(true)
const pgTrueLiteralRuntime: StdRoot.Scalar.RuntimeOf<typeof pgTrueLiteral> = true
const myTrueLiteralRuntime: StdRoot.Scalar.RuntimeOf<typeof myTrueLiteral> = true
void pgLiteralDialect
void myLiteralDialect
void pgPredicateDialect
void myPredicateDialect
void pgConcatDialect
void myConcatDialect
void pgLiteralRuntime
void myLiteralRuntime
void pgTrueLiteral
void myTrueLiteral
void pgTrueLiteralRuntime
void myTrueLiteralRuntime

// @ts-expect-error string literals stay narrow
const pgBadLiteralRuntime: StdRoot.Scalar.RuntimeOf<typeof pgLiteral> = "admin"
// @ts-expect-error string literals stay narrow
const myBadLiteralRuntime: StdRoot.Scalar.RuntimeOf<typeof myLiteral> = "admin"
// @ts-expect-error boolean literals stay narrow
const pgBadTrueLiteralRuntime: StdRoot.Scalar.RuntimeOf<typeof pgTrueLiteral> = false
// @ts-expect-error boolean literals stay narrow
const myBadTrueLiteralRuntime: StdRoot.Scalar.RuntimeOf<typeof myTrueLiteral> = false

const pgPlan = StdRoot.Query.select({
  id: pgUsers.id
}).pipe(
  StdRoot.Query.from(pgUsers)
)

const myPlan = StdRoot.Query.select({
  id: myUsers.id
}).pipe(
  StdRoot.Query.from(myUsers)
)

const stdPlan = Standard.Query.select({
  id: stdUsers.id
}).pipe(
  Standard.Query.from(stdUsers)
)

type StdPlanDialect = RootQuery.PlanDialectOf<typeof stdPlan>
type _AssertStdPlanDialect = Assert<IsExact<StdPlanDialect, "standard">>

const stdPgRendered = Postgres.Renderer.make().render(stdPlan)
const stdMysqlRendered = Mysql.Renderer.make().render(stdPlan)
const stdSqliteRendered = Sqlite.Renderer.make().render(stdPlan)
void stdPgRendered
void stdMysqlRendered
void stdSqliteRendered

const standardNarrowedToPostgres = Standard.Query.select({
  id: stdUsers.id
}).pipe(
  Standard.Query.from(stdUsers),
  Standard.Query.orderBy(StdRoot.Query.literal(1))
)

type StandardNarrowedDialect = RootQuery.PlanDialectOf<typeof standardNarrowedToPostgres>
type _AssertStandardNarrowedDialect = Assert<IsExact<StandardNarrowedDialect, "standard">>

const narrowedPgRendered = Postgres.Renderer.make().render(standardNarrowedToPostgres)
const narrowedMysqlRendered = Mysql.Renderer.make().render(standardNarrowedToPostgres)
void narrowedPgRendered
void narrowedMysqlRendered

const standardNarrowedToMysql = Standard.Query.select({
  id: stdUsers.id
}).pipe(
  Standard.Query.from(stdUsers),
  Standard.Query.orderBy(StdRoot.Query.literal(1))
)

type StandardMysqlNarrowedDialect = RootQuery.PlanDialectOf<typeof standardNarrowedToMysql>
type _AssertStandardMysqlNarrowedDialect = Assert<IsExact<StandardMysqlNarrowedDialect, "standard">>

const standardMysqlRendered = Mysql.Renderer.make().render(standardNarrowedToMysql)
const standardMysqlPgRendered = Postgres.Renderer.make().render(standardNarrowedToMysql)
void standardMysqlRendered
void standardMysqlPgRendered

const standardNarrowedToSqlite = Standard.Query.select({
  id: stdUsers.id
}).pipe(
  Standard.Query.from(stdUsers),
  Standard.Query.orderBy(StdRoot.Query.literal(1))
)

type StandardSqliteNarrowedDialect = RootQuery.PlanDialectOf<typeof standardNarrowedToSqlite>
type _AssertStandardSqliteNarrowedDialect = Assert<IsExact<StandardSqliteNarrowedDialect, "standard">>

const standardSqliteRendered = Sqlite.Renderer.make().render(standardNarrowedToSqlite)
const standardSqliteMysqlRendered = Mysql.Renderer.make().render(standardNarrowedToSqlite)
void standardSqliteRendered
void standardSqliteMysqlRendered

const standardConflictPlan = Standard.Query.select({
  id: stdUsers.id
}).pipe(
  Standard.Query.from(stdUsers),
  Standard.Query.orderBy(StdRoot.Query.literal(1)),
  Standard.Query.where(StdRoot.Query.literal(true))
)

type StandardConflictDialect = RootQuery.PlanDialectOf<typeof standardConflictPlan>
type _AssertStandardConflictDialect = Assert<IsExact<
  StandardConflictDialect,
  "standard"
>>

const conflictPgRendered = Postgres.Renderer.make().render(standardConflictPlan)
void conflictPgRendered

// @ts-expect-error postgres set operators do not accept mysql left operands
const postgresSetWithMysqlLeft = StdRoot.Query.union(myPlan, pgPlan)

// @ts-expect-error postgres set operators do not accept mysql right operands
const postgresSetWithMysqlRight = StdRoot.Query.union(pgPlan, myPlan)

// @ts-expect-error mysql set operators do not accept postgres left operands
const mysqlSetWithPostgresLeft = StdRoot.Query.union(pgPlan, myPlan)

// @ts-expect-error mysql set operators do not accept postgres right operands
const mysqlSetWithPostgresRight = StdRoot.Query.union(myPlan, pgPlan)

void postgresSetWithMysqlLeft
void postgresSetWithMysqlRight
void mysqlSetWithPostgresLeft
void mysqlSetWithPostgresRight

const pgValuesSource = StdRoot.Query.values([
  { id: StdRoot.Query.literal(1), email: StdRoot.Query.literal("alice@example.com") },
  { id: StdRoot.Query.literal(2), email: StdRoot.Query.literal("bob@example.com") }
] as const).pipe(StdRoot.Query.as("seed"))

const pgValuesPlan = StdRoot.Query.select({
  id: pgValuesSource.id,
  email: pgValuesSource.email
})

type PgValuesDialect = RootQuery.PlanDialectOf<typeof pgValuesPlan>
type _AssertPgValuesDialect = Assert<IsExact<PgValuesDialect, "standard">>

const pgSeriesSource = Postgres.Query.generateSeries(1, 3, 1, "series")
const pgSeriesPlan = StdRoot.Query.select({
  value: pgSeriesSource.value
}).pipe(
  StdRoot.Query.from(pgSeriesSource)
)

type PgSeriesRequired = RootQuery.RequiredOfPlan<typeof pgSeriesPlan>
type PgSeriesAvailable = RootQuery.AvailableOfPlan<typeof pgSeriesPlan>
type PgSeriesDialect = RootQuery.PlanDialectOf<typeof pgSeriesPlan>
type _AssertPgSeriesRequired = Assert<IsExact<PgSeriesRequired, never>>
type _AssertPgSeriesAvailableKeys = Assert<IsExact<keyof PgSeriesAvailable, "series">>
type _AssertPgSeriesDialect = Assert<IsExact<PgSeriesDialect, "postgres">>

const mixedDialectPlan = StdRoot.Query.select({
  id: pgUsers.id
}).pipe(
  StdRoot.Query.from(pgUsers),
  StdRoot.Query.orderBy(StdRoot.Query.literal(1))
)

const mixedDialectRendered = Postgres.Renderer.make().render(mixedDialectPlan)
void mixedDialectRendered

const mixedDialectLimitPlan = StdRoot.Query.select({
  id: pgUsers.id
}).pipe(
  StdRoot.Query.from(pgUsers),
  StdRoot.Query.limit(StdRoot.Query.literal(1))
)

const mixedDialectLimitRendered = Postgres.Renderer.make().render(mixedDialectLimitPlan)
void mixedDialectLimitRendered

const mixedDialectOffsetPlan = StdRoot.Query.select({
  id: pgUsers.id
}).pipe(
  StdRoot.Query.from(pgUsers),
  StdRoot.Query.offset(StdRoot.Query.literal(1))
)

const mixedDialectOffsetRendered = Postgres.Renderer.make().render(mixedDialectOffsetPlan)
void mixedDialectOffsetRendered

const pgRendered = Postgres.Renderer.make().render(pgPlan)
const myRendered = Mysql.Renderer.make().render(myPlan)
type PgRow = Renderer.RowOf<typeof pgRendered>
type MyRow = Renderer.RowOf<typeof myRendered>
const mysqlRowFromPg: MyRow = null as never as PgRow
const pgRowFromMysql: PgRow = null as never as MyRow
void mysqlRowFromPg
void pgRowFromMysql

const pgExecutor = Executor.make("postgres", <PlanValue extends RootQuery.QueryPlan<any, any, any, any, any, any, any, any, any>>(
  plan: RootQuery.DialectCompatiblePlan<PlanValue, "postgres">
): Effect.Effect<any, never, never> => {
  void plan
  return null as never
})
const myExecutor = Executor.make("mysql", <PlanValue extends RootQuery.QueryPlan<any, any, any, any, any, any, any, any, any>>(
  plan: RootQuery.DialectCompatiblePlan<PlanValue, "mysql">
): Effect.Effect<any, never, never> => {
  void plan
  return null as never
})
const sqliteExecutor = Executor.make("sqlite", <PlanValue extends RootQuery.QueryPlan<any, any, any, any, any, any, any, any, any>>(
  plan: RootQuery.DialectCompatiblePlan<PlanValue, "sqlite">
): Effect.Effect<any, never, never> => {
  void plan
  return null as never
})

pgExecutor.execute(stdPlan)
pgExecutor.execute(standardNarrowedToPostgres)
myExecutor.execute(stdPlan)
myExecutor.execute(standardNarrowedToMysql)
sqliteExecutor.execute(stdPlan)
sqliteExecutor.execute(standardNarrowedToSqlite)

type MysqlPlanAgainstPostgres = RootQuery.DialectCompatiblePlan<typeof myPlan, "postgres">
const mysqlPlanDialectError: MysqlPlanAgainstPostgres["__effect_qb_error__"] =
  "effect-qb: plan dialect is not compatible with the target renderer or executor"
const mysqlPlanDialect: MysqlPlanAgainstPostgres["__effect_qb_plan_dialect__"] = "mysql"
const mysqlTargetDialect: MysqlPlanAgainstPostgres["__effect_qb_target_dialect__"] = "postgres"
const mysqlDialectHint: MysqlPlanAgainstPostgres["__effect_qb_hint__"] =
  "Use the matching dialect module or renderer/executor"
void mysqlPlanDialectError
void mysqlPlanDialect
void mysqlTargetDialect
void mysqlDialectHint

// @ts-expect-error mysql plans are not accepted by the postgres executor
pgExecutor.execute(myPlan)

// @ts-expect-error postgres plans are not accepted by the mysql executor
myExecutor.execute(pgPlan)
