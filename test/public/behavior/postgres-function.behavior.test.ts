import { describe, expect, test } from "bun:test"

import * as Postgres from "#postgres"
import { Column as C, Query as Q, Renderer, Table } from "#postgres"
import * as StdRoot from "#standard"

describe("postgres function namespace", () => {
  test("renders grouped function helpers through the postgres namespace", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const plan = Q.select({
      lowerEmail: Postgres.Function.string.lower(users.email),
      fallbackEmail: Postgres.Function.core.coalesce(users.email, Q.literal("missing")),
      today: Postgres.Function.temporal.currentDate(),
      instant: Postgres.Function.currentTimestamp()
    }).pipe(
      Q.from(users)
    )

    const rendered = Renderer.make().render(plan)

    expect(rendered.sql).toBe('select lower("users"."email") as "lowerEmail", coalesce("users"."email", $1) as "fallbackEmail", current_date as "today", current_timestamp as "instant" from "users"')
    expect(rendered.params).toEqual(["missing"])
  })

  test("groups by function call expressions", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    const today = Postgres.Function.currentDate()

    const plan = Q.select({
      today,
      userCount: Postgres.Function.count(users.id)
    }).pipe(
      Q.from(users),
      Q.groupBy(today)
    )

    const rendered = Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select current_date as "today", count("users"."id") as "userCount" from "users" group by current_date'
    )
    expect(rendered.params).toEqual([])
  })
})
