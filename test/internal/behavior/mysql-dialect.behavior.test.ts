// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import * as CoreRenderer from "#internal/renderer.ts"
import * as ExpressionAst from "#internal/expression-ast.ts"
import { mysqlDialect } from "../../../packages/querybuilder/src/mysql/internal/dialect.ts"
import { renderExpression } from "../../../packages/querybuilder/src/internal/sql-expression-renderer.ts"
import * as Mysql from "#mysql"
import { makeMysqlSocialGraph } from "../../fixtures/schema.ts"
import { buildGroupedConcatPlan } from "../../helpers/dialect-matrix.ts"
import { unsafeAny, unsafeNever } from "../../helpers/unsafe.ts"
import * as StdRoot from "#standard"

const userId = "11111111-1111-4111-8111-111111111111"
const secondUserId = "22222222-2222-4222-8222-222222222222"
const render = (plan: unknown) => Mysql.Renderer.make().render(unsafeAny(plan))

describe("mysql dialect behavior", () => {
  test("escapes backtick identifiers for aliased table references", () => {
    const events = StdRoot.Table.make("audit`logs", {
      ["event`payload"]: StdRoot.Column.text()
    })
    const aliased = unsafeAny(StdRoot.Table.alias(unsafeAny(events), "daily`rollup"))

    const plan = StdRoot.Query.select({
      payload: StdRoot.Query.as(unsafeAny(aliased["event`payload"]), "payload`alias")
    }).pipe(
      StdRoot.Query.from(unsafeAny(aliased))
    )

    expect(render(plan).sql).toBe(
      "select `daily``rollup`.`event``payload` as `payload``alias` from `audit``logs` as `daily``rollup`"
    )
  })

  test("inlines null and booleans while binding other literals with question-mark placeholders", () => {
    const timestamp = new Date("2024-01-02T03:04:05.000Z")

    const plan = StdRoot.Query.select({
      truthy: StdRoot.Query.literal(true),
      falsy: StdRoot.Query.literal(false),
      missing: StdRoot.Query.literal(null),
      createdAt: StdRoot.Query.literal(timestamp),
      visits: StdRoot.Query.literal(7),
      label: StdRoot.Query.literal("user")
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

  test("dedupes repeated exact group-by expressions", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const valid = StdRoot.Query.select({
      loweredEmail: StdRoot.Function.lower(users.email),
      postCount: StdRoot.Function.count(posts.id)
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.innerJoin(posts, StdRoot.Query.eq(users.id, posts.userId)),
      StdRoot.Query.groupBy(StdRoot.Function.lower(users.email)),
      StdRoot.Query.groupBy(StdRoot.Function.lower(users.email))
    )

    expect(Mysql.Renderer.make().render(valid).sql).toBe(
      "select lower(`users`.`email`) as `loweredEmail`, count(`posts`.`id`) as `postCount` from `users` inner join `posts` on (`users`.`id` = `posts`.`userId`) group by lower(`users`.`email`)"
    )
  })

  test("renders literal-only scalar operators with stable mysql parameter ordering", () => {
    const plan = StdRoot.Query.select({
      stitched: StdRoot.Function.concat("a", "b", "c"),
      fallback: StdRoot.Function.coalesce(null, null, "done"),
      missing: StdRoot.Query.isNull(null),
      present: StdRoot.Query.isNotNull("x"),
      caps: StdRoot.Function.upper("mix"),
      lowered: StdRoot.Function.lower("MIX")
    })

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select concat(?, ?, ?) as `stitched`, coalesce(null, null, ?) as `fallback`, (null is null) as `missing`, (? is not null) as `present`, upper(?) as `caps`, lower(?) as `lowered`"
    )
    expect(rendered.params).toEqual(["a", "b", "c", "done", "x", "mix", "MIX"])
  })

  test("renders explicit casts with mysql syntax", () => {
    const { users } = makeMysqlSocialGraph()

    const plan = StdRoot.Query.select({
      idAsText: StdRoot.Query.cast(users.id, StdRoot.Query.type.text())
    }).pipe(StdRoot.Query.from(users))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe("select cast(`users`.`id` as char) as `idAsText` from `users`")
    expect(rendered.params).toEqual([])
  })

  test("renders parameterized custom datatypes through explicit casts", () => {
    const plan = StdRoot.Query.select({
      scaledValue: StdRoot.Query.cast(
        StdRoot.Query.literal(1),
        StdRoot.Query.type.custom("decimal(10,2)")
      )
    })

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe("select cast(? as decimal(10,2)) as `scaledValue`")
    expect(rendered.params).toEqual([1])
  })

  test("renders named enum and set casts with mysql syntax", () => {
    const plan = StdRoot.Query.select({
      enumValue: StdRoot.Query.cast(
        StdRoot.Query.literal("draft"),
        Mysql.Type.enum("enum('draft','published')")
      ),
      setValue: StdRoot.Query.cast(
        StdRoot.Query.literal("admin"),
        Mysql.Type.set("set('admin','editor')")
      )
    })

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe("select cast(? as enum('draft','published')) as `enumValue`, cast(? as set('admin','editor')) as `setValue`")
    expect(rendered.params).toEqual(["draft", "admin"])
  })

  test("renders boolean combinators and clause-level parameter ordering across mysql queries", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = StdRoot.Query.select({
      summary: StdRoot.Function.concat(
        StdRoot.Function.lower(users.email),
        "::",
        StdRoot.Function.upper(StdRoot.Function.coalesce(posts.title, "missing"))
      ),
      draftOrMissing: StdRoot.Query.or(
        StdRoot.Query.isNull(posts.title),
        unsafeAny(StdRoot.Query.eq(StdRoot.Function.lower(unsafeAny(posts.title)), "draft"))
      ),
      active: StdRoot.Query.and(
        StdRoot.Query.isNotNull(posts.id),
        StdRoot.Query.not(StdRoot.Query.eq(users.email, "banned@example.com"))
      )
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.leftJoin(posts, StdRoot.Query.eq(users.id, posts.userId)),
      StdRoot.Query.where(StdRoot.Query.and(
        StdRoot.Query.or(
          StdRoot.Query.eq(users.email, "alice@example.com"),
          StdRoot.Query.eq(users.email, "bob@example.com")
        ),
        StdRoot.Query.not(
          StdRoot.Query.eq(StdRoot.Function.coalesce(posts.title, "missing"), "archived")
        )
      )),
      StdRoot.Query.orderBy(
        StdRoot.Function.upper(StdRoot.Function.coalesce(posts.title, "missing")),
        "desc"
      )
    )

    const rendered = render(plan)

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

    const plan = StdRoot.Query.select({
      email: users.email
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.where(StdRoot.Query.like(users.email, "%@example.com")),
      StdRoot.Query.distinct(),
      StdRoot.Query.orderBy(users.email),
      StdRoot.Query.limit(5),
      StdRoot.Query.offset(10)
    )

    const rendered = render(plan)

    expect(rendered.sql).toBe(
      "select distinct `users`.`email` as `email` from `users` where (`users`.`email` like ?) order by `users`.`email` asc limit ? offset ?"
    )
    expect(rendered.params).toEqual(["%@example.com", 5, 10])
  })

  test("rejects NaN mysql limit values", () => {
    const { users } = makeMysqlSocialGraph()

    const plan = StdRoot.Query.select({
      email: users.email
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.limit(Number.NaN)
    )

    expect(() => render(plan)).toThrow("Expected a finite numeric value")
  })

  test("rejects NaN mysql offset values", () => {
    const { users } = makeMysqlSocialGraph()

    const plan = StdRoot.Query.select({
      email: users.email
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.offset(Number.NaN)
    )

    expect(() => render(plan)).toThrow("Expected a finite numeric value")
  })

  test("renders the extended read predicate surface with mysql-specific operators", () => {
    const { users } = makeMysqlSocialGraph()

    const plan = StdRoot.Query.select({
      notEqual: StdRoot.Query.neq(users.id, 5),
      lessThan: StdRoot.Query.lt(users.id, 10),
      lessThanOrEqual: StdRoot.Query.lte(users.id, 11),
      greaterThan: StdRoot.Query.gt(users.id, 1),
      greaterThanOrEqual: StdRoot.Query.gte(users.id, 0),
      emailLike: StdRoot.Query.like(users.email, "%@example.com"),
      emailInsensitive: StdRoot.Query.ilike(users.email, "%@EXAMPLE.COM%"),
      idRange: StdRoot.Query.between(users.id, 2, 4),
      idSet: StdRoot.Query.in(users.id, 7, 8, 9)
    }).pipe(
      StdRoot.Query.from(users)
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select (`users`.`id` <> ?) as `notEqual`, (`users`.`id` < ?) as `lessThan`, (`users`.`id` <= ?) as `lessThanOrEqual`, (`users`.`id` > ?) as `greaterThan`, (`users`.`id` >= ?) as `greaterThanOrEqual`, (`users`.`email` like ?) as `emailLike`, (lower(`users`.`email`) like lower(?)) as `emailInsensitive`, (`users`.`id` between ? and ?) as `idRange`, (`users`.`id` in (?, ?, ?)) as `idSet` from `users`"
    )
    expect(rendered.params).toEqual([5, 10, 11, 1, 0, "%@example.com", "%@EXAMPLE.COM%", 2, 4, 7, 8, 9])
  })

  test("renders the remaining read predicate helpers with mysql-specific syntax", () => {
    const { users } = makeMysqlSocialGraph()

    const plan = StdRoot.Query.select({
      notInIds: StdRoot.Query.notIn(users.id, 4, 5, 6),
      distinctEmail: StdRoot.Query.isDistinctFrom(users.email, "alice@example.com"),
      sameEmail: StdRoot.Query.isNotDistinctFrom(users.email, "alice@example.com"),
      combined: StdRoot.Query.all(
        StdRoot.Query.eq(users.id, 1),
        StdRoot.Query.any(
          StdRoot.Query.eq(users.email, "alice@example.com"),
          StdRoot.Query.eq(users.email, "bob@example.com")
        )
      ),
      label: StdRoot.Query.match(users.email)
        .when("alice@example.com", "Alice")
        .when("bob@example.com", "Bob")
        .else("Other")
    }).pipe(
      StdRoot.Query.from(users)
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

    const selected = StdRoot.Query.select({
      titleState: StdRoot.Query.case()
        .when(StdRoot.Query.isNull(posts.title), "missing")
        .when(StdRoot.Query.eq(StdRoot.Function.lower(posts.title), "draft"), "draft")
        .else(StdRoot.Function.upper(StdRoot.Function.coalesce(posts.title, "published")))
    })
    const fromUsers = StdRoot.Query.from(users)(unsafeNever(selected))
    const plan = StdRoot.Query.leftJoin(posts, StdRoot.Query.eq(users.id, posts.userId))(fromUsers)

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select case when (`posts`.`title` is null) then ? when (lower(`posts`.`title`) = ?) then ? else upper(coalesce(`posts`.`title`, ?)) end as `titleState` from `users` left join `posts` on (`users`.`id` = `posts`.`userId`)"
    )
    expect(rendered.params).toEqual(["missing", "draft", "draft", "published"])
  })

  test("renders mysql right and cross joins and rejects unsupported full joins", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const rightJoinPlan = StdRoot.Query.select({
      userId: users.id,
      postId: posts.id
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.rightJoin(posts, StdRoot.Query.eq(users.id, posts.userId))
    )

    const fullJoinPlan = StdRoot.Query.select({
      userId: users.id,
      postId: posts.id
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.fullJoin(posts, StdRoot.Query.eq(users.id, posts.userId))
    )

    const crossJoinPlan = StdRoot.Query.select({
      userId: users.id,
      postId: posts.id
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.crossJoin(posts)
    )

    expect(Mysql.Renderer.make().render(rightJoinPlan).sql).toBe(
      "select `users`.`id` as `userId`, `posts`.`id` as `postId` from `users` right join `posts` on (`users`.`id` = `posts`.`userId`)"
    )
    expect(() => Mysql.Renderer.make().render(fullJoinPlan)).toThrow(
      "Unsupported mysql full join"
    )
    expect(Mysql.Renderer.make().render(crossJoinPlan).sql).toBe(
      "select `users`.`id` as `userId`, `posts`.`id` as `postId` from `users` cross join `posts`"
    )
  })

  test("renders distinct, limit, and offset with mysql placeholders", () => {
    const { users } = makeMysqlSocialGraph()

    const plan = StdRoot.Query.select({
      userId: users.id,
      email: users.email
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.distinct(),
      StdRoot.Query.orderBy(users.email),
      StdRoot.Query.limit(10),
      StdRoot.Query.offset(20)
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select distinct `users`.`id` as `userId`, `users`.`email` as `email` from `users` order by `users`.`email` asc limit ? offset ?"
    )
    expect(rendered.params).toEqual([10, 20])
  })

  test("renders exists subqueries with shared mysql parameter ordering", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const postExists = StdRoot.Query.select({
      id: posts.id
    }).pipe(
      StdRoot.Query.from(posts),
      StdRoot.Query.where(StdRoot.Query.eq(posts.title, "hello"))
    )

    const plan = StdRoot.Query.select({
      email: users.email,
      hasHelloPost: StdRoot.Query.exists(postExists)
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.where(StdRoot.Query.eq(users.email, "alice@example.com"))
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select `users`.`email` as `email`, exists (select `posts`.`id` as `id` from `posts` where (`posts`.`title` = ?)) as `hasHelloPost` from `users` where (`users`.`email` = ?)"
    )
    expect(rendered.params).toEqual(["hello", "alice@example.com"])
  })

  test("renders correlated exists subqueries against outer mysql sources", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const postExists = StdRoot.Query.select({
      id: posts.id
    }).pipe(
      StdRoot.Query.from(posts),
      StdRoot.Query.where(StdRoot.Query.eq(posts.userId, users.id))
    )

    const plan = StdRoot.Query.select({
      email: users.email,
      hasPosts: StdRoot.Query.exists(postExists)
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.where(StdRoot.Query.eq(users.email, "alice@example.com"))
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select `users`.`email` as `email`, exists (select `posts`.`id` as `id` from `posts` where (`posts`.`userId` = `users`.`id`)) as `hasPosts` from `users` where (`users`.`email` = ?)"
    )
    expect(rendered.params).toEqual(["alice@example.com"])
  })

  test("renders window functions and windowed aggregates with mysql syntax", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = StdRoot.Query.select({
      userId: users.id,
      rowNumber: StdRoot.Function.rowNumber({
        partitionBy: [users.id],
        orderBy: [{ value: posts.id, direction: "asc" }]
      }),
      rankByTitle: StdRoot.Function.rank({
        partitionBy: [users.id],
        orderBy: [{ value: StdRoot.Function.lower(posts.title), direction: "desc" }]
      }),
      postCount: StdRoot.Function.over(StdRoot.Function.count(posts.id), {
        partitionBy: [users.id],
        orderBy: [{ value: posts.id, direction: "asc" }]
      }),
      latestTitle: StdRoot.Function.over(StdRoot.Function.max(posts.title), {
        partitionBy: [users.id]
      })
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.leftJoin(posts, StdRoot.Query.eq(users.id, posts.userId))
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select `users`.`id` as `userId`, row_number() over (partition by `users`.`id` order by `posts`.`id` asc) as `rowNumber`, rank() over (partition by `users`.`id` order by lower(`posts`.`title`) desc) as `rankByTitle`, count(`posts`.`id`) over (partition by `users`.`id` order by `posts`.`id` asc) as `postCount`, max(`posts`.`title`) over (partition by `users`.`id`) as `latestTitle` from `users` left join `posts` on (`users`.`id` = `posts`.`userId`)"
    )
    expect(rendered.params).toEqual([])
  })

  test("renders aliased mysql subqueries as derived tables", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const activePosts = StdRoot.Query.select({
      userId: posts.userId,
      title: posts.title
    }).pipe(
      StdRoot.Query.from(posts),
      StdRoot.Query.where(StdRoot.Query.isNotNull(posts.title))
    )

    const derivedPosts = unsafeAny(activePosts.pipe(StdRoot.Query.as("active_posts")))

    const plan = StdRoot.Query.select({
      userId: users.id,
      title: derivedPosts.title
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.innerJoin(derivedPosts, StdRoot.Query.eq(users.id, derivedPosts.userId))
    )

    const rendered = render(plan)

    expect(rendered.sql).toBe(
      "select `users`.`id` as `userId`, `active_posts`.`title` as `title` from `users` inner join (select `posts`.`userId` as `userId`, `posts`.`title` as `title` from `posts` where (`posts`.`title` is not null)) as `active_posts` on (`users`.`id` = `active_posts`.`userId`)"
    )
    expect(rendered.params).toEqual([])
  })

  test("renders mysql common table expressions as aliased sources", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const activePostsSubquery = StdRoot.Query.select({
      userId: posts.userId,
      title: posts.title
    }).pipe(
      StdRoot.Query.from(posts),
      StdRoot.Query.where(StdRoot.Query.isNotNull(posts.title))
    )
    const activePosts = activePostsSubquery.pipe(StdRoot.Query.with("active_posts"))

    const plan = StdRoot.Query.select({
      userId: users.id,
      title: activePosts.title
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.innerJoin(activePosts, StdRoot.Query.eq(users.id, activePosts.userId))
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "with `active_posts` as (select `posts`.`userId` as `userId`, `posts`.`title` as `title` from `posts` where (`posts`.`title` is not null)) select `users`.`id` as `userId`, `active_posts`.`title` as `title` from `users` inner join `active_posts` on (`users`.`id` = `active_posts`.`userId`)"
    )
  })

  test("rejects mysql data-modifying ctes with returning projections", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })

    const insertedUsers = StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }).pipe(
      StdRoot.Query.returning({
        id: users.id,
        email: users.email,
        bio: users.bio
      }),
      StdRoot.Query.with("inserted_users")
    )

    const plan = StdRoot.Query.select({
      id: insertedUsers.id,
      email: insertedUsers.email,
      bio: insertedUsers.bio
    }).pipe(
      StdRoot.Query.from(insertedUsers)
    )

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported mysql returning"
    )
  })

  test("renders mysql lateral joins with correlated outer references", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const lateralPosts = StdRoot.Query.select({
        postId: posts.id,
        userId: posts.userId
      }).pipe(
        StdRoot.Query.from(posts),
        StdRoot.Query.where(StdRoot.Query.eq(posts.userId, users.id)),
        StdRoot.Query.lateral("user_posts")
      )

    const plan = StdRoot.Query.select({
      userId: users.id,
      postId: lateralPosts.postId
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.innerJoin(lateralPosts, true)
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select `users`.`id` as `userId`, `user_posts`.`postId` as `postId` from `users` inner join lateral (select `posts`.`id` as `postId`, `posts`.`userId` as `userId` from `posts` where (`posts`.`userId` = `users`.`id`)) as `user_posts` on true"
    )
    expect(rendered.params).toEqual([])
  })

  test("renders mysql recursive ctes with the recursive keyword", () => {
    const { posts } = makeMysqlSocialGraph()

    const recursivePosts = StdRoot.Query.select({
        userId: posts.userId
      }).pipe(
        StdRoot.Query.from(posts),
        StdRoot.Query.withRecursive("recursive_posts")
      )

    const plan = StdRoot.Query.select({
      userId: recursivePosts.userId
    }).pipe(
      StdRoot.Query.from(recursivePosts)
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "with recursive `recursive_posts` as (select `posts`.`userId` as `userId` from `posts`) select `recursive_posts`.`userId` as `userId` from `recursive_posts`"
    )
    expect(rendered.params).toEqual([])
  })

  test("rejects mysql upsert statements with returning projections", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })

    const upsertPlan = StdRoot.Query.returning({
      id: users.id,
      email: users.email
    })(StdRoot.Query.upsert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }, ["id"] as const, {
      email: "alice@new.example.com"
    }))

    expect(() => Mysql.Renderer.make().render(upsertPlan)).toThrow(
      "Unsupported mysql returning"
    )
  })

  test("renders mysql locking clauses at the end of select queries", () => {
    const { users } = makeMysqlSocialGraph()

    const plan = StdRoot.Query.select({
      id: users.id
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.lock("update", { nowait: true })
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select `users`.`id` as `id` from `users` for update nowait"
    )
    expect(rendered.params).toEqual([])
  })

  test("renders mysql set operators with stable operand ordering", () => {
    const { users } = makeMysqlSocialGraph()

    const alice = StdRoot.Query.select({
      email: users.email
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.where(StdRoot.Query.eq(users.email, "alice@example.com"))
    )

    const bob = StdRoot.Query.select({
      email: users.email
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.where(StdRoot.Query.eq(users.email, "bob@example.com"))
    )

    const carol = StdRoot.Query.select({
      email: users.email
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.where(StdRoot.Query.eq(users.email, "carol@example.com"))
    )

    const unionPlan = StdRoot.Query.union(StdRoot.Query.union(alice, bob), carol)
    const intersectPlan = StdRoot.Query.intersect(alice, bob)
    const exceptPlan = StdRoot.Query.except(alice, bob)

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

  test("rejects mysql insert update and delete mutations with returning projections", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })

    const insertPlan = StdRoot.Query.returning({
      id: users.id,
      email: users.email,
      bio: users.bio
    })(StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }))

    const updatePlan = StdRoot.Query.returning({
      id: users.id,
      email: users.email,
      bio: users.bio
    })(StdRoot.Query.where(StdRoot.Query.eq(users.id, userId))(
      StdRoot.Query.update(users, {
        email: "updated@example.com",
        bio: null
      })
    ))

    const deletePlan = StdRoot.Query.returning({
      id: users.id
    })(StdRoot.Query.where(StdRoot.Query.eq(users.id, userId))(
      StdRoot.Query.delete(users)
    ))

    expect(() => Mysql.Renderer.make().render(insertPlan)).toThrow(
      "Unsupported mysql returning"
    )
    expect(() => Mysql.Renderer.make().render(updatePlan)).toThrow(
      "Unsupported mysql returning"
    )
    expect(() => Mysql.Renderer.make().render(deletePlan)).toThrow(
      "Unsupported mysql returning"
    )
  })

  test("renders mysql joined update modifiers order and limit", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = StdRoot.Query.limit(2)(
      StdRoot.Query.orderBy(posts.id)(
        StdRoot.Query.lock("lowPriority")(
          StdRoot.Query.where(StdRoot.Query.eq(posts.title, "hello"))(
            StdRoot.Query.innerJoin(posts, StdRoot.Query.eq(posts.userId, users.id))(
              StdRoot.Query.update(users, {
                email: "author@example.com"
              })
            )
          )
        )
      )
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "update low_priority `users` inner join `posts` on (`posts`.`userId` = `users`.`id`) set `email` = ? where (`posts`.`title` = ?) order by `posts`.`id` asc limit 2"
    )
    expect(rendered.params).toEqual([
      "author@example.com",
      "hello"
    ])
  })

  test("renders mysql multi-table update assignments", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = StdRoot.Query.where(StdRoot.Query.eq(posts.userId, users.id))(
      StdRoot.Query.update([users, posts], {
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

    const plan = StdRoot.Query.limit(3)(
      StdRoot.Query.orderBy(posts.id, "desc")(
        StdRoot.Query.lock("quick")(
          StdRoot.Query.where(StdRoot.Query.eq(posts.title, "hello"))(
            StdRoot.Query.innerJoin(posts, StdRoot.Query.eq(posts.userId, users.id))(
              StdRoot.Query.delete(users)
            )
          )
        )
      )
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "delete quick `users` from `users` inner join `posts` on (`posts`.`userId` = `users`.`id`) where (`posts`.`title` = ?) order by `posts`.`id` desc limit 3"
    )
    expect(rendered.params).toEqual([
      "hello"
    ])
  })

  test("renders mysql multi-table delete targets", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = StdRoot.Query.where(StdRoot.Query.eq(posts.userId, users.id))(
      StdRoot.Query.delete([users, posts])
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "delete `users`, `posts` from `users`, `posts` where (`posts`.`userId` = `users`.`id`)"
    )
    expect(rendered.params).toEqual([])
  })

  test("renders mysql multi-row and source-backed inserts", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })
    const archivedUsers = StdRoot.Table.make("archived_users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })

    const valuesSource = unsafeAny(StdRoot.Query.as(StdRoot.Query.values([
      { id: StdRoot.Query.literal(userId), email: "alice@example.com", bio: null },
      { id: StdRoot.Query.literal(secondUserId), email: "bob@example.com", bio: "writer" }
    ] as const), "seed"))

    const multiRowPlan = StdRoot.Query.insert(users).pipe(
      StdRoot.Query.from(valuesSource)
    )

    const insertSelectPlan = StdRoot.Query.insert(archivedUsers).pipe(
      StdRoot.Query.from(StdRoot.Query.select({
      id: users.id,
      email: users.email,
      bio: users.bio
    }).pipe(
      StdRoot.Query.from(users)
    )))

    const insertUnnestPlan = StdRoot.Query.insert(users).pipe(
      StdRoot.Query.from(StdRoot.Query.unnest({
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
    const auditLogs = StdRoot.Table.make("audit_logs", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey, StdRoot.Column.default(StdRoot.Query.literal("audit-log-id"))),
      note: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })

    const defaultInsertPlan = StdRoot.Query.insert(auditLogs)
    const conflictPlan = StdRoot.Query.onConflict(["email"] as const, {
      update: {
        bio: StdRoot.Query.excluded(users.bio)
      }
    })(StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: "writer"
    }))

    expect(Mysql.Renderer.make().render(defaultInsertPlan).sql).toBe(
      "insert into `audit_logs` () values ()"
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
    const orgs = StdRoot.Table.make("orgs", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      slug: StdRoot.Column.text().pipe(StdRoot.Column.unique)
    })
    const membershipsFields = {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      orgId: StdRoot.Column.uuid(),
      role: StdRoot.Column.text(),
      note: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    }
    const membershipsBase = StdRoot.Table.make("memberships", membershipsFields)
    const memberships = membershipsBase.pipe(
      StdRoot.Table.foreignKey((table) => table.orgId, () => orgs.id),
      StdRoot.Table.unique((table) => [table.orgId, table.role]),
      StdRoot.Table.index((table) => [table.role, table.orgId]),
      StdRoot.Table.check("role_not_empty", StdRoot.Query.neq(membershipsBase.role, StdRoot.Query.literal("")))
    )

    expect(Mysql.Renderer.make().render(StdRoot.Query.createTable(memberships, {
      ifNotExists: true
    })).sql).toBe(
      "create table if not exists `memberships` (`id` char(36) not null, `orgId` char(36) not null, `role` text not null, `note` text, primary key (`id`), foreign key (`orgId`) references `orgs` (`id`), unique (`orgId`, `role`), constraint `role_not_empty` check ((`role` <> '')))"
    )
    expect(Mysql.Renderer.make().render(StdRoot.Query.createTable(memberships, {
      ifNotExists: true
    })).params).toEqual([])
    expect(Mysql.Renderer.make().render(StdRoot.Query.createIndex(memberships, ["role", "orgId"] as const)).sql).toBe(
      'create index `memberships_role_orgId_idx` on `memberships` (`role`, `orgId`)'
    )
    expect(Mysql.Renderer.make().render(StdRoot.Query.dropIndex(memberships, ["role", "orgId"] as const)).sql).toBe(
      'drop index `memberships_role_orgId_idx` on `memberships`'
    )
    expect(() => Mysql.Renderer.make().render(StdRoot.Query.createIndex(memberships, ["role", "orgId"] as const, {
      ifNotExists: true
    }))).toThrow("Unsupported mysql create index options")
    expect(() => Mysql.Renderer.make().render(StdRoot.Query.dropIndex(memberships, ["role", "orgId"] as const, {
      ifExists: true
    }))).toThrow("Unsupported mysql drop index options")
    expect(Mysql.Renderer.make().render(StdRoot.Query.dropTable(memberships, {
      ifExists: true
    })).sql).toBe(
      'drop table if exists `memberships`'
    )
  })

  test("renders schema-qualified mysql tables in queries and ddl", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    }, "analytics")
    const events = StdRoot.Table.make("events", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid().pipe(StdRoot.Column.references(() => users.id))
    }, "analytics")

    const plan = StdRoot.Query.select({
      eventId: events.id
    }).pipe(
      StdRoot.Query.from(events)
    )

    expect(Mysql.Renderer.make().render(plan).sql).toBe(
      "select `events`.`id` as `eventId` from `analytics`.`events`"
    )
    expect(Mysql.Renderer.make().render(StdRoot.Query.createTable(events, {
      ifNotExists: true
    })).sql).toBe(
      "create table if not exists `analytics`.`events` (`id` char(36) not null, `userId` char(36) not null, primary key (`id`), foreign key (`userId`) references `analytics`.`users` (`id`))"
    )
  })

  test("decodes nullable joined rows through the mysql executor pipeline", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = StdRoot.Query.select({
      profile: {
        id: users.id,
        email: StdRoot.Function.lower(users.email)
      },
      post: {
        id: posts.id,
        title: StdRoot.Function.lower(posts.title)
      },
      hasPost: StdRoot.Query.isNotNull(posts.id)
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.leftJoin(posts, StdRoot.Query.eq(users.id, posts.userId))
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
      "Renderer.make requires an explicit render implementation for dialect: mysql"
    )
    expect(() => (CoreRenderer.make as (dialect: string) => unknown)("sqlite")).toThrow(
      "Renderer.make requires an explicit render implementation for dialect: sqlite"
    )

    const unsupportedExpression = {
      [ExpressionAst.TypeId]: {
        kind: "unsupported"
      }
    } as unknown as StdRoot.Scalar.Any

    expect(() => renderExpression(unsupportedExpression, {
      params: [],
      ctes: [],
      cteNames: new Set<string>()
    }, mysqlDialect)).toThrow(
      "Unsupported expression for SQL rendering"
    )
  })
})
