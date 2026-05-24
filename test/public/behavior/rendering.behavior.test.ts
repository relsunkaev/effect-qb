import { describe, expect, test } from "bun:test"

import * as Mysql from "#mysql"
import * as Sqlite from "#sqlite"
import * as Standard from "#standard"
import { Column as C, Table } from "#standard"
import { Query as Q, Function as F, Json as PgJson, Renderer } from "#postgres"
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

  test("rejects malformed membership predicates before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const includesEmail = Standard.Query.in(users.email, "alice@example.com")
    const excludesEmail = Standard.Query.notIn(users.email, "alice@example.com")
    ;(includesEmail as any)[expressionAst].values = undefined
    ;(excludesEmail as any)[expressionAst].values = undefined

    const inPlan = Standard.Query.select({
      ok: includesEmail
    }).pipe(Standard.Query.from(users))
    const notInPlan = Standard.Query.select({
      ok: excludesEmail
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(inPlan)).toThrow(
      "in(...) requires at least one candidate value"
    )
    expect(() => Renderer.make().render(inPlan)).toThrow(
      "in(...) requires at least one candidate value"
    )
    expect(() => Mysql.Renderer.make().render(inPlan)).toThrow(
      "in(...) requires at least one candidate value"
    )
    expect(() => Sqlite.Renderer.make().render(inPlan)).toThrow(
      "in(...) requires at least one candidate value"
    )

    expect(() => Standard.Renderer.make().render(notInPlan)).toThrow(
      "notIn(...) requires at least one candidate value"
    )
    expect(() => Renderer.make().render(notInPlan)).toThrow(
      "notIn(...) requires at least one candidate value"
    )
    expect(() => Mysql.Renderer.make().render(notInPlan)).toThrow(
      "notIn(...) requires at least one candidate value"
    )
    expect(() => Sqlite.Renderer.make().render(notInPlan)).toThrow(
      "notIn(...) requires at least one candidate value"
    )
  })

  test("rejects malformed case expressions before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const label = Standard.Query.case()
      .when(Standard.Query.eq(users.email, "alice@example.com"), "match")
      .else("missing")
    ;(label as any)[expressionAst].branches = []
    const plan = Standard.Query.select({
      label
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "case(...) requires at least one branch"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "case(...) requires at least one branch"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "case(...) requires at least one branch"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "case(...) requires at least one branch"
    )
  })

  test("rejects case expressions without a branch array before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const label = Standard.Query.case()
      .when(Standard.Query.eq(users.email, "alice@example.com"), "match")
      .else("missing")
    ;(label as any)[expressionAst].branches = undefined
    const plan = Standard.Query.select({
      label
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "case(...) requires at least one branch"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "case(...) requires at least one branch"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "case(...) requires at least one branch"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "case(...) requires at least one branch"
    )
  })

  test("rejects grouped case expressions without a branch array before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const label = Standard.Query.case()
      .when(Standard.Query.eq(users.email, "alice@example.com"), "match")
      .else("missing")
    const plan = Standard.Query.select({
      label
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.groupBy(label)
    )
    ;(label as any)[expressionAst].branches = undefined

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "case(...) requires at least one branch"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "case(...) requires at least one branch"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "case(...) requires at least one branch"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "case(...) requires at least one branch"
    )
  })

  test("rejects case expressions without a fallback before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const label = Standard.Query.case()
      .when(Standard.Query.eq(users.email, "alice@example.com"), "match")
      .else("missing")
    ;(label as any)[expressionAst].else = undefined
    const plan = Standard.Query.select({
      label
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "case(...) requires an else expression"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "case(...) requires an else expression"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "case(...) requires an else expression"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "case(...) requires an else expression"
    )
  })

  test("rejects case expressions with incomplete branches before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const label = Standard.Query.case()
      .when(Standard.Query.eq(users.email, "alice@example.com"), "match")
      .else("missing")
    ;(label as any)[expressionAst].branches[0].then = undefined
    const plan = Standard.Query.select({
      label
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "case(...) requires every branch to define when and then expressions"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "case(...) requires every branch to define when and then expressions"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "case(...) requires every branch to define when and then expressions"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "case(...) requires every branch to define when and then expressions"
    )
  })

  test("rejects window over expressions without an aggregate before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const postCount = Standard.Function.over(Standard.Function.count(users.email), {
      partitionBy: [users.email]
    })
    ;(postCount as any)[expressionAst].value = undefined
    const plan = Standard.Query.select({
      postCount
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "window over(...) requires an aggregate expression"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "window over(...) requires an aggregate expression"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "window over(...) requires an aggregate expression"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "window over(...) requires an aggregate expression"
    )
  })

  test("rejects invalid window order directions before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const rowNumber = Standard.Function.rowNumber({
      orderBy: [{ value: users.email, direction: "asc" }]
    })
    ;(rowNumber as any)[expressionAst].orderBy[0].direction = "sideways"
    const plan = Standard.Query.select({
      rowNumber
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "window order direction must be asc or desc"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "window order direction must be asc or desc"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "window order direction must be asc or desc"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "window order direction must be asc or desc"
    )
  })

  test("rejects window order terms without expressions before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const rowNumber = Standard.Function.rowNumber({
      orderBy: [{ value: users.email, direction: "asc" }]
    })
    ;(rowNumber as any)[expressionAst].orderBy[0].value = undefined
    const plan = Standard.Query.select({
      rowNumber
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "window order terms require expression values"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "window order terms require expression values"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "window order terms require expression values"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "window order terms require expression values"
    )
  })

  test("rejects window partition terms without expressions before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const rowNumber = Standard.Function.rowNumber({
      partitionBy: [users.email],
      orderBy: [{ value: users.email, direction: "asc" }]
    })
    ;(rowNumber as any)[expressionAst].partitionBy[0] = undefined
    const plan = Standard.Query.select({
      rowNumber
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "window partition terms require expression values"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "window partition terms require expression values"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "window partition terms require expression values"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "window partition terms require expression values"
    )
  })

  test("rejects window expressions without clause arrays before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const rowNumber = Standard.Function.rowNumber({
      partitionBy: [users.email],
      orderBy: [{ value: users.email, direction: "asc" }]
    })
    ;(rowNumber as any)[expressionAst].orderBy = undefined
    const plan = Standard.Query.select({
      rowNumber
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "window expressions require partitionBy and orderBy arrays"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "window expressions require partitionBy and orderBy arrays"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "window expressions require partitionBy and orderBy arrays"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "window expressions require partitionBy and orderBy arrays"
    )
  })

  test("rejects invalid quantified comparison operators before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey)
    })
    const userIds = Standard.Query.select({
      value: users.id
    }).pipe(Standard.Query.from(users))
    const matchesAny = Standard.Query.compareAny(users.id, userIds, "eq")
    ;(matchesAny as any)[expressionAst].operator = "sideways"
    const plan = Standard.Query.select({
      matchesAny
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "quantified comparison operator must be eq, neq, lt, lte, gt, or gte"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "quantified comparison operator must be eq, neq, lt, lte, gt, or gte"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "quantified comparison operator must be eq, neq, lt, lte, gt, or gte"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "quantified comparison operator must be eq, neq, lt, lte, gt, or gte"
    )
  })

  test("rejects subquery predicates without left operands before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey)
    })
    const userIds = Standard.Query.select({
      value: users.id
    }).pipe(Standard.Query.from(users))
    const matchesAny = Standard.Query.inSubquery(users.id, userIds)
    ;(matchesAny as any)[expressionAst].left = undefined
    const plan = Standard.Query.select({
      matchesAny
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "inSubquery(...) requires a value expression"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "inSubquery(...) requires a value expression"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "inSubquery(...) requires a value expression"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "inSubquery(...) requires a value expression"
    )
  })

  test("rejects grouped quantified comparisons without left operands before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey)
    })
    const userIds = Standard.Query.select({
      value: users.id
    }).pipe(Standard.Query.from(users))
    const matchesAny = Standard.Query.compareAny(users.id, userIds, "eq")
    const plan = Standard.Query.select({
      matchesAny,
      userCount: Standard.Function.count(users.id)
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.groupBy(matchesAny)
    )
    ;(matchesAny as any)[expressionAst].left = undefined

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "compareAny(...) requires a value expression"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "compareAny(...) requires a value expression"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "compareAny(...) requires a value expression"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "compareAny(...) requires a value expression"
    )
  })

  test("rejects collate expressions without collation identifiers before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const email = Standard.Query.collate(Standard.Query.literal("alice@example.com"), "C")
    ;(email as any)[expressionAst].collation = []
    const plan = Standard.Query.select({
      email
    })

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "collate(...) requires at least one collation identifier"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "collate(...) requires at least one collation identifier"
    )
  })

  test("rejects collate expressions without value operands before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const email = Standard.Query.collate(Standard.Query.literal("alice@example.com"), "C")
    ;(email as any)[expressionAst].value = undefined
    const plan = Standard.Query.select({
      email
    })

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "collate(...) requires a value expression"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "collate(...) requires a value expression"
    )
  })

  test("rejects grouped collate expressions without value operands before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const email = Standard.Query.collate(users.email, "C")
    const plan = Standard.Query.select({
      email
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.groupBy(email)
    )
    ;(email as any)[expressionAst].value = undefined

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "collate(...) requires a value expression"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "collate(...) requires a value expression"
    )
  })

  test("rejects cast expressions without a target type before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const value = Standard.Query.cast(Standard.Query.literal(1), Standard.Query.type.text())
    ;(value as any)[expressionAst].target = undefined
    const plan = Standard.Query.select({
      value
    })

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "cast(...) requires a target db type"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "cast(...) requires a target db type"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "cast(...) requires a target db type"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "cast(...) requires a target db type"
    )
  })

  test("rejects cast expressions without value operands before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const value = Standard.Query.cast(Standard.Query.literal(1), Standard.Query.type.text())
    ;(value as any)[expressionAst].value = undefined
    const plan = Standard.Query.select({
      value
    })

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "cast(...) requires a value expression"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "cast(...) requires a value expression"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "cast(...) requires a value expression"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "cast(...) requires a value expression"
    )
  })

  test("rejects grouped cast expressions without a target type before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const value = Standard.Query.cast(users.email, Standard.Query.type.text())
    const plan = Standard.Query.select({
      value
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.groupBy(value)
    )
    ;(value as any)[expressionAst].target = undefined

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "cast(...) requires a target db type"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "cast(...) requires a target db type"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "cast(...) requires a target db type"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "cast(...) requires a target db type"
    )
  })

  test("rejects grouped cast expressions without value operands before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const value = Standard.Query.cast(users.email, Standard.Query.type.text())
    const plan = Standard.Query.select({
      value
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.groupBy(value)
    )
    ;(value as any)[expressionAst].value = undefined

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "cast(...) requires a value expression"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "cast(...) requires a value expression"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "cast(...) requires a value expression"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "cast(...) requires a value expression"
    )
  })

  test("rejects current date function arguments before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const today = Standard.Function.currentDate()
    ;(today as any)[expressionAst].args = [Standard.Query.literal(1)]
    const plan = Standard.Query.select({
      today
    })

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "current_date does not accept arguments"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "current_date does not accept arguments"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "current_date does not accept arguments"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "current_date does not accept arguments"
    )
  })

  test("rejects extract function calls with the wrong arity before rendering SQL", () => {
    const extracted = Standard.Function.call("extract", Standard.Query.literal("year"))
    const plan = Standard.Query.select({
      extracted
    })

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "extract(...) requires exactly field and source arguments"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "extract(...) requires exactly field and source arguments"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "extract(...) requires exactly field and source arguments"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "extract(...) requires exactly field and source arguments"
    )
  })

  test("rejects function calls without a function name before rendering SQL", () => {
    const value = Standard.Function.call("", Standard.Query.literal(1))
    const plan = Standard.Query.select({
      value
    })

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "function calls require a non-empty function name"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "function calls require a non-empty function name"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "function calls require a non-empty function name"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "function calls require a non-empty function name"
    )
  })

  test("rejects grouped function calls without a function name before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const value = Standard.Function.call("lower", users.email)
    const plan = Standard.Query.select({
      value
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.groupBy(value)
    )
    ;(value as any)[expressionAst].name = undefined

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "function calls require a non-empty function name"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "function calls require a non-empty function name"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "function calls require a non-empty function name"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "function calls require a non-empty function name"
    )
  })

  test("rejects function calls without an argument array before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const value = Standard.Function.call("lower", Standard.Query.literal("ALICE"))
    ;(value as any)[expressionAst].args = undefined
    const plan = Standard.Query.select({
      value
    })

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "function calls require an argument array"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "function calls require an argument array"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "function calls require an argument array"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "function calls require an argument array"
    )
  })

  test("rejects function call arguments without value expressions before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const value = Standard.Function.call("lower", Standard.Query.literal("ALICE"))
    ;(value as any)[expressionAst].args = [undefined]
    const plan = Standard.Query.select({
      value
    })

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "function call arguments require value expressions"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "function call arguments require value expressions"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "function call arguments require value expressions"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "function call arguments require value expressions"
    )
  })

  test("rejects grouped function call arguments without value expressions before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const value = Standard.Function.call("lower", users.email)
    const plan = Standard.Query.select({
      value
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.groupBy(value)
    )
    ;(value as any)[expressionAst].args = [undefined]

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "function call arguments require value expressions"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "function call arguments require value expressions"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "function call arguments require value expressions"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "function call arguments require value expressions"
    )
  })

  test("rejects unary expressions without value operands before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const email = Standard.Function.lower(users.email)
    ;(email as any)[expressionAst].value = undefined
    const plan = Standard.Query.select({
      email
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "lower(...) requires a value expression"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "lower(...) requires a value expression"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "lower(...) requires a value expression"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "lower(...) requires a value expression"
    )
  })

  test("rejects grouped unary expressions without value operands before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const email = Standard.Function.lower(users.email)
    const plan = Standard.Query.select({
      email
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.groupBy(email)
    )
    ;(email as any)[expressionAst].value = undefined

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "lower(...) requires a value expression"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "lower(...) requires a value expression"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "lower(...) requires a value expression"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "lower(...) requires a value expression"
    )
  })

  test("rejects binary expressions without operands before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const matches = Standard.Query.eq(users.email, "alice@example.com")
    ;(matches as any)[expressionAst].right = undefined
    const plan = Standard.Query.select({
      matches
    }).pipe(Standard.Query.from(users))

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "eq(...) requires left and right expressions"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "eq(...) requires left and right expressions"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "eq(...) requires left and right expressions"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "eq(...) requires left and right expressions"
    )
  })

  test("rejects grouped binary expressions without operands before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const matches = Standard.Query.eq(users.email, "alice@example.com")
    const plan = Standard.Query.select({
      matches
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.groupBy(matches)
    )
    ;(matches as any)[expressionAst].right = undefined

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "eq(...) requires left and right expressions"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "eq(...) requires left and right expressions"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "eq(...) requires left and right expressions"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "eq(...) requires left and right expressions"
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

  test("rejects coalesce expressions without a value array before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const coalesced = Standard.Function.coalesce(users.email, "missing")
    ;(coalesced as any)[expressionAst].values = {}
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

  test("rejects grouped coalesce expressions without a value array before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const coalesced = Standard.Function.coalesce(users.email, "missing")
    const plan = Standard.Query.select({
      email: coalesced
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.groupBy(coalesced)
    )
    ;(coalesced as any)[expressionAst].values = undefined

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

  test("rejects json build object expressions without an entries array before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const pgBuiltObject = PgJson.json.buildObject({
      email: "alice@example.com"
    })
    const mysqlBuiltObject = Mysql.Json.json.buildObject({
      email: "alice@example.com"
    })
    const sqliteBuiltObject = Sqlite.Json.json.buildObject({
      email: "alice@example.com"
    })
    ;(pgBuiltObject as any)[expressionAst].entries = {}
    ;(mysqlBuiltObject as any)[expressionAst].entries = {}
    ;(sqliteBuiltObject as any)[expressionAst].entries = {}

    expect(() => Renderer.make().render(Q.select({ builtObject: pgBuiltObject }))).toThrow(
      "json build object expressions require an entries array"
    )
    expect(() => Mysql.Renderer.make().render(Mysql.Query.select({ builtObject: mysqlBuiltObject }))).toThrow(
      "json build object expressions require an entries array"
    )
    expect(() => Sqlite.Renderer.make().render(Sqlite.Query.select({ builtObject: sqliteBuiltObject }))).toThrow(
      "json build object expressions require an entries array"
    )
  })

  test("rejects json build array expressions without a value array before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const pgBuiltArray = PgJson.json.buildArray("alice@example.com")
    const mysqlBuiltArray = Mysql.Json.json.buildArray("alice@example.com")
    const sqliteBuiltArray = Sqlite.Json.json.buildArray("alice@example.com")
    ;(pgBuiltArray as any)[expressionAst].values = {}
    ;(mysqlBuiltArray as any)[expressionAst].values = {}
    ;(sqliteBuiltArray as any)[expressionAst].values = {}

    expect(() => Renderer.make().render(Q.select({ builtArray: pgBuiltArray }))).toThrow(
      "json build array expressions require a value array"
    )
    expect(() => Mysql.Renderer.make().render(Mysql.Query.select({ builtArray: mysqlBuiltArray }))).toThrow(
      "json build array expressions require a value array"
    )
    expect(() => Sqlite.Renderer.make().render(Sqlite.Query.select({ builtArray: sqliteBuiltArray }))).toThrow(
      "json build array expressions require a value array"
    )
  })

  test("rejects json build object entries without value expressions before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const pgBuiltObject = PgJson.json.buildObject({
      email: "alice@example.com"
    })
    const mysqlBuiltObject = Mysql.Json.json.buildObject({
      email: "alice@example.com"
    })
    const sqliteBuiltObject = Sqlite.Json.json.buildObject({
      email: "alice@example.com"
    })
    ;(pgBuiltObject as any)[expressionAst].entries[0] = null
    ;(mysqlBuiltObject as any)[expressionAst].entries[0] = null
    ;(sqliteBuiltObject as any)[expressionAst].entries[0] = null

    expect(() => Renderer.make().render(Q.select({ builtObject: pgBuiltObject }))).toThrow(
      "json build object entries require string keys and value expressions"
    )
    expect(() => Mysql.Renderer.make().render(Mysql.Query.select({ builtObject: mysqlBuiltObject }))).toThrow(
      "json build object entries require string keys and value expressions"
    )
    expect(() => Sqlite.Renderer.make().render(Sqlite.Query.select({ builtObject: sqliteBuiltObject }))).toThrow(
      "json build object entries require string keys and value expressions"
    )
  })

  test("rejects json build array entries without value expressions before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const pgBuiltArray = PgJson.json.buildArray("alice@example.com")
    const mysqlBuiltArray = Mysql.Json.json.buildArray("alice@example.com")
    const sqliteBuiltArray = Sqlite.Json.json.buildArray("alice@example.com")
    ;(pgBuiltArray as any)[expressionAst].values[0] = undefined
    ;(mysqlBuiltArray as any)[expressionAst].values[0] = undefined
    ;(sqliteBuiltArray as any)[expressionAst].values[0] = undefined

    expect(() => Renderer.make().render(Q.select({ builtArray: pgBuiltArray }))).toThrow(
      "json build array entries require value expressions"
    )
    expect(() => Mysql.Renderer.make().render(Mysql.Query.select({ builtArray: mysqlBuiltArray }))).toThrow(
      "json build array entries require value expressions"
    )
    expect(() => Sqlite.Renderer.make().render(Sqlite.Query.select({ builtArray: sqliteBuiltArray }))).toThrow(
      "json build array entries require value expressions"
    )
  })

  test("rejects json key predicates without string keys before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const pgHasKey = PgJson.jsonb.hasKey(
      PgJson.jsonb.buildObject({ email: "alice@example.com" }),
      "email"
    )
    const mysqlHasKey = Mysql.Json.json.hasKey(
      Mysql.Json.json.buildObject({ email: "alice@example.com" }),
      "email"
    )
    const sqliteHasKey = Sqlite.Json.json.hasKey(
      Sqlite.Json.json.buildObject({ email: "alice@example.com" }),
      "email"
    )
    ;(pgHasKey as any)[expressionAst].keys = [0]
    ;(mysqlHasKey as any)[expressionAst].keys = [0]
    ;(sqliteHasKey as any)[expressionAst].keys = [0]

    expect(() => Renderer.make().render(Q.select({ hasKey: pgHasKey }))).toThrow(
      "json key predicates require string keys"
    )
    expect(() => Mysql.Renderer.make().render(Mysql.Query.select({ hasKey: mysqlHasKey }))).toThrow(
      "json key predicates require string keys"
    )
    expect(() => Sqlite.Renderer.make().render(Sqlite.Query.select({ hasKey: sqliteHasKey }))).toThrow(
      "json key predicates require string keys"
    )
  })

  test("rejects empty SQL JSON path predicates before rendering SQL", () => {
    const pgPathExists = PgJson.jsonb.pathExists(
      PgJson.jsonb.buildObject({ email: "alice@example.com" }),
      ""
    )
    const mysqlPathExists = Mysql.Json.json.pathExists(
      Mysql.Json.json.buildObject({ email: "alice@example.com" }),
      ""
    )
    const sqlitePathExists = Sqlite.Json.json.pathExists(
      Sqlite.Json.json.buildObject({ email: "alice@example.com" }),
      ""
    )

    expect(() => Renderer.make().render(Q.select({ pathExists: pgPathExists }))).toThrow(
      "SQL/JSON path input must be a non-empty string"
    )
    expect(() => Mysql.Renderer.make().render(Mysql.Query.select({ pathExists: mysqlPathExists }))).toThrow(
      "SQL/JSON path input must be a non-empty string"
    )
    expect(() => Sqlite.Renderer.make().render(Sqlite.Query.select({ pathExists: sqlitePathExists }))).toThrow(
      "SQL/JSON path input must be a non-empty string"
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
