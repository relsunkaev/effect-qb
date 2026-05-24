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
