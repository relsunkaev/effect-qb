// @ts-nocheck
import { describe, expect, test } from "bun:test"

import * as Postgres from "#postgres"
import { unsafeAny } from "../../helpers/unsafe.ts"
import * as StdRoot from "#standard"

const userId = "11111111-1111-4111-8111-111111111111"
const secondUserId = "22222222-2222-4222-8222-222222222222"
const render = (plan: unknown) => Postgres.Renderer.make().render(unsafeAny(plan))

describe("postgres insert behavior", () => {
  test("renders postgres multi-row and source-backed inserts", () => {
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
      'insert into "users" ("id", "email", "bio") values ($1, $2, null), ($3, $4, $5)'
    )
    expect(render(multiRowPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])

    expect(render(insertSelectPlan).sql).toBe(
      'insert into "archived_users" ("id", "email", "bio") select "users"."id" as "id", "users"."email" as "email", "users"."bio" as "bio" from "users"'
    )
    expect(render(insertSelectPlan).params).toEqual([])

    expect(render(insertUnnestPlan).sql).toBe(
      'insert into "users" ("id", "email", "bio") select * from unnest(cast($1 as uuid[]), cast($2 as text[]), cast($3 as text[]))'
    )
    expect(render(insertUnnestPlan).params).toEqual([
      [userId, secondUserId],
      ["alice@example.com", "bob@example.com"],
      [null, "writer"]
    ])

    const updateFromValuesPlan = StdRoot.Query.update(users, {
      email: valuesSource.email
    }).pipe(
      StdRoot.Query.from(valuesSource),
      StdRoot.Query.where(unsafeAny(StdRoot.Query.eq(users.id, valuesSource.id)))
    )

    expect(render(updateFromValuesPlan).sql).toBe(
      'update "users" set "email" = "seed"."email" from (select $1 as "id", $2 as "email", null as "bio" union all select $3 as "id", $4 as "email", $5 as "bio") as "seed"("id", "email", "bio") where ("users"."id" = "seed"."id")'
    )
    expect(render(updateFromValuesPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])
  })

  test("renders postgres default-only inserts and rich conflict clauses", () => {
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
    const partialIndexConflictPlan = StdRoot.Query.onConflict({
      columns: ["email"] as const,
      where: StdRoot.Query.isNotNull(users.bio)
    }, {
      update: {
        bio: StdRoot.Query.excluded(users.bio)
      },
      where: StdRoot.Query.isNotNull(StdRoot.Query.excluded(users.bio))
    })(StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: "writer"
    }))
    const namedConstraintPlan = StdRoot.Query.onConflict({
      constraint: "users_email_key"
    }, {
      update: {
        email: StdRoot.Query.excluded(users.email)
      }
    })(StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }))

    expect(render(defaultInsertPlan).sql).toBe(
      'insert into "audit_logs" default values'
    )

    expect(render(partialIndexConflictPlan).sql).toBe(
      'insert into "users" ("id", "email", "bio") values ($1, $2, $3) on conflict ("email") where ("users"."bio" is not null) do update set "bio" = excluded."bio" where (excluded."bio" is not null)'
    )
    expect(render(partialIndexConflictPlan).params).toEqual([
      userId,
      "alice@example.com",
      "writer"
    ])

    expect(render(namedConstraintPlan).sql).toBe(
      'insert into "users" ("id", "email", "bio") values ($1, $2, null) on conflict on constraint "users_email_key" do update set "email" = excluded."email"'
    )
    expect(render(namedConstraintPlan).params).toEqual([
      userId,
      "alice@example.com"
    ])
  })

  test("conflict builders trust typed constraint names without constructor-time validation", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const invalidFromBuilder = StdRoot.Query.onConflict({
      constraint: ""
    }, {
      update: {
        email: StdRoot.Query.excluded(users.email)
      }
    })(StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }))

    const plan = StdRoot.Query.onConflict({
      constraint: "users_email_key"
    }, {
      update: {
        email: StdRoot.Query.excluded(users.email)
      }
    })(StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }))
    ;(plan as any)[queryAst].conflict.target.name = ""

    expect(render(invalidFromBuilder).sql).toContain('on conflict on constraint ""')
    expect(render(plan).sql).toContain('on conflict on constraint ""')
  })

  test("renders postgres string conflict targets", () => {
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
      'insert into "users" ("id", "email") values ($1, $2) on conflict ("email") do update set "email" = excluded."email"'
    )
  })

  test("canonicalizes insert values using the target column runtime contract", () => {
    const metrics = StdRoot.Table.make("metrics", {
      total: StdRoot.Column.number(),
      counter: Postgres.Column.int8()
    })

    const rendered = render(StdRoot.Query.insert(metrics, {
      total: "-0.00",
      counter: "0042"
    }))

    expect(rendered.params).toEqual([
      "0",
      "42"
    ])
  })

  test("rejects invalid insert values before rendering params", () => {
    const events = StdRoot.Table.make("events", {
      happenedOn: StdRoot.Column.date()
    })

    expect(() => render(StdRoot.Query.insert(events, {
      happenedOn: "2026-02-31"
    }))).toThrow("Expected a local-date value")
  })

  test("rejects invalid Date insert values before rendering params", () => {
    const events = StdRoot.Table.make("date_object_events", {
      happenedOn: StdRoot.Column.date()
    })

    expect(() => render(StdRoot.Query.insert(events, {
      happenedOn: new Date("not a date")
    }))).toThrow()
  })

  test("canonicalizes expression-wrapped insert values using the target column runtime contract", () => {
    const metrics = StdRoot.Table.make("expression_metrics", {
      total: StdRoot.Column.number(),
      counter: Postgres.Column.int8()
    })

    const rendered = render(StdRoot.Query.insert(metrics, {
      total: StdRoot.Query.literal("-0.00"),
      counter: StdRoot.Query.literal("0042")
    }))

    expect(rendered.params).toEqual([
      "0",
      "42"
    ])
  })

  test("rejects invalid expression-wrapped insert values before rendering params", () => {
    const events = StdRoot.Table.make("expression_events", {
      happenedOn: StdRoot.Column.date()
    })

    expect(() => render(StdRoot.Query.insert(events, {
      happenedOn: StdRoot.Query.literal("2026-02-31")
    }))).toThrow("Expected a local-date value")
  })

  test("rejects invalid Date expression-wrapped insert values before normalizing dates", () => {
    const events = StdRoot.Table.make("expression_date_events", {
      happenedOn: StdRoot.Column.date()
    })

    expect(() => render(StdRoot.Query.insert(events, {
      happenedOn: StdRoot.Query.literal(new Date("not a date"))
    }))).toThrow("Expected a valid Date value")
  })

  test("rejects insert values that violate target column schemas after normalization", () => {
    const labels = StdRoot.Table.make("labels", {
      code: StdRoot.Column.varchar(3)
    })

    expect(() => render(StdRoot.Query.insert(labels, {
      code: "toolong"
    }))).toThrow()
  })

  test("canonicalizes update values using the target column runtime contract", () => {
    const metrics = StdRoot.Table.make("update_metrics", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      total: StdRoot.Column.number(),
      counter: Postgres.Column.int8()
    })

    const rendered = render(StdRoot.Query.update(metrics, {
      total: "-0.00",
      counter: StdRoot.Query.literal("0042")
    }).pipe(
      StdRoot.Query.where(StdRoot.Query.eq(metrics.id, "metric-1"))
    ))

    expect(rendered.params).toEqual([
      "0",
      "42",
      "metric-1"
    ])
  })

  test("canonicalizes conflict update values using the target column runtime contract", () => {
    const metrics = StdRoot.Table.make("conflict_metrics", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      total: StdRoot.Column.number(),
      counter: Postgres.Column.int8()
    })

    const rendered = render(StdRoot.Query.onConflict({
      columns: ["id"] as const
    }, {
      update: {
        total: "-0.00",
        counter: StdRoot.Query.literal("0042")
      }
    })(StdRoot.Query.insert(metrics, {
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
    const metrics = StdRoot.Table.make("unnest_metrics", {
      total: StdRoot.Column.number(),
      counter: Postgres.Column.int8()
    })

    const rendered = render(StdRoot.Query.insert(metrics).pipe(
      StdRoot.Query.from(StdRoot.Query.unnest({
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
    const events = StdRoot.Table.make("unnest_events", {
      happenedOn: StdRoot.Column.date()
    })

    expect(() => render(StdRoot.Query.insert(events).pipe(
      StdRoot.Query.from(StdRoot.Query.unnest({
        happenedOn: ["2026-02-31"]
      }, "seed"))
    ))).toThrow("Expected a local-date value")
  })
})
