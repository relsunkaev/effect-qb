// @ts-nocheck
import { describe, expect, test } from "bun:test"

import * as Postgres from "#postgres"
import { unsafeAny } from "../../helpers/unsafe.ts"

const userId = "11111111-1111-1111-1111-111111111111"
const secondUserId = "22222222-2222-2222-2222-222222222222"
const render = (plan: unknown) => Postgres.Renderer.make().render(unsafeAny(plan))

describe("postgres insert behavior", () => {
  test("renders postgres multi-row and source-backed inserts", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })
    const archivedUsers = Postgres.Table.make("archived_users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })

    const valuesSource = unsafeAny(Postgres.Query.as(Postgres.Query.values([
      { id: Postgres.Query.literal(userId), email: "alice@example.com", bio: null },
      { id: Postgres.Query.literal(secondUserId), email: "bob@example.com", bio: "writer" }
    ] as const), "seed"))

    const multiRowPlan = Postgres.Query.insert(users).pipe(
      Postgres.Query.from(valuesSource)
    )

    const insertSelectPlan = Postgres.Query.insert(archivedUsers).pipe(
      Postgres.Query.from(Postgres.Query.select({
      id: users.id,
      email: users.email,
      bio: users.bio
    }).pipe(
      Postgres.Query.from(users)
    )))

    const insertUnnestPlan = Postgres.Query.insert(users).pipe(
      Postgres.Query.from(Postgres.Query.unnest({
      id: [userId, secondUserId],
      email: ["alice@example.com", "bob@example.com"],
      bio: [null, "writer"]
      }, "seed"))
    )

    expect(render(multiRowPlan).sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") values ($1, $2, null), ($3, $4, $5)'
    )
    expect(render(multiRowPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])

    expect(render(insertSelectPlan).sql).toBe(
      'insert into "public"."archived_users" ("id", "email", "bio") select "users"."id" as "id", "users"."email" as "email", "users"."bio" as "bio" from "public"."users"'
    )
    expect(render(insertSelectPlan).params).toEqual([])

    expect(render(insertUnnestPlan).sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") select * from unnest(cast($1 as uuid[]), cast($2 as text[]), cast($3 as text[]))'
    )
    expect(render(insertUnnestPlan).params).toEqual([
      [userId, secondUserId],
      ["alice@example.com", "bob@example.com"],
      [null, "writer"]
    ])

    const updateFromValuesPlan = Postgres.Query.update(users, {
      email: valuesSource.email
    }).pipe(
      Postgres.Query.from(valuesSource),
      Postgres.Query.where(unsafeAny(Postgres.Query.eq(users.id, valuesSource.id)))
    )

    expect(render(updateFromValuesPlan).sql).toBe(
      'update "public"."users" set "email" = "seed"."email" from (select $1 as "id", $2 as "email", null as "bio" union all select $3 as "id", $4 as "email", $5 as "bio") as "seed"("id", "email", "bio") where ("users"."id" = "seed"."id")'
    )
    expect(render(updateFromValuesPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])
  })

  test("rejects incomplete insert-select sources even when they reference the target table", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })

    const source = Postgres.Query.select({
      id: users.id,
      email: users.email,
      bio: users.bio
    })
    const plan = Postgres.Query.insert(users).pipe(
      Postgres.Query.from(unsafeAny(source))
    )

    expect(() => render(plan)).toThrow(
      "query references sources that are not yet in scope: users"
    )
  })

  test("renders postgres default-only inserts and rich conflict clauses", () => {
    const auditLogs = Postgres.Table.make("audit_logs", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey, Postgres.Column.default(Postgres.Query.literal("audit-log-id"))),
      note: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })

    const defaultInsertPlan = Postgres.Query.insert(auditLogs)
    const partialIndexConflictPlan = Postgres.Query.onConflict({
      columns: ["email"] as const,
      where: Postgres.Query.isNotNull(users.bio)
    }, {
      update: {
        bio: Postgres.Query.excluded(users.bio)
      },
      where: Postgres.Query.isNotNull(Postgres.Query.excluded(users.bio))
    })(Postgres.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: "writer"
    }))
    const namedConstraintPlan = Postgres.Query.onConflict({
      constraint: "users_email_key"
    }, {
      update: {
        email: Postgres.Query.excluded(users.email)
      }
    })(Postgres.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }))

    expect(render(defaultInsertPlan).sql).toBe(
      'insert into "public"."audit_logs" default values'
    )

    expect(render(partialIndexConflictPlan).sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") values ($1, $2, $3) on conflict ("email") where ("users"."bio" is not null) do update set "bio" = excluded."bio" where (excluded."bio" is not null)'
    )
    expect(render(partialIndexConflictPlan).params).toEqual([
      userId,
      "alice@example.com",
      "writer"
    ])

    expect(render(namedConstraintPlan).sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") values ($1, $2, null) on conflict on constraint "users_email_key" do update set "email" = excluded."email"'
    )
    expect(render(namedConstraintPlan).params).toEqual([
      userId,
      "alice@example.com"
    ])
  })

  test("rejects postgres conflict targets with unknown columns at runtime", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    expect(() => Postgres.Query.onConflict(unsafeAny(["missing"]), {
      update: {
        email: Postgres.Query.excluded(users.email)
      }
    })(Postgres.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }))).toThrow("effect-qb: unknown conflict target column")
  })

  test("renders postgres string conflict targets", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const plan = Postgres.Query.onConflict("email", {
      update: {
        email: Postgres.Query.excluded(users.email)
      }
    })(Postgres.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }))

    expect(render(plan).sql).toBe(
      'insert into "public"."users" ("id", "email") values ($1, $2) on conflict ("email") do update set "email" = excluded."email"'
    )
  })

  test("rejects postgres empty returning selections before omitting returning", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    expect(() => Postgres.Query.returning({})(Postgres.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }))).toThrow("returning(...) requires at least one selected expression")
  })

  test("rejects postgres conflict update actions without assignments", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    expect(() => Postgres.Query.onConflict(["email"] as const, {
      update: {}
    })(Postgres.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }))).toThrow("conflict update assignments require at least one assignment")
  })

  test("rejects postgres upsert update actions without assignments", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    expect(() => Postgres.Query.upsert(users, {
      id: userId,
      email: "alice@example.com"
    }, ["email"] as const, {})).toThrow("upsert update assignments require at least one assignment")
  })

  test("rejects postgres upsert conflict columns with unknown columns at runtime", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    expect(() => Postgres.Query.upsert(users, {
      id: userId,
      email: "alice@example.com"
    }, unsafeAny(["missing"]), {
      email: "alice@example.com"
    })).toThrow("effect-qb: unknown conflict target column")
  })

  test("canonicalizes insert values using the target column runtime contract", () => {
    const metrics = Postgres.Table.make("metrics", {
      total: Postgres.Column.number(),
      counter: Postgres.Column.int8()
    })

    const rendered = render(Postgres.Query.insert(metrics, {
      total: "-0.00",
      counter: "0042"
    }))

    expect(rendered.params).toEqual([
      "0",
      "42"
    ])
  })

  test("rejects invalid insert values before rendering params", () => {
    const events = Postgres.Table.make("events", {
      happenedOn: Postgres.Column.date()
    })

    expect(() => render(Postgres.Query.insert(events, {
      happenedOn: "2026-02-31"
    }))).toThrow("Expected a local-date value")
  })

  test("rejects invalid Date insert values before rendering params", () => {
    const events = Postgres.Table.make("date_object_events", {
      happenedOn: Postgres.Column.date()
    })

    expect(() => render(Postgres.Query.insert(events, {
      happenedOn: new Date("not a date")
    }))).toThrow()
  })

  test("canonicalizes expression-wrapped insert values using the target column runtime contract", () => {
    const metrics = Postgres.Table.make("expression_metrics", {
      total: Postgres.Column.number(),
      counter: Postgres.Column.int8()
    })

    const rendered = render(Postgres.Query.insert(metrics, {
      total: Postgres.Query.literal("-0.00"),
      counter: Postgres.Query.literal("0042")
    }))

    expect(rendered.params).toEqual([
      "0",
      "42"
    ])
  })

  test("rejects invalid expression-wrapped insert values before rendering params", () => {
    const events = Postgres.Table.make("expression_events", {
      happenedOn: Postgres.Column.date()
    })

    expect(() => render(Postgres.Query.insert(events, {
      happenedOn: Postgres.Query.literal("2026-02-31")
    }))).toThrow("Expected a local-date value")
  })

  test("rejects insert values that violate target column schemas after normalization", () => {
    const labels = Postgres.Table.make("labels", {
      code: Postgres.Column.varchar(3)
    })

    expect(() => render(Postgres.Query.insert(labels, {
      code: "toolong"
    }))).toThrow()
  })

  test("canonicalizes update values using the target column runtime contract", () => {
    const metrics = Postgres.Table.make("update_metrics", {
      id: Postgres.Column.text().pipe(Postgres.Column.primaryKey),
      total: Postgres.Column.number(),
      counter: Postgres.Column.int8()
    })

    const rendered = render(Postgres.Query.update(metrics, {
      total: "-0.00",
      counter: Postgres.Query.literal("0042")
    }).pipe(
      Postgres.Query.where(Postgres.Query.eq(metrics.id, "metric-1"))
    ))

    expect(rendered.params).toEqual([
      "0",
      "42",
      "metric-1"
    ])
  })

  test("canonicalizes conflict update values using the target column runtime contract", () => {
    const metrics = Postgres.Table.make("conflict_metrics", {
      id: Postgres.Column.text().pipe(Postgres.Column.primaryKey),
      total: Postgres.Column.number(),
      counter: Postgres.Column.int8()
    })

    const rendered = render(Postgres.Query.onConflict({
      columns: ["id"] as const
    }, {
      update: {
        total: "-0.00",
        counter: Postgres.Query.literal("0042")
      }
    })(Postgres.Query.insert(metrics, {
      id: "metric-1",
      total: "1.00",
      counter: "2"
    })))

    expect(rendered.params).toEqual([
      "metric-1",
      "1",
      "2",
      "0",
      "42"
    ])
  })

  test("canonicalizes unnest insert arrays using the target column runtime contract", () => {
    const metrics = Postgres.Table.make("unnest_metrics", {
      total: Postgres.Column.number(),
      counter: Postgres.Column.int8()
    })

    const rendered = render(Postgres.Query.insert(metrics).pipe(
      Postgres.Query.from(Postgres.Query.unnest({
        total: ["-0.00"],
        counter: ["0042"]
      }, "seed"))
    ))

    expect(rendered.params).toEqual([
      ["0"],
      ["42"]
    ])
  })

  test("rejects invalid unnest insert arrays before rendering params", () => {
    const events = Postgres.Table.make("unnest_events", {
      happenedOn: Postgres.Column.date()
    })

    expect(() => render(Postgres.Query.insert(events).pipe(
      Postgres.Query.from(Postgres.Query.unnest({
        happenedOn: ["2026-02-31"]
      }, "seed"))
    ))).toThrow("Expected a local-date value")
  })
})
