// @ts-nocheck
import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as Mysql from "#mysql";
import * as Postgres from "#postgres";
import * as StdRoot from "#standard";
import {
  makeMysqlEmployees,
  makeMysqlSocialGraph,
  makePostgresEmployees,
  makePostgresSocialGraph,
} from "../../fixtures/schema.ts";

const userId = "11111111-1111-4111-8111-111111111111";

describe("dialect behavior", () => {
  test("postgres and mysql produce the same decoded row shape for the same logical query", () => {
    const { users: pgUsers } = makePostgresSocialGraph();
    const { users: myUsers } = makeMysqlSocialGraph();

    const pgPlan = StdRoot.Query.select({
      profile: {
        id: pgUsers.id,
        email: StdRoot.Function.lower(pgUsers.email),
      },
    }).pipe(StdRoot.Query.from(pgUsers));
    const myPlan = StdRoot.Query.select({
      profile: {
        id: myUsers.id,
        email: StdRoot.Function.lower(myUsers.email),
      },
    }).pipe(StdRoot.Query.from(myUsers));

    const row = {
      profile__id: userId,
      profile__email: "alice@example.com",
    };

    const pgRows = Effect.runSync(
      Postgres.Executor.make({
        driver: Postgres.Executor.driver(() => Effect.succeed([row])),
      }).execute(pgPlan),
    );
    const myRows = Effect.runSync(
      Mysql.Executor.make({
        driver: Mysql.Executor.driver(() => Effect.succeed([row])),
      }).execute(myPlan),
    );

    expect(pgRows).toEqual(myRows);
  });

  test("postgres and mysql render the same logical self-join with dialect-specific SQL syntax", () => {
    const pgEmployees = makePostgresEmployees();
    const myEmployees = makeMysqlEmployees();

    const pgManager = StdRoot.Table.alias(pgEmployees, "manager");
    const pgReport = StdRoot.Table.alias(pgEmployees, "report");
    const myManager = StdRoot.Table.alias(myEmployees, "manager");
    const myReport = StdRoot.Table.alias(myEmployees, "report");

    const pgPlan = StdRoot.Query.select({
      managerId: pgManager.id,
      reportName: pgReport.name,
    }).pipe(
      StdRoot.Query.from(pgManager),
      StdRoot.Query.leftJoin(pgReport, StdRoot.Query.eq(pgReport.managerId, pgManager.id)),
    );
    const myPlan = StdRoot.Query.select({
      managerId: myManager.id,
      reportName: myReport.name,
    }).pipe(
      StdRoot.Query.from(myManager),
      StdRoot.Query.leftJoin(myReport, StdRoot.Query.eq(myReport.managerId, myManager.id)),
    );

    expect(Postgres.Renderer.make().render(pgPlan).sql).toBe(
      'select "manager"."id" as "managerId", "report"."name" as "reportName" from "employees" as "manager" left join "employees" as "report" on ("report"."managerId" = "manager"."id")',
    );
    expect(Mysql.Renderer.make().render(myPlan).sql).toBe(
      "select `manager`.`id` as `managerId`, `report`.`name` as `reportName` from `employees` as `manager` left join `employees` as `report` on (`report`.`managerId` = `manager`.`id`)",
    );
  });

  test("root function operators stay portable across dialect-shaped tables", () => {
    const { users: pgUsers } = makePostgresSocialGraph();
    const { users: myUsers } = makeMysqlSocialGraph();

    const pgExpr = StdRoot.Function.concat(StdRoot.Function.lower(pgUsers.email), "-user");
    const myExpr = StdRoot.Function.concat(StdRoot.Function.lower(myUsers.email), "-user");

    expect(pgExpr[StdRoot.Scalar.TypeId].dbType.dialect).toBe("standard");
    expect(myExpr[StdRoot.Scalar.TypeId].dbType.dialect).toBe("standard");
  });

  test("mixed-dialect tables are rejected consistently from the shared table layer", () => {
    expect(() =>
      StdRoot.Table.make("mixed_users", {
        id: Postgres.Column.custom(Schema.String.check(Schema.isUUID()), Postgres.Type.custom("uuid")),
        email: Mysql.Column.custom(Schema.String, Mysql.Datatypes.mysqlDatatypes.text()),
      }),
    ).toThrow(
      "Invalid dialects for table 'mixed_users': Mixed table dialects are not supported: postgres, mysql",
    );
  });
});
