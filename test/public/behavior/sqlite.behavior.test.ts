// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import * as Postgres from "#postgres"
import * as Sqlite from "#sqlite"
import { makeSqliteEmployees, makeSqliteSocialGraph } from "../../fixtures/schema.ts"

const render = (plan: unknown) => Sqlite.Renderer.make().render(plan as any)

describe("sqlite behavior", () => {
  test("renders read queries with sqlite placeholders, quoting, and string concatenation", () => {
    const { users, posts } = makeSqliteSocialGraph()

    const plan = Sqlite.Query.select({
      emailLabel: Sqlite.Function.concat(
        Sqlite.Function.lower(users.email),
        "-",
        Sqlite.Function.coalesce(Sqlite.Function.max(posts.title), "missing")
      ),
      firstTitle: Sqlite.Function.min(posts.title),
      postCount: Sqlite.Function.count(posts.id)
    }).pipe(
      Sqlite.Query.from(users),
      Sqlite.Query.leftJoin(posts, Sqlite.Query.eq(users.id, posts.userId)),
      Sqlite.Query.groupBy(Sqlite.Function.lower(users.email)),
      Sqlite.Query.having(Sqlite.Query.eq(Sqlite.Function.count(posts.id), 2)),
      Sqlite.Query.orderBy(Sqlite.Function.count(posts.id), "desc"),
      Sqlite.Query.limit(5),
      Sqlite.Query.offset(1)
    )

    const rendered = render(plan)

    expect(rendered.sql).toBe(
      'select (lower("users"."email") || ? || coalesce(max("posts"."title"), ?)) as "emailLabel", min("posts"."title") as "firstTitle", count("posts"."id") as "postCount" from "users" left join "posts" on ("users"."id" = "posts"."userId") group by lower("users"."email") having (count("posts"."id") = ?) order by count("posts"."id") desc limit ? offset ?'
    )
    expect(rendered.params).toEqual(["-", "missing", 2, 5, 1])
    expect(rendered.dialect).toBe("sqlite")
  })

  test("renders sqlite upserts and returning clauses with excluded column references", () => {
    const users = Sqlite.Table.make("users", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      email: Sqlite.Column.text(),
      visits: Sqlite.Column.int()
    })

    const plan = Sqlite.Query.insert(users, {
      id: "user-1",
      email: "alice@example.com",
      visits: 1
    }).pipe(
      Sqlite.Query.onConflict(["id"] as const, {
        update: {
          email: Sqlite.Query.excluded(users.email),
          visits: 2
        }
      }),
      Sqlite.Query.returning({
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

  test("rejects sqlite conflict targets with unknown columns at runtime", () => {
    const users = Sqlite.Table.make("users", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      email: Sqlite.Column.text()
    })

    expect(() => Sqlite.Query.onConflict(["missing"] as any, {
      update: {
        email: Sqlite.Query.excluded(users.email)
      }
    })(Sqlite.Query.insert(users, {
      id: "user-1",
      email: "alice@example.com"
    }))).toThrow("effect-qb: unknown conflict target column")
  })

  test("canonicalizes and validates sqlite unnest insert arrays using target column contracts", () => {
    const metrics = Sqlite.Table.make("unnest_metrics", {
      total: Sqlite.Column.number(),
      happenedOn: Sqlite.Column.date()
    })

    const rendered = render(Sqlite.Query.insert(metrics).pipe(
      Sqlite.Query.from(Sqlite.Query.unnest({
        total: ["-0.00"],
        happenedOn: ["2026-05-12"]
      }, "seed"))
    ))

    expect(rendered.params).toEqual([
      "0",
      "2026-05-12"
    ])

    expect(() => render(Sqlite.Query.insert(metrics).pipe(
      Sqlite.Query.from(Sqlite.Query.unnest({
        total: ["1.00"],
        happenedOn: ["2026-02-31"]
      }, "seed"))
    ))).toThrow("Expected a local-date value")
  })

  test("renders sqlite JSON helpers through JSON1 functions", () => {
    const docs = Sqlite.Table.make("docs", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      payload: Sqlite.Column.json(Schema.Unknown)
    })
    const tags = Sqlite.Json.json.get(
      docs.payload,
      Sqlite.Json.json.path(
        Sqlite.Json.json.key("profile"),
        Sqlite.Json.json.key("tags")
      )
    )

    const plan = Sqlite.Query.select({
      city: Sqlite.Json.json.text(
        docs.payload,
        Sqlite.Json.json.path(
          Sqlite.Json.json.key("profile"),
          Sqlite.Json.json.key("address"),
          Sqlite.Json.json.key("city")
        )
      ),
      built: Sqlite.Json.json.buildObject({
        source: "sqlite",
        ok: true
      }),
      tags: Sqlite.Json.json.length(tags)
    }).pipe(Sqlite.Query.from(docs))

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
    const docs = Sqlite.Table.make("docs", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      payload: Sqlite.Column.json(Schema.Unknown)
    })

    const rendered = render(Sqlite.Query.select({
      built: Sqlite.Json.json.buildObject({
        nested: { ok: true },
        tags: ["sqlite"]
      }),
      patched: Sqlite.Json.json.set(
        docs.payload,
        Sqlite.Json.json.path(Sqlite.Json.json.key("nested")),
        { ok: true }
      )
    }).pipe(Sqlite.Query.from(docs)))

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
    const rendered = render(Sqlite.Query.select({
      merged: Sqlite.Json.json.merge(
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
    const docs = Sqlite.Table.make("docs", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      payload: Sqlite.Column.json(Schema.Unknown)
    })

    const lastTagPath = Sqlite.Json.json.path(
      Sqlite.Json.json.key("profile"),
      Sqlite.Json.json.key("tags"),
      Sqlite.Json.json.index(-1)
    )
    const descendPath = Sqlite.Json.json.path(
      Sqlite.Json.json.descend(),
      Sqlite.Json.json.key("city")
    )

    const rendered = render(Sqlite.Query.select({
      hasLastTag: Sqlite.Json.json.pathExists(docs.payload, lastTagPath)
    }).pipe(Sqlite.Query.from(docs)))

    expect(rendered.sql).toBe(
      'select (json_type("docs"."payload", ?) is not null) as "hasLastTag" from "docs"'
    )
    expect(rendered.params).toEqual(["$.profile.tags[#-1]"])
    expect(() => render(Sqlite.Query.select({
      unsupported: Sqlite.Json.json.pathExists(docs.payload, descendPath)
    }).pipe(Sqlite.Query.from(docs)))).toThrow("SQLite JSON paths do not support recursive descent segments")
  })

  test("encodes sqlite JSON string scalar literals as JSON text", () => {
    const docs = Sqlite.Table.make("json_string_docs", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      payload: Sqlite.Column.json(Schema.String)
    })

    const rendered = render(Sqlite.Query.insert(docs, {
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

    const create = render(Sqlite.Query.createTable(employees, { ifNotExists: true }))
    const createIndex = render(Sqlite.Query.createIndex(employees, ["managerId"] as const, { ifNotExists: true }))
    const dropIndex = render(Sqlite.Query.dropIndex(employees, ["managerId"] as const, { ifExists: true }))

    expect(create.sql).toBe(
      'create table if not exists "employees" ("id" text not null, "managerId" text, "name" text not null, primary key ("id"))'
    )
    expect(createIndex.sql).toBe(
      'create index if not exists "employees_managerId_idx" on "employees" ("managerId")'
    )
    expect(dropIndex.sql).toBe('drop index if exists "employees_managerId_idx"')
  })

  test("rejects sqlite DDL references to unknown index columns at runtime", () => {
    const employees = makeSqliteEmployees()

    expect(() =>
      render(Sqlite.Query.createIndex(employees, ["missing"]))
    ).toThrow("effect-qb: unknown index column 'missing'")

    expect(() =>
      render(Sqlite.Query.dropIndex(employees, ["missing"]))
    ).toThrow("effect-qb: unknown index column 'missing'")
  })

  test("rejects invalid sqlite transaction isolation levels at runtime", () => {
    expect(() =>
      render(Sqlite.Query.transaction({
        isolationLevel: "chaos"
      }))
    ).toThrow("Unsupported transaction isolation level")
  })

  test("rejects empty sqlite membership predicates", () => {
    const { users } = makeSqliteSocialGraph()

    expect(() => render(Sqlite.Query.select({
      ok: Sqlite.Query.in(users.email)
    }).pipe(Sqlite.Query.from(users)))).toThrow("in(...) requires at least one candidate value")

    expect(() => render(Sqlite.Query.select({
      ok: Sqlite.Query.notIn(users.email)
    }).pipe(Sqlite.Query.from(users)))).toThrow("notIn(...) requires at least one candidate value")
  })

  test("rejects empty sqlite boolean combinators", () => {
    const { users } = makeSqliteSocialGraph()

    for (const expression of [
      Sqlite.Query.and(),
      Sqlite.Query.or(),
      Sqlite.Query.all(),
      Sqlite.Query.any()
    ]) {
      expect(() => render(Sqlite.Query.select({
        ok: expression
      }).pipe(Sqlite.Query.from(users)))).toThrow()
    }
  })

  test("rejects non-finite sqlite numeric literals", () => {
    expect(() => render(Sqlite.Query.select({
      bad: Sqlite.Query.literal(Number.NaN)
    }))).toThrow("Expected a finite numeric value")
  })

  test("rejects sqlite plans at postgres executors through dialect branding", () => {
    const { users } = makeSqliteSocialGraph()
    const plan = Sqlite.Query.select({
      id: users.id
    }).pipe(Sqlite.Query.from(users))

    expect(plan[Sqlite.RowSet.TypeId].dialect).toBe("sqlite")
    expect(() => Postgres.Renderer.make().render(plan as any)).toThrow(
      "effect-qb: plan dialect is not compatible with the target renderer or executor"
    )
  })
})
