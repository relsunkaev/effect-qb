// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1759-1772

// README.md:1759-1772
import * as Mysql from "effect-qb/mysql"
import { Executor as PostgresExecutor } from "effect-qb/postgres"

const mysqlPlan = Mysql.Query.select({
  id: Mysql.Query.literal("user-id")
})

const postgresExecutor = PostgresExecutor.make()

// @ts-expect-error mysql plans are not dialect-compatible with the postgres executor
postgresExecutor.execute(mysqlPlan)
// effect-qb: plan dialect is not compatible with the target renderer or executor

export {};
