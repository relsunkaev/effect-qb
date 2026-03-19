import { describe, expect, test } from "bun:test"

import { Column as C, Query as Q, Renderer, Table } from "../src/postgres.ts"

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
      postCount: Q.count(posts.id)
    }).pipe(
      Q.from(users),
      Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
      Q.groupBy(users.email),
      Q.having(Q.eq(Q.count(posts.id), 1))
    )

    const rendered = Renderer.make("postgres").render(plan)

    expect(rendered.sql).toBe('select "users"."email" as "email", count("posts"."id") as "postCount" from "public"."users" inner join "public"."posts" on ("users"."id" = "posts"."userId") group by "users"."email" having (count("posts"."id") = $1)')
    expect(rendered.params).toEqual([1])
  })
})
