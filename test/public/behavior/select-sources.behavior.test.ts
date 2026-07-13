import { describe, expect, test } from "bun:test"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import { unsafeAny } from "../../helpers/unsafe.ts"
import * as StdRoot from "#standard"

const pgUsers = StdRoot.Table.make("users", {
  id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
  email: StdRoot.Column.text()
})

const pgPosts = StdRoot.Table.make("posts", {
  id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
  userId: StdRoot.Column.uuid(),
  title: StdRoot.Column.text()
})

const mysqlUsers = StdRoot.Table.make("users", {
  id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
  email: StdRoot.Column.text()
})

const mysqlPosts = StdRoot.Table.make("posts", {
  id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
  userId: StdRoot.Column.uuid(),
  title: StdRoot.Column.text()
})

const renderPostgres = (plan: unknown) => Postgres.Renderer.make().render(unsafeAny(plan))
const renderMysql = (plan: unknown) => Mysql.Renderer.make().render(unsafeAny(plan))

describe("select sources behavior", () => {
  test("renders set-op all variants in postgres", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const archivedUsers = StdRoot.Table.make("archived_users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const active = StdRoot.Query.select({
      email: users.email
    }).pipe(
      StdRoot.Query.from(users)
    )
    const archived = StdRoot.Query.select({
      email: archivedUsers.email
    }).pipe(
      StdRoot.Query.from(archivedUsers)
    )

    expect(renderPostgres(StdRoot.Query.unionAll(unsafeAny(active), unsafeAny(archived))).sql).toBe(
      '(select "users"."email" as "email" from "users") union all (select "archived_users"."email" as "email" from "archived_users")'
    )
    expect(renderPostgres(StdRoot.Query.intersectAll(unsafeAny(active), unsafeAny(archived))).sql).toBe(
      '(select "users"."email" as "email" from "users") intersect all (select "archived_users"."email" as "email" from "archived_users")'
    )
    expect(renderPostgres(StdRoot.Query.exceptAll(unsafeAny(active), unsafeAny(archived))).sql).toBe(
      '(select "users"."email" as "email" from "users") except all (select "archived_users"."email" as "email" from "archived_users")'
    )
  })

  test("renders standalone values, unnest, and generate series sources in postgres", () => {
    const valuesSource = StdRoot.Query.values([
      { id: StdRoot.Query.literal(1), email: StdRoot.Query.literal("alice@example.com") },
      { id: StdRoot.Query.literal(2), email: StdRoot.Query.literal("bob@example.com") }
    ] as const).pipe(StdRoot.Query.as("seed"))

    const unnestSource = StdRoot.Query.unnest({
      id: [StdRoot.Query.literal(1), StdRoot.Query.literal(2)] as const,
      email: [StdRoot.Query.literal("alice@example.com"), StdRoot.Query.literal("bob@example.com")] as const
    }, "seed_rows")

    const seriesSource = Postgres.Query.generateSeries(1, 3, 1, "series")

    expect(renderPostgres(
      StdRoot.Query.select({
        id: valuesSource.id,
        email: valuesSource.email
      }).pipe(StdRoot.Query.from(valuesSource))
    ).sql).toBe(
      'select "seed"."id" as "id", "seed"."email" as "email" from (select $1 as "id", $2 as "email" union all select $3 as "id", $4 as "email") as "seed"("id", "email")'
    )

    expect(renderPostgres(
      StdRoot.Query.select({
        id: unnestSource.id,
        email: unnestSource.email
      }).pipe(StdRoot.Query.from(unnestSource))
    ).sql).toBe(
      'select "seed_rows"."id" as "id", "seed_rows"."email" as "email" from (select $1 as "id", $2 as "email" union all select $3 as "id", $4 as "email") as "seed_rows"("id", "email")'
    )

    expect(renderPostgres(
      StdRoot.Query.select({
        value: seriesSource.value
      }).pipe(StdRoot.Query.from(seriesSource))
    ).sql).toBe(
      'select "series"."value" as "value" from generate_series($1, $2, $3) as "series"("value")'
    )
  })

  test("rejects NaN postgres generateSeries arguments", () => {
    const renderSeries = (series: ReturnType<typeof Postgres.Query.generateSeries>) =>
      renderPostgres(StdRoot.Query.select({
        value: series.value
      }).pipe(StdRoot.Query.from(series)))

    expect(() =>
      renderSeries(Postgres.Query.generateSeries(Number.NaN, 3, 1, "bad_start"))
    ).toThrow("Expected a finite numeric value")
    expect(() =>
      renderSeries(Postgres.Query.generateSeries(1, Number.NaN, 1, "bad_stop"))
    ).toThrow("Expected a finite numeric value")
    expect(() =>
      renderSeries(Postgres.Query.generateSeries(1, 3, Number.NaN, "bad_step"))
    ).toThrow("Expected a finite numeric value")
  })

  test("renders postgres values rows by column name when row property order differs", () => {
    const valuesSource = StdRoot.Query.values([
      { id: StdRoot.Query.literal(1), email: StdRoot.Query.literal("alice@example.com") },
      { email: StdRoot.Query.literal("bob@example.com"), id: StdRoot.Query.literal(2) }
    ] as const).pipe(StdRoot.Query.as("seed"))

    const rendered = renderPostgres(
      StdRoot.Query.select({
        id: valuesSource.id,
        email: valuesSource.email
      }).pipe(StdRoot.Query.from(valuesSource))
    )

    expect(rendered.sql).toBe(
      'select "seed"."id" as "id", "seed"."email" as "email" from (select $1 as "id", $2 as "email" union all select $3 as "id", $4 as "email") as "seed"("id", "email")'
    )
    expect(rendered.params).toEqual([1, "alice@example.com", 2, "bob@example.com"])
  })

  test("renders standalone values and unnest sources in mysql", () => {
    const valuesSource = StdRoot.Query.values([
      { id: StdRoot.Query.literal(1), email: StdRoot.Query.literal("alice@example.com") },
      { id: StdRoot.Query.literal(2), email: StdRoot.Query.literal("bob@example.com") }
    ] as const).pipe(StdRoot.Query.as("seed"))

    const unnestSource = StdRoot.Query.unnest({
      id: [StdRoot.Query.literal(1), StdRoot.Query.literal(2)] as const,
      email: [StdRoot.Query.literal("alice@example.com"), StdRoot.Query.literal("bob@example.com")] as const
    }, "seed_rows")

    expect(renderMysql(
      StdRoot.Query.select({
        id: valuesSource.id,
        email: valuesSource.email
      }).pipe(StdRoot.Query.from(valuesSource))
    ).sql).toBe(
      'select `seed`.`id` as `id`, `seed`.`email` as `email` from (select ? as `id`, ? as `email` union all select ? as `id`, ? as `email`) as `seed`(`id`, `email`)'
    )

    expect(renderMysql(
      StdRoot.Query.select({
        id: unnestSource.id,
        email: unnestSource.email
      }).pipe(StdRoot.Query.from(unnestSource))
    ).sql).toBe(
      'select `seed_rows`.`id` as `id`, `seed_rows`.`email` as `email` from (select ? as `id`, ? as `email` union all select ? as `id`, ? as `email`) as `seed_rows`(`id`, `email`)'
    )
  })

  test("renders mysql values rows by column name when row property order differs", () => {
    const valuesSource = StdRoot.Query.values([
      { id: StdRoot.Query.literal(1), email: StdRoot.Query.literal("alice@example.com") },
      { email: StdRoot.Query.literal("bob@example.com"), id: StdRoot.Query.literal(2) }
    ] as const).pipe(StdRoot.Query.as("seed"))

    const rendered = renderMysql(
      StdRoot.Query.select({
        id: valuesSource.id,
        email: valuesSource.email
      }).pipe(StdRoot.Query.from(valuesSource))
    )

    expect(rendered.sql).toBe(
      "select `seed`.`id` as `id`, `seed`.`email` as `email` from (select ? as `id`, ? as `email` union all select ? as `id`, ? as `email`) as `seed`(`id`, `email`)"
    )
    expect(rendered.params).toEqual([1, "alice@example.com", 2, "bob@example.com"])
  })

  test("renders scalar and quantified subqueries in postgres", () => {
    const postIds = StdRoot.Query.select({
      value: pgPosts.id
    }).pipe(
      StdRoot.Query.from(pgPosts)
    )

    const scalarPlan = StdRoot.Query.select({
      userId: pgUsers.id,
      firstPostId: StdRoot.Query.scalar(postIds),
      matchesAny: StdRoot.Query.inSubquery(pgUsers.id, postIds),
      matchesSome: StdRoot.Query.compareAny(pgUsers.id, postIds, "eq"),
      matchesAll: StdRoot.Query.compareAll(pgUsers.id, postIds, "eq")
    }).pipe(
      StdRoot.Query.from(pgUsers)
    )

    expect(renderPostgres(scalarPlan).sql).toBe(
      'select "users"."id" as "userId", (select "posts"."id" as "value" from "posts") as "firstPostId", ("users"."id" in (select "posts"."id" as "value" from "posts")) as "matchesAny", ("users"."id" = any (select "posts"."id" as "value" from "posts")) as "matchesSome", ("users"."id" = all (select "posts"."id" as "value" from "posts")) as "matchesAll" from "users"'
    )
  })

  test("rejects mutation plans in subquery expressions before rendering invalid nested sql", () => {
    const insertPlan = StdRoot.Query.insert(pgUsers, {
      id: "11111111-1111-4111-8111-111111111111",
      email: "alice@example.com"
    })
    const plan = StdRoot.Query.select({
      inserted: StdRoot.Query.exists(unsafeAny(insertPlan))
    })

    expect(() => renderPostgres(plan)).toThrow(
      "subquery expressions only accept select-like query plans"
    )
  })

  test("groups by quantified subquery expressions in postgres", () => {
    const postIds = StdRoot.Query.select({
      value: pgPosts.id
    }).pipe(
      StdRoot.Query.from(pgPosts)
    )
    const matchesAny = StdRoot.Query.inSubquery(pgUsers.id, postIds)

    const plan = StdRoot.Query.select({
      matchesAny,
      userCount: StdRoot.Function.count(pgUsers.id)
    }).pipe(
      StdRoot.Query.from(pgUsers),
      StdRoot.Query.groupBy(matchesAny)
    )

    expect(renderPostgres(plan).sql).toBe(
      'select ("users"."id" in (select "posts"."id" as "value" from "posts")) as "matchesAny", count("users"."id") as "userCount" from "users" group by ("users"."id" in (select "posts"."id" as "value" from "posts"))'
    )
  })

  test("renders common table expressions before referencing cte sources", () => {
    const activePosts = StdRoot.Query.select({
      userId: pgPosts.userId,
      title: pgPosts.title
    }).pipe(
      StdRoot.Query.from(pgPosts),
      StdRoot.Query.where(StdRoot.Query.isNotNull(pgPosts.title)),
      StdRoot.Query.with("active_posts")
    )

    const plan = StdRoot.Query.select({
      email: pgUsers.email,
      title: activePosts.title
    }).pipe(
      StdRoot.Query.from(pgUsers),
      StdRoot.Query.innerJoin(activePosts, StdRoot.Query.eq(pgUsers.id, activePosts.userId))
    )

    expect(renderPostgres(plan).sql).toBe(
      'with "active_posts" as (select "posts"."userId" as "userId", "posts"."title" as "title" from "posts" where ("posts"."title" is not null)) select "users"."email" as "email", "active_posts"."title" as "title" from "users" inner join "active_posts" on ("users"."id" = "active_posts"."userId")'
    )
  })

  test("renders nested common table expressions once at the outer query", () => {
    const postTitles = StdRoot.Query.select({
      userId: pgPosts.userId,
      title: pgPosts.title
    }).pipe(
      StdRoot.Query.from(pgPosts),
      StdRoot.Query.with("post_titles")
    )
    const activeTitles = StdRoot.Query.select({
      userId: postTitles.userId,
      title: postTitles.title
    }).pipe(
      StdRoot.Query.from(postTitles),
      StdRoot.Query.where(StdRoot.Query.isNotNull(postTitles.title)),
      StdRoot.Query.with("active_titles")
    )

    const plan = StdRoot.Query.select({
      title: activeTitles.title
    }).pipe(
      StdRoot.Query.from(activeTitles)
    )

    expect(renderPostgres(plan).sql).toBe(
      'with "post_titles" as (select "posts"."userId" as "userId", "posts"."title" as "title" from "posts"), "active_titles" as (select "post_titles"."userId" as "userId", "post_titles"."title" as "title" from "post_titles" where ("post_titles"."title" is not null)) select "active_titles"."title" as "title" from "active_titles"'
    )
  })

  test("rejects nested ctes that shadow an outer cte name with a different plan", () => {
    const outerItems = StdRoot.Query.select({
      id: pgUsers.id,
      email: pgUsers.email
    }).pipe(
      StdRoot.Query.from(pgUsers),
      StdRoot.Query.with("shared_items")
    )
    const innerItems = StdRoot.Query.select({
      postId: pgPosts.id,
      title: pgPosts.title
    }).pipe(
      StdRoot.Query.from(pgPosts),
      StdRoot.Query.with("shared_items")
    )
    const postItems = StdRoot.Query.select({
      postId: innerItems.postId,
      title: innerItems.title
    }).pipe(
      StdRoot.Query.from(innerItems),
      StdRoot.Query.as("post_items")
    )

    const plan = StdRoot.Query.select({
      email: outerItems.email,
      title: postItems.title
    }).pipe(
      StdRoot.Query.from(outerItems),
      StdRoot.Query.crossJoin(postItems)
    )

    expect(() => renderPostgres(plan)).toThrow(
      "common table expression name is already registered with a different plan: shared_items"
    )
  })

  test("renders nested mysql common table expressions once at the outer query", () => {
    const postTitles = StdRoot.Query.select({
      userId: mysqlPosts.userId,
      title: mysqlPosts.title
    }).pipe(
      StdRoot.Query.from(mysqlPosts),
      StdRoot.Query.with("post_titles")
    )
    const activeTitles = StdRoot.Query.select({
      userId: postTitles.userId,
      title: postTitles.title
    }).pipe(
      StdRoot.Query.from(postTitles),
      StdRoot.Query.where(StdRoot.Query.isNotNull(postTitles.title)),
      StdRoot.Query.with("active_titles")
    )

    const plan = StdRoot.Query.select({
      title: activeTitles.title
    }).pipe(
      StdRoot.Query.from(activeTitles)
    )

    expect(renderMysql(plan).sql).toBe(
      "with `post_titles` as (select `posts`.`userId` as `userId`, `posts`.`title` as `title` from `posts`), `active_titles` as (select `post_titles`.`userId` as `userId`, `post_titles`.`title` as `title` from `post_titles` where (`post_titles`.`title` is not null)) select `active_titles`.`title` as `title` from `active_titles`"
    )
  })

  test("renders lateral joins after their required outer sources are in scope", () => {
    const lateralPosts = StdRoot.Query.select({
      postId: pgPosts.id,
      userId: pgPosts.userId
    }).pipe(
      StdRoot.Query.from(pgPosts),
      StdRoot.Query.where(StdRoot.Query.eq(pgPosts.userId, pgUsers.id)),
      StdRoot.Query.lateral("user_posts")
    )

    const plan = StdRoot.Query.select({
      email: pgUsers.email,
      postId: lateralPosts.postId
    }).pipe(
      StdRoot.Query.from(pgUsers),
      StdRoot.Query.innerJoin(lateralPosts, StdRoot.Query.eq(lateralPosts.userId, pgUsers.id))
    )

    expect(renderPostgres(plan).sql).toBe(
      'select "users"."email" as "email", "user_posts"."postId" as "postId" from "users" inner join lateral (select "posts"."id" as "postId", "posts"."userId" as "userId" from "posts" where ("posts"."userId" = "users"."id")) as "user_posts" on ("user_posts"."userId" = "users"."id")'
    )
  })

  test("renders scalar and quantified subqueries in mysql", () => {
    const postIds = StdRoot.Query.select({
      value: mysqlPosts.id
    }).pipe(
      StdRoot.Query.from(mysqlPosts)
    )

    const scalarPlan = StdRoot.Query.select({
      userId: mysqlUsers.id,
      firstPostId: StdRoot.Query.scalar(postIds),
      matchesAny: StdRoot.Query.inSubquery(mysqlUsers.id, postIds),
      matchesSome: StdRoot.Query.compareAny(mysqlUsers.id, postIds, "eq"),
      matchesAll: StdRoot.Query.compareAll(mysqlUsers.id, postIds, "eq")
    }).pipe(
      StdRoot.Query.from(mysqlUsers)
    )

    expect(renderMysql(scalarPlan).sql).toBe(
      'select `users`.`id` as `userId`, (select `posts`.`id` as `value` from `posts`) as `firstPostId`, (`users`.`id` in (select `posts`.`id` as `value` from `posts`)) as `matchesAny`, (`users`.`id` = any (select `posts`.`id` as `value` from `posts`)) as `matchesSome`, (`users`.`id` = all (select `posts`.`id` as `value` from `posts`)) as `matchesAll` from `users`'
    )
  })
})
