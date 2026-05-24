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

    expect(renderPostgres(Postgres.Query.unionAll(unsafeAny(active), unsafeAny(archived))).sql).toBe(
      '(select "users"."email" as "email" from "users") union all (select "archived_users"."email" as "email" from "archived_users")'
    )
    expect(renderPostgres(Postgres.Query.intersectAll(unsafeAny(active), unsafeAny(archived))).sql).toBe(
      '(select "users"."email" as "email" from "users") intersect all (select "archived_users"."email" as "email" from "archived_users")'
    )
    expect(renderPostgres(Postgres.Query.exceptAll(unsafeAny(active), unsafeAny(archived))).sql).toBe(
      '(select "users"."email" as "email" from "users") except all (select "archived_users"."email" as "email" from "archived_users")'
    )
  })

  test("rejects runtime set operators with mismatched result rows", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid()
    })

    const usersByEmail = Postgres.Query.select({
      email: users.email
    }).pipe(Postgres.Query.from(users))
    const postsById = Postgres.Query.select({
      postId: posts.id
    }).pipe(Postgres.Query.from(posts))

    expect(() => renderPostgres(Postgres.Query.union(unsafeAny(usersByEmail), unsafeAny(postsById)))).toThrow(
      "set operator operands must have matching result rows"
    )
  })

  test("rejects runtime set operators with dotted path collisions", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const nested = Postgres.Query.select({
      profile: {
        email: users.email
      }
    }).pipe(Postgres.Query.from(users))

    const dotted = Postgres.Query.select({
      "profile.email": users.email
    }).pipe(Postgres.Query.from(users))

    expect(() => renderPostgres(Postgres.Query.union(unsafeAny(nested), unsafeAny(dotted)))).toThrow(
      "set operator operands must have matching result rows"
    )
  })

  test("rejects incomplete set operator operands before rendering invalid nested sql", () => {
    const complete = Postgres.Query.select({
      id: pgUsers.id
    }).pipe(Postgres.Query.from(pgUsers))
    const incomplete = Postgres.Query.select({
      id: pgUsers.id
    })

    expect(() => renderPostgres(Postgres.Query.union(complete, unsafeAny(incomplete)))).toThrow(
      "query references sources that are not yet in scope: users"
    )

    expect(() => renderPostgres(Postgres.Query.union(unsafeAny(incomplete), complete))).toThrow(
      "query references sources that are not yet in scope: users"
    )
  })

  test("rejects mutation plans as set operator operands", () => {
    const selected = Postgres.Query.select({
      email: pgUsers.email
    }).pipe(Postgres.Query.from(pgUsers))
    const inserted = Postgres.Query.insert(pgUsers, {
      id: "11111111-1111-1111-1111-111111111111",
      email: "alice@example.com"
    }).pipe(
      Postgres.Query.returning({
        email: pgUsers.email
      })
    )

    expect(() => Postgres.Query.union(unsafeAny(inserted), selected)).toThrow(
      "set operator operands only accept select-like query plans"
    )
    expect(() => Postgres.Query.union(selected, unsafeAny(inserted))).toThrow(
      "set operator operands only accept select-like query plans"
    )
  })

  test("rejects query modifiers on set operator plans instead of ignoring them", () => {
    const active = Postgres.Query.select({
      email: pgUsers.email
    }).pipe(Postgres.Query.from(pgUsers))
    const archived = Postgres.Query.select({
      email: pgUsers.email
    }).pipe(Postgres.Query.from(pgUsers))
    const setPlan = Postgres.Query.unionAll(active, archived)

    expect(() =>
      renderPostgres(Postgres.Query.distinct()(unsafeAny(setPlan)))
    ).toThrow("distinct(...) is not supported for set statements")

    expect(() =>
      renderPostgres(Postgres.Query.limit(1)(unsafeAny(setPlan)))
    ).toThrow("limit(...) is not supported for set statements")

    expect(() =>
      renderPostgres(Postgres.Query.orderBy(Postgres.Query.literal(1))(unsafeAny(setPlan)))
    ).toThrow("orderBy(...) is not supported for set statements")
  })

  test("rejects duplicate source names before rendering ambiguous joins", () => {
    expect(() =>
      Postgres.Query.select({
        id: pgUsers.id
      }).pipe(
        Postgres.Query.from(pgUsers),
        Postgres.Query.innerJoin(pgUsers, Postgres.Query.eq(pgUsers.id, pgUsers.id))
      )
    ).toThrow("query source name is already in scope: users")
  })

  test("rejects replacing a select from source with another from source", () => {
    const sourced = Postgres.Query.select({
      id: pgUsers.id
    }).pipe(
      Postgres.Query.from(pgUsers)
    )

    expect(() => Postgres.Query.from(pgPosts)(unsafeAny(sourced))).toThrow(
      "select statements accept only one from(...) source; use joins for additional sources"
    )
  })

  test("rejects select joins before a base from source exists", () => {
    const joinOnly = Postgres.Query.select({
      id: pgPosts.id
    })

    expect(() => Postgres.Query.crossJoin(pgPosts)(unsafeAny(joinOnly))).toThrow(
      "select joins require a from(...) source before joining"
    )

    expect(() => Postgres.Query.innerJoin(pgPosts, true)(unsafeAny(joinOnly))).toThrow(
      "select joins require a from(...) source before joining"
    )
  })

  test("rejects structurally incomplete source-like objects", () => {
    const fakeSource = {
      name: "users",
      baseName: "users"
    }
    const fakeDerivedSource = {
      kind: "derived",
      name: "users",
      baseName: "users"
    }

    expect(() =>
      Postgres.Query.select({
        id: pgUsers.id
      }).pipe(
        Postgres.Query.from(unsafeAny(fakeSource))
      )
    ).toThrow("from(...) requires an aliased source in select/update statements")

    expect(() =>
      Postgres.Query.select({
        id: pgUsers.id
      }).pipe(
        Postgres.Query.from(unsafeAny(fakeDerivedSource))
      )
    ).toThrow("from(...) requires an aliased source in select/update statements")

    expect(() =>
      Postgres.Query.select({
        id: pgUsers.id
      }).pipe(
        Postgres.Query.from(pgUsers),
        Postgres.Query.crossJoin(unsafeAny(fakeSource))
      )
    ).toThrow("join(...) requires an aliased source in select/update/delete statements")
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

    expect(renderPostgres(
      Postgres.Query.select({
        id: valuesSource.id,
        email: valuesSource.email
      }).pipe(Postgres.Query.from(valuesSource))
    ).sql).toBe(
      'select "seed"."id" as "id", "seed"."email" as "email" from (select $1 as "id", $2 as "email" union all select $3 as "id", $4 as "email") as "seed"("id", "email")'
    )

    expect(renderPostgres(
      Postgres.Query.select({
        id: unnestSource.id,
        email: unnestSource.email
      }).pipe(Postgres.Query.from(unnestSource))
    ).sql).toBe(
      'select "seed_rows"."id" as "id", "seed_rows"."email" as "email" from (select $1 as "id", $2 as "email" union all select $3 as "id", $4 as "email") as "seed_rows"("id", "email")'
    )

    expect(renderPostgres(
      Postgres.Query.select({
        value: seriesSource.value
      }).pipe(Postgres.Query.from(seriesSource))
    ).sql).toBe(
      'select "series"."value" as "value" from generate_series($1, $2, $3) as "series"("value")'
    )
  })

  test("rejects NaN postgres generateSeries arguments", () => {
    const renderSeries = (series: ReturnType<typeof Postgres.Query.generateSeries>) =>
      renderPostgres(Postgres.Query.select({
        value: series.value
      }).pipe(Postgres.Query.from(series)))

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
    const valuesSource = Postgres.Query.values([
      { id: Postgres.Query.literal(1), email: Postgres.Query.literal("alice@example.com") },
      { email: Postgres.Query.literal("bob@example.com"), id: Postgres.Query.literal(2) }
    ] as const).pipe(Postgres.Query.as("seed"))

    const rendered = renderPostgres(
      Postgres.Query.select({
        id: valuesSource.id,
        email: valuesSource.email
      }).pipe(Postgres.Query.from(valuesSource))
    )

    expect(rendered.sql).toBe(
      'select "seed"."id" as "id", "seed"."email" as "email" from (select $1 as "id", $2 as "email" union all select $3 as "id", $4 as "email") as "seed"("id", "email")'
    )
    expect(rendered.params).toEqual([1, "alice@example.com", 2, "bob@example.com"])
  })

  test("rejects postgres values rows with no projected columns", () => {
    expect(() => Postgres.Query.values([{}] as const)).toThrow(
      "values(...) rows must specify at least one column"
    )
  })

  test("rejects invalid postgres unnest column arrays", () => {
    expect(() => Postgres.Query.unnest(unsafeAny({
      id: []
    }), "empty_seed_rows")).toThrow("unnest(...) requires at least one row")

    expect(() => Postgres.Query.unnest(unsafeAny({
      id: Postgres.Query.literal(1)
    }), "not_array_seed_rows")).toThrow("unnest(...) expects every value to be an array")
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

    expect(renderMysql(
      Mysql.Query.select({
        id: valuesSource.id,
        email: valuesSource.email
      }).pipe(Mysql.Query.from(valuesSource))
    ).sql).toBe(
      'select `seed`.`id` as `id`, `seed`.`email` as `email` from (select ? as `id`, ? as `email` union all select ? as `id`, ? as `email`) as `seed`(`id`, `email`)'
    )

    expect(renderMysql(
      Mysql.Query.select({
        id: unnestSource.id,
        email: unnestSource.email
      }).pipe(Mysql.Query.from(unnestSource))
    ).sql).toBe(
      'select `seed_rows`.`id` as `id`, `seed_rows`.`email` as `email` from (select ? as `id`, ? as `email` union all select ? as `id`, ? as `email`) as `seed_rows`(`id`, `email`)'
    )
  })

  test("renders mysql values rows by column name when row property order differs", () => {
    const valuesSource = Mysql.Query.values([
      { id: Mysql.Query.literal(1), email: Mysql.Query.literal("alice@example.com") },
      { email: Mysql.Query.literal("bob@example.com"), id: Mysql.Query.literal(2) }
    ] as const).pipe(Mysql.Query.as("seed"))

    const rendered = renderMysql(
      Mysql.Query.select({
        id: valuesSource.id,
        email: valuesSource.email
      }).pipe(Mysql.Query.from(valuesSource))
    )

    expect(rendered.sql).toBe(
      "select `seed`.`id` as `id`, `seed`.`email` as `email` from (select ? as `id`, ? as `email` union all select ? as `id`, ? as `email`) as `seed`(`id`, `email`)"
    )
    expect(rendered.params).toEqual([1, "alice@example.com", 2, "bob@example.com"])
  })

  test("rejects mysql values rows with no projected columns", () => {
    expect(() => Mysql.Query.values([{}] as const)).toThrow(
      "values(...) rows must specify at least one column"
    )
  })

  test("rejects invalid mysql unnest column arrays", () => {
    expect(() => Mysql.Query.unnest(unsafeAny({
      id: []
    }), "empty_seed_rows")).toThrow("unnest(...) requires at least one row")

    expect(() => Mysql.Query.unnest(unsafeAny({
      id: Mysql.Query.literal(1)
    }), "not_array_seed_rows")).toThrow("unnest(...) expects every value to be an array")
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

    expect(renderPostgres(scalarPlan).sql).toBe(
      'select "users"."id" as "userId", (select "posts"."id" as "value" from "posts") as "firstPostId", ("users"."id" in (select "posts"."id" as "value" from "posts")) as "matchesAny", ("users"."id" = any (select "posts"."id" as "value" from "posts")) as "matchesSome", ("users"."id" = all (select "posts"."id" as "value" from "posts")) as "matchesAll" from "users"'
    )
  })

  test("rejects mutation plans in subquery expressions before rendering invalid nested sql", () => {
    const insertPlan = Postgres.Query.insert(pgUsers, {
      id: "11111111-1111-1111-1111-111111111111",
      email: "alice@example.com"
    })
    const plan = Postgres.Query.select({
      inserted: Postgres.Query.exists(unsafeAny(insertPlan))
    })

    expect(() => renderPostgres(plan)).toThrow(
      "subquery expressions only accept select-like query plans"
    )
  })

  test("groups by quantified subquery expressions in postgres", () => {
    const postIds = Postgres.Query.select({
      value: pgPosts.id
    }).pipe(
      Postgres.Query.from(pgPosts)
    )
    const matchesAny = Postgres.Query.inSubquery(pgUsers.id, postIds)

    const plan = Postgres.Query.select({
      matchesAny,
      userCount: Postgres.Function.count(pgUsers.id)
    }).pipe(
      Postgres.Query.from(pgUsers),
      Postgres.Query.groupBy(matchesAny)
    )

    expect(renderPostgres(plan).sql).toBe(
      'select ("users"."id" in (select "posts"."id" as "value" from "posts")) as "matchesAny", count("users"."id") as "userCount" from "users" group by ("users"."id" in (select "posts"."id" as "value" from "posts"))'
    )
  })

  test("rejects derived source projection alias collisions", () => {
    const subquery = Postgres.Query.select({
      "user__id": pgUsers.id,
      user: {
        id: pgUsers.email
      }
    }).pipe(
      Postgres.Query.from(pgUsers)
    )

    expect(() => Postgres.Query.as(subquery, "u")).toThrow(
      "Duplicate projection alias: user__id"
    )
  })

  test("rejects incomplete derived and cte sources before rendering invalid nested sql", () => {
    const subquery = Postgres.Query.select({
      id: pgUsers.id
    })

    expect(() => Postgres.Query.as(unsafeAny(subquery), "missing_users")).toThrow(
      "query references sources that are not yet in scope: users"
    )

    expect(() => Postgres.Query.with("missing_users")(unsafeAny(subquery))).toThrow(
      "query references sources that are not yet in scope: users"
    )
  })

  test("rejects mutation plans as derived or lateral inline sources", () => {
    const mutation = Postgres.Query.insert(pgUsers, {
      id: "11111111-1111-1111-1111-111111111111",
      email: "alice@example.com"
    }).pipe(
      Postgres.Query.returning({
        id: pgUsers.id,
        email: pgUsers.email
      })
    )

    expect(() => Postgres.Query.as(unsafeAny(mutation), "inserted_users")).toThrow(
      "inline derived sources only accept select-like query plans"
    )

    expect(() => mutation.pipe(Postgres.Query.as("inserted_users"))).toThrow(
      "inline derived sources only accept select-like query plans"
    )

    expect(() => Postgres.Query.lateral("inserted_users")(unsafeAny(mutation))).toThrow(
      "inline derived sources only accept select-like query plans"
    )
  })

  test("renders common table expressions before referencing cte sources", () => {
    const activePosts = Postgres.Query.select({
      userId: pgPosts.userId,
      title: pgPosts.title
    }).pipe(
      Postgres.Query.from(pgPosts),
      Postgres.Query.where(Postgres.Query.isNotNull(pgPosts.title)),
      Postgres.Query.with("active_posts")
    )

    const plan = Postgres.Query.select({
      email: pgUsers.email,
      title: activePosts.title
    }).pipe(
      Postgres.Query.from(pgUsers),
      Postgres.Query.innerJoin(activePosts, Postgres.Query.eq(pgUsers.id, activePosts.userId))
    )

    expect(renderPostgres(plan).sql).toBe(
      'with "active_posts" as (select "posts"."userId" as "userId", "posts"."title" as "title" from "posts" where ("posts"."title" is not null)) select "users"."email" as "email", "active_posts"."title" as "title" from "users" inner join "active_posts" on ("users"."id" = "active_posts"."userId")'
    )
  })

  test("renders nested common table expressions once at the outer query", () => {
    const postTitles = Postgres.Query.select({
      userId: pgPosts.userId,
      title: pgPosts.title
    }).pipe(
      Postgres.Query.from(pgPosts),
      Postgres.Query.with("post_titles")
    )
    const activeTitles = Postgres.Query.select({
      userId: postTitles.userId,
      title: postTitles.title
    }).pipe(
      Postgres.Query.from(postTitles),
      Postgres.Query.where(Postgres.Query.isNotNull(postTitles.title)),
      Postgres.Query.with("active_titles")
    )

    const plan = Postgres.Query.select({
      title: activeTitles.title
    }).pipe(
      Postgres.Query.from(activeTitles)
    )

    expect(renderPostgres(plan).sql).toBe(
      'with "post_titles" as (select "posts"."userId" as "userId", "posts"."title" as "title" from "posts"), "active_titles" as (select "post_titles"."userId" as "userId", "post_titles"."title" as "title" from "post_titles" where ("post_titles"."title" is not null)) select "active_titles"."title" as "title" from "active_titles"'
    )
  })

  test("rejects nested ctes that shadow an outer cte name with a different plan", () => {
    const outerItems = Postgres.Query.select({
      id: pgUsers.id,
      email: pgUsers.email
    }).pipe(
      Postgres.Query.from(pgUsers),
      Postgres.Query.with("shared_items")
    )
    const innerItems = Postgres.Query.select({
      postId: pgPosts.id,
      title: pgPosts.title
    }).pipe(
      Postgres.Query.from(pgPosts),
      Postgres.Query.with("shared_items")
    )
    const postItems = Postgres.Query.select({
      postId: innerItems.postId,
      title: innerItems.title
    }).pipe(
      Postgres.Query.from(innerItems),
      Postgres.Query.as("post_items")
    )

    const plan = Postgres.Query.select({
      email: outerItems.email,
      title: postItems.title
    }).pipe(
      Postgres.Query.from(outerItems),
      Postgres.Query.crossJoin(postItems)
    )

    expect(() => renderPostgres(plan)).toThrow(
      "common table expression name is already registered with a different plan: shared_items"
    )
  })

  test("renders nested mysql common table expressions once at the outer query", () => {
    const postTitles = Mysql.Query.select({
      userId: mysqlPosts.userId,
      title: mysqlPosts.title
    }).pipe(
      Mysql.Query.from(mysqlPosts),
      Mysql.Query.with("post_titles")
    )
    const activeTitles = Mysql.Query.select({
      userId: postTitles.userId,
      title: postTitles.title
    }).pipe(
      Mysql.Query.from(postTitles),
      Mysql.Query.where(Mysql.Query.isNotNull(postTitles.title)),
      Mysql.Query.with("active_titles")
    )

    const plan = Mysql.Query.select({
      title: activeTitles.title
    }).pipe(
      Mysql.Query.from(activeTitles)
    )

    expect(renderMysql(plan).sql).toBe(
      "with `post_titles` as (select `posts`.`userId` as `userId`, `posts`.`title` as `title` from `posts`), `active_titles` as (select `post_titles`.`userId` as `userId`, `post_titles`.`title` as `title` from `post_titles` where (`post_titles`.`title` is not null)) select `active_titles`.`title` as `title` from `active_titles`"
    )
  })

  test("rejects lateral joins before their required outer sources", () => {
    const lateralPosts = Postgres.Query.select({
      postId: pgPosts.id,
      userId: pgPosts.userId
    }).pipe(
      Postgres.Query.from(pgPosts),
      Postgres.Query.where(Postgres.Query.eq(pgPosts.userId, pgUsers.id)),
      Postgres.Query.lateral("user_posts")
    )

    const plan = Postgres.Query.select({
      anchorId: pgPosts.id,
      postId: lateralPosts.postId
    }).pipe(
      Postgres.Query.from(pgPosts),
      Postgres.Query.innerJoin(unsafeAny(lateralPosts), Postgres.Query.eq(lateralPosts.userId, pgPosts.userId))
    )

    expect(() => renderPostgres(plan)).toThrow(
      "query references sources that are not yet in scope: users"
    )
  })

  test("renders lateral joins after their required outer sources are in scope", () => {
    const lateralPosts = Postgres.Query.select({
      postId: pgPosts.id,
      userId: pgPosts.userId
    }).pipe(
      Postgres.Query.from(pgPosts),
      Postgres.Query.where(Postgres.Query.eq(pgPosts.userId, pgUsers.id)),
      Postgres.Query.lateral("user_posts")
    )

    const plan = Postgres.Query.select({
      email: pgUsers.email,
      postId: lateralPosts.postId
    }).pipe(
      Postgres.Query.from(pgUsers),
      Postgres.Query.innerJoin(lateralPosts, Postgres.Query.eq(lateralPosts.userId, pgUsers.id))
    )

    expect(renderPostgres(plan).sql).toBe(
      'select "users"."email" as "email", "user_posts"."postId" as "postId" from "users" inner join lateral (select "posts"."id" as "postId", "posts"."userId" as "userId" from "posts" where ("posts"."userId" = "users"."id")) as "user_posts" on ("user_posts"."userId" = "users"."id")'
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

    expect(renderMysql(scalarPlan).sql).toBe(
      'select `users`.`id` as `userId`, (select `posts`.`id` as `value` from `posts`) as `firstPostId`, (`users`.`id` in (select `posts`.`id` as `value` from `posts`)) as `matchesAny`, (`users`.`id` = any (select `posts`.`id` as `value` from `posts`)) as `matchesSome`, (`users`.`id` = all (select `posts`.`id` as `value` from `posts`)) as `matchesAll` from `users`'
    )
  })
})
