// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as SqlClient from "@effect/sql/SqlClient"
import * as Chunk from "effect/Chunk"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import { Cast, Column as C, Executor, Query as Q, Function as F, Renderer, Table, Type } from "#postgres"

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

  test("fromDriver ignores extra columns while decoding projected columns", () => {
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
          profile__email: "alice@example.com",
          ignored: 123
        }
      ]))
    })

    expect(Effect.runSync(executor.execute(plan)) as ReadonlyArray<unknown>).toEqual([
      {
        profile: {
          id: userId,
          email: "alice@example.com"
        }
      }
    ])
  })

  test("fromDriver rejects rows missing required projected aliases", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })
    const plan = Q.select({
      id: users.id,
      email: users.email
    }).pipe(
      Q.from(users)
    )

    const executor = Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          id: userId
        }
      ]))
    })

    const result = Effect.runSync(Effect.either(executor.execute(plan)))

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RowDecodeError",
        stage: "schema",
        projection: {
          alias: "email"
        }
      }
    })
  })

  test("fromDriver rejects nested rows missing required projected aliases", () => {
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

    const result = Effect.runSync(Effect.either(executor.execute(plan)))

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RowDecodeError",
        stage: "schema",
        projection: {
          alias: "profile__email"
        }
      }
    })
  })

  test("explicit projection aliases still decode into the original result paths", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })
    const plan = Q.select({
      profile: {
        id: Q.as(users.id, "user_identifier"),
        email: Q.as(F.lower(users.email), "email_lower")
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

  test("fromDriver rejects missing nested projected aliases instead of omitting paths", () => {
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

    expect(Effect.runSync(Effect.either(executor.execute(plan)))).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RowDecodeError",
        stage: "schema",
        projection: {
          alias: "profile__email"
        }
      }
    })
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

  test("fromDriver rejects impossible local-date values", () => {
    const events = Table.make("events", {
      happenedOn: C.date()
    })

    const plan = Q.select({
      happenedOn: events.happenedOn
    }).pipe(
      Q.from(events)
    )

    const result = Effect.runSync(Effect.either(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          happenedOn: "2026-02-31"
        }
      ]))
    }).execute(plan)))

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RowDecodeError",
        stage: "normalize",
        projection: {
          alias: "happenedOn"
        },
        dbType: {
          dialect: "postgres",
          kind: "date"
        }
      }
    })
  })

  test("normalized driver mode rejects impossible local-date values", () => {
    const events = Table.make("normalized_date_events", {
      happenedOn: C.date()
    })

    const plan = Q.select({
      happenedOn: events.happenedOn
    }).pipe(
      Q.from(events)
    )

    const result = Effect.runSync(Effect.either(Executor.make({
      driverMode: "normalized",
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          happenedOn: "2026-02-31"
        }
      ]))
    }).execute(plan)))

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RowDecodeError",
        stage: "schema",
        projection: {
          alias: "happenedOn"
        },
        dbType: {
          dialect: "postgres",
          kind: "date"
        }
      }
    })
  })

  const invalidTemporalCases = [
    {
      name: "fromDriver rejects impossible local-time values",
      tableName: "invalid_time_events",
      column: () => C.time(),
      raw: "25:61:00",
      stage: "normalize",
      kind: "time"
    },
    {
      name: "normalized driver mode rejects impossible local-time values",
      tableName: "normalized_invalid_time_events",
      column: () => C.time(),
      raw: "25:61:00",
      driverMode: "normalized",
      stage: "schema",
      kind: "time"
    },
    {
      name: "fromDriver rejects impossible offset-time values",
      tableName: "invalid_offset_time_events",
      column: () => C.timetz(),
      raw: "25:61:00+99:99",
      stage: "normalize",
      kind: "timetz"
    },
    {
      name: "normalized driver mode rejects impossible offset-time values",
      tableName: "normalized_invalid_offset_time_events",
      column: () => C.timetz(),
      raw: "25:61:00+99:99",
      driverMode: "normalized",
      stage: "schema",
      kind: "timetz"
    },
    {
      name: "fromDriver rejects impossible local-datetime values",
      tableName: "invalid_datetime_events",
      column: () => C.timestamp(),
      raw: "2026-02-31 10:00:00",
      stage: "normalize",
      kind: "timestamp"
    },
    {
      name: "normalized driver mode rejects impossible local-datetime values",
      tableName: "normalized_invalid_datetime_events",
      column: () => C.timestamp(),
      raw: "2026-02-31T10:00:00",
      driverMode: "normalized",
      stage: "schema",
      kind: "timestamp"
    },
    {
      name: "fromDriver rejects impossible instant values",
      tableName: "invalid_instant_events",
      column: () => C.timestamptz(),
      raw: "2026-02-31T10:00:00Z",
      stage: "normalize",
      kind: "timestamptz"
    },
    {
      name: "normalized driver mode rejects impossible instant values",
      tableName: "normalized_invalid_instant_events",
      column: () => C.timestamptz(),
      raw: "2026-02-31T10:00:00Z",
      driverMode: "normalized",
      stage: "schema",
      kind: "timestamptz"
    }
  ]

  for (const invalidCase of invalidTemporalCases) {
    test(invalidCase.name, () => {
      const events = Table.make(invalidCase.tableName, {
        value: invalidCase.column()
      })

      const plan = Q.select({
        value: events.value
      }).pipe(
        Q.from(events)
      )

      const result = Effect.runSync(Effect.either(Executor.make({
        driverMode: invalidCase.driverMode,
        driver: Executor.driver("postgres", () => Effect.succeed([
          {
            value: invalidCase.raw
          }
        ]))
      }).execute(plan)))

      expect(result).toMatchObject({
        _tag: "Left",
        left: {
          _tag: "RowDecodeError",
          stage: invalidCase.stage,
          projection: {
            alias: "value"
          },
          dbType: {
            dialect: "postgres",
            kind: invalidCase.kind
          }
        }
      })
    })
  }

  test("fromDriver normalizes canonical scalar outputs across raw driver variants", () => {
    const metrics = Table.make("metrics", {
      id: C.uuid().pipe(C.primaryKey),
      createdAt: C.timestamp(),
      total: C.number(),
      counter: C.custom(Schema.String, {
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
        },
        {
          createdAt: "2026-03-18 10:00:00",
          total: "-0.00",
          counter: "-0"
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
      },
      {
        createdAt: "2026-03-18T10:00:00",
        total: "0",
        counter: "0"
      }
    ])
  })

  test("fromDriver normalizes byte and array outputs", () => {
    const files = Table.make("files", {
      payload: C.bytea(),
      tags: C.text().pipe(C.array())
    })

    const plan = Q.select({
      payload: files.payload,
      tags: files.tags
    }).pipe(
      Q.from(files)
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          payload: Buffer.from([1, 2, 3]),
          tags: ["alpha", "beta"]
        }
      ]))
    }).execute(plan))

    expect(Array.from(rows[0]!.payload)).toEqual([1, 2, 3])
    expect(rows[0]!.tags).toEqual(["alpha", "beta"])
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

  test("fromDriver accepts canonical instant outputs with milliseconds", () => {
    const events = Table.make("events", {
      happenedAt: C.timestamptz()
    })

    const plan = Q.select({
      happenedAt: events.happenedAt
    }).pipe(
      Q.from(events)
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          happenedAt: new Date("2026-03-18T10:00:00.000Z")
        },
        {
          happenedAt: "2026-03-18T10:00:00+02:00"
        }
      ]))
    }).execute(plan))

    expect(rows).toEqual([
      {
        happenedAt: "2026-03-18T10:00:00.000Z"
      },
      {
        happenedAt: "2026-03-18T08:00:00.000Z"
      }
    ])
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
        .when(Q.eq(F.lower(posts.title), "draft"), "draft")
        .else(F.upper(F.coalesce(posts.title, "published")))
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
        .when(Q.eq(F.lower(posts.title), "draft"), "draft")
        .else(F.upper(F.coalesce(posts.title, "published")))
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
        .when(Q.eq(F.count(posts.id), 0), "empty")
        .else(F.coalesce(F.max(posts.title), "latest"))
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
      title: F.coalesce(posts.title, "missing")
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

  test("fromDriver accepts top-level JSON nulls allowed by the JSON schema", () => {
    const docs = Table.make("nullable_json_docs", {
      payload: C.json(Schema.NullOr(Schema.Struct({
        kind: Schema.String
      })))
    })

    const plan = Q.select({
      payload: docs.payload
    }).pipe(
      Q.from(docs)
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          payload: null
        }
      ]))
    }).execute(plan))

    expect(rows).toEqual([
      {
        payload: null
      }
    ])
  })

  test("fromDriver rejects non-finite JSON numbers", () => {
    const docs = Table.make("json_number_docs", {
      payload: C.json(Schema.Number)
    })

    const plan = Q.select({
      payload: docs.payload
    }).pipe(
      Q.from(docs)
    )

    const result = Effect.runSync(Effect.either(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          payload: Number.NaN
        }
      ]))
    }).execute(plan)))

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RowDecodeError",
        stage: "normalize",
        projection: {
          alias: "payload"
        },
        dbType: {
          dialect: "postgres",
          kind: "json"
        }
      }
    })
  })

  test("normalized driver mode rejects non-finite JSON numbers", () => {
    const docs = Table.make("normalized_json_number_docs", {
      payload: C.json(Schema.Number)
    })

    const plan = Q.select({
      payload: docs.payload
    }).pipe(
      Q.from(docs)
    )

    const result = Effect.runSync(Effect.either(Executor.make({
      driverMode: "normalized",
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          payload: Number.NaN
        }
      ]))
    }).execute(plan)))

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RowDecodeError",
        stage: "schema",
        projection: {
          alias: "payload"
        },
        dbType: {
          dialect: "postgres",
          kind: "json"
        }
      }
    })
  })

  test("normalized driver mode rejects non-finite numeric values", () => {
    const metrics = Table.make("normalized_metrics", {
      total: C.float8()
    })

    const plan = Q.select({
      total: metrics.total
    }).pipe(
      Q.from(metrics)
    )

    const result = Effect.runSync(Effect.either(Executor.make({
      driverMode: "normalized",
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          total: Number.POSITIVE_INFINITY
        }
      ]))
    }).execute(plan)))

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RowDecodeError",
        stage: "schema",
        projection: {
          alias: "total"
        },
        dbType: {
          dialect: "postgres",
          kind: "float8"
        }
      }
    })
  })

  test("normalized driver mode rejects non-finite aggregate numbers", () => {
    const users = Table.make("normalized_aggregate_users", {
      id: C.uuid().pipe(C.primaryKey)
    })

    const plan = Q.select({
      count: F.count(users.id)
    }).pipe(
      Q.from(users)
    )

    const result = Effect.runSync(Effect.either(Executor.make({
      driverMode: "normalized",
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          count: Number.POSITIVE_INFINITY
        }
      ]))
    }).execute(plan)))

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RowDecodeError",
        stage: "schema",
        projection: {
          alias: "count"
        }
      }
    })
  })

  test("normalized driver mode rejects non-finite window numbers", () => {
    const users = Table.make("normalized_window_users", {
      id: C.uuid().pipe(C.primaryKey)
    })

    const plan = Q.select({
      rowNumber: F.rowNumber({
        orderBy: [{ value: users.id, direction: "asc" }]
      })
    }).pipe(
      Q.from(users)
    )

    const result = Effect.runSync(Effect.either(Executor.make({
      driverMode: "normalized",
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          rowNumber: Number.POSITIVE_INFINITY
        }
      ]))
    }).execute(plan)))

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RowDecodeError",
        stage: "schema",
        projection: {
          alias: "rowNumber"
        }
      }
    })
  })

  test("fromDriver enforces structured record cast fields", () => {
    const plan = Q.select({
      profile: Cast.to("{}", Type.record("user_profile", {
        displayName: Type.text(),
        age: Type.int4()
      }))
    })

    const executor = Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          profile: {
            displayName: "Alice"
          }
        }
      ]))
    })

    expect(Effect.runSync(Effect.flip(executor.execute(plan)))).toMatchObject({
      _tag: "RowDecodeError",
      stage: "schema",
      projection: {
        alias: "profile"
      },
      dbType: {
        dialect: "postgres",
        kind: "user_profile"
      },
      raw: {
        displayName: "Alice"
      }
    })
  })

  test("fromDriver enforces declared string length limits", () => {
    const users = Table.make("users", {
      shortName: C.varchar(3),
      code: C.char(2)
    })

    const plan = Q.select({
      shortName: users.shortName,
      code: users.code
    }).pipe(
      Q.from(users)
    )

    const executor = Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          shortName: "toolong",
          code: "abcd"
        }
      ]))
    })

    expect(Effect.runSync(Effect.flip(executor.execute(plan)))).toMatchObject({
      _tag: "RowDecodeError",
      stage: "schema",
      projection: {
        alias: "shortName"
      },
      dbType: {
        dialect: "postgres",
        kind: "varchar"
      },
      raw: "toolong"
    })
  })

  test("fromDriver enforces char length limits", () => {
    const users = Table.make("users", {
      code: C.char(2)
    })

    const plan = Q.select({
      code: users.code
    }).pipe(
      Q.from(users)
    )

    const executor = Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          code: "abcd"
        }
      ]))
    })

    expect(Effect.runSync(Effect.flip(executor.execute(plan)))).toMatchObject({
      _tag: "RowDecodeError",
      stage: "schema",
      projection: {
        alias: "code"
      },
      dbType: {
        dialect: "postgres",
        kind: "char"
      },
      raw: "abcd"
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

  test("fromDriver accepts already-decoded JSON string scalars", () => {
    const docs = Table.make("json_string_docs", {
      payload: C.json(Schema.String)
    })

    const plan = Q.select({
      payload: docs.payload
    }).pipe(
      Q.from(docs)
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          payload: "plain text"
        }
      ]))
    }).execute(plan))

    expect(rows).toEqual([
      {
        payload: "plain text"
      }
    ])
  })

  test("fromDriver preserves already-decoded JSON string scalars that look like JSON", () => {
    const docs = Table.make("json_numeric_string_docs", {
      payload: C.json(Schema.String)
    })

    const plan = Q.select({
      payload: docs.payload
    }).pipe(
      Q.from(docs)
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          payload: "42"
        }
      ]))
    }).execute(plan))

    expect(rows).toEqual([
      {
        payload: "42"
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

  describe("stream", () => {
    test("decodes the same rows as execute for read plans", () => {
      const users = Table.make("users", {
        id: C.uuid().pipe(C.primaryKey),
        email: C.text().pipe(C.nullable),
        createdAt: C.timestamp()
      })

      const plan = Q.select({
        profile: {
          id: users.id,
          email: users.email,
          createdAt: users.createdAt
        }
      }).pipe(
        Q.from(users)
      )

      const flatRows = [
        {
          profile__id: userId,
          profile__email: "alice@example.com",
          profile__createdAt: "2026-03-18 10:00:00"
        },
        {
          profile__id: "22222222-2222-2222-2222-222222222222",
          profile__email: null,
          profile__createdAt: new Date("2026-03-19T11:30:00Z")
        }
      ] as const

      const executor = Executor.make({
        driver: Executor.driver("postgres", {
          execute: () => Effect.succeed(flatRows),
          stream: () => Stream.fromIterable(flatRows).pipe(Stream.rechunk(1))
        })
      })

      const executedRows = Effect.runSync(executor.execute(plan))
      const streamedRows = Chunk.toReadonlyArray(
        Effect.runSync(Stream.runCollect(executor.stream(plan)))
      )

      expect(streamedRows).toEqual(executedRows)
      expect(streamedRows).toEqual([
        {
          profile: {
            id: userId,
            email: "alice@example.com",
            createdAt: "2026-03-18T10:00:00"
          }
        },
        {
          profile: {
            id: "22222222-2222-2222-2222-222222222222",
            email: null,
            createdAt: "2026-03-19T11:30:00"
          }
        }
      ])
    })

    test("preserves row order across streamed chunks", () => {
      const users = Table.make("users", {
        id: C.uuid().pipe(C.primaryKey)
      })

      const plan = Q.select({
        id: users.id
      }).pipe(
        Q.from(users)
      )

      const flatRows = [
        { id: "11111111-1111-1111-1111-111111111111" },
        { id: "22222222-2222-2222-2222-222222222222" },
        { id: "33333333-3333-3333-3333-333333333333" }
      ]

      const executor = Executor.make({
        driver: Executor.driver("postgres", {
          execute: () => Effect.succeed(flatRows),
          stream: () => Stream.fromIterable(flatRows).pipe(Stream.rechunk(2))
        })
      })

      const streamedRows = Chunk.toReadonlyArray(
        Effect.runSync(Stream.runCollect(executor.stream(plan)))
      )

      expect(streamedRows).toEqual([
        { id: "11111111-1111-1111-1111-111111111111" },
        { id: "22222222-2222-2222-2222-222222222222" },
        { id: "33333333-3333-3333-3333-333333333333" }
      ])
    })

    test("fails with RowDecodeError when streamed rows violate runtime decoding", () => {
      const users = Table.make("users", {
        id: C.uuid().pipe(C.primaryKey),
        createdAt: C.timestamp()
      })

      const plan = Q.select({
        id: users.id,
        createdAt: users.createdAt
      }).pipe(
        Q.from(users)
      )

      const executor = Executor.make({
        driver: Executor.driver("postgres", {
          execute: () => Effect.succeed([]),
          stream: () =>
            Stream.fromIterable([
              {
                id: userId,
                createdAt: "not-a-date"
              }
            ])
        })
      })

      expect(
        Effect.runSync(Effect.flip(Stream.runCollect(executor.stream(plan))))
      ).toMatchObject({
        _tag: "RowDecodeError",
        stage: "normalize",
        projection: {
          alias: "createdAt"
        },
        dbType: {
          dialect: "postgres",
          kind: "timestamp"
        },
        raw: "not-a-date"
      })
    })

    test("fails with RowDecodeError when streamed nested rows miss required aliases", () => {
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
        driver: Executor.driver("postgres", {
          execute: () => Effect.succeed([]),
          stream: () =>
            Stream.fromIterable([
              {
                profile__id: userId
              }
            ])
        })
      })

      const result = Effect.runSync(Effect.either(Stream.runCollect(executor.stream(plan))))

      expect(result).toMatchObject({
        _tag: "Left",
        left: {
          _tag: "RowDecodeError",
          stage: "schema",
          projection: {
            alias: "profile__email"
          }
        }
      })
    })

    test("uses the driver's stream path without calling execute", () => {
      const users = Table.make("users", {
        id: C.uuid().pipe(C.primaryKey)
      })

      const plan = Q.select({
        id: users.id
      }).pipe(
        Q.from(users)
      )

      let executeCalls = 0
      let streamCalls = 0

      const executor = Executor.make({
        driver: Executor.driver("postgres", {
          execute: () => {
            executeCalls += 1
            return Effect.succeed([])
          },
          stream: () => {
            streamCalls += 1
            return Stream.fromIterable([{ id: userId }])
          }
        })
      })

      const rows = Chunk.toReadonlyArray(
        Effect.runSync(Stream.runCollect(executor.stream(plan)))
      )

      expect(rows).toEqual([{ id: userId }])
      expect(streamCalls).toBe(1)
      expect(executeCalls).toBe(0)
    })

    test("runs driver stream finalizers when consumers stop early", () => {
      const users = Table.make("users", {
        id: C.uuid().pipe(C.primaryKey)
      })

      const plan = Q.select({
        id: users.id
      }).pipe(
        Q.from(users)
      )

      let finalized = false

      const executor = Executor.make({
        driver: Executor.driver("postgres", {
          execute: () => Effect.succeed([]),
          stream: () =>
            Stream.fromIterable([
              { id: "11111111-1111-1111-1111-111111111111" },
              { id: "22222222-2222-2222-2222-222222222222" }
            ]).pipe(
              Stream.ensuring(Effect.sync(() => {
                finalized = true
              }))
            )
        })
      })

      const rows = Chunk.toReadonlyArray(
        Effect.runSync(Stream.runCollect(executor.stream(plan).pipe(Stream.take(1))))
      )

      expect(rows).toEqual([{ id: "11111111-1111-1111-1111-111111111111" }])
      expect(finalized).toBe(true)
    })

    test("forwards rendered SQL and params to the ambient SqlClient stream", () => {
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
        reserve: Effect.succeed({
          executeStream<Row extends object>(
            statement: string,
            params?: ReadonlyArray<any>
          ) {
            expect(statement).toBe('select "users"."id" as "profile__id", "users"."email" as "profile__email" from "public"."users" where ("users"."email" = $1)')
            expect(params).toEqual(["alice@example.com"])
            return Stream.fromIterable([
              {
                profile__id: userId,
                profile__email: "alice@example.com"
              }
            ] as unknown as ReadonlyArray<Row>)
          }
        })
      } as unknown as SqlClient.SqlClient

      const rows = Chunk.toReadonlyArray(
        Effect.runSync(
          Effect.provideService(
            Stream.runCollect(executor.stream(plan)),
            SqlClient.SqlClient,
            sql
          )
        )
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
