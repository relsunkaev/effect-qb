// @ts-nocheck
import { describe, expect, test } from "bun:test"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import * as StdRoot from "#standard"

const userId = "11111111-1111-4111-8111-111111111111"

describe("mysql dialect legality", () => {
  test("rejects full outer joins instead of rendering unsupported mysql sql", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid()
    })

    const plan = StdRoot.Query.select({
      userId: users.id,
      postId: posts.id
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.fullJoin(posts, StdRoot.Query.eq(users.id, posts.userId))
    )

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported mysql full join"
    )
  })

  test("rejects mutation returning projections instead of rendering unsupported mysql sql", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const plan = StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }).pipe(
      StdRoot.Query.returning({
        id: users.id
      })
    )

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported mysql returning"
    )
  })

  test("rejects data-modifying ctes instead of rendering unsupported mysql sql", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const insertedUsers = StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }).pipe(
      StdRoot.Query.with("inserted_users")
    )

    const plan = StdRoot.Query.select({
      ok: StdRoot.Query.literal(1)
    }).pipe(
      StdRoot.Query.from(insertedUsers)
    )

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported mysql data-modifying cte"
    )
  })

  test("rejects postgres-only truncate options instead of rendering unsupported mysql sql", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const plan = StdRoot.Query.truncate(users, {
      restartIdentity: true,
      cascade: true
    })

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported mysql truncate options"
    )
  })

  test("rejects generateSeries sources instead of rendering unsupported table-function sql", () => {
    const series = Postgres.Query.generateSeries(1, 3, 1, "series")

    const plan = StdRoot.Query.select({
      value: series.value
    }).pipe(
      StdRoot.Query.from(series)
    )

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported table function source for SQL rendering"
    )
  })
})
