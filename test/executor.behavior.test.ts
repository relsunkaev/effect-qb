import { describe, expect, test } from "bun:test"
import * as SqlClient from "@effect/sql/SqlClient"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Column as C, Executor, Query as Q, Renderer, Table } from "../src/index.ts"

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

    const rows = Effect.runSync(Executor.fromDriver(renderer, driver).execute(plan))

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

    const executor = Executor.fromDriver(
      Renderer.make("postgres"),
      Executor.driver("postgres", () => Effect.succeed([]))
    )

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

    const executor = Executor.fromDriver(
      Renderer.make("postgres"),
      Executor.driver("postgres", () => Effect.succeed([
        {
          profile__id: userId,
          ignored: 123
        }
      ]))
    )

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

    const executor = Executor.fromDriver(
      Renderer.make("postgres"),
      Executor.driver("postgres", () => Effect.succeed([
        {
          user_identifier: userId,
          email_lower: "alice@example.com"
        }
      ]))
    )

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

    const executor = Executor.fromSqlClient(Renderer.make("postgres"))
    const sql = {
      unsafe<Row extends object>(statement: string, params?: ReadonlyArray<any>) {
        expect(statement).toBe('select "users"."id" as "profile__id", "users"."email" as "profile__email" from "users" where ("users"."email" = $1)')
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

    const executor = Executor.fromDriver(
      Renderer.make("postgres"),
      Executor.driver("postgres", () => Effect.succeed([
        {
          profile__id: userId
        }
      ]))
    )

    expect(Effect.runSync(executor.execute(plan)) as ReadonlyArray<unknown>).toEqual([
      {
        profile: {
          id: userId
        }
      }
    ])
  })

  test("fromDriver preserves projected values even when runtime types differ", () => {
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

    const executor = Executor.fromDriver(
      Renderer.make("postgres"),
      Executor.driver("postgres", () => Effect.succeed([
        {
          profile__id: userId,
          profile__createdAt: "not-a-date"
        }
      ]))
    )

    expect(Effect.runSync(executor.execute(plan)) as ReadonlyArray<unknown>).toEqual([
      {
        profile: {
          id: userId,
          createdAt: "not-a-date"
        }
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
        .when(Q.eq(Q.lower(posts.title), "draft"), "draft")
        .else(Q.upper(Q.coalesce(posts.title, "published")))
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId))
    )

    const executor = Executor.fromDriver(
      Renderer.make("postgres"),
      Executor.driver("postgres", () => Effect.succeed([
        {
          titleState: "missing"
        }
      ]))
    )

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

    const executor = Executor.fromSqlClient(Renderer.make("postgres"))
    const sql = {
      unsafe<Row extends object>(statement: string, params?: ReadonlyArray<any>) {
        expect(statement).toBe(
          'select case when ("posts"."title" is null) then $1 when (lower("posts"."title") = $2) then $3 else upper(coalesce("posts"."title", $4)) end as "titleState" from "users" left join "posts" on ("users"."id" = "posts"."userId") where ("users"."id" = $5)'
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

    const executor = Executor.fromDriver(
      Renderer.make("postgres"),
      Executor.driver("postgres", () => Effect.succeed([
        {
          userId,
          summary: "empty"
        }
      ]))
    )

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

  test("fromDriver remaps aliased JSON projections without runtime validation", () => {
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

    const executor = Executor.fromDriver(
      Renderer.make("postgres"),
      Executor.driver("postgres", () => Effect.succeed([
        {
          profile_alias: {}
        }
      ]))
    )

    expect(Effect.runSync(executor.execute(plan)) as ReadonlyArray<unknown>).toEqual([
      {
        profile: {}
      }
    ])
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
