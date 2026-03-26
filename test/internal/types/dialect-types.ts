import * as Effect from "effect/Effect"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import * as Executor from "#internal/executor.ts"
import * as RootQuery from "#internal/query.ts"
import * as Renderer from "#internal/renderer.ts"

const pgUsers = Postgres.Table.make("users", {
  id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
  email: Postgres.Column.text()
})

const myUsers = Mysql.Table.make("users", {
  id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
  email: Mysql.Column.text()
})

const pgLiteral = Postgres.Query.literal("user")
const myLiteral = Mysql.Query.literal("user")
const pgPredicate = Postgres.Query.eq(pgUsers.email, "alice@example.com")
const myPredicate = Mysql.Query.eq(myUsers.email, "alice@example.com")
const pgConcat = Postgres.Function.concat(Postgres.Function.lower(pgUsers.email), "-user")
const myConcat = Mysql.Function.concat(Mysql.Function.lower(myUsers.email), "-user")

const pgLiteralDialect: Postgres.Expression.DbTypeOf<typeof pgLiteral>["dialect"] = "postgres"
const myLiteralDialect: Mysql.Expression.DbTypeOf<typeof myLiteral>["dialect"] = "mysql"
const pgPredicateDialect: Postgres.Expression.DbTypeOf<typeof pgPredicate>["dialect"] = "postgres"
const myPredicateDialect: Mysql.Expression.DbTypeOf<typeof myPredicate>["dialect"] = "mysql"
const pgConcatDialect: Postgres.Expression.DbTypeOf<typeof pgConcat>["dialect"] = "postgres"
const myConcatDialect: Mysql.Expression.DbTypeOf<typeof myConcat>["dialect"] = "mysql"
const pgLiteralRuntime: Postgres.Expression.RuntimeOf<typeof pgLiteral> = "user"
const myLiteralRuntime: Mysql.Expression.RuntimeOf<typeof myLiteral> = "user"
const pgTrueLiteral = Postgres.Query.literal(true)
const myTrueLiteral = Mysql.Query.literal(true)
const pgTrueLiteralRuntime: Postgres.Expression.RuntimeOf<typeof pgTrueLiteral> = true
const myTrueLiteralRuntime: Mysql.Expression.RuntimeOf<typeof myTrueLiteral> = true
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
const pgBadLiteralRuntime: Postgres.Expression.RuntimeOf<typeof pgLiteral> = "admin"
// @ts-expect-error string literals stay narrow
const myBadLiteralRuntime: Mysql.Expression.RuntimeOf<typeof myLiteral> = "admin"
// @ts-expect-error boolean literals stay narrow
const pgBadTrueLiteralRuntime: Postgres.Expression.RuntimeOf<typeof pgTrueLiteral> = false
// @ts-expect-error boolean literals stay narrow
const myBadTrueLiteralRuntime: Mysql.Expression.RuntimeOf<typeof myTrueLiteral> = false

const pgPlan = Postgres.Query.select({
  id: pgUsers.id
}).pipe(
  Postgres.Query.from(pgUsers)
)

const myPlan = Mysql.Query.select({
  id: myUsers.id
}).pipe(
  Mysql.Query.from(myUsers)
)

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
