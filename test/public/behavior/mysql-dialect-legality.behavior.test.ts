// @ts-nocheck
import { describe, expect, test } from "bun:test"

import * as Mysql from "#mysql"

const userId = "11111111-1111-1111-1111-111111111111"

describe("mysql dialect legality", () => {
  test("rejects full outer joins instead of rendering unsupported mysql sql", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })
    const posts = Mysql.Table.make("posts", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      userId: Mysql.Column.uuid()
    })

    const plan = Mysql.Query.select({
      userId: users.id,
      postId: posts.id
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.fullJoin(posts, Mysql.Query.eq(users.id, posts.userId))
    )

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported mysql full join"
    )
  })

  test("rejects mutation returning projections instead of rendering unsupported mysql sql", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    const plan = Mysql.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }).pipe(
      Mysql.Query.returning({
        id: users.id
      })
    )

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported mysql returning"
    )
  })

  test("rejects postgres-only truncate options instead of rendering unsupported mysql sql", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    const plan = Mysql.Query.truncate(users, {
      restartIdentity: true,
      cascade: true
    })

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported mysql truncate options"
    )
  })

  test("rejects generateSeries sources instead of rendering unsupported table-function sql", () => {
    const series = Mysql.Query.generateSeries(1, 3, 1, "series")

    const plan = Mysql.Query.select({
      value: series.value
    }).pipe(
      Mysql.Query.from(series)
    )

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported table function source for SQL rendering"
    )
  })
})
