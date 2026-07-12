// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Query as Q, Function as F, Table } from "#standard"
import { Column as C, Executor, Renderer, Type } from "#postgres"
import * as StdRoot from "#standard"

const userId = "11111111-1111-4111-8111-111111111111"
const postId = "22222222-2222-4222-8222-222222222222"

describe("implication behavior", () => {
  test("fromDriver remaps nested projection paths while preserving null joined siblings", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid(),
      title: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
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
          profile__id: userId,
          profile__email: "alice@example.com",
          post__id: null,
          post__titleState: "missing"
        }
      ]))
    }).execute(plan)) as ReadonlyArray<unknown>

    expect(rows).toEqual([
      {
        profile: {
          id: userId,
          email: "alice@example.com"
        },
        post: {
          id: null,
          titleState: "missing"
        }
      }
    ])
  })

  test("runtime decoding rejects impossible rows after implication pruning", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })

    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid(),
      title: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
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
    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid(),
      title: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid(),
      status: StdRoot.Column.text(),
      title: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
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
    expect(rendered.sql).toBe('select "users"."id" as "userId", case when ("posts"."status" = $1) then $2 else $3 end as "label" from "users" left join "posts" on ("users"."id" = "posts"."userId") where ("posts"."status" = $4)')
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
    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      status: StdRoot.Column.text()
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

  test("predicate facts keep dotted table and column names distinct", () => {
    const dottedTable = Table.make("a.b", {
      status: C.custom(Schema.Literals(["left", "right"]), StdRoot.Query.type.text())
    })
    const splitTable = Table.make("a", {
      "b.status": C.custom(Schema.Literals(["left", "right"]), StdRoot.Query.type.text())
    })

    const plan = Q.select({
      splitStatus: splitTable["b.status"]
    }).pipe(
      Q.from(splitTable),
      Q.crossJoin(dottedTable),
      Q.where(Q.eq(dottedTable.status, "left"))
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          splitStatus: "right"
        }
      ]))
    }).execute(plan))

    expect(rows).toEqual([
      {
        splitStatus: "right"
      }
    ])
  })

  test("predicate facts do not promote split sources for dotted table names", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    const dottedTable = Table.make("a.b", {
      status: C.custom(Schema.Literals(["left", "right"]), StdRoot.Query.type.text())
    })
    const splitTable = Table.make("a", {
      "b.status": C.custom(Schema.Literals(["left", "right"]), StdRoot.Query.type.text())
    })

    const plan = Q.select({
      splitStatus: splitTable["b.status"],
      dottedStatus: dottedTable.status
    }).pipe(
      Q.from(users),
      Q.leftJoin(splitTable, Q.eq(splitTable["b.status"], "right")),
      Q.leftJoin(dottedTable, Q.eq(dottedTable.status, "left")),
      Q.where(Q.isNotNull(dottedTable.status))
    )

    const rows = Effect.runSync(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          splitStatus: null,
          dottedStatus: "left"
        }
      ]))
    }).execute(plan))

    expect(rows).toEqual([
      {
        splitStatus: null,
        dottedStatus: "left"
      }
    ])
  })

  test("isNull collapses dependent left joins to always-null projections", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })

    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid(),
      title: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })

    const comments = StdRoot.Table.make("comments", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      postId: StdRoot.Column.uuid(),
      body: StdRoot.Column.text()
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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })

    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid()
    })

    const comments = StdRoot.Table.make("comments", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      postId: StdRoot.Column.uuid(),
      body: StdRoot.Column.text()
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
