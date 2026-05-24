import { describe, expect, test } from "bun:test"

import { Casing, Column, Query, Table } from "../../../packages/querybuilder/src/index.ts"
import * as Pg from "#postgres"
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
