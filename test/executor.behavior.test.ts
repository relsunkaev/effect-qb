import { describe, expect, test } from "bun:test"
import * as SqlClient from "@effect/sql/SqlClient"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Column as C, Executor, Query as Q, Renderer, Table } from "../src/postgres.ts"
import { BigIntStringSchema } from "../src/internal/runtime-value.ts"

const userId = "11111111-1111-1111-1111-111111111111"

describe("executor behavior", () => {
  test("fromDriver decodes nested rows with null leaves", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text().pipe(C.nullable)
    })

    const plan = Q.select({
      profile: {
        id: users.id,
        email: users.email
      }
    }).pipe(
      Q.from(users)
    )

    const renderer = Renderer.make("postgres")
    const driver = Executor.driver("postgres", () => Effect.succeed([
        {
        profile__id: userId,
        profile__email: null
      }
    ]))

    const rows = Effect.runSync(Executor.make({ renderer, driver }).execute(plan))

    expect(rows as ReadonlyArray<unknown>).toEqual([
      {
        profile: {
          id: userId,
          email: null
        }
      }
    ])
  })

  test("fromDriver returns empty arrays unchanged", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey)
    })
    const plan = Q.select({
      id: users.id
    }).pipe(
      Q.from(users)
    )

    const executor = Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([]))
    })

    expect(Effect.runSync(executor.execute(plan))).toEqual([])
  })

  test("fromDriver ignores extra columns and omits missing projected columns", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })
    const plan = Q.select({
      profile: {
        id: users.id,
        email: users.email
      }
    }).pipe(
      Q.from(users)
    )

    const executor = Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          profile__id: userId,
          ignored: 123
        }
      ]))
    })

    expect(Effect.runSync(executor.execute(plan)) as ReadonlyArray<unknown>).toEqual([
      {
        profile: {
          id: userId
        }
      }
    ])
  })

  test("explicit projection aliases still decode into the original result paths", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })
    const plan = Q.select({
      profile: {
        id: Q.as(users.id, "user_identifier"),
        email: Q.as(Q.lower(users.email), "email_lower")
      }
    }).pipe(
      Q.from(users)
    )

    const executor = Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          user_identifier: userId,
          email_lower: "alice@example.com"
        }
      ]))
    })

    expect(Effect.runSync(executor.execute(plan))).toEqual([
      {
        profile: {
          id: userId,
          email: "alice@example.com"
        }
      }
    ])
  })

  test("fromSqlClient forwards rendered SQL and params before remapping rows", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })
    const plan = Q.select({
      profile: {
        id: users.id,
        email: users.email
      }
    }).pipe(
      Q.from(users),
      Q.where(Q.eq(users.email, "alice@example.com"))
    )

    const executor = Executor.make()
    const sql = {
      unsafe<Row extends object>(statement: string, params?: ReadonlyArray<any>) {
        expect(statement).toBe('select "users"."id" as "profile__id", "users"."email" as "profile__email" from "public"."users" where ("users"."email" = $1)')
        expect(params).toEqual(["alice@example.com"])
        return Effect.succeed([
          {
            profile__id: userId,
            profile__email: "alice@example.com"
          }
        ] as unknown as ReadonlyArray<Row>)
      }
    } as unknown as SqlClient.SqlClient

    const rows = Effect.runSync(
      Effect.provideService(executor.execute(plan), SqlClient.SqlClient, sql)
    )

    expect(rows).toEqual([
      {
        profile: {
          id: userId,
          email: "alice@example.com"
        }
      }
    ])
  })

  test("fromDriver omits missing projected aliases instead of failing", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })
    const plan = Q.select({
      profile: {
        id: users.id,
        email: users.email
      }
    }).pipe(
      Q.from(users)
    )

    const executor = Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          profile__id: userId
        }
      ]))
    })

    expect(Effect.runSync(executor.execute(plan)) as ReadonlyArray<unknown>).toEqual([
      {
        profile: {
          id: userId
        }
      }
    ])
  })

  test("fromDriver rejects raw values that cannot be normalized into the canonical runtime contract", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      createdAt: C.timestamp()
    })
    const plan = Q.select({
      profile: {
        id: users.id,
        createdAt: users.createdAt
      }
    }).pipe(
      Q.from(users)
    )

    const executor = Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          profile__id: userId,
          profile__createdAt: "not-a-date"
        }
      ]))
    })

    expect(Effect.runSync(Effect.flip(executor.execute(plan)))).toMatchObject({
      _tag: "RowDecodeError",
      stage: "normalize",
      projection: {
        alias: "profile__createdAt"
      },
      dbType: {
        dialect: "postgres",
        kind: "timestamp"
      },
      raw: "not-a-date"
    })
  })

  test("fromDriver normalizes canonical scalar outputs across raw driver variants", () => {
    const metrics = Table.make("metrics", {
      id: C.uuid().pipe(C.primaryKey),
      createdAt: C.timestamp(),
      total: C.number(),
      counter: C.custom(BigIntStringSchema, {
        dialect: "postgres",
        kind: "int8"
      })
    })

    const plan = Q.select({
      createdAt: metrics.createdAt,
      total: metrics.total,
      counter: metrics.counter
    }).pipe(
      Q.from(metrics)
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          createdAt: new Date("2026-03-18T10:00:00Z"),
          total: 12.34,
          counter: 42n
        },
        {
          createdAt: "2026-03-18 10:00:00",
          total: "0012.3400",
          counter: "0042"
        }
      ]))
    }).execute(plan))

    expect(rows).toEqual([
      {
        createdAt: "2026-03-18T10:00:00",
        total: "12.34",
        counter: "42"
      },
      {
        createdAt: "2026-03-18T10:00:00",
        total: "12.34",
        counter: "42"
      }
    ])
  })

  test("fromDriver applies schema pipes after canonical date normalization", () => {
    const events = Table.make("events", {
      happenedOn: C.date().pipe(C.schema(Schema.DateFromString))
    })

    const plan = Q.select({
      happenedOn: events.happenedOn
    }).pipe(
      Q.from(events)
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          happenedOn: "2026-03-18"
        },
        {
          happenedOn: new Date("2026-03-18T00:00:00.000Z")
        }
      ]))
    }).execute(plan))

    expect(rows[0]?.happenedOn).toBeInstanceOf(Date)
    expect(rows[1]?.happenedOn).toBeInstanceOf(Date)
    expect(rows[0]?.happenedOn.toISOString()).toBe("2026-03-18T00:00:00.000Z")
    expect(rows[1]?.happenedOn.toISOString()).toBe("2026-03-18T00:00:00.000Z")
  })

  test("fromDriver decodes searched case projections over left joins", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey)
    })
    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid(),
      title: C.text().pipe(C.nullable)
    })

    const plan = Q.select({
      titleState: Q.case()
        .when(Q.isNull(posts.title), "missing")
        .when(Q.eq(Q.lower(posts.title), "draft"), "draft")
        .else(Q.upper(Q.coalesce(posts.title, "published")))
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId))
    )

    const executor = Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          titleState: "missing"
        }
      ]))
    })

    expect(Effect.runSync(executor.execute(plan))).toEqual([
      {
        titleState: "missing"
      }
    ])
  })

  test("fromSqlClient forwards searched case SQL and params before remapping rows", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey)
    })
    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid(),
      title: C.text().pipe(C.nullable)
    })

    const plan = Q.select({
      titleState: Q.case()
        .when(Q.isNull(posts.title), "missing")
        .when(Q.eq(Q.lower(posts.title), "draft"), "draft")
        .else(Q.upper(Q.coalesce(posts.title, "published")))
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
      Q.where(Q.eq(users.id, userId))
    )

    const executor = Executor.make()
    const sql = {
      unsafe<Row extends object>(statement: string, params?: ReadonlyArray<any>) {
        expect(statement).toBe(
          'select case when ("posts"."title" is null) then $1 when (lower("posts"."title") = $2) then $3 else upper(coalesce("posts"."title", $4)) end as "titleState" from "public"."users" left join "public"."posts" on ("users"."id" = "posts"."userId") where ("users"."id" = $5)'
        )
        expect(params).toEqual(["missing", "draft", "draft", "published", userId])
        return Effect.succeed([
          {
            titleState: "DRAFT"
          }
        ] as unknown as ReadonlyArray<Row>)
      }
    } as unknown as SqlClient.SqlClient

    const rows = Effect.runSync(
      Effect.provideService(executor.execute(plan), SqlClient.SqlClient, sql)
    )

    expect(rows).toEqual([
      {
        titleState: "DRAFT"
      }
    ])
  })

  test("fromDriver decodes aggregate searched case projections", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey)
    })
    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid(),
      title: C.text().pipe(C.nullable)
    })

    const plan = Q.select({
      userId: users.id,
      summary: Q.case()
        .when(Q.eq(Q.count(posts.id), 0), "empty")
        .else(Q.coalesce(Q.max(posts.title), "latest"))
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
      Q.groupBy(users.id)
    )

    const executor = Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          userId,
          summary: "empty"
        }
      ]))
    })

    expect(Effect.runSync(executor.execute(plan))).toEqual([
      {
        userId,
        summary: "empty"
      }
    ])
  })

  test("renderer output does not expose a row schema", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey)
    })
    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      title: C.text()
    })

    const plan = Q.select({
      id: users.id,
      title: Q.coalesce(posts.title, "missing")
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.id))
    )

    const rendered = Renderer.make("postgres").render(plan)

    expect("rowSchema" in (rendered as Record<string, unknown>)).toBe(false)
  })

  test("fromDriver enforces runtime schemas for aliased JSON projections", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      profile: C.json(Schema.Struct({
        displayName: Schema.String
      }))
    })

    const plan = Q.select({
      profile: Q.as(users.profile, "profile_alias")
    }).pipe(
      Q.from(users)
    )

    const executor = Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          profile_alias: {}
        }
      ]))
    })

    expect(Effect.runSync(Effect.flip(executor.execute(plan)))).toMatchObject({
      _tag: "RowDecodeError",
      stage: "schema",
      projection: {
        alias: "profile_alias"
      },
      dbType: {
        dialect: "postgres",
        kind: "json"
      },
      raw: {}
    })
  })

  test("fromDriver applies schema transforms after JSON normalization", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      profile: C.json(Schema.Struct({
        visits: Schema.NumberFromString
      }))
    })

    const plan = Q.select({
      profile: users.profile
    }).pipe(
      Q.from(users)
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          profile: "{\"visits\":\"42\"}"
        }
      ]))
    }).execute(plan))

    expect(rows).toEqual([
      {
        profile: {
          visits: 42
        }
      }
    ])
  })

  test("normalized driver mode skips raw scalar normalization but still validates schemas", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      createdAt: C.timestamp()
    })

    const plan = Q.select({
      createdAt: users.createdAt
    }).pipe(
      Q.from(users)
    )

    const executor = Executor.make({
      driverMode: "normalized",
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          createdAt: new Date("2026-03-18T10:00:00Z")
        }
      ]))
    })

    expect(Effect.runSync(Effect.flip(executor.execute(plan)))).toMatchObject({
      _tag: "RowDecodeError",
      stage: "schema",
      projection: {
        alias: "createdAt"
      },
      raw: expect.any(Date)
    })
  })

  test("withTransaction delegates to the ambient SqlClient transaction service", () => {
    const effect = Executor.withTransaction(Effect.succeed("ok"))
    const sql = {
      withTransaction: <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.map(self, (value) => `txn:${String(value)}`)
    } as unknown as SqlClient.SqlClient

    expect(Effect.runSync(Effect.provideService(effect, SqlClient.SqlClient, sql))).toBe("txn:ok")
  })

  test("withSavepoint delegates to the ambient SqlClient transaction service", () => {
    const effect = Executor.withSavepoint(Effect.succeed("ok"))
    const sql = {
      withTransaction: <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.map(self, (value) => `sp:${String(value)}`)
    } as unknown as SqlClient.SqlClient

    expect(Effect.runSync(Effect.provideService(effect, SqlClient.SqlClient, sql))).toBe("sp:ok")
  })
})
