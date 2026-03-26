// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import { Executor, Query as Q, Function as F, Renderer, Table } from "#postgres"
import { makeRootSocialGraph } from "../../fixtures/schema.ts"
import { unsafeAny } from "../../helpers/unsafe.ts"

const userId = "11111111-1111-1111-1111-111111111111"
const postId = "22222222-2222-2222-2222-222222222222"

describe("nullability behavior", () => {
  test("coalesce over an optional joined source decodes through a non-null fallback", () => {
    const { users, posts } = makeRootSocialGraph()

    const plan = Q.select({
      userId: users.id,
      fallbackTitle: F.coalesce(null, posts.title, Q.literal("missing"))
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId))
    )

    const rows = Effect.runSync(unsafeAny(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          userId,
          fallbackTitle: "missing"
        }
      ]))
    }).execute(plan)))

    expect(rows).toEqual([
      {
        userId,
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

    const rows = Effect.runSync(unsafeAny(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          userId,
          titleMissing: true,
          titlePresent: false
        }
      ]))
    }).execute(plan)))

    expect(rows).toEqual([
      {
        userId,
        titleMissing: true,
        titlePresent: false
      }
    ])
  })

  test("aggregate nullability semantics remain stable across optional joined sources", () => {
    const { users, posts } = makeRootSocialGraph()

    const plan = Q.select({
      userId: users.id,
      postCount: F.count(posts.id),
      maxTitle: F.max(posts.title),
      minTitle: F.min(posts.title)
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
      Q.groupBy(users.id)
    )

    const rendered = Renderer.make("postgres").render(plan)

    expect(rendered.sql).toBe('select "users"."id" as "userId", count("posts"."id") as "postCount", max("posts"."title") as "maxTitle", min("posts"."title") as "minTitle" from "public"."users" left join "public"."posts" on ("users"."id" = "posts"."userId") group by "users"."id"')
    expect(rendered.params).toEqual([])
  })

  test("where predicates refine nullable joined projections and reject impossible rows", () => {
    const { users, posts } = makeRootSocialGraph()

    const plan = Q.select({
      userId: users.id,
      postId: posts.id,
      postTitle: posts.title,
      upperPostTitle: F.upper(posts.title)
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
      Q.where(Q.and(
        Q.isNotNull(posts.title),
        Q.eq(posts.id, postId)
      ))
    )

    const rendered = Renderer.make("postgres").render(plan)

    expect(rendered.sql).toBe('select "users"."id" as "userId", "posts"."id" as "postId", "posts"."title" as "postTitle", upper("posts"."title") as "upperPostTitle" from "public"."users" left join "public"."posts" on ("users"."id" = "posts"."userId") where (("posts"."title" is not null) and ("posts"."id" = $1))')
    expect(rendered.params).toEqual([postId])

    const error = Effect.runSync(Effect.flip(unsafeAny(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          userId,
          postId: null,
          postTitle: null,
          upperPostTitle: null
        }
      ]))
    }).execute(plan))))

    expect(error).toMatchObject({
      _tag: "RowDecodeError",
      stage: "schema",
      projection: {
        alias: "postId"
      },
      raw: null
    })
  })

  test("searched case applies branch-local refinement to SQL while runtime stays conservative", () => {
    const { users, posts } = makeRootSocialGraph()

    const plan = Q.select({
      normalizedTitle: Q.case()
        .when(Q.isNotNull(posts.title), F.upper(posts.title))
        .else("missing")
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId))
    )

    const rows = Effect.runSync(unsafeAny(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          normalizedTitle: null
        }
      ]))
    }).execute(plan))) as ReadonlyArray<unknown>

    expect(rows).toEqual([
      {
        normalizedTitle: null
      }
    ])
  })

  test("searched case stays conservative after filtered left joins", () => {
    const { users, posts } = makeRootSocialGraph()

    const plan = Q.select({
      normalizedTitle: Q.case()
        .when(Q.isNotNull(posts.title), F.upper(posts.title))
        .when(Q.isNotNull(posts.id), "UNTITLED")
        .else("missing")
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
      Q.where(Q.isNotNull(posts.id))
    )

    const rows = Effect.runSync(unsafeAny(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          normalizedTitle: null
        },
        {
          normalizedTitle: "HELLO"
        }
      ]))
    }).execute(plan))) as ReadonlyArray<unknown>

    expect(rows).toEqual([
      {
        normalizedTitle: null
      },
      {
        normalizedTitle: "HELLO"
      }
    ])
  })
})
