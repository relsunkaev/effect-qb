import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import * as CoreRenderer from "../src/renderer.ts"
import * as ExpressionAst from "../src/internal/expression-ast.ts"
import { mysqlDialect } from "../src/internal/mysql-dialect.ts"
import { renderExpression } from "../src/internal/sql-expression-renderer.ts"
import * as Mysql from "../src/mysql.ts"
import { makeMysqlSocialGraph } from "./fixtures/schema.ts"

const userId = "11111111-1111-1111-1111-111111111111"

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

    const selected = Mysql.Query.select({
      emailLabel: Mysql.Query.concat(
        Mysql.Query.lower(users.email),
        "-",
        Mysql.Query.coalesce(Mysql.Query.max(posts.title), "missing")
      ),
      firstTitle: Mysql.Query.min(posts.title),
      postCount: Mysql.Query.count(posts.id)
    })
    const fromUsers = Mysql.Query.from(users)(selected as never)
    const joined = Mysql.Query.innerJoin(posts, Mysql.Query.eq(users.id, posts.userId))(fromUsers)
    const grouped = Mysql.Query.groupBy(Mysql.Query.lower(users.email))(joined)
    const filtered = Mysql.Query.having(Mysql.Query.eq(Mysql.Query.count(posts.id), 2))(grouped)
    const plan = Mysql.Query.orderBy(Mysql.Query.count(posts.id), "desc")(filtered)

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
      loweredEmail: Mysql.Query.lower(users.email),
      postCount: Mysql.Query.count(posts.id)
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.innerJoin(posts, Mysql.Query.eq(users.id, posts.userId)),
      Mysql.Query.groupBy(Mysql.Query.lower(users.email)),
      Mysql.Query.groupBy(Mysql.Query.lower(users.email))
    )

    expect(Mysql.Renderer.make().render(valid).sql).toBe(
      "select lower(`users`.`email`) as `loweredEmail`, count(`posts`.`id`) as `postCount` from `users` inner join `posts` on (`users`.`id` = `posts`.`userId`) group by lower(`users`.`email`)"
    )

    const invalid = Mysql.Query.select({
      email: users.email,
      postCount: Mysql.Query.count(posts.id)
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.innerJoin(posts, Mysql.Query.eq(users.id, posts.userId)),
      Mysql.Query.groupBy(Mysql.Query.lower(users.email))
    )

    expect(() => Mysql.Renderer.make().render(invalid as never)).toThrow(
      "Invalid grouped selection: scalar expressions must be covered by groupBy(...) when aggregates are present"
    )
  })

  test("renders literal-only scalar operators with stable mysql parameter ordering", () => {
    const plan = Mysql.Query.select({
      stitched: Mysql.Query.concat("a", "b", "c"),
      fallback: Mysql.Query.coalesce(null, null, "done"),
      missing: Mysql.Query.isNull(null),
      present: Mysql.Query.isNotNull("x"),
      caps: Mysql.Query.upper("mix"),
      lowered: Mysql.Query.lower("MIX")
    })

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select concat(?, ?, ?) as `stitched`, coalesce(null, null, ?) as `fallback`, (null is null) as `missing`, (? is not null) as `present`, upper(?) as `caps`, lower(?) as `lowered`"
    )
    expect(rendered.params).toEqual(["a", "b", "c", "done", "x", "mix", "MIX"])
  })

  test("renders boolean combinators and clause-level parameter ordering across mysql queries", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = Mysql.Query.select({
      summary: Mysql.Query.concat(
        Mysql.Query.lower(users.email),
        "::",
        Mysql.Query.upper(Mysql.Query.coalesce(posts.title, "missing"))
      ),
      draftOrMissing: Mysql.Query.or(
        Mysql.Query.isNull(posts.title),
        Mysql.Query.eq(Mysql.Query.lower(posts.title), "draft")
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
          Mysql.Query.eq(Mysql.Query.coalesce(posts.title, "missing"), "archived")
        )
      )),
      Mysql.Query.orderBy(
        Mysql.Query.upper(Mysql.Query.coalesce(posts.title, "missing")),
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

  test("renders searched case expressions with mysql placeholders", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const selected = Mysql.Query.select({
      titleState: Mysql.Query.case()
        .when(Mysql.Query.isNull(posts.title), "missing")
        .when(Mysql.Query.eq(Mysql.Query.lower(posts.title), "draft"), "draft")
        .else(Mysql.Query.upper(Mysql.Query.coalesce(posts.title, "published")))
    })
    const fromUsers = Mysql.Query.from(users)(selected as never)
    const plan = Mysql.Query.leftJoin(posts, Mysql.Query.eq(users.id, posts.userId))(fromUsers)

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select case when (`posts`.`title` is null) then ? when (lower(`posts`.`title`) = ?) then ? else upper(coalesce(`posts`.`title`, ?)) end as `titleState` from `users` left join `posts` on (`users`.`id` = `posts`.`userId`)"
    )
    expect(rendered.params).toEqual(["missing", "draft", "draft", "published"])
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

  test("renders aliased mysql subqueries as derived tables", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const activePosts = Mysql.Query.select({
      userId: posts.userId,
      title: posts.title
    }).pipe(
      Mysql.Query.from(posts),
      Mysql.Query.where(Mysql.Query.isNotNull(posts.title))
    )

    const derivedPosts = Mysql.Query.as(activePosts, "active_posts")

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

  test("decodes nullable joined rows through the mysql executor pipeline", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = Mysql.Query.select({
      profile: {
        id: users.id,
        email: Mysql.Query.lower(users.email)
      },
      post: {
        id: posts.id,
        title: Mysql.Query.lower(posts.title)
      },
      hasPost: Mysql.Query.isNotNull(posts.id)
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.leftJoin(posts, Mysql.Query.eq(users.id, posts.userId))
    )

    const rows = Effect.runSync(Mysql.Executor.fromDriver(
      Mysql.Renderer.make(),
      Mysql.Executor.driver(() => Effect.succeed([{
        profile__id: userId,
        profile__email: "alice@example.com",
        post__id: null,
        post__title: null,
        hasPost: false
      }]))
    ).execute(plan))

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
        kind: "window"
      }
    } as unknown as Mysql.Expression.Any

    expect(() => renderExpression(unsupportedExpression, { params: [] }, mysqlDialect)).toThrow(
      "Unsupported expression for SQL rendering"
    )
  })
})
