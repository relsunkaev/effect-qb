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
      'select json_extract("docs"."payload", ?) as "city", json_object(?, ?, ?, ?) as "built", (case when json_type(json_extract("docs"."payload", ?)) = \'array\' then json_array_length(json_extract("docs"."payload", ?)) when json_type(json_extract("docs"."payload", ?)) = \'object\' then (select count(*) from json_each(json_extract("docs"."payload", ?))) else null end) as "tags" from "docs"'
    )
    expect(rendered.params).toEqual([
      "$.profile.address.city",
      "source",
      "sqlite",
      "ok",
      true,
      "$.profile.tags",
      "$.profile.tags",
      "$.profile.tags",
      "$.profile.tags"
    ])
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
