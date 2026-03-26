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

  test("runtime decoding rejects impossible rows after implication pruning", () => {
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

    const error = Effect.runSync(Effect.flip(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          userId,
          postId: null,
          titleState: "missing"
        }
      ]))
    }).execute(plan)))

    expect(error).toMatchObject({
      _tag: "RowDecodeError",
      stage: "schema",
      projection: {
        alias: "postId"
      },
      raw: null
    })
  })

  test("runtime decoding rejects non-null payloads for always-null proofs", () => {
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

    const error = Effect.runSync(Effect.flip(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          title: "hello",
          upperTitle: "HELLO"
        }
      ]))
    }).execute(plan)))

    expect(error).toMatchObject({
      _tag: "RowDecodeError",
      stage: "schema",
      projection: {
        alias: "title"
      },
      raw: "hello"
    })
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

  test("runtime decoding prunes equality-proven case branches", () => {
    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      status: C.text()
    })

    const plan = Q.select({
      label: Q.case()
        .when(Q.eq(posts.status, "draft"), 1)
        .else(2)
    }).pipe(
      Q.from(posts),
      Q.where(Q.eq(posts.status, "draft"))
    )

    const error = Effect.runSync(Effect.flip(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          label: 2
        }
      ]))
    }).execute(plan)))

    expect(error).toMatchObject({
      _tag: "RowDecodeError",
      stage: "schema",
      projection: {
        alias: "label"
      },
      raw: 2
    })
  })

  test("isNull collapses dependent left joins to always-null projections", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey)
    })

    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid(),
      title: C.text().pipe(C.nullable)
    })

    const comments = Table.make("comments", {
      id: C.uuid().pipe(C.primaryKey),
      postId: C.uuid(),
      body: C.text()
    })

    const plan = Q.select({
      userId: users.id,
      postId: posts.id,
      postTitle: posts.title,
      commentId: comments.id,
      commentBody: comments.body
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
      Q.leftJoin(comments, Q.eq(posts.id, comments.postId)),
      Q.where(Q.isNull(posts.id))
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          userId,
          postId: null,
          postTitle: null,
          commentId: null,
          commentBody: null
        }
      ]))
    }).execute(plan)) as ReadonlyArray<unknown>

    expect(rows).toEqual([
      {
        userId,
        postId: null,
        postTitle: null,
        commentId: null,
        commentBody: null
      }
    ])
  })

  test("isNull rejects non-null payloads from dependent left joins", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey)
    })

    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid()
    })

    const comments = Table.make("comments", {
      id: C.uuid().pipe(C.primaryKey),
      postId: C.uuid(),
      body: C.text()
    })

    const plan = Q.select({
      userId: users.id,
      commentId: comments.id
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
      Q.leftJoin(comments, Q.eq(posts.id, comments.postId)),
      Q.where(Q.isNull(posts.id))
    )

    const error = Effect.runSync(Effect.flip(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          userId,
          commentId: postId
        }
      ]))
    }).execute(plan)))

    expect(error).toMatchObject({
      _tag: "RowDecodeError",
      stage: "schema",
      projection: {
        alias: "commentId"
      },
      raw: postId
    })
  })
})
