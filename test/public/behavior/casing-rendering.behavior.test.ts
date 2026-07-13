import { describe, expect, test } from "bun:test"

import { Casing, Column, Query, Table } from "../../../packages/querybuilder/src/index.ts"
import * as Mysql from "#mysql"
import * as Pg from "#postgres"
import * as Sqlite from "#sqlite"
import * as StdRoot from "#standard"

describe("casing rendering behavior", () => {
  test("renderer casing maps physical table and column identifiers without changing model keys", () => {
    const users = StdRoot.Table.make("UserAccounts", {
      id: Column.uuid().pipe(Column.primaryKey),
      createdAt: Column.datetime(),
      displayName: Column.text()
    })

    const plan = Query.select({
      createdAt: users.createdAt
    }).pipe(
      Query.from(users),
      Query.where(Query.eq(users.displayName, "Alice"))
    )

    const rendered = Pg.Renderer.make().pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case"
      })
    ).render(plan)

    expect(rendered.sql).toBe(
      'select "user_accounts"."created_at" as "createdAt" from "user_accounts" where ("user_accounts"."display_name" = $1)'
    )
    expect(rendered.projections).toEqual([
      { path: ["createdAt"], alias: "createdAt" }
    ])

    expect(Pg.Renderer.make().pipe(
      Casing.withCasing("snake_case")
    ).render(plan).sql).toBe(rendered.sql)
  })

  test("casing style shorthand applies to all identifier categories", () => {
    const Snake = Casing.make("snake_case")
    const users = Snake.table("UserAccounts", {
      id: Column.uuid().pipe(Column.primaryKey),
      createdAt: Column.datetime(),
      displayName: Column.text()
    }).pipe(
      StdRoot.Index.make((table) => table.displayName).pipe(StdRoot.Index.named("DisplayNameLookup"))
    )

    const plan = StdRoot.Query.createIndex(users, ["displayName"] as const, {
      name: "DisplayNameLookup",
      ifNotExists: true
    })

    expect(Pg.Renderer.make().render(plan).sql).toBe(
      'create index if not exists "display_name_lookup" on "user_accounts" ("display_name")'
    )
    expect(Pg.Renderer.make().pipe(Casing.withCasing("snake_case")).render(
      StdRoot.Query.select({ createdAt: users.createdAt }).pipe(StdRoot.Query.from(users))
    ).sql).toBe(
      'select "user_accounts"."created_at" as "createdAt" from "user_accounts"'
    )
  })

  test("mysql and sqlite renderer casing maps physical identifiers without changing model keys", () => {
    const users = StdRoot.Table.make("UserAccounts", {
      id: Column.uuid().pipe(Column.primaryKey),
      createdAt: Column.datetime(),
      displayName: Column.text()
    })

    const plan = Query.select({
      createdAt: users.createdAt
    }).pipe(
      Query.from(users),
      Query.where(Query.eq(users.displayName, "Alice"))
    )

    const casing = {
      tables: "snake_case",
      columns: "snake_case"
    } as const

    expect(Mysql.Renderer.make().pipe(Casing.withCasing(casing)).render(plan).sql).toBe(
      "select `user_accounts`.`created_at` as `createdAt` from `user_accounts` where (`user_accounts`.`display_name` = ?)"
    )
    expect(Sqlite.Renderer.make().pipe(Casing.withCasing(casing)).render(plan).sql).toBe(
      'select "user_accounts"."created_at" as "createdAt" from "user_accounts" where ("user_accounts"."display_name" = ?)'
    )
  })

  test("renderer casing preserves query-local values source identifiers", () => {
    const casing = {
      tables: "snake_case",
      columns: "snake_case"
    } as const
    const postgresSeed = StdRoot.Query.values([
      { displayName: StdRoot.Query.literal("Alice") }
    ] as const).pipe(StdRoot.Query.as("SeedRows"))
    const mysqlSeed = StdRoot.Query.values([
      { displayName: StdRoot.Query.literal("Alice") }
    ] as const).pipe(StdRoot.Query.as("SeedRows"))
    const sqliteSeed = StdRoot.Query.values([
      { displayName: StdRoot.Query.literal("Alice") }
    ] as const).pipe(StdRoot.Query.as("SeedRows"))

    expect(Pg.Renderer.make().pipe(Casing.withCasing(casing)).render(
      StdRoot.Query.select({
        displayName: postgresSeed.displayName
      }).pipe(StdRoot.Query.from(postgresSeed))
    ).sql).toBe(
      'select "SeedRows"."displayName" as "displayName" from (select $1 as "displayName") as "SeedRows"("displayName")'
    )
    expect(Mysql.Renderer.make().pipe(Casing.withCasing(casing)).render(
      StdRoot.Query.select({
        displayName: mysqlSeed.displayName
      }).pipe(StdRoot.Query.from(mysqlSeed))
    ).sql).toBe(
      "select `SeedRows`.`displayName` as `displayName` from (select ? as `displayName`) as `SeedRows`(`displayName`)"
    )
    expect(Sqlite.Renderer.make().pipe(Casing.withCasing(casing)).render(
      StdRoot.Query.select({
        displayName: sqliteSeed.displayName
      }).pipe(StdRoot.Query.from(sqliteSeed))
    ).sql).toBe(
      'select "SeedRows"."displayName" as "displayName" from (select ? as "displayName") as "SeedRows"'
    )
  })

  test("renderer casing propagates into derived source plans", () => {
    const casing = {
      tables: "snake_case",
      columns: "snake_case"
    } as const
    const users = StdRoot.Table.make("UserAccounts", {
      id: Column.uuid().pipe(Column.primaryKey),
      displayName: Column.text()
    })
    const postgresActiveUsers = StdRoot.Query.select({
      id: users.id,
      displayName: users.displayName
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.where(StdRoot.Query.isNotNull(users.displayName)),
      StdRoot.Query.as("ActiveUsers")
    )
    const mysqlActiveUsers = StdRoot.Query.select({
      id: users.id,
      displayName: users.displayName
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.where(StdRoot.Query.isNotNull(users.displayName)),
      StdRoot.Query.as("ActiveUsers")
    )
    const sqliteActiveUsers = StdRoot.Query.select({
      id: users.id,
      displayName: users.displayName
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.where(StdRoot.Query.isNotNull(users.displayName)),
      StdRoot.Query.as("ActiveUsers")
    )

    expect(Pg.Renderer.make().pipe(Casing.withCasing(casing)).render(
      StdRoot.Query.select({
        displayName: postgresActiveUsers.displayName
      }).pipe(StdRoot.Query.from(postgresActiveUsers))
    ).sql).toBe(
      'select "ActiveUsers"."displayName" as "displayName" from (select "user_accounts"."id" as "id", "user_accounts"."display_name" as "displayName" from "user_accounts" where ("user_accounts"."display_name" is not null)) as "ActiveUsers"'
    )
    expect(Mysql.Renderer.make().pipe(Casing.withCasing(casing)).render(
      StdRoot.Query.select({
        displayName: mysqlActiveUsers.displayName
      }).pipe(StdRoot.Query.from(mysqlActiveUsers))
    ).sql).toBe(
      "select `ActiveUsers`.`displayName` as `displayName` from (select `user_accounts`.`id` as `id`, `user_accounts`.`display_name` as `displayName` from `user_accounts` where (`user_accounts`.`display_name` is not null)) as `ActiveUsers`"
    )
    expect(Sqlite.Renderer.make().pipe(Casing.withCasing(casing)).render(
      StdRoot.Query.select({
        displayName: sqliteActiveUsers.displayName
      }).pipe(StdRoot.Query.from(sqliteActiveUsers))
    ).sql).toBe(
      'select "ActiveUsers"."displayName" as "displayName" from (select "user_accounts"."id" as "id", "user_accounts"."display_name" as "displayName" from "user_accounts" where ("user_accounts"."display_name" is not null)) as "ActiveUsers"'
    )
  })

  test("mutation casing maps insert and conflict identifiers", () => {
    const users = StdRoot.Table.make("UserAccounts", {
      id: Column.uuid().pipe(Column.primaryKey),
      emailAddress: Column.text(),
      displayName: Column.text()
    }).pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case"
      })
    )

    const mysqlPlan = StdRoot.Query.onConflict(["emailAddress"] as const, {
      update: {
        displayName: StdRoot.Query.excluded(users.displayName)
      }
    })(StdRoot.Query.insert(users, {
      id: "11111111-1111-4111-8111-111111111111",
      emailAddress: "alice@example.com",
      displayName: "Alice"
    }))

    const postgresPlan = StdRoot.Query.onConflict(["emailAddress"] as const, {
      update: {
        displayName: StdRoot.Query.excluded(users.displayName)
      }
    })(StdRoot.Query.insert(users, {
      id: "11111111-1111-4111-8111-111111111111",
      emailAddress: "alice@example.com",
      displayName: "Alice"
    }))

    const sqlitePlan = StdRoot.Query.onConflict(["emailAddress"] as const, {
      update: {
        displayName: StdRoot.Query.excluded(users.displayName)
      }
    })(StdRoot.Query.insert(users, {
      id: "11111111-1111-4111-8111-111111111111",
      emailAddress: "alice@example.com",
      displayName: "Alice"
    }))

    expect(Mysql.Renderer.make().render(mysqlPlan).sql).toBe(
      "insert into `user_accounts` (`id`, `email_address`, `display_name`) values (?, ?, ?) on duplicate key update `display_name` = values(`display_name`)"
    )
    expect(Pg.Renderer.make().render(postgresPlan).sql).toBe(
      'insert into "user_accounts" ("id", "email_address", "display_name") values ($1, $2, $3) on conflict ("email_address") do update set "display_name" = excluded."display_name"'
    )
    expect(Sqlite.Renderer.make().render(sqlitePlan).sql).toBe(
      'insert into "user_accounts" ("id", "email_address", "display_name") values (?, ?, ?) on conflict ("email_address") do update set "display_name" = excluded."display_name"'
    )
  })

  test("mutation casing maps update assignment identifiers", () => {
    const users = StdRoot.Table.make("UserAccounts", {
      id: Column.uuid().pipe(Column.primaryKey),
      displayName: Column.text()
    }).pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case"
      })
    )

    const id = "11111111-1111-4111-8111-111111111111"
    const mysqlPlan = StdRoot.Query.update(users, {
      displayName: "Alice"
    }).pipe(
      StdRoot.Query.where(StdRoot.Query.eq(users.id, id))
    )
    const sqlitePlan = StdRoot.Query.update(users, {
      displayName: "Alice"
    }).pipe(
      StdRoot.Query.where(StdRoot.Query.eq(users.id, id))
    )

    expect(Mysql.Renderer.make().render(mysqlPlan).sql).toBe(
      "update `user_accounts` set `display_name` = ? where (`user_accounts`.`id` = ?)"
    )
    expect(Sqlite.Renderer.make().render(sqlitePlan).sql).toBe(
      'update "user_accounts" set "display_name" = ? where ("user_accounts"."id" = ?)'
    )
  })

  test("mysql delete target casing maps joined delete identifiers", () => {
    const users = StdRoot.Table.make("UserAccounts", {
      id: Column.uuid().pipe(Column.primaryKey),
      emailAddress: Column.text()
    }).pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case"
      })
    )
    const posts = StdRoot.Table.make("PostEntries", {
      id: Column.uuid().pipe(Column.primaryKey),
      userId: Column.uuid()
    }).pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case"
      })
    )

    const plan = StdRoot.Query.innerJoin(posts, StdRoot.Query.eq(posts.userId, users.id))(
      StdRoot.Query.delete(users)
    )

    expect(Mysql.Renderer.make().render(plan).sql).toBe(
      "delete `user_accounts` from `user_accounts` inner join `post_entries` on (`post_entries`.`user_id` = `user_accounts`.`id`)"
    )
  })

  test("table casing overrides renderer casing", () => {
    const users = StdRoot.Table.make("UserAccounts", {
      id: Column.uuid().pipe(Column.primaryKey),
      createdAt: Column.datetime()
    }).pipe(
      Casing.withCasing({ columns: "preserve" })
    )

    const plan = Query.select({
      createdAt: users.createdAt
    }).pipe(Query.from(users))

    expect(Pg.Renderer.make().pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case"
      })
    ).render(plan).sql).toBe(
      'select "user_accounts"."createdAt" as "createdAt" from "user_accounts"'
    )
    expect(Pg.Renderer.make().pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case"
      })
    ).render(plan).sql).toBe(
      'select "user_accounts"."createdAt" as "createdAt" from "user_accounts"'
    )
  })

  test("casing table factories create cased tables", () => {
    const Snake = Casing.make({
      tables: "snake_case",
      columns: "snake_case"
    })
    const users = Snake.table("UserAccounts", {
      id: Column.uuid().pipe(Column.primaryKey),
      createdAt: Column.datetime()
    })

    const plan = Query.insert(users, {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-05-23T12:00:00"
    })

    expect(Pg.Renderer.make().render(plan).sql).toBe(
      'insert into "user_accounts" ("id", "created_at") values ($1, $2)'
    )
  })

  test("casing pipes trust typed targets without invalid-target validation", () => {
    try {
      Casing.withCasing({ columns: "snake_case" })("not-a-casing-target" as any)
    } catch (error) {
      expect(String(error)).not.toContain(
        "Casing.withCasing can only be applied to tables or schema factories"
      )
    }
  })
})
