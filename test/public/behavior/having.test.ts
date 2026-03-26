// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import { Column as C, Executor, Query as Q, Function as F, Renderer, Table } from "#postgres"

describe("having", () => {
  test("renders aggregate predicates after group by", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid()
    })

    const plan = Q.select({
      email: users.email,
      postCount: F.count(posts.id)
    }).pipe(
      Q.from(users),
      Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
      Q.groupBy(users.email),
      Q.having(Q.eq(F.count(posts.id), 1))
    )

    const rendered = Renderer.make("postgres").render(plan)

    expect(rendered.sql).toBe('select "users"."email" as "email", count("posts"."id") as "postCount" from "public"."users" inner join "public"."posts" on ("users"."id" = "posts"."userId") group by "users"."email" having (count("posts"."id") = $1)')
    expect(rendered.params).toEqual([1])
  })

  test("runtime decoding applies having assumptions to searched case projections", () => {
    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid(),
      status: C.text()
    })

    const isDraft = Q.eq(posts.status, Q.literal("draft"))

    const titleState = Q.case()
      .when(isDraft, 1)
      .else(2)

    const plan = Q.select({
      titleState
    }).pipe(
      Q.from(posts),
      Q.groupBy(titleState),
      Q.having(isDraft)
    )

    const error = Effect.runSync(Effect.flip(Executor.make({
      driver: Executor.driver("postgres", () => Effect.succeed([
        {
          titleState: 2
        }
      ]))
    }).execute(plan)))

    expect(error).toMatchObject({
      _tag: "RowDecodeError",
      stage: "schema",
      projection: {
        alias: "titleState"
      },
      raw: 2
    })
  })
})
