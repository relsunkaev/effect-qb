import { describe, expect, test } from "bun:test"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"

const pgUsers = Postgres.Table.make("users", {
  id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
  email: Postgres.Column.text()
})

const pgPosts = Postgres.Table.make("posts", {
  id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
  userId: Postgres.Column.uuid(),
  title: Postgres.Column.text()
})

const mysqlUsers = Mysql.Table.make("users", {
  id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
  email: Mysql.Column.text()
})

const mysqlPosts = Mysql.Table.make("posts", {
  id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
  userId: Mysql.Column.uuid(),
  title: Mysql.Column.text()
})

describe("select sources behavior", () => {
  test("renders set-op all variants in postgres", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })
    const archivedUsers = Postgres.Table.make("archived_users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const active = Postgres.Query.select({
      email: users.email
    }).pipe(
      Postgres.Query.from(users)
    )
    const archived = Postgres.Query.select({
      email: archivedUsers.email
    }).pipe(
      Postgres.Query.from(archivedUsers)
    )

    expect(Postgres.Renderer.make().render(Postgres.Query.unionAll(active, archived)).sql).toBe(
      '(select "users"."email" as "email" from "public"."users") union all (select "archived_users"."email" as "email" from "public"."archived_users")'
    )
    expect(Postgres.Renderer.make().render(Postgres.Query.intersectAll(active, archived)).sql).toBe(
      '(select "users"."email" as "email" from "public"."users") intersect all (select "archived_users"."email" as "email" from "public"."archived_users")'
    )
    expect(Postgres.Renderer.make().render(Postgres.Query.exceptAll(active, archived)).sql).toBe(
      '(select "users"."email" as "email" from "public"."users") except all (select "archived_users"."email" as "email" from "public"."archived_users")'
    )
  })

  test("renders standalone values, unnest, and generate series sources in postgres", () => {
    const valuesSource = Postgres.Query.values([
      { id: Postgres.Query.literal(1), email: Postgres.Query.literal("alice@example.com") },
      { id: Postgres.Query.literal(2), email: Postgres.Query.literal("bob@example.com") }
    ] as const).pipe(Postgres.Query.as("seed"))

    const unnestSource = Postgres.Query.unnest({
      id: [Postgres.Query.literal(1), Postgres.Query.literal(2)] as const,
      email: [Postgres.Query.literal("alice@example.com"), Postgres.Query.literal("bob@example.com")] as const
    }, "seed_rows")

    const seriesSource = Postgres.Query.generateSeries(1, 3, 1, "series")

    expect(Postgres.Renderer.make().render(
      Postgres.Query.select({
        id: valuesSource.id,
        email: valuesSource.email
      }).pipe(Postgres.Query.from(valuesSource))
    ).sql).toBe(
      'select "seed"."id" as "id", "seed"."email" as "email" from (select $1 as "id", $2 as "email" union all select $3 as "id", $4 as "email") as "seed"("id", "email")'
    )

    expect(Postgres.Renderer.make().render(
      Postgres.Query.select({
        id: unnestSource.id,
        email: unnestSource.email
      }).pipe(Postgres.Query.from(unnestSource))
    ).sql).toBe(
      'select "seed_rows"."id" as "id", "seed_rows"."email" as "email" from (select $1 as "id", $2 as "email" union all select $3 as "id", $4 as "email") as "seed_rows"("id", "email")'
    )

    expect(Postgres.Renderer.make().render(
      Postgres.Query.select({
        value: seriesSource.value
      }).pipe(Postgres.Query.from(seriesSource))
    ).sql).toBe(
      'select "series"."value" as "value" from generate_series($1, $2, $3) as "series"("value")'
    )
  })

  test("renders standalone values and unnest sources in mysql", () => {
    const valuesSource = Mysql.Query.values([
      { id: Mysql.Query.literal(1), email: Mysql.Query.literal("alice@example.com") },
      { id: Mysql.Query.literal(2), email: Mysql.Query.literal("bob@example.com") }
    ] as const).pipe(Mysql.Query.as("seed"))

    const unnestSource = Mysql.Query.unnest({
      id: [Mysql.Query.literal(1), Mysql.Query.literal(2)] as const,
      email: [Mysql.Query.literal("alice@example.com"), Mysql.Query.literal("bob@example.com")] as const
    }, "seed_rows")

    expect(Mysql.Renderer.make().render(
      Mysql.Query.select({
        id: valuesSource.id,
        email: valuesSource.email
      }).pipe(Mysql.Query.from(valuesSource))
    ).sql).toBe(
      'select `seed`.`id` as `id`, `seed`.`email` as `email` from (select ? as `id`, ? as `email` union all select ? as `id`, ? as `email`) as `seed`(`id`, `email`)'
    )

    expect(Mysql.Renderer.make().render(
      Mysql.Query.select({
        id: unnestSource.id,
        email: unnestSource.email
      }).pipe(Mysql.Query.from(unnestSource))
    ).sql).toBe(
      'select `seed_rows`.`id` as `id`, `seed_rows`.`email` as `email` from (select ? as `id`, ? as `email` union all select ? as `id`, ? as `email`) as `seed_rows`(`id`, `email`)'
    )
  })

  test("renders scalar and quantified subqueries in postgres", () => {
    const postIds = Postgres.Query.select({
      value: pgPosts.id
    }).pipe(
      Postgres.Query.from(pgPosts)
    )

    const scalarPlan = Postgres.Query.select({
      userId: pgUsers.id,
      firstPostId: Postgres.Query.scalar(postIds),
      matchesAny: Postgres.Query.inSubquery(pgUsers.id, postIds),
      matchesSome: Postgres.Query.compareAny(pgUsers.id, postIds, "eq"),
      matchesAll: Postgres.Query.compareAll(pgUsers.id, postIds, "eq")
    }).pipe(
      Postgres.Query.from(pgUsers)
    )

    expect(Postgres.Renderer.make().render(scalarPlan).sql).toBe(
      'select "users"."id" as "userId", (select "posts"."id" as "value" from "public"."posts") as "firstPostId", ("users"."id" in (select "posts"."id" as "value" from "public"."posts")) as "matchesAny", ("users"."id" = any (select "posts"."id" as "value" from "public"."posts")) as "matchesSome", ("users"."id" = all (select "posts"."id" as "value" from "public"."posts")) as "matchesAll" from "public"."users"'
    )
  })

  test("renders scalar and quantified subqueries in mysql", () => {
    const postIds = Mysql.Query.select({
      value: mysqlPosts.id
    }).pipe(
      Mysql.Query.from(mysqlPosts)
    )

    const scalarPlan = Mysql.Query.select({
      userId: mysqlUsers.id,
      firstPostId: Mysql.Query.scalar(postIds),
      matchesAny: Mysql.Query.inSubquery(mysqlUsers.id, postIds),
      matchesSome: Mysql.Query.compareAny(mysqlUsers.id, postIds, "eq"),
      matchesAll: Mysql.Query.compareAll(mysqlUsers.id, postIds, "eq")
    }).pipe(
      Mysql.Query.from(mysqlUsers)
    )

    expect(Mysql.Renderer.make().render(scalarPlan).sql).toBe(
      'select `users`.`id` as `userId`, (select `posts`.`id` as `value` from `posts`) as `firstPostId`, (`users`.`id` in (select `posts`.`id` as `value` from `posts`)) as `matchesAny`, (`users`.`id` = any (select `posts`.`id` as `value` from `posts`)) as `matchesSome`, (`users`.`id` = all (select `posts`.`id` as `value` from `posts`)) as `matchesAll` from `users`'
    )
  })
})
