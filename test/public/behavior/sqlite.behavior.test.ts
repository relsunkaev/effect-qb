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

  test("rejects empty sqlite selections before emitting invalid SQL", () => {
    const { users } = makeSqliteSocialGraph()

    expect(() => render(Sqlite.Query.select({}).pipe(
      Sqlite.Query.from(users)
    ))).toThrow("sqlite select statements require at least one selected expression")

    expect(() => render(Sqlite.Query.select().pipe(
      Sqlite.Query.from(users)
    ))).toThrow("sqlite select statements require at least one selected expression")
  })

  test("rejects sqlite-unsupported read constructs before emitting invalid SQL", () => {
    const { users, posts } = makeSqliteSocialGraph()
    const docs = Sqlite.Table.make("docs", {
      payload: Sqlite.Column.json(Schema.Struct({
        tags: Schema.Array(Schema.String)
      }))
    })
    const postIds = Sqlite.Query.select({
      value: posts.id
    }).pipe(Sqlite.Query.from(posts))
    const lateralPosts = Sqlite.Query.select({
      postId: posts.id,
      userId: posts.userId
    }).pipe(
      Sqlite.Query.from(posts),
      Sqlite.Query.where(Sqlite.Query.eq(posts.userId, users.id)),
      Sqlite.Query.lateral("user_posts")
    )

    expect(() => render(Sqlite.Query.select({
      ok: Sqlite.Query.compareAny(users.id, postIds, "eq")
    }).pipe(Sqlite.Query.from(users)))).toThrow("Unsupported sqlite quantified comparison")

    expect(() => render(Sqlite.Query.select({
      ok: Sqlite.Query.compareAll(users.id, postIds, "eq")
    }).pipe(Sqlite.Query.from(users)))).toThrow("Unsupported sqlite quantified comparison")

    expect(() => render(Sqlite.Query.select({
      ok: Sqlite.Query.regexMatch(users.email, ".*@example.com")
    }).pipe(Sqlite.Query.from(users)))).toThrow("Unsupported sqlite regex operator")

    expect(() => render(Sqlite.Query.select({
      ok: Sqlite.Query.contains(docs.payload, docs.payload)
    }).pipe(Sqlite.Query.from(docs)))).toThrow("Unsupported container operator for SQL rendering")

    expect(() => render(Sqlite.Query.select({
      id: users.id
    }).pipe(
      Sqlite.Query.from(users),
      Sqlite.Query.lock("update")
    ))).toThrow("Unsupported sqlite row locking")

    expect(() => render(Sqlite.Query.select({
      email: users.email,
      postId: lateralPosts.postId
    }).pipe(
      Sqlite.Query.from(users),
      Sqlite.Query.innerJoin(lateralPosts, Sqlite.Query.eq(lateralPosts.userId, users.id))
    ))).toThrow("Unsupported sqlite lateral source")
  })

  test("rejects sqlite-unsupported set operator all variants before emitting invalid SQL", () => {
    const left = Sqlite.Query.select({
      id: Sqlite.Query.cast(Sqlite.Query.literal(1), Sqlite.Query.type.int())
    })
    const right = Sqlite.Query.select({
      id: Sqlite.Query.cast(Sqlite.Query.literal(2), Sqlite.Query.type.int())
    })

    expect(() => render(Sqlite.Query.intersectAll(left, right))).toThrow(
      "Unsupported sqlite set operator all variant"
    )
    expect(() => render(Sqlite.Query.exceptAll(left, right))).toThrow(
      "Unsupported sqlite set operator all variant"
    )
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

  test("renders sqlite conflict target and action predicates", () => {
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
      Sqlite.Query.onConflict({
        columns: ["email"] as const,
        where: Sqlite.Query.isNotNull(users.email)
      }, {
        update: {
          visits: Sqlite.Query.excluded(users.visits)
        },
        where: Sqlite.Query.gt(Sqlite.Query.excluded(users.visits), 0)
      })
    )

    const rendered = render(plan)

    expect(rendered.sql).toBe(
      'insert into "users" ("id", "email", "visits") values (?, ?, ?) on conflict ("email") where ("users"."email" is not null) do update set "visits" = excluded."visits" where (excluded."visits" > ?)'
    )
    expect(rendered.params).toEqual(["user-1", "alice@example.com", 1, 0])
  })

  test("rejects sqlite conflict action predicates without update assignments", () => {
    const users = Sqlite.Table.make("users", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      email: Sqlite.Column.text()
    })

    expect(() => render(Sqlite.Query.insert(users, {
      id: "user-1",
      email: "alice@example.com"
    }).pipe(
      Sqlite.Query.onConflict(["email"] as const, {
        where: Sqlite.Query.isNotNull(users.email)
      } as any)
    ))).toThrow("conflict action predicates require update assignments")
  })

  test("rejects sqlite conflict update actions without assignments", () => {
    const users = Sqlite.Table.make("users", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      email: Sqlite.Column.text()
    })

    expect(() => Sqlite.Query.onConflict(["email"] as const, {
      update: {}
    })(Sqlite.Query.insert(users, {
      id: "user-1",
      email: "alice@example.com"
    }))).toThrow("conflict update assignments require at least one assignment")
  })

  test("rejects sqlite upsert update actions without assignments", () => {
    const users = Sqlite.Table.make("users", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      email: Sqlite.Column.text()
    })

    expect(() => Sqlite.Query.upsert(users, {
      id: "user-1",
      email: "alice@example.com"
    }, ["email"] as const, {})).toThrow("upsert update assignments require at least one assignment")
  })

  test("rejects sqlite upsert conflict columns with unknown columns at runtime", () => {
    const users = Sqlite.Table.make("users", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      email: Sqlite.Column.text()
    })

    expect(() => Sqlite.Query.upsert(users, {
      id: "user-1",
      email: "alice@example.com"
    }, ["missing"] as any, {
      email: "alice@example.com"
    })).toThrow("effect-qb: unknown conflict target column")
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

  test("renders sqlite string conflict targets", () => {
    const users = Sqlite.Table.make("users", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      email: Sqlite.Column.text()
    })

    const plan = Sqlite.Query.onConflict("email", {
      update: {
        email: Sqlite.Query.excluded(users.email)
      }
    })(Sqlite.Query.insert(users, {
      id: "user-1",
      email: "alice@example.com"
    }))

    expect(render(plan).sql).toBe(
      'insert into "users" ("id", "email") values (?, ?) on conflict ("email") do update set "email" = excluded."email"'
    )
  })

  test("rejects sqlite empty returning selections before omitting returning", () => {
    const users = Sqlite.Table.make("users", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      email: Sqlite.Column.text()
    })

    expect(() => Sqlite.Query.returning({})(Sqlite.Query.insert(users, {
      id: "user-1",
      email: "alice@example.com"
    }))).toThrow("returning(...) requires at least one selected expression")
  })

  test("rejects sqlite named conflict targets at runtime", () => {
    const users = Sqlite.Table.make("users", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      email: Sqlite.Column.text()
    })

    expect(() => Sqlite.Query.onConflict({
      constraint: "users_email_key"
    } as any, {
      update: {
        email: Sqlite.Query.excluded(users.email)
      }
    })(Sqlite.Query.insert(users, {
      id: "user-1",
      email: "alice@example.com"
    }))).toThrow("Unsupported sqlite named conflict constraint")
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
    const wildcardPath = Sqlite.Json.json.path(
      Sqlite.Json.json.key("profile"),
      Sqlite.Json.json.wildcard()
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
    expect(() => render(Sqlite.Query.select({
      unsupported: Sqlite.Json.json.get(docs.payload, wildcardPath)
    }).pipe(Sqlite.Query.from(docs)))).toThrow("SQLite JSON paths do not support wildcard segments")
  })

  test("rejects sqlite JSON array inserts that SQLite would silently ignore", () => {
    const docs = Sqlite.Table.make("docs", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      payload: Sqlite.Column.json(Schema.Unknown)
    })

    const firstTagPath = Sqlite.Json.json.path(
      Sqlite.Json.json.key("profile"),
      Sqlite.Json.json.key("tags"),
      Sqlite.Json.json.index(1)
    )

    expect(() => render(Sqlite.Query.select({
      inserted: Sqlite.Json.json.insert(docs.payload, firstTagPath, "city")
    }).pipe(Sqlite.Query.from(docs)))).toThrow(
      "Unsupported JSON feature for sqlite: jsonInsertArrayIndex"
    )
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

  test("rejects sqlite truncate statements before emitting invalid SQL", () => {
    const { users } = makeSqliteSocialGraph()

    expect(() => render(Sqlite.Query.truncate(users))).toThrow(
      "Unsupported sqlite truncate statement"
    )
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

  test("rejects invalid sqlite window order directions before rendering SQL", () => {
    const { users } = makeSqliteSocialGraph()

    expect(() => Sqlite.Function.rowNumber({
      orderBy: [{ value: users.id, direction: "sideways" as any }]
    })).toThrow("window order direction must be asc or desc")
  })

  test("rejects sqlite mutation modifiers that would otherwise be ignored", () => {
    const { users, posts } = makeSqliteSocialGraph()

    expect(() => render(Sqlite.Query.update(users, {}))).toThrow(
      "update statements require at least one assignment"
    )

    const orderedUpdate = Sqlite.Query.update(users, {
      email: "updated@example.com"
    }).pipe(
      Sqlite.Query.orderBy(users.id)
    )

    expect(() => render(orderedUpdate)).toThrow(
      "orderBy(...) is not supported for update statements"
    )

    const limitedDelete = Sqlite.Query.delete(users).pipe(
      Sqlite.Query.limit(1)
    )

    expect(() => render(limitedDelete)).toThrow(
      "limit(...) is not supported for delete statements"
    )

    const lockedUpdate = Sqlite.Query.update(users, {
      email: "updated@example.com"
    }).pipe(
      Sqlite.Query.lock("ignore")
    )

    expect(() => render(lockedUpdate)).toThrow(
      "lock(...) is not supported for update statements"
    )

    expect(() => render(Sqlite.Query.delete(users).pipe(
      Sqlite.Query.innerJoin(posts, Sqlite.Query.eq(users.id, posts.userId))
    ))).toThrow("Unsupported sqlite joined delete")

    expect(() => render(Sqlite.Query.update([users, posts] as any, {
      users: {
        email: "updated@example.com"
      },
      posts: {
        title: "published"
      }
    }))).toThrow("Unsupported sqlite multi-table update")
  })

  test("rejects invalid sqlite transaction isolation levels at runtime", () => {
    expect(() =>
      render(Sqlite.Query.transaction({
        isolationLevel: "chaos"
      }))
    ).toThrow("Unsupported transaction isolation level")
  })

  test("rejects sqlite transaction options that cannot be rendered", () => {
    expect(() =>
      render(Sqlite.Query.transaction({
        isolationLevel: "serializable"
      }))
    ).toThrow("Unsupported sqlite transaction options")

    expect(() =>
      render(Sqlite.Query.transaction({
        readOnly: true
      }))
    ).toThrow("Unsupported sqlite transaction options")

    expect(() =>
      render(Sqlite.Query.transaction({
        readOnly: false
      }))
    ).toThrow("Unsupported sqlite transaction options")
  })

  test("rejects invalid rendered sqlite transaction kinds", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")
    const transaction = Sqlite.Query.transaction()
    ;(transaction as any)[queryAst].transaction.kind = "begin"

    expect(() => render(transaction)).toThrow("Unsupported transaction statement kind")
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
