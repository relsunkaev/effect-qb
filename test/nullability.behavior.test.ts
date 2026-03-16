import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import { Executor, Query as Q, Renderer, Table } from "../src/index.ts"
import { makeRootSocialGraph } from "./fixtures/schema.ts"

describe("nullability behavior", () => {
  test("coalesce over an optional joined source decodes through a non-null fallback", () => {
    const { users, posts } = makeRootSocialGraph()

    const plan = Q.select({
      userId: users.id,
      fallbackTitle: Q.coalesce(posts.title, Q.literal("missing"))
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId))
    )

    const rows = Effect.runSync(Executor.fromDriver(
      Renderer.make("postgres"),
      Executor.driver("postgres", () => Effect.succeed([
        {
          userId: "user-1",
          fallbackTitle: "missing"
        }
      ]))
    ).execute(plan))

    expect(rows).toEqual([
      {
        userId: "user-1",
        fallbackTitle: "missing"
      }
    ])
  })

  test("isNull and isNotNull over optional joined sources remain boolean projections", () => {
    const { users, posts } = makeRootSocialGraph()

    const plan = Q.select({
      userId: users.id,
      titleMissing: Q.isNull(posts.title),
      titlePresent: Q.isNotNull(posts.title)
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId))
    )

    const rows = Effect.runSync(Executor.fromDriver(
      Renderer.make("postgres"),
      Executor.driver("postgres", () => Effect.succeed([
        {
          userId: "user-1",
          titleMissing: true,
          titlePresent: false
        }
      ]))
    ).execute(plan))

    expect(rows).toEqual([
      {
        userId: "user-1",
        titleMissing: true,
        titlePresent: false
      }
    ])
  })

  test("aggregate nullability semantics remain stable across optional joined sources", () => {
    const { users, posts } = makeRootSocialGraph()

    const plan = Q.select({
      userId: users.id,
      postCount: Q.count(posts.id),
      maxTitle: Q.max(posts.title),
      minTitle: Q.min(posts.title)
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
      Q.groupBy(users.id)
    )

    const rendered = Renderer.make("postgres").render(plan)

    expect(rendered.sql).toBe('select "users"."id" as "userId", count("posts"."id") as "postCount", max("posts"."title") as "maxTitle", min("posts"."title") as "minTitle" from "users" left join "posts" on ("users"."id" = "posts"."userId") group by "users"."id"')
    expect(rendered.params).toEqual([])
  })
})
