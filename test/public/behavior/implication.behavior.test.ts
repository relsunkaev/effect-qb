// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import { Column as C, Executor, Query as Q, Function as F, Renderer, Table } from "#postgres"

const userId = "11111111-1111-1111-1111-111111111111"
const postId = "22222222-2222-2222-2222-222222222222"

describe("implication behavior", () => {
  test("fromDriver remaps sparse nested projection paths without filling missing siblings", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid(),
      title: C.text().pipe(C.nullable)
    })

    const plan = Q.select({
      profile: {
        id: users.id,
        email: users.email
      },
      post: {
        id: posts.id,
        titleState: Q.case()
          .when(Q.isNotNull(posts.title), F.upper(posts.title))
          .else("missing")
      }
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId))
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          profile__email: "alice@example.com",
          post__titleState: "missing"
        }
      ]))
    }).execute(plan)) as ReadonlyArray<unknown>

    expect(rows).toEqual([
      {
        profile: {
          email: "alice@example.com"
        },
        post: {
          titleState: "missing"
        }
      }
    ])
  })

  test("runtime decoding stays conservative for implication-pruned branches", () => {
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
      postId: posts.id,
      titleState: Q.case()
        .when(Q.isNotNull(posts.title), F.upper(posts.title))
        .else("missing")
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
      Q.where(Q.and(
        Q.isNotNull(posts.id),
        Q.isNotNull(posts.title)
      ))
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          userId,
          postId: null,
          titleState: "missing"
        }
      ]))
    }).execute(plan)) as ReadonlyArray<unknown>

    expect(rows).toEqual([
      {
        userId,
        postId: null,
        titleState: "missing"
      }
    ])
  })

  test("runtime decoding stays conservative for always-null proofs", () => {
    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid(),
      title: C.text().pipe(C.nullable)
    })

    const plan = Q.select({
      title: posts.title,
      upperTitle: F.upper(posts.title)
    }).pipe(
      Q.from(posts),
      Q.where(Q.isNull(posts.title))
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          title: "hello",
          upperTitle: "HELLO"
        }
      ]))
    }).execute(plan)) as ReadonlyArray<unknown>

    expect(rows).toEqual([
      {
        title: "hello",
        upperTitle: "HELLO"
      }
    ])
  })

  test("renderer stays schema-free for implication-heavy plans while preserving projection metadata", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid(),
      status: C.text(),
      title: C.text().pipe(C.nullable)
    })

    const plan = Q.select({
      userId: users.id,
      label: Q.case()
        .when(Q.eq(posts.status, "draft"), 1)
        .else(2)
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
      Q.where(Q.eq(posts.status, "draft"))
    )

    const rendered = Renderer.make("postgres").render(plan)

    expect("rowSchema" in (rendered as Record<string, unknown>)).toBe(false)
    expect(rendered.sql).toBe('select "users"."id" as "userId", case when ("posts"."status" = $1) then $2 else $3 end as "label" from "public"."users" left join "public"."posts" on ("users"."id" = "posts"."userId") where ("posts"."status" = $4)')
    expect(rendered.params).toEqual(["draft", 1, 2, "draft"])
    expect(rendered.projections).toEqual([
      {
        alias: "userId",
        path: ["userId"]
      },
      {
        alias: "label",
        path: ["label"]
      }
    ])
  })
})
