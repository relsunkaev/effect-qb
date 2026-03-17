import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import * as CoreRenderer from "../src/renderer.ts"
import * as ExpressionAst from "../src/internal/expression-ast.ts"
import { postgresDialect } from "../src/internal/postgres-dialect.ts"
import { renderExpression } from "../src/internal/sql-expression-renderer.ts"
import * as Postgres from "../src/postgres.ts"
import { makePostgresSocialGraph } from "./fixtures/schema.ts"

const userId = "11111111-1111-1111-1111-111111111111"

describe("postgres dialect behavior", () => {
  test("escapes quoted identifiers for aliased table references", () => {
    const events = Postgres.Table.make("audit\"logs", {
      ["event\"payload"]: Postgres.Column.text()
    })
    const aliased = Postgres.Table.alias(events, "daily\"rollup")

    const plan = Postgres.Query.select({
      payload: Postgres.Query.as(aliased["event\"payload"], "payload\"alias")
    }).pipe(
      Postgres.Query.from(aliased)
    )

    expect(Postgres.Renderer.make().render(plan).sql).toBe(
      'select "daily""rollup"."event""payload" as "payload""alias" from "audit""logs" as "daily""rollup"'
    )
  })

  test("inlines null and booleans while numbering bound literals", () => {
    const timestamp = new Date("2024-01-02T03:04:05.000Z")

    const plan = Postgres.Query.select({
      truthy: Postgres.Query.literal(true),
      falsy: Postgres.Query.literal(false),
      missing: Postgres.Query.literal(null),
      createdAt: Postgres.Query.literal(timestamp),
      visits: Postgres.Query.literal(7),
      label: Postgres.Query.literal("user")
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select true as "truthy", false as "falsy", null as "missing", $1 as "createdAt", $2 as "visits", $3 as "label"'
    )
    expect(rendered.params).toEqual([timestamp, 7, "user"])
  })

  test("renders postgres concat syntax across grouped queries", () => {
    const { users, posts } = makePostgresSocialGraph()

    const selected = Postgres.Query.select({
      emailLabel: Postgres.Query.concat(
        Postgres.Query.lower(users.email),
        "-",
        Postgres.Query.coalesce(Postgres.Query.max(posts.title), "missing")
      ),
      firstTitle: Postgres.Query.min(posts.title),
      postCount: Postgres.Query.count(posts.id)
    })
    const fromUsers = Postgres.Query.from(users)(selected as never)
    const joined = Postgres.Query.innerJoin(posts, Postgres.Query.eq(users.id, posts.userId))(fromUsers)
    const grouped = Postgres.Query.groupBy(Postgres.Query.lower(users.email))(joined)
    const filtered = Postgres.Query.having(Postgres.Query.eq(Postgres.Query.count(posts.id), 2))(grouped)
    const plan = Postgres.Query.orderBy(Postgres.Query.count(posts.id), "desc")(filtered)

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select (lower("users"."email") || $1 || coalesce(max("posts"."title"), $2)) as "emailLabel", min("posts"."title") as "firstTitle", count("posts"."id") as "postCount" from "users" inner join "posts" on ("users"."id" = "posts"."userId") group by lower("users"."email") having (count("posts"."id") = $3) order by count("posts"."id") desc'
    )
    expect(rendered.params).toEqual(["-", "missing", 2])
    expect(rendered.projections).toEqual([
      { path: ["emailLabel"], alias: "emailLabel" },
      { path: ["firstTitle"], alias: "firstTitle" },
      { path: ["postCount"], alias: "postCount" }
    ])
  })

  test("dedupes repeated exact group-by expressions and rejects provenance-only grouped matches", () => {
    const { users, posts } = makePostgresSocialGraph()

    const valid = Postgres.Query.select({
      loweredEmail: Postgres.Query.lower(users.email),
      postCount: Postgres.Query.count(posts.id)
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.innerJoin(posts, Postgres.Query.eq(users.id, posts.userId)),
      Postgres.Query.groupBy(Postgres.Query.lower(users.email)),
      Postgres.Query.groupBy(Postgres.Query.lower(users.email))
    )

    expect(Postgres.Renderer.make().render(valid).sql).toBe(
      'select lower("users"."email") as "loweredEmail", count("posts"."id") as "postCount" from "users" inner join "posts" on ("users"."id" = "posts"."userId") group by lower("users"."email")'
    )

    const invalid = Postgres.Query.select({
      email: users.email,
      postCount: Postgres.Query.count(posts.id)
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.innerJoin(posts, Postgres.Query.eq(users.id, posts.userId)),
      Postgres.Query.groupBy(Postgres.Query.lower(users.email))
    )

    expect(() => Postgres.Renderer.make().render(invalid as never)).toThrow(
      "Invalid grouped selection: scalar expressions must be covered by groupBy(...) when aggregates are present"
    )
  })

  test("renders literal-only scalar operators with stable postgres parameter ordering", () => {
    const plan = Postgres.Query.select({
      stitched: Postgres.Query.concat("a", "b", "c"),
      fallback: Postgres.Query.coalesce(null, null, "done"),
      missing: Postgres.Query.isNull(null),
      present: Postgres.Query.isNotNull("x"),
      caps: Postgres.Query.upper("mix"),
      lowered: Postgres.Query.lower("MIX")
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ($1 || $2 || $3) as "stitched", coalesce(null, null, $4) as "fallback", (null is null) as "missing", ($5 is not null) as "present", upper($6) as "caps", lower($7) as "lowered"'
    )
    expect(rendered.params).toEqual(["a", "b", "c", "done", "x", "mix", "MIX"])
  })

  test("renders boolean combinators and clause-level parameter ordering across postgres queries", () => {
    const { users, posts } = makePostgresSocialGraph()

    const plan = Postgres.Query.select({
      summary: Postgres.Query.concat(
        Postgres.Query.lower(users.email),
        "::",
        Postgres.Query.upper(Postgres.Query.coalesce(posts.title, "missing"))
      ),
      draftOrMissing: Postgres.Query.or(
        Postgres.Query.isNull(posts.title),
        Postgres.Query.eq(Postgres.Query.lower(posts.title), "draft")
      ),
      active: Postgres.Query.and(
        Postgres.Query.isNotNull(posts.id),
        Postgres.Query.not(Postgres.Query.eq(users.email, "banned@example.com"))
      )
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.leftJoin(posts, Postgres.Query.eq(users.id, posts.userId)),
      Postgres.Query.where(Postgres.Query.and(
        Postgres.Query.or(
          Postgres.Query.eq(users.email, "alice@example.com"),
          Postgres.Query.eq(users.email, "bob@example.com")
        ),
        Postgres.Query.not(
          Postgres.Query.eq(Postgres.Query.coalesce(posts.title, "missing"), "archived")
        )
      )),
      Postgres.Query.orderBy(
        Postgres.Query.upper(Postgres.Query.coalesce(posts.title, "missing")),
        "desc"
      )
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select (lower("users"."email") || $1 || upper(coalesce("posts"."title", $2))) as "summary", (("posts"."title" is null) or (lower("posts"."title") = $3)) as "draftOrMissing", (("posts"."id" is not null) and (not ("users"."email" = $4))) as "active" from "users" left join "posts" on ("users"."id" = "posts"."userId") where ((("users"."email" = $5) or ("users"."email" = $6)) and (not (coalesce("posts"."title", $7) = $8))) order by upper(coalesce("posts"."title", $9)) desc'
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

  test("renders searched case expressions with postgres placeholders", () => {
    const { users, posts } = makePostgresSocialGraph()

    const plan = Postgres.Query.select({
      titleState: Postgres.Query.case()
        .when(Postgres.Query.isNull(posts.title), "missing")
        .when(Postgres.Query.eq(Postgres.Query.lower(posts.title), "draft"), "draft")
        .else(Postgres.Query.upper(Postgres.Query.coalesce(posts.title, "published")))
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.leftJoin(posts, Postgres.Query.eq(users.id, posts.userId))
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select case when ("posts"."title" is null) then $1 when (lower("posts"."title") = $2) then $3 else upper(coalesce("posts"."title", $4)) end as "titleState" from "users" left join "posts" on ("users"."id" = "posts"."userId")'
    )
    expect(rendered.params).toEqual(["missing", "draft", "draft", "published"])
  })

  test("decodes nullable joined rows through the postgres executor pipeline", () => {
    const { users, posts } = makePostgresSocialGraph()

    const plan = Postgres.Query.select({
      profile: {
        id: users.id,
        email: Postgres.Query.lower(users.email)
      },
      post: {
        id: posts.id,
        title: Postgres.Query.lower(posts.title)
      },
      hasPost: Postgres.Query.isNotNull(posts.id)
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.leftJoin(posts, Postgres.Query.eq(users.id, posts.userId))
    )

    const rows = Effect.runSync(Postgres.Executor.fromDriver(
      Postgres.Renderer.make(),
      Postgres.Executor.driver(() => Effect.succeed([{
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

  test("uses the built-in postgres renderer and rejects unknown expression nodes", () => {
    expect(() => CoreRenderer.make("postgres")).not.toThrow()

    const unsupportedExpression = {
      [ExpressionAst.TypeId]: {
        kind: "window"
      }
    } as unknown as Postgres.Expression.Any

    expect(() => renderExpression(unsupportedExpression, { params: [] }, postgresDialect)).toThrow(
      "Unsupported expression for SQL rendering"
    )
  })
})
