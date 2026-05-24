import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import { Casing, Column, Query, Table } from "../../../packages/querybuilder/src/index.ts"
import * as Pg from "#postgres"

describe("postgres schema composition", () => {
  test("schema namespaces assign schemas and inherited casing to tables", () => {
    const Analytics = Pg.Schema.make("analytics").pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case"
      })
    )

    const metrics = Analytics.table("UserMetrics", {
      id: Column.uuid().pipe(Column.primaryKey),
      createdAt: Column.datetime(),
      meta: Pg.Column.jsonb(Schema.Struct({
        count: Schema.Number
      }))
    })

    const rendered = Pg.Renderer.make().render(Query.select({
      createdAt: metrics.createdAt
    }).pipe(Query.from(metrics)))

    expect(rendered.sql).toBe(
      'select "user_metrics"."created_at" as "createdAt" from "analytics"."user_metrics"'
    )
  })

  test("withSchema composes with table-level casing overrides", () => {
    const Analytics = Pg.Schema.make("analytics").pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case"
      })
    )

    const events = Table.make("Events", {
      id: Column.uuid().pipe(Column.primaryKey),
      createdAt: Column.datetime(),
      meta: Pg.Column.jsonb(Schema.Struct({
        kind: Schema.String
      }))
    }).pipe(
      Casing.withCasing({ columns: "preserve" }),
      Analytics.withSchema
    )

    const rendered = Pg.Renderer.make().render(Query.insert(events, {
      id: "11111111-1111-1111-1111-111111111111",
      createdAt: "2026-05-23T12:00:00",
      meta: { kind: "created" }
    }))

    expect(rendered.sql).toBe(
      'insert into "analytics"."events" ("id", "createdAt", "meta") values ($1, $2, $3)'
    )
  })
})

