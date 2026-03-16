import { describe, expect, test } from "bun:test"
import * as SqlClient from "@effect/sql/SqlClient"
import * as Effect from "effect/Effect"

import { Column as C, Executor, Query as Q, Renderer, Table } from "../src/index.ts"

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
        profile__id: "user-1",
        profile__email: null
      }
    ]))

    const rows = Effect.runSync(Executor.fromDriver(renderer, driver).execute(plan))

    expect(rows as ReadonlyArray<unknown>).toEqual([
      {
        profile: {
          id: "user-1",
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
          profile__id: "user-1",
          ignored: 123
        }
      ]))
    )

    expect(Effect.runSync(executor.execute(plan)) as ReadonlyArray<any>).toEqual([
      {
        profile: {
          id: "user-1"
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
          user_identifier: "user-1",
          email_lower: "alice@example.com"
        }
      ]))
    )

    expect(Effect.runSync(executor.execute(plan))).toEqual([
      {
        profile: {
          id: "user-1",
          email: "alice@example.com"
        }
      }
    ])
  })

  test("fromSqlClient forwards rendered SQL and params before decoding rows", () => {
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
            profile__id: "user-1",
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
          id: "user-1",
          email: "alice@example.com"
        }
      }
    ])
  })
})
