// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import * as Mysql from "#mysql"
import { unsafeAny } from "../../helpers/unsafe.ts"
import * as StdRoot from "#standard"

const userId = "11111111-1111-4111-8111-111111111111"
const secondUserId = "22222222-2222-4222-8222-222222222222"
const render = (plan: unknown) => Mysql.Renderer.make().render(unsafeAny(plan))

describe("mysql insert behavior", () => {
  test("renders mysql multi-row and source-backed inserts", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })
    const archivedUsers = StdRoot.Table.make("archived_users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })

    const valuesSource = unsafeAny(StdRoot.Query.as(StdRoot.Query.values([
      { id: StdRoot.Query.literal(userId), email: "alice@example.com", bio: null },
      { id: StdRoot.Query.literal(secondUserId), email: "bob@example.com", bio: "writer" }
    ] as const), "seed"))

    const multiRowPlan = StdRoot.Query.insert(users).pipe(
      StdRoot.Query.from(valuesSource)
    )

    const insertSelectPlan = StdRoot.Query.insert(archivedUsers).pipe(
      StdRoot.Query.from(StdRoot.Query.select({
      id: users.id,
      email: users.email,
      bio: users.bio
    }).pipe(
      StdRoot.Query.from(users)
    )))

    const insertUnnestPlan = StdRoot.Query.insert(users).pipe(
      StdRoot.Query.from(StdRoot.Query.unnest({
      id: [userId, secondUserId],
      email: ["alice@example.com", "bob@example.com"],
      bio: [null, "writer"]
      }, "seed"))
    )

    expect(render(multiRowPlan).sql).toBe(
      "insert into `users` (`id`, `email`, `bio`) values (?, ?, null), (?, ?, ?)"
    )
    expect(render(multiRowPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])

    expect(render(insertSelectPlan).sql).toBe(
      "insert into `archived_users` (`id`, `email`, `bio`) select `users`.`id` as `id`, `users`.`email` as `email`, `users`.`bio` as `bio` from `users`"
    )
    expect(render(insertSelectPlan).params).toEqual([])

    expect(render(insertUnnestPlan).sql).toBe(
      "insert into `users` (`id`, `email`, `bio`) values (?, ?, null), (?, ?, ?)"
    )
    expect(render(insertUnnestPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])

    const updateFromValuesPlan = StdRoot.Query.update(users, {
      email: valuesSource.email
    }).pipe(
      StdRoot.Query.from(valuesSource),
      StdRoot.Query.where(StdRoot.Query.eq(users.id, valuesSource.id))
    )

    expect(render(updateFromValuesPlan).sql).toBe(
      "update `users`, (select ? as `id`, ? as `email`, null as `bio` union all select ? as `id`, ? as `email`, ? as `bio`) as `seed`(`id`, `email`, `bio`) set `email` = `seed`.`email` where (`users`.`id` = `seed`.`id`)"
    )
    expect(render(updateFromValuesPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])
  })

  test("preserves JSON string scalars that look like JSON while encoding inserts", () => {
    const docs = StdRoot.Table.make("json_string_docs", {
      payload: StdRoot.Column.json(Schema.String)
    })

    const rendered = render(StdRoot.Query.insert(docs, {
      payload: "42"
    }))

    expect(rendered.params).toEqual(["\"42\""])
  })

  test("encodes structured JSON inserts as JSON text for mysql", () => {
    const docs = StdRoot.Table.make("json_docs", {
      payload: StdRoot.Column.json(Schema.Unknown)
    })

    const rendered = render(StdRoot.Query.insert(docs, {
      payload: {
        profile: {
          city: "Paris"
        }
      }
    }))

    expect(rendered.sql).toBe(
      "insert into `json_docs` (`payload`) values (?)"
    )
    expect(rendered.params).toEqual([
      JSON.stringify({ profile: { city: "Paris" } })
    ])
  })

  test("canonicalizes and validates mysql unnest insert arrays using target column contracts", () => {
    const metrics = StdRoot.Table.make("unnest_metrics", {
      total: StdRoot.Column.number(),
      happenedOn: StdRoot.Column.date()
    })

    const rendered = render(StdRoot.Query.insert(metrics).pipe(
      StdRoot.Query.from(StdRoot.Query.unnest({
        total: ["-0.00"],
        happenedOn: ["2026-05-12"]
      }, "seed"))
    ))

    expect(rendered.params).toEqual([
      "0",
      "2026-05-12"
    ])

    expect(() => render(StdRoot.Query.insert(metrics).pipe(
      StdRoot.Query.from(StdRoot.Query.unnest({
        total: ["1.00"],
        happenedOn: ["2026-02-31"]
      }, "seed"))
    ))).toThrow("Expected a local-date value")
  })

  test("renders mysql default-only inserts and duplicate-key conflict clauses", () => {
    const auditLogs = StdRoot.Table.make("audit_logs", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey, StdRoot.Column.default(StdRoot.Query.literal("audit-log-id"))),
      note: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })

    const defaultInsertPlan = StdRoot.Query.insert(auditLogs)
    const conflictPlan = StdRoot.Query.onConflict(["email"] as const, {
      update: {
        bio: StdRoot.Query.excluded(users.bio)
      }
    })(StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: "writer"
    }))

    expect(render(defaultInsertPlan).sql).toBe(
      "insert into `audit_logs` () values ()"
    )

    expect(render(conflictPlan).sql).toBe(
      "insert into `users` (`id`, `email`, `bio`) values (?, ?, ?) on duplicate key update `bio` = values(`bio`)"
    )
    expect(render(conflictPlan).params).toEqual([
      userId,
      "alice@example.com",
      "writer"
    ])
  })

  test("renders mysql string conflict targets", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const plan = StdRoot.Query.onConflict("email", {
      update: {
        email: StdRoot.Query.excluded(users.email)
      }
    })(StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }))

    expect(render(plan).sql).toBe(
      "insert into `users` (`id`, `email`) values (?, ?) on duplicate key update `email` = values(`email`)"
    )
  })

})
