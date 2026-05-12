// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import * as Mysql from "#mysql"
import { unsafeAny } from "../../helpers/unsafe.ts"

const userId = "11111111-1111-1111-1111-111111111111"
const secondUserId = "22222222-2222-2222-2222-222222222222"
const render = (plan: unknown) => Mysql.Renderer.make().render(unsafeAny(plan))

describe("mysql insert behavior", () => {
  test("renders mysql multi-row and source-backed inserts", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })
    const archivedUsers = Mysql.Table.make("archived_users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })

    const valuesSource = unsafeAny(Mysql.Query.as(Mysql.Query.values([
      { id: Mysql.Query.literal(userId), email: "alice@example.com", bio: null },
      { id: Mysql.Query.literal(secondUserId), email: "bob@example.com", bio: "writer" }
    ] as const), "seed"))

    const multiRowPlan = Mysql.Query.insert(users).pipe(
      Mysql.Query.from(valuesSource)
    )

    const insertSelectPlan = Mysql.Query.insert(archivedUsers).pipe(
      Mysql.Query.from(Mysql.Query.select({
      id: users.id,
      email: users.email,
      bio: users.bio
    }).pipe(
      Mysql.Query.from(users)
    )))

    const insertUnnestPlan = Mysql.Query.insert(users).pipe(
      Mysql.Query.from(Mysql.Query.unnest({
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

    const updateFromValuesPlan = Mysql.Query.update(users, {
      email: valuesSource.email
    }).pipe(
      Mysql.Query.from(valuesSource),
      Mysql.Query.where(Mysql.Query.eq(users.id, valuesSource.id))
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
    const docs = Mysql.Table.make("json_string_docs", {
      payload: Mysql.Column.json(Schema.String)
    })

    const rendered = render(Mysql.Query.insert(docs, {
      payload: "42"
    }))

    expect(rendered.params).toEqual(["42"])
  })

  test("encodes structured JSON inserts as JSON text for mysql", () => {
    const docs = Mysql.Table.make("json_docs", {
      payload: Mysql.Column.json(Schema.Unknown)
    })

    const rendered = render(Mysql.Query.insert(docs, {
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
    const metrics = Mysql.Table.make("unnest_metrics", {
      total: Mysql.Column.number(),
      happenedOn: Mysql.Column.date()
    })

    const rendered = render(Mysql.Query.insert(metrics).pipe(
      Mysql.Query.from(Mysql.Query.unnest({
        total: ["-0.00"],
        happenedOn: ["2026-05-12"]
      }, "seed"))
    ))

    expect(rendered.params).toEqual([
      "0",
      "2026-05-12"
    ])

    expect(() => render(Mysql.Query.insert(metrics).pipe(
      Mysql.Query.from(Mysql.Query.unnest({
        total: ["1.00"],
        happenedOn: ["2026-02-31"]
      }, "seed"))
    ))).toThrow("Expected a local-date value")
  })

  test("renders mysql default-only inserts and duplicate-key conflict clauses", () => {
    const auditLogs = Mysql.Table.make("audit_logs", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey, Mysql.Column.default(Mysql.Query.literal("audit-log-id"))),
      note: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })

    const defaultInsertPlan = Mysql.Query.insert(auditLogs)
    const conflictPlan = Mysql.Query.onConflict(["email"] as const, {
      update: {
        bio: Mysql.Query.excluded(users.bio)
      }
    })(Mysql.Query.insert(users, {
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

  test("rejects mysql conflict update actions without assignments", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    expect(() => Mysql.Query.onConflict(["email"] as const, {
      update: {}
    })(Mysql.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }))).toThrow("conflict update assignments require at least one assignment")
  })

  test("rejects mysql upsert update actions without assignments", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    expect(() => Mysql.Query.upsert(users, {
      id: userId,
      email: "alice@example.com"
    }, ["email"] as const, {})).toThrow("upsert update assignments require at least one assignment")
  })

  test("rejects mysql upsert conflict columns with unknown columns at runtime", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    expect(() => Mysql.Query.upsert(users, {
      id: userId,
      email: "alice@example.com"
    }, unsafeAny(["missing"]), {
      email: "alice@example.com"
    })).toThrow("effect-qb: unknown conflict target column")
  })

  test("rejects mysql conflict targets with unknown columns at runtime", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    expect(() => Mysql.Query.onConflict(unsafeAny(["missing"]), {
      update: {
        email: Mysql.Query.excluded(users.email)
      }
    })(Mysql.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }))).toThrow("effect-qb: unknown conflict target column")
  })

  test("renders mysql string conflict targets", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    const plan = Mysql.Query.onConflict("email", {
      update: {
        email: Mysql.Query.excluded(users.email)
      }
    })(Mysql.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }))

    expect(render(plan).sql).toBe(
      "insert into `users` (`id`, `email`) values (?, ?) on duplicate key update `email` = values(`email`)"
    )
  })

  test("rejects mysql object-shaped conflict targets at runtime", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    expect(() => Mysql.Query.onConflict(unsafeAny({
      columns: ["email"]
    }), {
      update: {
        email: Mysql.Query.excluded(users.email)
      }
    })(Mysql.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }))).toThrow("Unsupported mysql conflict target")

    expect(() => Mysql.Query.onConflict(unsafeAny({
      constraint: "users_email_key"
    }), {
      update: {
        email: Mysql.Query.excluded(users.email)
      }
    })(Mysql.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }))).toThrow("Unsupported mysql conflict target")

    expect(() => Mysql.Query.onConflict(unsafeAny({
      columns: ["email"],
      where: Mysql.Query.isNotNull(users.email)
    }), {
      update: {
        email: Mysql.Query.excluded(users.email)
      }
    })(Mysql.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }))).toThrow("Unsupported mysql conflict target")
  })
})
