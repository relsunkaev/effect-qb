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

    const rendered = Pg.Renderer.make({
      casing: {
        tables: "snake_case",
        columns: "snake_case"
      }
    }).render(plan)

    expect(rendered.sql).toBe(
      'select "user_accounts"."created_at" as "createdAt" from "user_accounts" where ("user_accounts"."display_name" = $1)'
    )
    expect(rendered.projections).toEqual([
      { path: ["createdAt"], alias: "createdAt" }
    ])
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

    expect(Mysql.Renderer.make({ casing }).render(plan).sql).toBe(
      "select `user_accounts`.`created_at` as `createdAt` from `user_accounts` where (`user_accounts`.`display_name` = ?)"
    )
    expect(Sqlite.Renderer.make({ casing }).render(plan).sql).toBe(
      'select "user_accounts"."created_at" as "createdAt" from "user_accounts" where ("user_accounts"."display_name" = ?)'
    )
  })

  test("renderer casing preserves query-local values source identifiers", () => {
    const casing = {
      tables: "snake_case",
      columns: "snake_case"
    } as const
    const postgresSeed = Pg.Query.values([
      { displayName: Pg.Query.literal("Alice") }
    ] as const).pipe(Pg.Query.as("SeedRows"))
    const mysqlSeed = Mysql.Query.values([
      { displayName: Mysql.Query.literal("Alice") }
    ] as const).pipe(Mysql.Query.as("SeedRows"))
    const sqliteSeed = Sqlite.Query.values([
      { displayName: Sqlite.Query.literal("Alice") }
    ] as const).pipe(Sqlite.Query.as("SeedRows"))

    expect(Pg.Renderer.make({ casing }).render(
      Pg.Query.select({
        displayName: postgresSeed.displayName
      }).pipe(Pg.Query.from(postgresSeed))
    ).sql).toBe(
      'select "SeedRows"."displayName" as "displayName" from (select $1 as "displayName") as "SeedRows"("displayName")'
    )
    expect(Mysql.Renderer.make({ casing }).render(
      Mysql.Query.select({
        displayName: mysqlSeed.displayName
      }).pipe(Mysql.Query.from(mysqlSeed))
    ).sql).toBe(
      "select `SeedRows`.`displayName` as `displayName` from (select ? as `displayName`) as `SeedRows`(`displayName`)"
    )
    expect(Sqlite.Renderer.make({ casing }).render(
      Sqlite.Query.select({
        displayName: sqliteSeed.displayName
      }).pipe(Sqlite.Query.from(sqliteSeed))
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
    const postgresActiveUsers = Pg.Query.select({
      id: users.id,
      displayName: users.displayName
    }).pipe(
      Pg.Query.from(users),
      Pg.Query.where(Pg.Query.isNotNull(users.displayName)),
      Pg.Query.as("ActiveUsers")
    )
    const mysqlActiveUsers = Mysql.Query.select({
      id: users.id,
      displayName: users.displayName
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.where(Mysql.Query.isNotNull(users.displayName)),
      Mysql.Query.as("ActiveUsers")
    )
    const sqliteActiveUsers = Sqlite.Query.select({
      id: users.id,
      displayName: users.displayName
    }).pipe(
      Sqlite.Query.from(users),
      Sqlite.Query.where(Sqlite.Query.isNotNull(users.displayName)),
      Sqlite.Query.as("ActiveUsers")
    )

    expect(Pg.Renderer.make({ casing }).render(
      Pg.Query.select({
        displayName: postgresActiveUsers.displayName
      }).pipe(Pg.Query.from(postgresActiveUsers))
    ).sql).toBe(
      'select "ActiveUsers"."displayName" as "displayName" from (select "user_accounts"."id" as "id", "user_accounts"."display_name" as "displayName" from "user_accounts" where ("user_accounts"."display_name" is not null)) as "ActiveUsers"'
    )
    expect(Mysql.Renderer.make({ casing }).render(
      Mysql.Query.select({
        displayName: mysqlActiveUsers.displayName
      }).pipe(Mysql.Query.from(mysqlActiveUsers))
    ).sql).toBe(
      "select `ActiveUsers`.`displayName` as `displayName` from (select `user_accounts`.`id` as `id`, `user_accounts`.`display_name` as `displayName` from `user_accounts` where (`user_accounts`.`display_name` is not null)) as `ActiveUsers`"
    )
    expect(Sqlite.Renderer.make({ casing }).render(
      Sqlite.Query.select({
        displayName: sqliteActiveUsers.displayName
      }).pipe(Sqlite.Query.from(sqliteActiveUsers))
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

    const mysqlPlan = Mysql.Query.onConflict(["emailAddress"] as const, {
      update: {
        displayName: Mysql.Query.excluded(users.displayName)
      }
    })(Mysql.Query.insert(users, {
      id: "11111111-1111-1111-1111-111111111111",
      emailAddress: "alice@example.com",
      displayName: "Alice"
    }))

    const postgresPlan = Pg.Query.onConflict(["emailAddress"] as const, {
      update: {
        displayName: Pg.Query.excluded(users.displayName)
      }
    })(Pg.Query.insert(users, {
      id: "11111111-1111-1111-1111-111111111111",
      emailAddress: "alice@example.com",
      displayName: "Alice"
    }))

    const sqlitePlan = Sqlite.Query.onConflict(["emailAddress"] as const, {
      update: {
        displayName: Sqlite.Query.excluded(users.displayName)
      }
    })(Sqlite.Query.insert(users, {
      id: "11111111-1111-1111-1111-111111111111",
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

    const id = "11111111-1111-1111-1111-111111111111"
    const mysqlPlan = Mysql.Query.update(users, {
      displayName: "Alice"
    }).pipe(
      Mysql.Query.where(Mysql.Query.eq(users.id, id))
    )
    const sqlitePlan = Sqlite.Query.update(users, {
      displayName: "Alice"
    }).pipe(
      Sqlite.Query.where(Sqlite.Query.eq(users.id, id))
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

    const plan = Mysql.Query.innerJoin(posts, Mysql.Query.eq(posts.userId, users.id))(
      Mysql.Query.delete(users)
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

    expect(Pg.Renderer.make({
      casing: {
        tables: "snake_case",
        columns: "snake_case"
      }
    }).render(plan).sql).toBe(
      'select "user_accounts"."createdAt" as "createdAt" from "user_accounts"'
    )
  })

  test("casing table factories create cased tables", () => {
    const Snake = Casing.casing({
      tables: "snake_case",
      columns: "snake_case"
    })
    const users = Snake.table("UserAccounts", {
      id: Column.uuid().pipe(Column.primaryKey),
      createdAt: Column.datetime()
    })

    const plan = Query.insert(users, {
      id: "11111111-1111-1111-1111-111111111111",
      createdAt: "2026-05-23T12:00:00"
    })

    expect(Pg.Renderer.make().render(plan).sql).toBe(
      'insert into "user_accounts" ("id", "created_at") values ($1, $2)'
    )
  })
})
