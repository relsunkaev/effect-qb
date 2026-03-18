import type * as Effect from "effect/Effect"

import * as Mysql from "../../src/mysql.ts"
import * as Postgres from "../../src/postgres.ts"
import { Executor, Query as RootQuery, Renderer } from "../../src/index.ts"

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
const pgConcat = Postgres.Query.concat(Postgres.Query.lower(pgUsers.email), "-user")
const myConcat = Mysql.Query.concat(Mysql.Query.lower(myUsers.email), "-user")

const pgLiteralDialect: typeof pgLiteral[typeof Postgres.Expression.TypeId]["dbType"]["dialect"] = "postgres"
const myLiteralDialect: typeof myLiteral[typeof Mysql.Expression.TypeId]["dbType"]["dialect"] = "mysql"
const pgPredicateDialect: typeof pgPredicate[typeof Postgres.Expression.TypeId]["dbType"]["dialect"] = "postgres"
const myPredicateDialect: typeof myPredicate[typeof Mysql.Expression.TypeId]["dbType"]["dialect"] = "mysql"
const pgConcatDialect: typeof pgConcat[typeof Postgres.Expression.TypeId]["dbType"]["dialect"] = "postgres"
const myConcatDialect: typeof myConcat[typeof Mysql.Expression.TypeId]["dbType"]["dialect"] = "mysql"
void pgLiteralDialect
void myLiteralDialect
void pgPredicateDialect
void myPredicateDialect
void pgConcatDialect
void myConcatDialect

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
