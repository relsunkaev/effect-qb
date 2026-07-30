// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import * as Postgres from "#postgres"
import * as Sqlite from "#sqlite"
import { makeSqliteEmployees, makeSqliteSocialGraph } from "../../fixtures/schema.ts"
import * as StdRoot from "#standard"

const render = (plan: unknown) => Sqlite.Renderer.make().render(plan as any)

const at = (base: any, ...segments: readonly any[]) =>
  segments.reduce((value, segment) => value.pipe(segment), base)

describe("sqlite behavior", () => {
  test("renders read queries with sqlite placeholders, quoting, and string concatenation", () => {
    const { users, posts } = makeSqliteSocialGraph()

    const plan = StdRoot.Query.select({
      emailLabel: StdRoot.Function.concat(
        StdRoot.Function.lower(users.email),
        "-",
        StdRoot.Function.coalesce(StdRoot.Function.max(posts.title), "missing")
      ),
      firstTitle: StdRoot.Function.min(posts.title),
      postCount: StdRoot.Function.count(posts.id)
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.leftJoin(posts, StdRoot.Query.eq(users.id, posts.userId)),
      StdRoot.Query.groupBy(StdRoot.Function.lower(users.email)),
      StdRoot.Query.having(StdRoot.Query.eq(StdRoot.Function.count(posts.id), 2)),
      StdRoot.Query.orderBy(StdRoot.Function.count(posts.id), "desc"),
      StdRoot.Query.limit(5),
      StdRoot.Query.offset(1)
    )

    const rendered = render(plan)

    expect(rendered.sql).toBe(
      'select (lower("users"."email") || ? || coalesce(max("posts"."title"), ?)) as "emailLabel", min("posts"."title") as "firstTitle", count("posts"."id") as "postCount" from "users" left join "posts" on ("users"."id" = "posts"."userId") group by lower("users"."email") having (count("posts"."id") = ?) order by count("posts"."id") desc limit ? offset ?'
    )
    expect(rendered.params).toEqual(["-", "missing", 2, 5, 1])
    expect(rendered.dialect).toBe("sqlite")
  })

  test("rejects sqlite-unsupported read constructs before emitting invalid SQL", () => {
    const { users, posts } = makeSqliteSocialGraph()
    const docs = StdRoot.Table.make("docs", {
      payload: StdRoot.Column.json(Schema.Struct({
        tags: Schema.Array(Schema.String)
      }))
    })
    const postIds = StdRoot.Query.select({
      value: posts.id
    }).pipe(StdRoot.Query.from(posts))
    const lateralPosts = StdRoot.Query.select({
      postId: posts.id,
      userId: posts.userId
    }).pipe(
      StdRoot.Query.from(posts),
      StdRoot.Query.where(StdRoot.Query.eq(posts.userId, users.id)),
      StdRoot.Query.lateral("user_posts")
    )

    expect(() => render(StdRoot.Query.select({
      ok: StdRoot.Query.compareAny(users.id, postIds, "eq")
    }).pipe(StdRoot.Query.from(users)))).toThrow("Unsupported sqlite quantified comparison")

    expect(() => render(StdRoot.Query.select({
      ok: StdRoot.Query.compareAll(users.id, postIds, "eq")
    }).pipe(StdRoot.Query.from(users)))).toThrow("Unsupported sqlite quantified comparison")

    expect(() => render(StdRoot.Query.select({
      ok: StdRoot.Query.regexMatch(users.email, ".*@example.com")
    }).pipe(StdRoot.Query.from(users)))).toThrow("Unsupported sqlite regex operator")

    expect(() => render(StdRoot.Query.select({
      ok: StdRoot.Query.contains(docs.payload, docs.payload)
    }).pipe(StdRoot.Query.from(docs)))).toThrow("Unsupported container operator for SQL rendering")

    expect(() => render(StdRoot.Query.select({
      id: users.id
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.lock("update")
    ))).toThrow("Unsupported sqlite row locking")

    expect(() => render(StdRoot.Query.select({
      email: users.email,
      postId: lateralPosts.postId
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.innerJoin(lateralPosts, StdRoot.Query.eq(lateralPosts.userId, users.id))
    ))).toThrow("Unsupported sqlite lateral source")
  })

  test("rejects sqlite-unsupported set operator all variants before emitting invalid SQL", () => {
    const left = StdRoot.Query.select({
      id: StdRoot.Query.cast(StdRoot.Query.literal(1), StdRoot.Type.int())
    })
    const right = StdRoot.Query.select({
      id: StdRoot.Query.cast(StdRoot.Query.literal(2), StdRoot.Type.int())
    })

    expect(() => render(StdRoot.Query.intersectAll(left, right))).toThrow(
      "Unsupported sqlite set operator all variant"
    )
    expect(() => render(StdRoot.Query.exceptAll(left, right))).toThrow(
      "Unsupported sqlite set operator all variant"
    )
  })

  test("renders sqlite upserts and returning clauses with excluded column references", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      visits: StdRoot.Column.int()
    })

    const plan = StdRoot.Query.insert(users, {
      id: "user-1",
      email: "alice@example.com",
      visits: 1
    }).pipe(
      StdRoot.Query.onConflict(["id"] as const, {
        update: {
          email: StdRoot.Query.excluded(users.email),
          visits: 2
        }
      }),
      StdRoot.Query.returning({
        id: users.id,
        email: users.email,
        visits: users.visits
      })
    )

    const rendered = render(plan)

    expect(rendered.sql).toBe(
      'insert into "users" ("id", "email", "visits") values (?, ?, ?) on conflict ("id") do update set "email" = excluded."email", "visits" = ? returning "users"."id" as "id", "users"."email" as "email", "users"."visits" as "visits"'
    )
    expect(rendered.params).toEqual(["user-1", "alice@example.com", 1, 2])
  })

  test("renders sqlite conflict target and action predicates", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      visits: StdRoot.Column.int()
    })

    const plan = StdRoot.Query.insert(users, {
      id: "user-1",
      email: "alice@example.com",
      visits: 1
    }).pipe(
      StdRoot.Query.onConflict({
        columns: ["email"] as const,
        where: StdRoot.Query.isNotNull(users.email)
      }, {
        update: {
          visits: StdRoot.Query.excluded(users.visits)
        },
        where: StdRoot.Query.gt(StdRoot.Query.excluded(users.visits), 0)
      })
    )

    const rendered = render(plan)

    expect(rendered.sql).toBe(
      'insert into "users" ("id", "email", "visits") values (?, ?, ?) on conflict ("email") where ("users"."email" is not null) do update set "visits" = excluded."visits" where (excluded."visits" > ?)'
    )
    expect(rendered.params).toEqual(["user-1", "alice@example.com", 1, 0])
  })

  test("renders sqlite string conflict targets", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const plan = StdRoot.Query.onConflict("email", {
      update: {
        email: StdRoot.Query.excluded(users.email)
      }
    })(StdRoot.Query.insert(users, {
      id: "user-1",
      email: "alice@example.com"
    }))

    expect(render(plan).sql).toBe(
      'insert into "users" ("id", "email") values (?, ?) on conflict ("email") do update set "email" = excluded."email"'
    )
  })

  test("canonicalizes and validates sqlite unnest insert arrays using target column contracts", () => {
    const metrics = StdRoot.Table.make("unnest_metrics", {
      total: StdRoot.Column.number(),
      happenedOn: StdRoot.Column.date()
    })

    const rendered = render(StdRoot.Query.insert(metrics).pipe(
      StdRoot.Query.from(StdRoot.Query.unnest({
        total: ["-0.00"],
        happenedOn: ["2026-05-12"]
      }, "seed"))
    ))

    expect(rendered.params).toEqual([
      "0",
      "2026-05-12"
    ])

    expect(() => render(StdRoot.Query.insert(metrics).pipe(
      StdRoot.Query.from(StdRoot.Query.unnest({
        total: ["1.00"],
        happenedOn: ["2026-02-31"]
      }, "seed"))
    ))).toThrow("Expected a local-date value")
  })

  test("renders sqlite JSON helpers through JSON1 functions", () => {
    const docs = StdRoot.Table.make("docs", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      payload: StdRoot.Column.json(Schema.Unknown)
    })
    const tags = StdRoot.Json.get(
      at(docs.payload,
        StdRoot.Json.key("profile"),
        StdRoot.Json.key("tags")
      )
    )

    const plan = StdRoot.Query.select({
      city: StdRoot.Json.text(
        at(docs.payload,
          StdRoot.Json.key("profile"),
          StdRoot.Json.key("address"),
          StdRoot.Json.key("city")
        )
      ),
      built: StdRoot.Json.buildObject({
        source: "sqlite",
        ok: true
      }),
      tags: StdRoot.Json.length(tags)
    }).pipe(StdRoot.Query.from(docs))

    const rendered = render(plan)

    expect(rendered.sql).toBe(
      'select json_extract("docs"."payload", ?) as "city", json_object(?, json(?), ?, json(?)) as "built", (case when json_type(json_extract("docs"."payload", ?)) = \'array\' then json_array_length(json_extract("docs"."payload", ?)) when json_type(json_extract("docs"."payload", ?)) = \'object\' then (select count(*) from json_each(json_extract("docs"."payload", ?))) else null end) as "tags" from "docs"'
    )
    expect(rendered.params).toEqual([
      "$.profile.address.city",
      "source",
      JSON.stringify("sqlite"),
      "ok",
      JSON.stringify(true),
      "$.profile.tags",
      "$.profile.tags",
      "$.profile.tags",
      "$.profile.tags"
    ])
  })

  test("renders nested sqlite JSON value arguments as JSON instead of SQL strings", () => {
    const docs = StdRoot.Table.make("docs", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      payload: StdRoot.Column.json(Schema.Unknown)
    })

    const rendered = render(StdRoot.Query.select({
      built: StdRoot.Json.buildObject({
        nested: { ok: true },
        tags: ["sqlite"]
      }),
      patched: StdRoot.Json.set(
        at(docs.payload, StdRoot.Json.key("nested")),
        { ok: true }
      )
    }).pipe(StdRoot.Query.from(docs)))

    expect(rendered.sql).toBe(
      'select json_object(?, json(?), ?, json(?)) as "built", json_set("docs"."payload", ?, json(?)) as "patched" from "docs"'
    )
    expect(rendered.params).toEqual([
      "nested",
      JSON.stringify({ ok: true }),
      "tags",
      JSON.stringify(["sqlite"]),
      "$.nested",
      JSON.stringify({ ok: true })
    ])
  })

  test("renders sqlite JSON merge operands as JSON instead of raw driver objects", () => {
    const rendered = render(StdRoot.Query.select({
      merged: StdRoot.Json.merge(
        { nested: { left: true } },
        { tags: ["sqlite"] }
      )
    }))

    expect(rendered.sql).toBe(
      'select json_patch(json(?), json(?)) as "merged"'
    )
    expect(rendered.params).toEqual([
      JSON.stringify({ nested: { left: true } }),
      JSON.stringify({ tags: ["sqlite"] })
    ])
  })

  test("renders sqlite JSON path objects through sqlite-specific path rules for path exists", () => {
    const docs = StdRoot.Table.make("docs", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      payload: StdRoot.Column.json(Schema.Unknown)
    })

    const lastTagPath = at(docs.payload,
      StdRoot.Json.key("profile"),
      StdRoot.Json.key("tags"),
      StdRoot.Json.index(-1)
    )
    const descendPath = at(docs.payload,
      StdRoot.Json.descend(),
      StdRoot.Json.key("city")
    )
    const wildcardPath = at(docs.payload,
      StdRoot.Json.key("profile"),
      StdRoot.Json.wildcard()
    )

    const rendered = render(StdRoot.Query.select({
      hasLastTag: StdRoot.Json.pathExists(lastTagPath)
    }).pipe(StdRoot.Query.from(docs)))

    expect(rendered.sql).toBe(
      'select (json_type("docs"."payload", ?) is not null) as "hasLastTag" from "docs"'
    )
    expect(rendered.params).toEqual(["$.profile.tags[#-1]"])
    expect(() => render(StdRoot.Query.select({
      unsupported: StdRoot.Json.pathExists(descendPath)
    }).pipe(StdRoot.Query.from(docs)))).toThrow("SQLite JSON paths do not support recursive descent segments")
    expect(() => render(StdRoot.Query.select({
      unsupported: StdRoot.Json.get(wildcardPath)
    }).pipe(StdRoot.Query.from(docs)))).toThrow("SQLite JSON paths do not support wildcard segments")
  })

  test("rejects sqlite JSON array inserts that SQLite would silently ignore", () => {
    const docs = StdRoot.Table.make("docs", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      payload: StdRoot.Column.json(Schema.Unknown)
    })

    const firstTagPath = at(docs.payload,
      StdRoot.Json.key("profile"),
      StdRoot.Json.key("tags"),
      StdRoot.Json.index(1)
    )

    expect(() => render(StdRoot.Query.select({
      inserted: StdRoot.Json.insert(firstTagPath, "city")
    }).pipe(StdRoot.Query.from(docs)))).toThrow(
      "Unsupported JSON feature for sqlite: jsonInsertArrayIndex"
    )
  })

  test("encodes sqlite JSON string scalar literals as JSON text", () => {
    const docs = StdRoot.Table.make("json_string_docs", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      payload: StdRoot.Column.json(Schema.String)
    })

    const rendered = render(StdRoot.Query.insert(docs, {
      id: "json-string-1",
      payload: "42"
    }))

    expect(rendered.sql).toBe(
      'insert into "json_string_docs" ("id", "payload") values (?, ?)'
    )
    expect(rendered.params).toEqual(["json-string-1", "\"42\""])
  })

  test("renders sqlite DDL without postgres-only constraint clauses", () => {
    const employees = makeSqliteEmployees()

    const create = render(StdRoot.Query.createTable(employees, { ifNotExists: true }))
    const createIndex = render(StdRoot.Query.createIndex(employees, ["managerId"] as const, { ifNotExists: true }))
    const dropIndex = render(StdRoot.Query.dropIndex(employees, ["managerId"] as const, { ifExists: true }))

    expect(create.sql).toBe(
      'create table if not exists "employees" ("id" text not null, "managerId" text, "name" text not null, primary key ("id"))'
    )
    expect(createIndex.sql).toBe(
      'create index if not exists "employees_managerId_idx" on "employees" ("managerId")'
    )
    expect(dropIndex.sql).toBe('drop index if exists "employees_managerId_idx"')
  })

  test("rejects sqlite truncate statements before emitting invalid SQL", () => {
    const { users } = makeSqliteSocialGraph()

    expect(() => render(StdRoot.Query.truncate(users))).toThrow(
      "Unsupported sqlite truncate statement"
    )
  })

  test("rejects sqlite mutation forms that cannot be rendered", () => {
    const { users, posts } = makeSqliteSocialGraph()

    expect(() => render(StdRoot.Query.delete(users).pipe(
      StdRoot.Query.innerJoin(posts, StdRoot.Query.eq(users.id, posts.userId))
    ))).toThrow("Unsupported sqlite joined delete")

    expect(() => render(StdRoot.Query.update([users, posts] as any, {
      users: {
        email: "updated@example.com"
      },
      posts: {
        title: "published"
      }
    }))).toThrow("Unsupported sqlite multi-table update")
  })

  test("rejects sqlite transaction options that cannot be rendered", () => {
    expect(() =>
      render(StdRoot.Query.transaction({
        isolationLevel: "serializable"
      }))
    ).toThrow("Unsupported sqlite transaction options")

    expect(() =>
      render(StdRoot.Query.transaction({
        readOnly: true
      }))
    ).toThrow("Unsupported sqlite transaction options")

    expect(() =>
      render(StdRoot.Query.transaction({
        readOnly: false
      }))
    ).toThrow("Unsupported sqlite transaction options")
  })

  test("sqlite transaction builders trust typed clause kinds without renderer-time validation", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")
    const transaction = StdRoot.Query.transaction()
    ;(transaction as any)[queryAst].transaction.kind = "begin"

    expect(render(transaction).sql).toBe("begin")
  })

  test("sqlite query builders trust typed statement kinds without renderer-time validation", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")
    const transaction = StdRoot.Query.transaction()
    ;(transaction as any)[queryAst].kind = "vacuum"

    expect(render(transaction).sql).toBe("begin")
  })

  test("rejects non-finite sqlite numeric literals", () => {
    expect(() => render(StdRoot.Query.select({
      bad: StdRoot.Query.literal(Number.NaN)
    }))).toThrow("Expected a finite numeric value")
  })

})
