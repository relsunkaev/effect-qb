// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1615-1634

// README.md:1615-1634
import { Column as MysqlColumn, Query as MysqlQuery, Table as MysqlTable } from "effect-qb/mysql"
import { Executor as PostgresExecutor } from "effect-qb/postgres"

const mysqlUsers = MysqlTable.make("users", {
  id: MysqlColumn.uuid().pipe(MysqlColumn.primaryKey)
})

const mysqlPlan = MysqlQuery.select({
  id: mysqlUsers.id
}).pipe(
  MysqlQuery.from(mysqlUsers)
)

const postgresExecutor = PostgresExecutor.make()

// @ts-expect-error mysql plans are not dialect-compatible with the postgres executor
postgresExecutor.execute(mysqlPlan)
// effect-qb: plan dialect is not compatible with the target renderer or executor

export {};
