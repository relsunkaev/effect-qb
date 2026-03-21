import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import { makeMysqlEmployees, makeMysqlSocialGraph, makePostgresEmployees, makePostgresSocialGraph } from "../../fixtures/schema.ts"

const userId = "11111111-1111-1111-1111-111111111111"

describe("dialect behavior", () => {
  test("postgres and mysql produce the same decoded row shape for the same logical query", () => {
    const { users: pgUsers } = makePostgresSocialGraph()
    const { users: myUsers } = makeMysqlSocialGraph()

    const pgPlan = Postgres.Query.select({
      profile: {
        id: pgUsers.id,
        email: Postgres.Query.lower(pgUsers.email)
      }
    }).pipe(
      Postgres.Query.from(pgUsers)
    )
    const myPlan = Mysql.Query.select({
      profile: {
        id: myUsers.id,
        email: Mysql.Query.lower(myUsers.email)
      }
    }).pipe(
      Mysql.Query.from(myUsers)
    )

    const row = {
      profile__id: userId,
      profile__email: "alice@example.com"
    }

    const pgRows = Effect.runSync(Postgres.Executor.make({
      driver: Postgres.Executor.driver(() => Effect.succeed([row]))
    }).execute(pgPlan))
    const myRows = Effect.runSync(Mysql.Executor.make({
      driver: Mysql.Executor.driver(() => Effect.succeed([row]))
    }).execute(myPlan))

    expect(pgRows).toEqual(myRows)
  })

  test("postgres and mysql render the same logical self-join with dialect-specific SQL syntax", () => {
    const pgEmployees = makePostgresEmployees()
    const myEmployees = makeMysqlEmployees()

    const pgManager = Postgres.Table.alias(pgEmployees, "manager")
    const pgReport = Postgres.Table.alias(pgEmployees, "report")
    const myManager = Mysql.Table.alias(myEmployees, "manager")
    const myReport = Mysql.Table.alias(myEmployees, "report")

    const pgPlan = Postgres.Query.select({
      managerId: pgManager.id,
      reportName: pgReport.name
    }).pipe(
      Postgres.Query.from(pgManager),
      Postgres.Query.leftJoin(pgReport, Postgres.Query.eq(pgReport.managerId, pgManager.id))
    )
    const myPlan = Mysql.Query.select({
      managerId: myManager.id,
      reportName: myReport.name
    }).pipe(
      Mysql.Query.from(myManager),
      Mysql.Query.leftJoin(myReport, Mysql.Query.eq(myReport.managerId, myManager.id))
    )

    expect(Postgres.Renderer.make().render(pgPlan).sql).toBe(
      'select "manager"."id" as "managerId", "report"."name" as "reportName" from "public"."employees" as "manager" left join "public"."employees" as "report" on ("report"."managerId" = "manager"."id")'
    )
    expect(Mysql.Renderer.make().render(myPlan).sql).toBe(
      'select `manager`.`id` as `managerId`, `report`.`name` as `reportName` from `employees` as `manager` left join `employees` as `report` on (`report`.`managerId` = `manager`.`id`)'
    )
  })

  test("dialect entrypoints brand operator outputs with their own db dialects", () => {
    const { users: pgUsers } = makePostgresSocialGraph()
    const { users: myUsers } = makeMysqlSocialGraph()

    const pgExpr = Postgres.Query.concat(Postgres.Query.lower(pgUsers.email), "-user")
    const myExpr = Mysql.Query.concat(Mysql.Query.lower(myUsers.email), "-user")

    expect(pgExpr[Postgres.Expression.TypeId].dbType.dialect).toBe("postgres")
    expect(myExpr[Mysql.Expression.TypeId].dbType.dialect).toBe("mysql")
  })

  test("mixed-dialect tables are rejected consistently from the shared table layer", () => {
    expect(() => Postgres.Table.make("mixed_users", {
      id: Postgres.Column.uuid(),
      email: Mysql.Column.text()
    })).toThrow("Invalid dialects for table 'mixed_users': Mixed table dialects are not supported: postgres, mysql")
  })
})
