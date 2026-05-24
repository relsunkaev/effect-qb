import { describe, expect, test } from "bun:test"

import * as Mysql from "#mysql"
import * as Sqlite from "#sqlite"
import * as Standard from "#standard"
import { Column as C, Table } from "#standard"
import { Cast as PgCast, Query as Q, Function as F, Json as PgJson, Renderer, Type as PgType } from "#postgres"
import { makeMysqlEmployees, makeMysqlSocialGraph, makeRootSocialGraph } from "../../fixtures/schema.ts"
import * as StdRoot from "#standard"
import { unsafeAny } from "../../helpers/unsafe.ts"

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

  test("standard renderer rejects mutation returning projections", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      email: Standard.Column.text()
    })
    const id = "11111111-1111-1111-1111-111111111111"
    const plans = [
      Standard.Query.returning({ id: users.id })(Standard.Query.insert(users, {
        id,
        email: "alice@example.com"
      })),
      Standard.Query.returning({ id: users.id })(Standard.Query.where(Standard.Query.eq(users.id, id))(
        Standard.Query.update(users, {
          email: "updated@example.com"
        })
      )),
      Standard.Query.returning({ id: users.id })(Standard.Query.where(Standard.Query.eq(users.id, id))(
        Standard.Query.delete(users)
      ))
    ]

    for (const plan of plans) {
      expect(() => Standard.Renderer.make().render(plan)).toThrow(
        "Unsupported standard returning"
      )
    }
  })

  test("standard renderer rejects insert conflict clauses", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      email: Standard.Column.text()
    })
    const id = "11111111-1111-1111-1111-111111111111"
    const insert = Standard.Query.insert(users, {
      id,
      email: "alice@example.com"
    })
    const plans = [
      Standard.Query.onConflict(["email"] as const)(insert),
      Standard.Query.onConflict(["email"] as const, {
        update: {
          email: Standard.Query.excluded(users.email)
        }
      })(insert)
    ]

    for (const plan of plans) {
      expect(() => Standard.Renderer.make().render(plan)).toThrow(
        "Unsupported standard insert conflict"
      )
    }
  })

  test("standard renderer rejects joined mutation clauses", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      email: Standard.Column.text()
    })
    const posts = Standard.Table.make("posts", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      userId: Standard.Column.uuid(),
      title: Standard.Column.text()
    })
    const joinedUpdate = Standard.Query.update(users, {
      email: "author@example.com"
    }).pipe(
      Standard.Query.innerJoin(posts, Standard.Query.eq(posts.userId, users.id)),
      Standard.Query.where(Standard.Query.eq(posts.title, "hello"))
    )
    const joinedDelete = Standard.Query.delete(users).pipe(
      Standard.Query.innerJoin(posts, Standard.Query.eq(posts.userId, users.id)),
      Standard.Query.where(Standard.Query.eq(posts.title, "hello"))
    )

    expect(() => Standard.Renderer.make().render(joinedUpdate)).toThrow(
      "Unsupported standard joined mutation"
    )
    expect(() => Standard.Renderer.make().render(joinedDelete)).toThrow(
      "Unsupported standard joined mutation"
    )
  })

  test("standard renderer rejects row locking clauses", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey)
    })
    const plan = Standard.Query.select({
      id: users.id
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.lock("update", { nowait: true })
    )

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "Unsupported standard row locking"
    )
  })

  test("standard renderer rejects truncate statements", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey)
    })

    expect(() => Standard.Renderer.make().render(Standard.Query.truncate(users))).toThrow(
      "Unsupported standard truncate statement"
    )
  })

  test("standard renderer rejects full outer joins", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey)
    })
    const posts = Standard.Table.make("posts", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      userId: Standard.Column.uuid()
    })
    const plan = Standard.Query.select({
      userId: users.id,
      postId: posts.id
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.fullJoin(posts, Standard.Query.eq(users.id, posts.userId))
    )

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "Unsupported standard full join"
    )
  })

  test("standard renderer rejects lateral sources", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      email: Standard.Column.text()
    })
    const posts = Standard.Table.make("posts", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      userId: Standard.Column.uuid()
    })
    const lateralPosts = Standard.Query.select({
      postId: posts.id,
      userId: posts.userId
    }).pipe(
      Standard.Query.from(posts),
      Standard.Query.where(Standard.Query.eq(posts.userId, users.id)),
      Standard.Query.lateral("user_posts")
    )
    const plan = Standard.Query.select({
      email: users.email,
      postId: lateralPosts.postId
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.innerJoin(lateralPosts, Standard.Query.eq(lateralPosts.userId, users.id))
    )

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "Unsupported standard lateral source"
    )
  })

  test("standard renderer rejects quantified comparisons", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey)
    })
    const userIds = Standard.Query.select({
      id: users.id
    }).pipe(Standard.Query.from(users))
    const plans = [
      Standard.Query.select({
        ok: Standard.Query.compareAny(users.id, userIds, "eq")
      }).pipe(Standard.Query.from(users)),
      Standard.Query.select({
        ok: Standard.Query.compareAll(users.id, userIds, "eq")
      }).pipe(Standard.Query.from(users))
    ]

    for (const plan of plans) {
      expect(() => Standard.Renderer.make().render(plan)).toThrow(
        "Unsupported standard quantified comparison"
      )
    }
  })

  test("standard renderer rejects non-union set operator all variants", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      email: Standard.Column.text()
    })
    const archivedUsers = Standard.Table.make("archived_users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      email: Standard.Column.text()
    })
    const active = Standard.Query.select({
      email: users.email
    }).pipe(Standard.Query.from(users))
    const archived = Standard.Query.select({
      email: archivedUsers.email
    }).pipe(Standard.Query.from(archivedUsers))
    const plans = [
      Standard.Query.intersectAll(active, archived),
      Standard.Query.exceptAll(active, archived)
    ]

    for (const plan of plans) {
      expect(() => Standard.Renderer.make().render(plan)).toThrow(
        "Unsupported standard set operator all variant"
      )
    }
  })

  test("renderers reject excluded references outside insert conflict handlers", () => {
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const plan = Standard.Query.select({
      email: Standard.Query.excluded(users.email)
    })

    expect(() => Standard.Renderer.make().render(plan)).toThrow(
      "excluded(...) is only supported inside insert conflict handlers"
    )
    expect(() => Renderer.make().render(plan)).toThrow(
      "excluded(...) is only supported inside insert conflict handlers"
    )
    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "excluded(...) is only supported inside insert conflict handlers"
    )
    expect(() => Sqlite.Renderer.make().render(plan)).toThrow(
      "excluded(...) is only supported inside insert conflict handlers"
    )
  })

  test("standard renderer rejects regular-expression predicates", () => {
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })

    const plans = [
      Standard.Query.select({ ok: Standard.Query.regexMatch(users.email, "@example\\.com$") }).pipe(Standard.Query.from(users)),
      Standard.Query.select({ ok: Standard.Query.regexIMatch(users.email, "@example\\.com$") }).pipe(Standard.Query.from(users)),
      Standard.Query.select({ ok: Standard.Query.regexNotMatch(users.email, "@example\\.com$") }).pipe(Standard.Query.from(users)),
      Standard.Query.select({ ok: Standard.Query.regexNotIMatch(users.email, "@example\\.com$") }).pipe(Standard.Query.from(users))
    ]

    for (const plan of plans) {
      expect(() => Standard.Renderer.make().render(plan)).toThrow(
        "Unsupported standard regular-expression predicates"
      )
    }
  })

  test("variadic boolean pipes trust typed operation composition without runtime mixed-argument validation", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const cases = [
      {
        mixed: (Standard.Query.and(true, true) as any).pipe(false, (value: unknown) => value),
        render: (mixed: unknown) => Standard.Renderer.make().render(Standard.Query.select({ ok: mixed as any }))
      },
      {
        mixed: (Q.and(true, true) as any).pipe(false, (value: unknown) => value),
        render: (mixed: unknown) => Renderer.make().render(Q.select({ ok: mixed as any }))
      },
      {
        mixed: (Mysql.Query.and(true, true) as any).pipe(false, (value: unknown) => value),
        render: (mixed: unknown) => Mysql.Renderer.make().render(Mysql.Query.select({ ok: mixed as any }))
      },
      {
        mixed: (Sqlite.Query.and(true, true) as any).pipe(false, (value: unknown) => value),
        render: (mixed: unknown) => Sqlite.Renderer.make().render(Sqlite.Query.select({ ok: mixed as any }))
      }
    ] as const

    for (const { mixed, render } of cases) {
      const ast = (mixed as any)[expressionAst]
      expect(ast.kind).toBe("and")
      expect(ast.values).toHaveLength(3)
      const rendered = render(mixed)
      expect(rendered.sql).toContain(" and ")
    }
  })

  test("cast expressions trust typed target db types without renderer-time validation", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const value = Standard.Query.cast(Standard.Query.literal(1), Standard.Query.type.text())
    ;(value as any)[expressionAst].target = undefined
    const plan = Standard.Query.select({
      value
    })

    expect(Standard.Renderer.make().render(plan).sql).toContain(" as undefined)")
    expect(Renderer.make().render(plan).sql).toContain(" as undefined)")
    expect(Mysql.Renderer.make().render(plan).sql).toContain(" as undefined)")
    expect(Sqlite.Renderer.make().render(plan).sql).toContain(" as undefined)")
  })

  test("custom db type casts trust typed db type names without renderer-time validation", () => {
    const standardPlan = Standard.Query.select({
      value: Standard.Query.cast(Standard.Query.literal(1), Standard.Query.type.custom("") as any)
    })
    const postgresPlan = Q.select({
      value: PgCast.to(Q.literal(1), PgType.custom("") as any)
    })
    const mysqlPlan = Mysql.Query.select({
      value: Mysql.Query.cast(Mysql.Query.literal(1), Mysql.Query.type.custom("") as any)
    })
    const sqlitePlan = Sqlite.Query.select({
      value: Sqlite.Query.cast(Sqlite.Query.literal(1), Sqlite.Query.type.custom("") as any)
    })

    expect(Standard.Renderer.make().render(standardPlan).sql).toContain(" as )")
    expect(Renderer.make().render(postgresPlan).sql).toContain(" as )")
    expect(Mysql.Renderer.make().render(mysqlPlan).sql).toContain(" as )")
    expect(Sqlite.Renderer.make().render(sqlitePlan).sql).toContain(" as )")
  })

  test("grouped cast expressions trust typed target db types without renderer-time validation", () => {
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

    expect(Standard.Renderer.make().render(plan).sql).toContain(" as undefined)")
    expect(Renderer.make().render(plan).sql).toContain(" as undefined)")
    expect(Mysql.Renderer.make().render(plan).sql).toContain(" as undefined)")
    expect(Sqlite.Renderer.make().render(plan).sql).toContain(" as undefined)")
  })

  test("groupBy builders trust typed cast targets without grouping-key runtime validation", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const users = Standard.Table.make("users", {
      email: Standard.Column.text()
    })
    const value = Standard.Query.cast(users.email, Standard.Query.type.text())
    ;(value as any)[expressionAst].target = undefined

    const plan = Standard.Query.select({
      value
    }).pipe(
      Standard.Query.from(users),
      Standard.Query.groupBy(value)
    )

    expect(Standard.Renderer.make().render(plan).sql).toContain("group by cast(")
    expect(Standard.Renderer.make().render(plan).sql).toContain("as undefined")
  })

  test("groupBy builders trust typed json key predicates without grouping-key runtime validation", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const queryAst = Symbol.for("effect-qb/QueryAst")
    const hasKey = PgJson.jsonb.hasKey(
      PgJson.jsonb.buildObject({ email: "alice@example.com" }),
      "email"
    )
    ;(hasKey as any)[expressionAst].keys = [0]

    const plan = Q.select({
      hasKey,
      rowCount: F.count(Q.literal(1))
    }).pipe(Q.groupBy(hasKey))

    expect((plan as any)[queryAst].groupBy).toHaveLength(1)
    expect((plan as any)[queryAst].groupBy[0]).toBe(hasKey)
  })

  test("groupBy builders trust typed json path predicates without grouping-key runtime validation", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const queryAst = Symbol.for("effect-qb/QueryAst")
    const value = PgJson.jsonb.get(
      PgJson.jsonb.buildObject({ email: "alice@example.com" }),
      PgJson.jsonb.key("email")
    )
    ;(value as any)[expressionAst].segments = {}

    const plan = Q.select({
      value,
      rowCount: F.count(Q.literal(1))
    }).pipe(Q.groupBy(value))

    expect((plan as any)[queryAst].groupBy).toHaveLength(1)
    expect((plan as any)[queryAst].groupBy[0]).toBe(value)
  })

  test("groupBy builders trust typed expression kinds without grouping-key runtime validation", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const queryAst = Symbol.for("effect-qb/QueryAst")
    const value = Standard.Query.literal(1)
    ;(value as any)[expressionAst].kind = "mystery"

    const plan = Standard.Query.select({
      value,
      rowCount: Standard.Function.count(Standard.Query.literal(1))
    }).pipe(Standard.Query.groupBy(value))

    expect((plan as any)[queryAst].groupBy).toHaveLength(1)
    expect((plan as any)[queryAst].groupBy[0]).toBe(value)
  })

  test("groupBy builders defer invalid Date literal validation to render-time boundaries", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")
    const value = Q.literal(new Date("not a date"))
    const plan = Q.select({
      value,
      rowCount: F.count(Q.literal(1))
    }).pipe(Q.groupBy(value))

    expect((plan as any)[queryAst].groupBy).toHaveLength(1)
    expect((plan as any)[queryAst].groupBy[0]).toBe(value)
  })

  test("renders safe extract fields as SQL field syntax", () => {
    const timestamp = new Date("2024-01-02T03:04:05.000Z")
    const extracted = Standard.Function.call(
      "extract",
      Standard.Query.literal("year"),
      Standard.Query.literal(timestamp)
    )
    const plan = Standard.Query.select({
      extracted
    })

    expect(Standard.Renderer.make().render(plan)).toMatchObject({
      sql: 'select extract(year from ?) as "extracted"',
      params: [timestamp]
    })
    expect(Renderer.make().render(plan)).toMatchObject({
      sql: 'select extract(year from $1) as "extracted"',
      params: [timestamp]
    })
    expect(Mysql.Renderer.make().render(plan)).toMatchObject({
      sql: "select extract(year from ?) as `extracted`",
      params: [timestamp]
    })
    expect(Sqlite.Renderer.make().render(plan)).toMatchObject({
      sql: 'select extract(year from ?) as "extracted"',
      params: [timestamp]
    })
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

  test("rejects grouped json key predicates without string keys before rendering SQL", () => {
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
    const pgPlan = Q.select({
      hasKey: pgHasKey,
      rowCount: F.count(Q.literal(1))
    }).pipe(Q.groupBy(pgHasKey))
    const mysqlPlan = Mysql.Query.select({
      hasKey: mysqlHasKey,
      rowCount: Mysql.Function.count(Mysql.Query.literal(1))
    }).pipe(Mysql.Query.groupBy(mysqlHasKey))
    const sqlitePlan = Sqlite.Query.select({
      hasKey: sqliteHasKey,
      rowCount: Sqlite.Function.count(Sqlite.Query.literal(1))
    }).pipe(Sqlite.Query.groupBy(sqliteHasKey))
    ;(pgHasKey as any)[expressionAst].keys = [0]
    ;(mysqlHasKey as any)[expressionAst].keys = [0]
    ;(sqliteHasKey as any)[expressionAst].keys = [0]

    expect(() => Renderer.make().render(pgPlan)).toThrow(
      "json key predicates require string keys"
    )
    expect(() => Mysql.Renderer.make().render(mysqlPlan)).toThrow(
      "json key predicates require string keys"
    )
    expect(() => Sqlite.Renderer.make().render(sqlitePlan)).toThrow(
      "json key predicates require string keys"
    )
  })

  test("rejects json path expressions with invalid path segments before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const pgValue = PgJson.jsonb.get(
      PgJson.jsonb.buildObject({ email: "alice@example.com" }),
      PgJson.jsonb.key("email")
    )
    const mysqlValue = Mysql.Json.json.get(
      Mysql.Json.json.buildObject({ email: "alice@example.com" }),
      Mysql.Json.json.key("email")
    )
    const sqliteValue = Sqlite.Json.json.get(
      Sqlite.Json.json.buildObject({ email: "alice@example.com" }),
      Sqlite.Json.json.key("email")
    )
    ;(pgValue as any)[expressionAst].segments = [null]
    ;(mysqlValue as any)[expressionAst].segments = [null]
    ;(sqliteValue as any)[expressionAst].segments = [null]

    expect(() => Renderer.make().render(Q.select({ value: pgValue }))).toThrow(
      "JSON path segments require string, number, or path segment objects"
    )
    expect(() => Mysql.Renderer.make().render(Mysql.Query.select({ value: mysqlValue }))).toThrow(
      "JSON path segments require string, number, or path segment objects"
    )
    expect(() => Sqlite.Renderer.make().render(Sqlite.Query.select({ value: sqliteValue }))).toThrow(
      "JSON path segments require string, number, or path segment objects"
    )
  })

  test("rejects grouped json path expressions without a segment array before rendering SQL", () => {
    const expressionAst = Symbol.for("effect-qb/ExpressionAst")
    const pgValue = PgJson.jsonb.get(
      PgJson.jsonb.buildObject({ email: "alice@example.com" }),
      PgJson.jsonb.key("email")
    )
    const mysqlValue = Mysql.Json.json.get(
      Mysql.Json.json.buildObject({ email: "alice@example.com" }),
      Mysql.Json.json.key("email")
    )
    const sqliteValue = Sqlite.Json.json.get(
      Sqlite.Json.json.buildObject({ email: "alice@example.com" }),
      Sqlite.Json.json.key("email")
    )
    const pgPlan = Q.select({
      value: pgValue,
      rowCount: F.count(Q.literal(1))
    }).pipe(Q.groupBy(pgValue))
    const mysqlPlan = Mysql.Query.select({
      value: mysqlValue,
      rowCount: Mysql.Function.count(Mysql.Query.literal(1))
    }).pipe(Mysql.Query.groupBy(mysqlValue))
    const sqlitePlan = Sqlite.Query.select({
      value: sqliteValue,
      rowCount: Sqlite.Function.count(Sqlite.Query.literal(1))
    }).pipe(Sqlite.Query.groupBy(sqliteValue))
    ;(pgValue as any)[expressionAst].segments = {}
    ;(mysqlValue as any)[expressionAst].segments = {}
    ;(sqliteValue as any)[expressionAst].segments = {}

    expect(() => Renderer.make().render(pgPlan)).toThrow(
      "JSON path expressions require a segment array"
    )
    expect(() => Mysql.Renderer.make().render(mysqlPlan)).toThrow(
      "JSON path expressions require a segment array"
    )
    expect(() => Sqlite.Renderer.make().render(sqlitePlan)).toThrow(
      "JSON path expressions require a segment array"
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
    }))).toThrow("Expected a valid Date value")
  })

  test("rejects invalid Date predicates before deriving predicate facts", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      createdAt: C.timestamp()
    })

    expect(() => {
      Q.select({ id: users.id }).pipe(
        Q.from(users),
        Q.where(Q.eq(users.createdAt, new Date("not a date")))
      )
    }).toThrow("Expected a valid Date value")
  })

  test("rejects grouped invalid Date literals before rendering SQL", () => {
    expect(() => {
      const value = Q.literal(new Date("not a date"))
      const plan = Q.select({
        value,
        rowCount: F.count(Q.literal(1))
      }).pipe(Q.groupBy(value))

      Renderer.make().render(plan)
    }).toThrow("Expected a valid Date value")
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

  test("built-in renderers trust typed aliases when explicit aliases collide with auto-generated aliases", () => {
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

    const rendered = Renderer.make().render(invalid)

    expect(rendered.sql).toBe('select "users"."id" as "profile__id", "users"."email" as "profile__id" from "users"')
    expect(rendered.projections).toEqual([
      { path: ["profile", "id"], alias: "profile__id" },
      { path: ["email"], alias: "profile__id" }
    ])
  })

  test("built-in renderers do not revalidate alias emptiness at runtime", () => {
    const users = Standard.Table.make("users", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey)
    })
    const aliasedUsers = Standard.Table.alias(users, unsafeAny(""))
    const plan = Standard.Query.select({
      id: Standard.Query.as(aliasedUsers.id, unsafeAny(""))
    }).pipe(
      Standard.Query.from(aliasedUsers)
    )

    expect(Standard.Renderer.make().render(plan).sql).toBe('select "id" as "" from "users" as ""')
    expect(Renderer.make().render(plan).sql).toBe('select "id" as "" from "users" as ""')
    expect(Mysql.Renderer.make().render(plan).sql).toBe("select `id` as `` from `users` as ``")
    expect(Sqlite.Renderer.make().render(plan).sql).toBe('select "id" as "" from "users" as ""')
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
