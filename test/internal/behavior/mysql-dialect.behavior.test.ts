import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import * as CoreRenderer from "#internal/renderer.ts"
import * as ExpressionAst from "#internal/expression-ast.ts"
import { mysqlDialect } from "#internal/mysql-dialect.ts"
import { renderExpression } from "#internal/sql-expression-renderer.ts"
import * as Mysql from "#mysql"
import { makeMysqlSocialGraph } from "../../fixtures/schema.ts"
import { buildGroupedConcatPlan } from "../../helpers/dialect-matrix.ts"
import { unsafeNever } from "../../helpers/unsafe.ts"

const userId = "11111111-1111-1111-1111-111111111111"
const secondUserId = "22222222-2222-2222-2222-222222222222"

describe("mysql dialect behavior", () => {
  test("escapes backtick identifiers for aliased table references", () => {
    const events = Mysql.Table.make("audit`logs", {
      ["event`payload"]: Mysql.Column.text()
    })
    const aliased = Mysql.Table.alias(events, "daily`rollup")

    const plan = Mysql.Query.select({
      payload: Mysql.Query.as(aliased["event`payload"], "payload`alias")
    }).pipe(
      Mysql.Query.from(aliased)
    )

    expect(Mysql.Renderer.make().render(plan).sql).toBe(
      "select `daily``rollup`.`event``payload` as `payload``alias` from `audit``logs` as `daily``rollup`"
    )
  })

  test("inlines null and booleans while binding other literals with question-mark placeholders", () => {
    const timestamp = new Date("2024-01-02T03:04:05.000Z")

    const plan = Mysql.Query.select({
      truthy: Mysql.Query.literal(true),
      falsy: Mysql.Query.literal(false),
      missing: Mysql.Query.literal(null),
      createdAt: Mysql.Query.literal(timestamp),
      visits: Mysql.Query.literal(7),
      label: Mysql.Query.literal("user")
    })

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select true as `truthy`, false as `falsy`, null as `missing`, ? as `createdAt`, ? as `visits`, ? as `label`"
    )
    expect(rendered.params).toEqual([timestamp, 7, "user"])
  })

  test("renders mysql concat syntax across grouped queries", () => {
    const { users, posts } = makeMysqlSocialGraph()
    const plan = buildGroupedConcatPlan(Mysql, users, posts)

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select concat(lower(`users`.`email`), ?, coalesce(max(`posts`.`title`), ?)) as `emailLabel`, min(`posts`.`title`) as `firstTitle`, count(`posts`.`id`) as `postCount` from `users` inner join `posts` on (`users`.`id` = `posts`.`userId`) group by lower(`users`.`email`) having (count(`posts`.`id`) = ?) order by count(`posts`.`id`) desc"
    )
    expect(rendered.params).toEqual(["-", "missing", 2])
    expect(rendered.projections).toEqual([
      { path: ["emailLabel"], alias: "emailLabel" },
      { path: ["firstTitle"], alias: "firstTitle" },
      { path: ["postCount"], alias: "postCount" }
    ])
  })

  test("dedupes repeated exact group-by expressions and rejects provenance-only grouped matches", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const valid = Mysql.Query.select({
      loweredEmail: Mysql.Function.lower(users.email),
      postCount: Mysql.Function.count(posts.id)
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.innerJoin(posts, Mysql.Query.eq(users.id, posts.userId)),
      Mysql.Query.groupBy(Mysql.Function.lower(users.email)),
      Mysql.Query.groupBy(Mysql.Function.lower(users.email))
    )

    expect(Mysql.Renderer.make().render(valid).sql).toBe(
      "select lower(`users`.`email`) as `loweredEmail`, count(`posts`.`id`) as `postCount` from `users` inner join `posts` on (`users`.`id` = `posts`.`userId`) group by lower(`users`.`email`)"
    )

    const invalid = Mysql.Query.select({
      email: users.email,
      postCount: Mysql.Function.count(posts.id)
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.innerJoin(posts, Mysql.Query.eq(users.id, posts.userId)),
      Mysql.Query.groupBy(Mysql.Function.lower(users.email))
    )

    expect(() => Mysql.Renderer.make().render(unsafeNever(invalid))).toThrow(
      "Invalid grouped selection: scalar expressions must be covered by groupBy(...) when aggregates are present"
    )
  })

  test("renders literal-only scalar operators with stable mysql parameter ordering", () => {
    const plan = Mysql.Query.select({
      stitched: Mysql.Function.concat("a", "b", "c"),
      fallback: Mysql.Function.coalesce(null, null, "done"),
      missing: Mysql.Query.isNull(null),
      present: Mysql.Query.isNotNull("x"),
      caps: Mysql.Function.upper("mix"),
      lowered: Mysql.Function.lower("MIX")
    })

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select concat(?, ?, ?) as `stitched`, coalesce(null, null, ?) as `fallback`, (null is null) as `missing`, (? is not null) as `present`, upper(?) as `caps`, lower(?) as `lowered`"
    )
    expect(rendered.params).toEqual(["a", "b", "c", "done", "x", "mix", "MIX"])
  })

  test("renders explicit casts with mysql syntax", () => {
    const { users } = makeMysqlSocialGraph()

    const plan = Mysql.Query.select({
      idAsText: Mysql.Query.cast(users.id, Mysql.Query.type.text())
    }).pipe(Mysql.Query.from(users))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe("select cast(`users`.`id` as char) as `idAsText` from `users`")
    expect(rendered.params).toEqual([])
  })

  test("renders parameterized custom datatypes through explicit casts", () => {
    const plan = Mysql.Query.select({
      scaledValue: Mysql.Query.cast(
        Mysql.Query.literal(1),
        Mysql.Query.type.custom("decimal(10,2)")
      )
    })

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe("select cast(? as decimal(10,2)) as `scaledValue`")
    expect(rendered.params).toEqual([1])
  })

  test("renders named enum and set casts with mysql syntax", () => {
    const plan = Mysql.Query.select({
      enumValue: Mysql.Query.cast(
        Mysql.Query.literal("draft"),
        Mysql.Query.type.enum("enum('draft','published')")
      ),
      setValue: Mysql.Query.cast(
        Mysql.Query.literal("admin"),
        Mysql.Query.type.set("set('admin','editor')")
      )
    })

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe("select cast(? as enum('draft','published')) as `enumValue`, cast(? as set('admin','editor')) as `setValue`")
    expect(rendered.params).toEqual(["draft", "admin"])
  })

  test("renders boolean combinators and clause-level parameter ordering across mysql queries", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = Mysql.Query.select({
      summary: Mysql.Function.concat(
        Mysql.Function.lower(users.email),
        "::",
        Mysql.Function.upper(Mysql.Function.coalesce(posts.title, "missing"))
      ),
      draftOrMissing: Mysql.Query.or(
        Mysql.Query.isNull(posts.title),
        Mysql.Query.eq(Mysql.Function.lower(posts.title), "draft")
      ),
      active: Mysql.Query.and(
        Mysql.Query.isNotNull(posts.id),
        Mysql.Query.not(Mysql.Query.eq(users.email, "banned@example.com"))
      )
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.leftJoin(posts, Mysql.Query.eq(users.id, posts.userId)),
      Mysql.Query.where(Mysql.Query.and(
        Mysql.Query.or(
          Mysql.Query.eq(users.email, "alice@example.com"),
          Mysql.Query.eq(users.email, "bob@example.com")
        ),
        Mysql.Query.not(
          Mysql.Query.eq(Mysql.Function.coalesce(posts.title, "missing"), "archived")
        )
      )),
      Mysql.Query.orderBy(
        Mysql.Function.upper(Mysql.Function.coalesce(posts.title, "missing")),
        "desc"
      )
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select concat(lower(`users`.`email`), ?, upper(coalesce(`posts`.`title`, ?))) as `summary`, ((`posts`.`title` is null) or (lower(`posts`.`title`) = ?)) as `draftOrMissing`, ((`posts`.`id` is not null) and (not (`users`.`email` = ?))) as `active` from `users` left join `posts` on (`users`.`id` = `posts`.`userId`) where (((`users`.`email` = ?) or (`users`.`email` = ?)) and (not (coalesce(`posts`.`title`, ?) = ?))) order by upper(coalesce(`posts`.`title`, ?)) desc"
    )
    expect(rendered.params).toEqual([
      "::",
      "missing",
      "draft",
      "banned@example.com",
      "alice@example.com",
      "bob@example.com",
      "missing",
      "archived",
      "missing"
    ])
  })

  test("renders distinct, limit, and offset with mysql parameter ordering", () => {
    const { users } = makeMysqlSocialGraph()

    const plan = Mysql.Query.select({
      email: users.email
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.where(Mysql.Query.like(users.email, "%@example.com")),
      Mysql.Query.distinct(),
      Mysql.Query.orderBy(users.email),
      Mysql.Query.limit(5),
      Mysql.Query.offset(10)
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select distinct `users`.`email` as `email` from `users` where (`users`.`email` like ?) order by `users`.`email` asc limit ? offset ?"
    )
    expect(rendered.params).toEqual(["%@example.com", 5, 10])
  })

  test("renders the extended read predicate surface with mysql-specific operators", () => {
    const { users } = makeMysqlSocialGraph()

    const plan = Mysql.Query.select({
      notEqual: Mysql.Query.neq(users.id, 5),
      lessThan: Mysql.Query.lt(users.id, 10),
      lessThanOrEqual: Mysql.Query.lte(users.id, 11),
      greaterThan: Mysql.Query.gt(users.id, 1),
      greaterThanOrEqual: Mysql.Query.gte(users.id, 0),
      emailLike: Mysql.Query.like(users.email, "%@example.com"),
      emailInsensitive: Mysql.Query.ilike(users.email, "%@EXAMPLE.COM%"),
      idRange: Mysql.Query.between(users.id, 2, 4),
      idSet: Mysql.Query.in(users.id, 7, 8, 9)
    }).pipe(
      Mysql.Query.from(users)
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select (`users`.`id` <> ?) as `notEqual`, (`users`.`id` < ?) as `lessThan`, (`users`.`id` <= ?) as `lessThanOrEqual`, (`users`.`id` > ?) as `greaterThan`, (`users`.`id` >= ?) as `greaterThanOrEqual`, (`users`.`email` like ?) as `emailLike`, (lower(`users`.`email`) like lower(?)) as `emailInsensitive`, (`users`.`id` between ? and ?) as `idRange`, (`users`.`id` in (?, ?, ?)) as `idSet` from `users`"
    )
    expect(rendered.params).toEqual([5, 10, 11, 1, 0, "%@example.com", "%@EXAMPLE.COM%", 2, 4, 7, 8, 9])
  })

  test("renders the remaining read predicate helpers with mysql-specific syntax", () => {
    const { users } = makeMysqlSocialGraph()

    const plan = Mysql.Query.select({
      notInIds: Mysql.Query.notIn(users.id, 4, 5, 6),
      distinctEmail: Mysql.Query.isDistinctFrom(users.email, "alice@example.com"),
      sameEmail: Mysql.Query.isNotDistinctFrom(users.email, "alice@example.com"),
      combined: Mysql.Query.all(
        Mysql.Query.eq(users.id, 1),
        Mysql.Query.any(
          Mysql.Query.eq(users.email, "alice@example.com"),
          Mysql.Query.eq(users.email, "bob@example.com")
        )
      ),
      label: Mysql.Query.match(users.email)
        .when("alice@example.com", "Alice")
        .when("bob@example.com", "Bob")
        .else("Other")
    }).pipe(
      Mysql.Query.from(users)
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select (`users`.`id` not in (?, ?, ?)) as `notInIds`, (not (`users`.`email` <=> ?)) as `distinctEmail`, (`users`.`email` <=> ?) as `sameEmail`, ((`users`.`id` = ?) and ((`users`.`email` = ?) or (`users`.`email` = ?))) as `combined`, case when (`users`.`email` = ?) then ? when (`users`.`email` = ?) then ? else ? end as `label` from `users`"
    )
    expect(rendered.params).toEqual([
      4,
      5,
      6,
      "alice@example.com",
      "alice@example.com",
      1,
      "alice@example.com",
      "bob@example.com",
      "alice@example.com",
      "Alice",
      "bob@example.com",
      "Bob",
      "Other"
    ])
  })

  test("renders searched case expressions with mysql placeholders", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const selected = Mysql.Query.select({
      titleState: Mysql.Query.case()
        .when(Mysql.Query.isNull(posts.title), "missing")
        .when(Mysql.Query.eq(Mysql.Function.lower(posts.title), "draft"), "draft")
        .else(Mysql.Function.upper(Mysql.Function.coalesce(posts.title, "published")))
    })
    const fromUsers = Mysql.Query.from(users)(unsafeNever(selected))
    const plan = Mysql.Query.leftJoin(posts, Mysql.Query.eq(users.id, posts.userId))(fromUsers)

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select case when (`posts`.`title` is null) then ? when (lower(`posts`.`title`) = ?) then ? else upper(coalesce(`posts`.`title`, ?)) end as `titleState` from `users` left join `posts` on (`users`.`id` = `posts`.`userId`)"
    )
    expect(rendered.params).toEqual(["missing", "draft", "draft", "published"])
  })

  test("renders right, full, and cross joins with mysql syntax", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const rightJoinPlan = Mysql.Query.select({
      userId: users.id,
      postId: posts.id
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.rightJoin(posts, Mysql.Query.eq(users.id, posts.userId))
    )

    const fullJoinPlan = Mysql.Query.select({
      userId: users.id,
      postId: posts.id
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.fullJoin(posts, Mysql.Query.eq(users.id, posts.userId))
    )

    const crossJoinPlan = Mysql.Query.select({
      userId: users.id,
      postId: posts.id
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.crossJoin(posts)
    )

    expect(Mysql.Renderer.make().render(rightJoinPlan).sql).toBe(
      "select `users`.`id` as `userId`, `posts`.`id` as `postId` from `users` right join `posts` on (`users`.`id` = `posts`.`userId`)"
    )
    expect(Mysql.Renderer.make().render(fullJoinPlan).sql).toBe(
      "select `users`.`id` as `userId`, `posts`.`id` as `postId` from `users` full join `posts` on (`users`.`id` = `posts`.`userId`)"
    )
    expect(Mysql.Renderer.make().render(crossJoinPlan).sql).toBe(
      "select `users`.`id` as `userId`, `posts`.`id` as `postId` from `users` cross join `posts`"
    )
  })

  test("renders distinct, limit, and offset with mysql placeholders", () => {
    const { users } = makeMysqlSocialGraph()

    const plan = Mysql.Query.select({
      userId: users.id,
      email: users.email
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.distinct(),
      Mysql.Query.orderBy(users.email),
      Mysql.Query.limit(10),
      Mysql.Query.offset(20)
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select distinct `users`.`id` as `userId`, `users`.`email` as `email` from `users` order by `users`.`email` asc limit ? offset ?"
    )
    expect(rendered.params).toEqual([10, 20])
  })

  test("renders exists subqueries with shared mysql parameter ordering", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const postExists = Mysql.Query.select({
      id: posts.id
    }).pipe(
      Mysql.Query.from(posts),
      Mysql.Query.where(Mysql.Query.eq(posts.title, "hello"))
    )

    const plan = Mysql.Query.select({
      email: users.email,
      hasHelloPost: Mysql.Query.exists(postExists)
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.where(Mysql.Query.eq(users.email, "alice@example.com"))
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select `users`.`email` as `email`, exists (select `posts`.`id` as `id` from `posts` where (`posts`.`title` = ?)) as `hasHelloPost` from `users` where (`users`.`email` = ?)"
    )
    expect(rendered.params).toEqual(["hello", "alice@example.com"])
  })

  test("renders correlated exists subqueries against outer mysql sources", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const postExists = Mysql.Query.select({
      id: posts.id
    }).pipe(
      Mysql.Query.from(posts),
      Mysql.Query.where(Mysql.Query.eq(posts.userId, users.id))
    )

    const plan = Mysql.Query.select({
      email: users.email,
      hasPosts: Mysql.Query.exists(postExists)
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.where(Mysql.Query.eq(users.email, "alice@example.com"))
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select `users`.`email` as `email`, exists (select `posts`.`id` as `id` from `posts` where (`posts`.`userId` = `users`.`id`)) as `hasPosts` from `users` where (`users`.`email` = ?)"
    )
    expect(rendered.params).toEqual(["alice@example.com"])
  })

  test("renders window functions and windowed aggregates with mysql syntax", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = Mysql.Query.select({
      userId: users.id,
      rowNumber: Mysql.Function.rowNumber({
        partitionBy: [users.id],
        orderBy: [{ value: posts.id, direction: "asc" }]
      }),
      rankByTitle: Mysql.Function.rank({
        partitionBy: [users.id],
        orderBy: [{ value: Mysql.Function.lower(posts.title), direction: "desc" }]
      }),
      postCount: Mysql.Function.over(Mysql.Function.count(posts.id), {
        partitionBy: [users.id],
        orderBy: [{ value: posts.id, direction: "asc" }]
      }),
      latestTitle: Mysql.Function.over(Mysql.Function.max(posts.title), {
        partitionBy: [users.id]
      })
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.leftJoin(posts, Mysql.Query.eq(users.id, posts.userId))
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select `users`.`id` as `userId`, row_number() over (partition by `users`.`id` order by `posts`.`id` asc) as `rowNumber`, rank() over (partition by `users`.`id` order by lower(`posts`.`title`) desc) as `rankByTitle`, count(`posts`.`id`) over (partition by `users`.`id` order by `posts`.`id` asc) as `postCount`, max(`posts`.`title`) over (partition by `users`.`id`) as `latestTitle` from `users` left join `posts` on (`users`.`id` = `posts`.`userId`)"
    )
    expect(rendered.params).toEqual([])
  })

  test("renders aliased mysql subqueries as derived tables", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const activePosts = Mysql.Query.select({
      userId: posts.userId,
      title: posts.title
    }).pipe(
      Mysql.Query.from(posts),
      Mysql.Query.where(Mysql.Query.isNotNull(posts.title))
    )

    const derivedPosts = activePosts.pipe(Mysql.Query.as("active_posts"))

    const plan = Mysql.Query.select({
      userId: users.id,
      title: derivedPosts.title
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.innerJoin(derivedPosts, Mysql.Query.eq(users.id, derivedPosts.userId))
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select `users`.`id` as `userId`, `active_posts`.`title` as `title` from `users` inner join (select `posts`.`userId` as `userId`, `posts`.`title` as `title` from `posts` where (`posts`.`title` is not null)) as `active_posts` on (`users`.`id` = `active_posts`.`userId`)"
    )
    expect(rendered.params).toEqual([])
  })

  test("renders mysql common table expressions as aliased sources", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const activePostsSubquery = Mysql.Query.select({
      userId: posts.userId,
      title: posts.title
    }).pipe(
      Mysql.Query.from(posts),
      Mysql.Query.where(Mysql.Query.isNotNull(posts.title))
    )
    const activePosts = activePostsSubquery.pipe(Mysql.Query.with("active_posts"))

    const plan = Mysql.Query.select({
      userId: users.id,
      title: activePosts.title
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.innerJoin(activePosts, Mysql.Query.eq(users.id, activePosts.userId))
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "with `active_posts` as (select `posts`.`userId` as `userId`, `posts`.`title` as `title` from `posts` where (`posts`.`title` is not null)) select `users`.`id` as `userId`, `active_posts`.`title` as `title` from `users` inner join `active_posts` on (`users`.`id` = `active_posts`.`userId`)"
    )
  })

  test("renders mysql data-modifying ctes with returning projections", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })

    const insertedUsers = Mysql.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }).pipe(
      Mysql.Query.returning({
        id: users.id,
        email: users.email,
        bio: users.bio
      }),
      Mysql.Query.with("inserted_users")
    )

    const plan = Mysql.Query.select({
      id: insertedUsers.id,
      email: insertedUsers.email,
      bio: insertedUsers.bio
    }).pipe(
      Mysql.Query.from(insertedUsers)
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "with `inserted_users` as (insert into `users` (`id`, `email`, `bio`) values (?, ?, null) returning `users`.`id` as `id`, `users`.`email` as `email`, `users`.`bio` as `bio`) select `inserted_users`.`id` as `id`, `inserted_users`.`email` as `email`, `inserted_users`.`bio` as `bio` from `inserted_users`"
    )
    expect(rendered.params).toEqual([
      userId,
      "alice@example.com"
    ])
  })

  test("renders mysql lateral joins with correlated outer references", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const lateralPosts = Mysql.Query.select({
        postId: posts.id,
        userId: posts.userId
      }).pipe(
        Mysql.Query.from(posts),
        Mysql.Query.where(Mysql.Query.eq(posts.userId, users.id)),
        Mysql.Query.lateral("user_posts")
      )

    const plan = Mysql.Query.select({
      userId: users.id,
      postId: lateralPosts.postId
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.innerJoin(lateralPosts, true)
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select `users`.`id` as `userId`, `user_posts`.`postId` as `postId` from `users` inner join lateral (select `posts`.`id` as `postId`, `posts`.`userId` as `userId` from `posts` where (`posts`.`userId` = `users`.`id`)) as `user_posts` on true"
    )
    expect(rendered.params).toEqual([])
  })

  test("renders mysql recursive ctes with the recursive keyword", () => {
    const { posts } = makeMysqlSocialGraph()

    const recursivePosts = Mysql.Query.select({
        userId: posts.userId
      }).pipe(
        Mysql.Query.from(posts),
        Mysql.Query.withRecursive("recursive_posts")
      )

    const plan = Mysql.Query.select({
      userId: recursivePosts.userId
    }).pipe(
      Mysql.Query.from(recursivePosts)
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "with recursive `recursive_posts` as (select `posts`.`userId` as `userId` from `posts`) select `recursive_posts`.`userId` as `userId` from `recursive_posts`"
    )
    expect(rendered.params).toEqual([])
  })

  test("renders mysql upsert statements with duplicate-key updates and returning projections", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })

    const upsertPlan = Mysql.Query.returning({
      id: users.id,
      email: users.email
    })(Mysql.Query.upsert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }, ["id"] as const, {
      email: "alice@new.example.com"
    }))

    const rendered = Mysql.Renderer.make().render(upsertPlan)

    expect(rendered.sql).toBe(
      "insert into `users` (`id`, `email`, `bio`) values (?, ?, null) on duplicate key update `email` = ? returning `users`.`id` as `id`, `users`.`email` as `email`"
    )
    expect(rendered.params).toEqual([
      userId,
      "alice@example.com",
      "alice@new.example.com"
    ])
  })

  test("renders mysql locking clauses at the end of select queries", () => {
    const { users } = makeMysqlSocialGraph()

    const plan = Mysql.Query.select({
      id: users.id
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.lock("update", { nowait: true, skipLocked: true })
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select `users`.`id` as `id` from `users` for update nowait skip locked"
    )
    expect(rendered.params).toEqual([])
  })

  test("renders mysql set operators with stable operand ordering", () => {
    const { users } = makeMysqlSocialGraph()

    const alice = Mysql.Query.select({
      email: users.email
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.where(Mysql.Query.eq(users.email, "alice@example.com"))
    )

    const bob = Mysql.Query.select({
      email: users.email
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.where(Mysql.Query.eq(users.email, "bob@example.com"))
    )

    const carol = Mysql.Query.select({
      email: users.email
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.where(Mysql.Query.eq(users.email, "carol@example.com"))
    )

    const unionPlan = Mysql.Query.union(Mysql.Query.union(alice, bob), carol)
    const intersectPlan = Mysql.Query.intersect(alice, bob)
    const exceptPlan = Mysql.Query.except(alice, bob)

    expect(Mysql.Renderer.make().render(unionPlan).sql).toBe(
      "(select `users`.`email` as `email` from `users` where (`users`.`email` = ?)) union (select `users`.`email` as `email` from `users` where (`users`.`email` = ?)) union (select `users`.`email` as `email` from `users` where (`users`.`email` = ?))"
    )
    expect(Mysql.Renderer.make().render(unionPlan).params).toEqual([
      "alice@example.com",
      "bob@example.com",
      "carol@example.com"
    ])
    expect(Mysql.Renderer.make().render(unionPlan).projections).toEqual([
      { path: ["email"], alias: "email" }
    ])

    expect(Mysql.Renderer.make().render(intersectPlan).sql).toBe(
      "(select `users`.`email` as `email` from `users` where (`users`.`email` = ?)) intersect (select `users`.`email` as `email` from `users` where (`users`.`email` = ?))"
    )
    expect(Mysql.Renderer.make().render(intersectPlan).params).toEqual([
      "alice@example.com",
      "bob@example.com"
    ])

    expect(Mysql.Renderer.make().render(exceptPlan).sql).toBe(
      "(select `users`.`email` as `email` from `users` where (`users`.`email` = ?)) except (select `users`.`email` as `email` from `users` where (`users`.`email` = ?))"
    )
    expect(Mysql.Renderer.make().render(exceptPlan).params).toEqual([
      "alice@example.com",
      "bob@example.com"
    ])
  })

  test("renders mysql insert update and delete mutations with returning projections", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })

    const insertPlan = Mysql.Query.returning({
      id: users.id,
      email: users.email,
      bio: users.bio
    })(Mysql.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }))

    const updatePlan = Mysql.Query.returning({
      id: users.id,
      email: users.email,
      bio: users.bio
    })(Mysql.Query.where(Mysql.Query.eq(users.id, userId))(
      Mysql.Query.update(users, {
        email: "updated@example.com",
        bio: null
      })
    ))

    const deletePlan = Mysql.Query.returning({
      id: users.id
    })(Mysql.Query.where(Mysql.Query.eq(users.id, userId))(
      Mysql.Query.delete(users)
    ))

    expect(Mysql.Renderer.make().render(insertPlan).sql).toBe(
      "insert into `users` (`id`, `email`, `bio`) values (?, ?, null) returning `users`.`id` as `id`, `users`.`email` as `email`, `users`.`bio` as `bio`"
    )
    expect(Mysql.Renderer.make().render(insertPlan).params).toEqual([
      userId,
      "alice@example.com"
    ])

    expect(Mysql.Renderer.make().render(updatePlan).sql).toBe(
      "update `users` set `email` = ?, `bio` = null where (`users`.`id` = ?) returning `users`.`id` as `id`, `users`.`email` as `email`, `users`.`bio` as `bio`"
    )
    expect(Mysql.Renderer.make().render(updatePlan).params).toEqual([
      "updated@example.com",
      userId
    ])

    expect(Mysql.Renderer.make().render(deletePlan).sql).toBe(
      "delete from `users` where (`users`.`id` = ?) returning `users`.`id` as `id`"
    )
    expect(Mysql.Renderer.make().render(deletePlan).params).toEqual([userId])
  })

  test("renders mysql joined update modifiers order and limit", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = Mysql.Query.returning({
      id: users.id,
      email: users.email
    })(Mysql.Query.limit(2)(
      Mysql.Query.orderBy(posts.id)(
        Mysql.Query.lock("lowPriority")(
          Mysql.Query.where(Mysql.Query.eq(posts.title, "hello"))(
            Mysql.Query.innerJoin(posts, Mysql.Query.eq(posts.userId, users.id))(
              Mysql.Query.update(users, {
                email: "author@example.com"
              })
            )
          )
        )
      )
    ))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "update low_priority `users` inner join `posts` on (`posts`.`userId` = `users`.`id`) set `email` = ? where (`posts`.`title` = ?) order by `posts`.`id` asc limit ? returning `users`.`id` as `id`, `users`.`email` as `email`"
    )
    expect(rendered.params).toEqual([
      "author@example.com",
      "hello",
      2
    ])
  })

  test("renders mysql multi-table update assignments", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = Mysql.Query.where(Mysql.Query.eq(posts.userId, users.id))(
      Mysql.Query.update([users, posts], {
        users: {
          email: "author@example.com"
        },
        posts: {
          title: "published"
        }
      })
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "update `users`, `posts` set `users`.`email` = ?, `posts`.`title` = ? where (`posts`.`userId` = `users`.`id`)"
    )
    expect(rendered.params).toEqual([
      "author@example.com",
      "published"
    ])
  })

  test("renders mysql joined delete modifiers order and limit", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = Mysql.Query.returning({
      id: users.id
    })(Mysql.Query.limit(3)(
      Mysql.Query.orderBy(posts.id, "desc")(
        Mysql.Query.lock("quick")(
          Mysql.Query.where(Mysql.Query.eq(posts.title, "hello"))(
            Mysql.Query.innerJoin(posts, Mysql.Query.eq(posts.userId, users.id))(
              Mysql.Query.delete(users)
            )
          )
        )
      )
    ))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "delete quick `users` from `users` inner join `posts` on (`posts`.`userId` = `users`.`id`) where (`posts`.`title` = ?) order by `posts`.`id` desc limit ? returning `users`.`id` as `id`"
    )
    expect(rendered.params).toEqual([
      "hello",
      3
    ])
  })

  test("renders mysql multi-table delete targets", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = Mysql.Query.where(Mysql.Query.eq(posts.userId, users.id))(
      Mysql.Query.delete([users, posts])
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "delete `users`, `posts` from `users`, `posts` where (`posts`.`userId` = `users`.`id`)"
    )
    expect(rendered.params).toEqual([])
  })

  test("renders mysql multi-row and source-backed inserts", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })
    const archivedUsers = Mysql.Table.make("archived_users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })

    const valuesSource = Mysql.Query.as(Mysql.Query.values([
      { id: Mysql.Query.literal(userId), email: "alice@example.com", bio: null },
      { id: Mysql.Query.literal(secondUserId), email: "bob@example.com", bio: "writer" }
    ] as const), "seed")

    const multiRowPlan = Mysql.Query.insert(users).pipe(
      Mysql.Query.from(valuesSource)
    )

    const insertSelectPlan = Mysql.Query.insert(archivedUsers).pipe(
      Mysql.Query.from(Mysql.Query.select({
      id: users.id,
      email: users.email,
      bio: users.bio
    }).pipe(
      Mysql.Query.from(users)
    )))

    const insertUnnestPlan = Mysql.Query.insert(users).pipe(
      Mysql.Query.from(Mysql.Query.unnest({
      id: [userId, secondUserId],
      email: ["alice@example.com", "bob@example.com"],
      bio: [null, "writer"]
      }, "seed"))
    )

    expect(Mysql.Renderer.make().render(multiRowPlan).sql).toBe(
      "insert into `users` (`id`, `email`, `bio`) values (?, ?, null), (?, ?, ?)"
    )
    expect(Mysql.Renderer.make().render(multiRowPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])

    expect(Mysql.Renderer.make().render(insertSelectPlan).sql).toBe(
      "insert into `archived_users` (`id`, `email`, `bio`) select `users`.`id` as `id`, `users`.`email` as `email`, `users`.`bio` as `bio` from `users`"
    )
    expect(Mysql.Renderer.make().render(insertSelectPlan).params).toEqual([])

    expect(Mysql.Renderer.make().render(insertUnnestPlan).sql).toBe(
      "insert into `users` (`id`, `email`, `bio`) values (?, ?, null), (?, ?, ?)"
    )
    expect(Mysql.Renderer.make().render(insertUnnestPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])
  })

  test("renders mysql default-values and duplicate-key conflict clauses", () => {
    const auditLogs = Mysql.Table.make("audit_logs", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey, Mysql.Column.default),
      note: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })

    const defaultInsertPlan = Mysql.Query.insert(auditLogs)
    const conflictPlan = Mysql.Query.onConflict(["email"] as const, {
      update: {
        bio: Mysql.Query.excluded(users.bio)
      }
    })(Mysql.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: "writer"
    }))

    expect(Mysql.Renderer.make().render(defaultInsertPlan).sql).toBe(
      "insert into `audit_logs` default values"
    )

    expect(Mysql.Renderer.make().render(conflictPlan).sql).toBe(
      "insert into `users` (`id`, `email`, `bio`) values (?, ?, ?) on duplicate key update `bio` = values(`bio`)"
    )
    expect(Mysql.Renderer.make().render(conflictPlan).params).toEqual([
      userId,
      "alice@example.com",
      "writer"
    ])
  })

  test("renders mysql ddl statements from schema tables", () => {
    const orgs = Mysql.Table.make("orgs", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      slug: Mysql.Column.text().pipe(Mysql.Column.unique)
    })
    const memberships = Mysql.Table.make("memberships", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      orgId: Mysql.Column.uuid(),
      role: Mysql.Column.text(),
      note: Mysql.Column.text().pipe(Mysql.Column.nullable)
    }).pipe(
      Mysql.Table.foreignKey("orgId", () => orgs, "id"),
      Mysql.Table.unique(["orgId", "role"] as const),
      Mysql.Table.index(["role", "orgId"] as const)
    )

    expect(Mysql.Renderer.make().render(Mysql.Query.createTable(memberships, {
      ifNotExists: true
    })).sql).toBe(
      'create table if not exists `memberships` (`id` char(36) not null, `orgId` char(36) not null, `role` text not null, `note` text, primary key (`id`), foreign key (`orgId`) references `orgs` (`id`), unique (`orgId`, `role`))'
    )
    expect(Mysql.Renderer.make().render(Mysql.Query.createIndex(memberships, ["role", "orgId"] as const, {
      ifNotExists: true
    })).sql).toBe(
      'create index `memberships_role_orgId_idx` on `memberships` (`role`, `orgId`)'
    )
    expect(Mysql.Renderer.make().render(Mysql.Query.dropIndex(memberships, ["role", "orgId"] as const, {
      ifExists: true
    })).sql).toBe(
      'drop index `memberships_role_orgId_idx` on `memberships`'
    )
    expect(Mysql.Renderer.make().render(Mysql.Query.dropTable(memberships, {
      ifExists: true
    })).sql).toBe(
      'drop table if exists `memberships`'
    )
  })

  test("renders schema-qualified mysql tables in queries and ddl", () => {
    const analytics = Mysql.Table.schema("analytics")
    const users = analytics.table("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey)
    })
    const events = analytics.table("events", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      userId: Mysql.Column.uuid().pipe(Mysql.Column.references(() => users.id))
    })

    const plan = Mysql.Query.select({
      eventId: events.id
    }).pipe(
      Mysql.Query.from(events)
    )

    expect(Mysql.Renderer.make().render(plan).sql).toBe(
      "select `events`.`id` as `eventId` from `analytics`.`events`"
    )
    expect(Mysql.Renderer.make().render(Mysql.Query.createTable(events, {
      ifNotExists: true
    })).sql).toBe(
      "create table if not exists `analytics`.`events` (`id` char(36) not null, `userId` char(36) not null, primary key (`id`), foreign key (`userId`) references `analytics`.`users` (`id`))"
    )
  })

  test("decodes nullable joined rows through the mysql executor pipeline", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = Mysql.Query.select({
      profile: {
        id: users.id,
        email: Mysql.Function.lower(users.email)
      },
      post: {
        id: posts.id,
        title: Mysql.Function.lower(posts.title)
      },
      hasPost: Mysql.Query.isNotNull(posts.id)
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.leftJoin(posts, Mysql.Query.eq(users.id, posts.userId))
    )

    const rows = Effect.runSync(Mysql.Executor.make({
      driver: Mysql.Executor.driver(() => Effect.succeed([{
        profile__id: userId,
        profile__email: "alice@example.com",
        post__id: null,
        post__title: null,
        hasPost: false
      }]))
    }).execute(plan))

    expect(rows).toEqual([{
      profile: {
        id: userId,
        email: "alice@example.com"
      },
      post: {
        id: null,
        title: null
      },
      hasPost: false
    }])
  })

  test("uses the mysql entrypoint renderer while the core one-argument renderer path rejects mysql", () => {
    expect(() => Mysql.Renderer.make()).not.toThrow()
    expect(() => (CoreRenderer.make as (dialect: string) => unknown)("mysql")).toThrow(
      "No built-in renderer for dialect: mysql"
    )
    expect(() => (CoreRenderer.make as (dialect: string) => unknown)("sqlite")).toThrow(
      "No built-in renderer for dialect: sqlite"
    )

    const unsupportedExpression = {
      [ExpressionAst.TypeId]: {
        kind: "unsupported"
      }
    } as unknown as Mysql.Expression.Any

    expect(() => renderExpression(unsupportedExpression, { params: [] }, mysqlDialect)).toThrow(
      "Unsupported expression for SQL rendering"
    )
  })
})
