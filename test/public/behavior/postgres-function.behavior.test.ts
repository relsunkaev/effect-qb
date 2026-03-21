import { describe, expect, test } from "bun:test"

import * as Postgres from "#postgres"
import { Column as C, Query as Q, Renderer, Table } from "#postgres"

describe("postgres function namespace", () => {
  test("renders grouped function helpers through the postgres namespace", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
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

    expect(rendered.sql).toBe('select lower("users"."email") as "lowerEmail", coalesce("users"."email", $1) as "fallbackEmail", current_date as "today", current_timestamp as "instant" from "public"."users"')
    expect(rendered.params).toEqual(["missing"])
  })
})
