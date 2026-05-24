import { describe, expect, test } from "bun:test"

import * as Mysql from "#mysql"
import * as Sqlite from "#sqlite"
import * as Standard from "#standard"
import { Column as C, Table } from "#standard"
import { Query as Q, Function as F, Renderer } from "#postgres"
import { makeMysqlEmployees, makeMysqlSocialGraph, makeRootSocialGraph } from "../../fixtures/schema.ts"
import * as StdRoot from "#standard"

describe("rendering behavior", () => {
  test("standard plans render through every built-in SQL renderer", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      email: Standard.Column.text()
    })

    const plan = Standard.Query.select({
      label: Standard.Function.concat(Standard.Function.lower(users.email), "-user")
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.where(Standard.Query.eq(users.email, "alice@example.com"))
    )

    expect(Standard.Renderer.make().render(plan).sql).toBe('select (lower("users"."email") || ?) as "label" from "users" where ("users"."email" = ?)')
    expect(Renderer.make().render(plan).sql).toBe('select (lower("users"."email") || $1) as "label" from "users" where ("users"."email" = $2)')
    expect(Mysql.Renderer.make().render(plan).sql).toBe("select concat(lower(`users`.`email`), ?) as `label` from `users` where (`users`.`email` = ?)")
    expect(Sqlite.Renderer.make().render(plan).sql).toBe('select (lower("users"."email") || ?) as "label" from "users" where ("users"."email" = ?)')
  })

  test("rejects untyped standard plans that mix concrete dialects at render time", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey)
    })

    const conflict = Standard.Query.select({
      id: users.id
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.orderBy(Q.literal(1) as any),
      Standard.Query.where(Mysql.Query.literal(true) as any)
    )

    expect(() => Renderer.make().render(conflict as any)).toThrow(
      "effect-qb: plan dialect is not compatible with the target renderer or executor"
    )
  })

  test("standard ctes, joins, grouping, ordering, and pagination render across built-in SQL renderers", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      email: Standard.Column.text()
    })
    const posts = Standard.Table.make("posts", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      userId: Standard.Column.uuid(),
      title: Standard.Column.text().pipe(Standard.Column.nullable)
    })
    const activePosts = Standard.Query.select({
      userId: posts.userId,
      title: posts.title
    }).pipe(
      Standard.Query.from(posts),
      Standard.Query.where(Standard.Query.isNotNull(posts.title)),
      Standard.Query.with("active_posts")
    )
    const postCount = Standard.Function.count(activePosts.title)
    const plan = Standard.Query.select({
      email: users.email,
      postCount
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.leftJoin(activePosts, Standard.Query.eq(users.id, activePosts.userId)),
      Standard.Query.groupBy(users.email),
      Standard.Query.having(Standard.Query.gt(postCount, 0)),
      Standard.Query.orderBy(users.email),
      Standard.Query.limit(10),
      Standard.Query.offset(5)
    )

    expect(Standard.Renderer.make().render(plan).sql).toBe(
      'with "active_posts" as (select "posts"."userId" as "userId", "posts"."title" as "title" from "posts" where ("posts"."title" is not null)) select "users"."email" as "email", count("active_posts"."title") as "postCount" from "users" left join "active_posts" on ("users"."id" = "active_posts"."userId") group by "users"."email" having (count("active_posts"."title") > ?) order by "users"."email" asc limit ? offset ?'
    )
    expect(Renderer.make().render(plan).sql).toBe(
      'with "active_posts" as (select "posts"."userId" as "userId", "posts"."title" as "title" from "posts" where ("posts"."title" is not null)) select "users"."email" as "email", count("active_posts"."title") as "postCount" from "users" left join "active_posts" on ("users"."id" = "active_posts"."userId") group by "users"."email" having (count("active_posts"."title") > $1) order by "users"."email" asc limit $2 offset $3'
    )
    expect(Mysql.Renderer.make().render(plan).sql).toBe(
      "with `active_posts` as (select `posts`.`userId` as `userId`, `posts`.`title` as `title` from `posts` where (`posts`.`title` is not null)) select `users`.`email` as `email`, count(`active_posts`.`title`) as `postCount` from `users` left join `active_posts` on (`users`.`id` = `active_posts`.`userId`) group by `users`.`email` having (count(`active_posts`.`title`) > ?) order by `users`.`email` asc limit ? offset ?"
    )
    expect(Sqlite.Renderer.make().render(plan).sql).toBe(
      'with "active_posts" as (select "posts"."userId" as "userId", "posts"."title" as "title" from "posts" where ("posts"."title" is not null)) select "users"."email" as "email", count("active_posts"."title") as "postCount" from "users" left join "active_posts" on ("users"."id" = "active_posts"."userId") group by "users"."email" having (count("active_posts"."title") > ?) order by "users"."email" asc limit ? offset ?'
    )
  })

  test("standard insert, update, and delete render across built-in SQL renderers", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      email: Standard.Column.text(),
      bio: Standard.Column.text().pipe(Standard.Column.nullable)
    })
    const id = "11111111-1111-1111-1111-111111111111"
    const insert = Standard.Query.insert(users, {
      id,
      email: "alice@example.com",
      bio: null
    })
    const update = Standard.Query.update(users, {
      email: "updated@example.com"
    }).pipe(
      Standard.Query.where(Standard.Query.eq(users.id, id))
    )
    const delete_ = Standard.Query.delete(users).pipe(
      Standard.Query.where(Standard.Query.eq(users.id, id))
    )

    expect(Standard.Renderer.make().render(insert).sql).toBe('insert into "users" ("id", "email", "bio") values (?, ?, null)')
    expect(Renderer.make().render(insert).sql).toBe('insert into "users" ("id", "email", "bio") values ($1, $2, null)')
    expect(Mysql.Renderer.make().render(insert).sql).toBe("insert into `users` (`id`, `email`, `bio`) values (?, ?, null)")
    expect(Sqlite.Renderer.make().render(insert).sql).toBe('insert into "users" ("id", "email", "bio") values (?, ?, null)')

    expect(Standard.Renderer.make().render(update).sql).toBe('update "users" set "email" = ? where ("users"."id" = ?)')
    expect(Renderer.make().render(update).sql).toBe('update "users" set "email" = $1 where ("users"."id" = $2)')
    expect(Mysql.Renderer.make().render(update).sql).toBe("update `users` set `email` = ? where (`users`.`id` = ?)")
    expect(Sqlite.Renderer.make().render(update).sql).toBe('update "users" set "email" = ? where ("users"."id" = ?)')

    expect(Standard.Renderer.make().render(delete_).sql).toBe('delete from "users" where ("users"."id" = ?)')
    expect(Renderer.make().render(delete_).sql).toBe('delete from "users" where ("users"."id" = $1)')
    expect(Mysql.Renderer.make().render(delete_).sql).toBe("delete from `users` where (`users`.`id` = ?)")
    expect(Sqlite.Renderer.make().render(delete_).sql).toBe('delete from "users" where ("users"."id" = ?)')
  })

  test("rejects malformed between predicates before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      id: Standard.Column.int()
    })
    const between = Standard.Query.between(users.id, 1, 2)
    ;(between as any)[expressionAst].values = [users.id, Standard.Query.literal(1)]
    const plan = Standard.Query.select({
      ok: between
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "between(...) requires exactly three operands"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "between(...) requires exactly three operands"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "between(...) requires exactly three operands"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "between(...) requires exactly three operands"
    )
  })

  test("rejects malformed boolean combinators before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const matchesEmail = Standard.Query.eq(users.email, "alice@example.com")
    const conjunction = Standard.Query.and(matchesEmail)
    const disjunction = Standard.Query.or(matchesEmail)
    ;(conjunction as any)[expressionAst].values = undefined
    ;(disjunction as any)[expressionAst].values = undefined

    const andPlan = Standard.Query.select({
      ok: conjunction
    }).pipe(Standard.Query.from(users))
    const orPlan = Standard.Query.select({
      ok: disjunction
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(andPlan)).toThrow(
      "and(...) requires at least one predicate"
    )
    expect(() => Renderer.make().render(andPlan)).toThrow(
      "and(...) requires at least one predicate"
    )
    expect(() => Mysql.Renderer.make().render(andPlan)).toThrow(
      "and(...) requires at least one predicate"
    )
    expect(() => Sqlite.Renderer.make().render(andPlan)).toThrow(
      "and(...) requires at least one predicate"
    )

    expect(() => Standard.Renderer.make().render(orPlan)).toThrow(
      "or(...) requires at least one predicate"
    )
    expect(() => Renderer.make().render(orPlan)).toThrow(
      "or(...) requires at least one predicate"
    )
    expect(() => Mysql.Renderer.make().render(orPlan)).toThrow(
      "or(...) requires at least one predicate"
    )
    expect(() => Sqlite.Renderer.make().render(orPlan)).toThrow(
      "or(...) requires at least one predicate"
    )
  })

  test("rejects malformed coalesce expressions before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const coalesced = Standard.Function.coalesce(users.email, "missing")
    ;(coalesced as any)[expressionAst].values = []
    const plan = Standard.Query.select({
      email: coalesced
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "coalesce(...) requires at least one value"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "coalesce(...) requires at least one value"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "coalesce(...) requires at least one value"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "coalesce(...) requires at least one value"
    )
  })

  test("rejects malformed concat expressions before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const label = Standard.Function.concat(users.email, "-user")
    ;(label as any)[expressionAst].values = []
    const plan = Standard.Query.select({
      label
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "concat(...) requires at least two values"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "concat(...) requires at least two values"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "concat(...) requires at least two values"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "concat(...) requires at least two values"
    )
  })

  test("postgres renders clause combinations with stable parameter ordering", () => {
    const { users, posts } = makeRootSocialGraph()

    const plan = Q.select({
      label: F.concat(F.lower(users.email), "::"),
      fallbackTitle: F.coalesce(posts.title, Q.literal("missing")),
      ok: Q.not(Q.or(Q.eq(users.email, "a"), Q.isNull(posts.title)))
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
      Q.where(Q.and(Q.eq(users.email, "alice@example.com"), Q.isNotNull(posts.title))),
      Q.orderBy(F.lower(users.email), "desc")
    )

    const rendered = Renderer.make().render(plan)

    expect(rendered.sql).toBe('select (lower("users"."email") || $1) as "label", coalesce("posts"."title", $2) as "fallbackTitle", (not (("users"."email" = $3) or ("posts"."title" is null))) as "ok" from "users" left join "posts" on ("users"."id" = "posts"."userId") where (("users"."email" = $4) and ("posts"."title" is not null)) order by lower("users"."email") desc')
    expect(rendered.params).toEqual(["::", "missing", "a", "alice@example.com"])
    expect(rendered.projections).toEqual([
      { path: ["label"], alias: "label" },
      { path: ["fallbackTitle"], alias: "fallbackTitle" },
      { path: ["ok"], alias: "ok" }
    ])
  })

  test("mysql renders the same logical query with mysql-specific quoting and placeholders", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = Mysql.Query.select({
      label: Mysql.Function.concat(Mysql.Function.lower(users.email), "::"),
      fallbackTitle: Mysql.Function.coalesce(posts.title, Mysql.Query.literal("missing")),
      ok: Mysql.Query.not(Mysql.Query.or(Mysql.Query.eq(users.email, "a"), Mysql.Query.isNull(posts.title)))
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.leftJoin(posts, Mysql.Query.eq(users.id, posts.userId)),
      Mysql.Query.where(Mysql.Query.and(Mysql.Query.eq(users.email, "alice@example.com"), Mysql.Query.isNotNull(posts.title))),
      Mysql.Query.orderBy(Mysql.Function.lower(users.email), "desc")
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe('select concat(lower(`users`.`email`), ?) as `label`, coalesce(`posts`.`title`, ?) as `fallbackTitle`, (not ((`users`.`email` = ?) or (`posts`.`title` is null))) as `ok` from `users` left join `posts` on (`users`.`id` = `posts`.`userId`) where ((`users`.`email` = ?) and (`posts`.`title` is not null)) order by lower(`users`.`email`) desc')
    expect(rendered.params).toEqual(["::", "missing", "a", "alice@example.com"])
    expect(rendered.projections).toEqual([
      { path: ["label"], alias: "label" },
      { path: ["fallbackTitle"], alias: "fallbackTitle" },
      { path: ["ok"], alias: "ok" }
    ])
  })

  test("renders literal-only selections without a from clause", () => {
    const plan = Q.select({
      answer: Q.literal(42),
      label: Q.literal("user")
    })

    const rendered = Renderer.make().render(plan)

    expect(rendered.sql).toBe('select $1 as "answer", $2 as "label"')
    expect(rendered.params).toEqual([42, "user"])
    expect(rendered.projections).toEqual([
      { path: ["answer"], alias: "answer" },
      { path: ["label"], alias: "label" }
    ])
  })

  test("rejects invalid Date literals before rendering params", () => {
    expect(() => Renderer.make().render(Q.select({
      value: Q.literal(new Date("not a date"))
    }))).toThrow()
  })

  test("rejects incomplete plans that still require sources", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const incomplete = Q.select({
      id: users.id
    })

    expect(() => Renderer.make().render(incomplete)).toThrow(
      "query references sources that are not yet in scope"
    )
  })

  test("keeps projection metadata deterministic across repeated renders", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const plan = Q.select({
      profile: {
        id: users.id,
        lowerEmail: Q.as(F.lower(users.email), "email_lower")
      },
      kind: Q.literal("user")
    }).pipe(
      Q.from(users)
    )

    const renderer = Renderer.make()
    const first = renderer.render(plan)
    const second = renderer.render(plan)

    expect(first.sql).toBe('select "users"."id" as "profile__id", lower("users"."email") as "email_lower", $1 as "kind" from "users"')
    expect(first.projections).toEqual([
      { path: ["profile", "id"], alias: "profile__id" },
      { path: ["profile", "lowerEmail"], alias: "email_lower" },
      { path: ["kind"], alias: "kind" }
    ])
    expect(second.sql).toBe(first.sql)
    expect(second.params).toEqual(first.params)
    expect(second.projections).toEqual(first.projections)
  })

  test("rejects explicit aliases that collide with auto-generated aliases", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const invalid = Q.select({
      profile: {
        id: users.id
      },
      email: Q.as(users.email, "profile__id")
    }).pipe(
      Q.from(users)
    )

    expect(() => Renderer.make().render(invalid)).toThrow("Duplicate projection alias: profile__id")
  })

  test("quotes aliased self-joins with logical alias names and physical base tables", () => {
    const employees = makeMysqlEmployees()
    const manager = StdRoot.Table.alias(employees, "manager")
    const report = StdRoot.Table.alias(employees, "report")

    const plan = Mysql.Query.select({
      managerId: manager.id,
      reportName: report.name
    }).pipe(
      Mysql.Query.from(manager),
      Mysql.Query.leftJoin(report, Mysql.Query.eq(report.managerId, manager.id))
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe('select `manager`.`id` as `managerId`, `report`.`name` as `reportName` from `employees` as `manager` left join `employees` as `report` on (`report`.`managerId` = `manager`.`id`)')
    expect(rendered.params).toEqual([])
  })
})
