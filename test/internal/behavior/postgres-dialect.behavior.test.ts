// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import * as CoreRenderer from "#internal/renderer.ts"
import * as ExpressionAst from "#internal/expression-ast.ts"
import { postgresDialect } from "../../../packages/querybuilder/src/postgres/internal/dialect.ts"
import { renderExpression } from "../../../packages/querybuilder/src/internal/sql-expression-renderer.ts"
import * as Postgres from "#postgres"
import { makePostgresSocialGraph } from "../../fixtures/schema.ts"
import { buildGroupedConcatPlan } from "../../helpers/dialect-matrix.ts"
import { unsafeAny } from "../../helpers/unsafe.ts"
import * as StdRoot from "#standard"

const userId = "11111111-1111-4111-8111-111111111111"
const secondUserId = "22222222-2222-4222-8222-222222222222"
const render = (plan: unknown) => Postgres.Renderer.make().render(unsafeAny(plan))

describe("postgres dialect behavior", () => {
  test("escapes quoted identifiers for aliased table references", () => {
    const events = StdRoot.Table.make("audit\"logs", {
      ["event\"payload"]: StdRoot.Column.text()
    })
    const aliased = unsafeAny(StdRoot.Table.alias(unsafeAny(events), "daily\"rollup"))

    const plan = StdRoot.Query.select({
      payload: StdRoot.Query.as(unsafeAny(aliased["event\"payload"]), "payload\"alias")
    }).pipe(
      StdRoot.Query.from(unsafeAny(aliased))
    )

    expect(render(plan).sql).toBe(
      'select "daily""rollup"."event""payload" as "payload""alias" from "audit""logs" as "daily""rollup"'
    )
  })

  test("inlines null and booleans while numbering bound literals", () => {
    const timestamp = new Date("2024-01-02T03:04:05.000Z")

    const plan = StdRoot.Query.select({
      truthy: StdRoot.Query.literal(true),
      falsy: StdRoot.Query.literal(false),
      missing: StdRoot.Query.literal(null),
      createdAt: StdRoot.Query.literal(timestamp),
      visits: StdRoot.Query.literal(7),
      label: StdRoot.Query.literal("user")
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select true as "truthy", false as "falsy", null as "missing", $1 as "createdAt", $2 as "visits", $3 as "label"'
    )
    expect(rendered.params).toEqual([timestamp, 7, "user"])
  })

  test("renders empty postgres selections as zero-column selects", () => {
    const { users } = makePostgresSocialGraph()

    const rendered = Postgres.Renderer.make().render(
      StdRoot.Query.select({}).pipe(StdRoot.Query.from(users))
    )

    expect(rendered.sql).toBe('select from "users"')
    expect(rendered.projections).toEqual([])
  })

  test("renders omitted postgres selections as zero-column selects", () => {
    const { users } = makePostgresSocialGraph()

    const rendered = Postgres.Renderer.make().render(
      StdRoot.Query.select().pipe(StdRoot.Query.from(users))
    )

    expect(rendered.sql).toBe('select from "users"')
    expect(rendered.projections).toEqual([])
  })

  test("renders postgres concat syntax across grouped queries", () => {
    const { users, posts } = makePostgresSocialGraph()
    const plan = buildGroupedConcatPlan(Postgres, users, posts)

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

  test("dedupes repeated exact group-by expressions", () => {
    const { users, posts } = makePostgresSocialGraph()

    const valid = StdRoot.Query.select({
      loweredEmail: StdRoot.Function.lower(users.email),
      postCount: StdRoot.Function.count(posts.id)
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.innerJoin(posts, StdRoot.Query.eq(users.id, posts.userId)),
      StdRoot.Query.groupBy(StdRoot.Function.lower(users.email)),
      StdRoot.Query.groupBy(StdRoot.Function.lower(users.email))
    )

    expect(Postgres.Renderer.make().render(valid).sql).toBe(
      'select lower("users"."email") as "loweredEmail", count("posts"."id") as "postCount" from "users" inner join "posts" on ("users"."id" = "posts"."userId") group by lower("users"."email")'
    )
  })

  test("groups by regex predicate expressions", () => {
    const { users } = makePostgresSocialGraph()
    const matchesExample = StdRoot.Query.regexMatch(users.email, "@example\\.com$")

    const plan = StdRoot.Query.select({
      matchesExample,
      userCount: StdRoot.Function.count(users.id)
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.groupBy(matchesExample)
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("users"."email" ~ $1) as "matchesExample", count("users"."id") as "userCount" from "users" group by ("users"."email" ~ $2)'
    )
    expect(rendered.params).toEqual(["@example\\.com$", "@example\\.com$"])
  })

  test("renders literal-only scalar operators with stable postgres parameter ordering", () => {
    const plan = StdRoot.Query.select({
      stitched: StdRoot.Function.concat("a", "b", "c"),
      fallback: StdRoot.Function.coalesce(null, null, "done"),
      missing: StdRoot.Query.isNull(null),
      present: StdRoot.Query.isNotNull("x"),
      caps: StdRoot.Function.upper("mix"),
      lowered: StdRoot.Function.lower("MIX")
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ($1 || $2 || $3) as "stitched", coalesce(null, null, $4) as "fallback", (null is null) as "missing", ($5 is not null) as "present", upper($6) as "caps", lower($7) as "lowered"'
    )
    expect(rendered.params).toEqual(["a", "b", "c", "done", "x", "mix", "MIX"])
  })

  test("renders nextval sequence definitions with quoted regclass names", () => {
    const sequence = Postgres.Schema.make("Audit\"Schema").sequence("User\"ID_seq")
    const plan = StdRoot.Query.select({
      id: Postgres.Function.nextVal(sequence)
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe('select nextval(cast($1 as regclass)) as "id"')
    expect(rendered.params).toEqual(['"Audit""Schema"."User""ID_seq"'])
  })

  test("renders explicit collations with postgres syntax", () => {
    const plan = StdRoot.Query.select({
      cEmail: StdRoot.Query.collate(StdRoot.Query.literal("alice@example.com"), "C"),
      cQualified: StdRoot.Query.collate(StdRoot.Query.literal("alice@example.com"), ["pg_catalog", "default"])
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ($1 collate "C") as "cEmail", ($2 collate "pg_catalog"."default") as "cQualified"'
    )
    expect(rendered.params).toEqual(["alice@example.com", "alice@example.com"])
  })

  test("groups by collated expressions", () => {
    const { users } = makePostgresSocialGraph()
    const collatedEmail = StdRoot.Query.collate(users.email, "C")

    const plan = StdRoot.Query.select({
      collatedEmail,
      userCount: StdRoot.Function.count(users.id)
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.groupBy(collatedEmail)
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("users"."email" collate "C") as "collatedEmail", count("users"."id") as "userCount" from "users" group by ("users"."email" collate "C")'
    )
    expect(rendered.params).toEqual([])
  })

  test("renders explicit casts with postgres syntax", () => {
    const { users } = makePostgresSocialGraph()

    const plan = StdRoot.Query.select({
      idAsText: StdRoot.Cast.to(users.id, StdRoot.Query.type.text())
    }).pipe(StdRoot.Query.from(users))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe('select cast("users"."id" as text) as "idAsText" from "users"')
    expect(rendered.params).toEqual([])
  })

  test("renders parameterized custom datatypes through explicit casts", () => {
    const plan = StdRoot.Query.select({
      sizedText: StdRoot.Cast.to(
        StdRoot.Query.literal("alice@example.com"),
        Postgres.Type.custom("varchar(255)")
      )
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe('select cast($1 as varchar(255)) as "sizedText"')
    expect(rendered.params).toEqual(["alice@example.com"])
  })

  test("renders array-style custom datatypes through explicit casts", () => {
    const plan = StdRoot.Query.select({
      textArray: StdRoot.Cast.to(
        StdRoot.Query.literal(null),
        Postgres.Type.custom("text[]")
      )
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe('select cast(null as text[]) as "textArray"')
    expect(rendered.params).toEqual([])
  })

  test("renders structured datatype casts with postgres syntax", () => {
    const plan = StdRoot.Query.select({
      arrayValue: StdRoot.Cast.to(
        StdRoot.Query.literal("{}"),
        Postgres.Type.array(StdRoot.Query.type.text())
      ),
      rangeValue: StdRoot.Cast.to(
        StdRoot.Query.literal("int4range(1,10)"),
        Postgres.Type.range("int4range", Postgres.Type.int4())
      ),
      recordValue: StdRoot.Cast.to(
        StdRoot.Query.literal("{}"),
        Postgres.Type.record("user_profile", {
          displayName: StdRoot.Query.type.text(),
          age: Postgres.Type.int4()
        })
      ),
      domainValue: StdRoot.Cast.to(
        StdRoot.Query.literal("alice@example.com"),
        Postgres.Type.domain("email_domain", StdRoot.Query.type.text())
      ),
      enumValue: StdRoot.Cast.to(
        StdRoot.Query.literal("status_enum"),
        Postgres.Type.enum("status_enum")
      )
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select cast($1 as text[]) as "arrayValue", cast($2 as int4range) as "rangeValue", cast($3 as user_profile) as "recordValue", cast($4 as email_domain) as "domainValue", cast($5 as status_enum) as "enumValue"'
    )
    expect(rendered.params).toEqual(["{}", "int4range(1,10)", "{}", "alice@example.com", "status_enum"])
  })

  test("renders array and range container operators with postgres syntax", () => {
    const plan = StdRoot.Query.select({
      arrayContains: StdRoot.Query.contains(
        StdRoot.Cast.to(StdRoot.Query.literal("{}"), Postgres.Type.array(StdRoot.Query.type.text())),
        StdRoot.Cast.to(StdRoot.Query.literal("{}"), Postgres.Type.array(StdRoot.Query.type.text()))
      ),
      arrayContainedBy: StdRoot.Query.containedBy(
        StdRoot.Cast.to(StdRoot.Query.literal("{}"), Postgres.Type.array(StdRoot.Query.type.text())),
        StdRoot.Cast.to(StdRoot.Query.literal("{}"), Postgres.Type.array(StdRoot.Query.type.text()))
      ),
      rangeOverlap: StdRoot.Query.overlaps(
        StdRoot.Cast.to(StdRoot.Query.literal("int4range(1,10)"), Postgres.Type.range("int4range", Postgres.Type.int4())),
        StdRoot.Cast.to(StdRoot.Query.literal("int4range(5,15)"), Postgres.Type.range("int4range", Postgres.Type.int4()))
      )
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select (cast($1 as text[]) @> cast($2 as text[])) as "arrayContains", (cast($3 as text[]) <@ cast($4 as text[])) as "arrayContainedBy", (cast($5 as int4range) && cast($6 as int4range)) as "rangeOverlap"'
    )
    expect(rendered.params).toEqual(["{}", "{}", "{}", "{}", "int4range(1,10)", "int4range(5,15)"])
  })

  test("rejects incompatible built-in postgres range and multirange operands", () => {
    const plan = StdRoot.Query.select({
      badOverlap: StdRoot.Query.overlaps(
        StdRoot.Cast.to(StdRoot.Query.literal("int4range(1,10)"), Postgres.Type.int4range()),
        StdRoot.Cast.to(StdRoot.Query.literal("[2026-01-01,2026-01-02)"), Postgres.Type.tstzrange())
      ),
      badMultiOverlap: StdRoot.Query.overlaps(
        StdRoot.Cast.to(StdRoot.Query.literal("{[1,10)}"), Postgres.Type.int4multirange()),
        StdRoot.Cast.to(StdRoot.Query.literal("{[2026-01-01,2026-01-02)}"), Postgres.Type.tstzmultirange())
      )
    })

    expect(() => Postgres.Renderer.make().render(plan)).toThrow()
  })

  test("renders boolean combinators and clause-level parameter ordering across postgres queries", () => {
    const { users, posts } = makePostgresSocialGraph()

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

  test("renders distinct, limit, and offset with postgres parameter ordering", () => {
    const { users } = makePostgresSocialGraph()

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
      'select distinct "users"."email" as "email" from "users" where ("users"."email" like $1) order by "users"."email" asc limit $2 offset $3'
    )
    expect(rendered.params).toEqual(["%@example.com", 5, 10])
  })

  test("rejects NaN postgres limit values", () => {
    const { users } = makePostgresSocialGraph()

    const plan = StdRoot.Query.select({
      email: users.email
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.limit(Number.NaN)
    )

    expect(() => render(plan)).toThrow("Expected a finite numeric value")
  })

  test("rejects NaN postgres offset values", () => {
    const { users } = makePostgresSocialGraph()

    const plan = StdRoot.Query.select({
      email: users.email
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.offset(Number.NaN)
    )

    expect(() => render(plan)).toThrow("Expected a finite numeric value")
  })

  test("renders distinct on with postgres parameter ordering", () => {
    const { users } = makePostgresSocialGraph()

    const plan = StdRoot.Query.select({
      id: users.id,
      email: users.email
    }).pipe(
      StdRoot.Query.from(users),
      Postgres.Query.distinctOn(users.email),
      StdRoot.Query.orderBy(users.email),
      StdRoot.Query.orderBy(users.id)
    )

    const rendered = render(plan)

    expect(rendered.sql).toBe(
      'select distinct on ("users"."email") "users"."id" as "id", "users"."email" as "email" from "users" order by "users"."email" asc, "users"."id" asc'
    )
    expect(rendered.params).toEqual([])
  })

  test("rejects distinct on ordering that does not start with distinct expressions", () => {
    const { users } = makePostgresSocialGraph()

    const plan = StdRoot.Query.select({
      id: users.id,
      email: users.email
    }).pipe(
      StdRoot.Query.from(users),
      Postgres.Query.distinctOn(users.email),
      StdRoot.Query.orderBy(users.id),
      StdRoot.Query.orderBy(users.email)
    )

    expect(() => render(plan)).toThrow(
      "distinctOn(...) expressions must match the leftmost orderBy(...) expressions"
    )
  })

  test("renders the extended read predicate surface with postgres-specific operators", () => {
    const { users } = makePostgresSocialGraph()

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

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("users"."id" <> $1) as "notEqual", ("users"."id" < $2) as "lessThan", ("users"."id" <= $3) as "lessThanOrEqual", ("users"."id" > $4) as "greaterThan", ("users"."id" >= $5) as "greaterThanOrEqual", ("users"."email" like $6) as "emailLike", ("users"."email" ilike $7) as "emailInsensitive", ("users"."id" between $8 and $9) as "idRange", ("users"."id" in ($10, $11, $12)) as "idSet" from "users"'
    )
    expect(rendered.params).toEqual([5, 10, 11, 1, 0, "%@example.com", "%@EXAMPLE.COM%", 2, 4, 7, 8, 9])
  })

  test("renders the remaining read predicate helpers with postgres-specific syntax", () => {
    const { users } = makePostgresSocialGraph()

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

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("users"."id" not in ($1, $2, $3)) as "notInIds", ("users"."email" is distinct from $4) as "distinctEmail", ("users"."email" is not distinct from $5) as "sameEmail", (("users"."id" = $6) and (("users"."email" = $7) or ("users"."email" = $8))) as "combined", case when ("users"."email" = $9) then $10 when ("users"."email" = $11) then $12 else $13 end as "label" from "users"'
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

  test("renders searched case expressions with postgres placeholders", () => {
    const { users, posts } = makePostgresSocialGraph()

    const plan = StdRoot.Query.select({
      titleState: StdRoot.Query.case()
        .when(StdRoot.Query.isNull(posts.title), "missing")
        .when(StdRoot.Query.eq(StdRoot.Function.lower(posts.title), "draft"), "draft")
        .else(StdRoot.Function.upper(StdRoot.Function.coalesce(posts.title, "published")))
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.leftJoin(posts, StdRoot.Query.eq(users.id, posts.userId))
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select case when ("posts"."title" is null) then $1 when (lower("posts"."title") = $2) then $3 else upper(coalesce("posts"."title", $4)) end as "titleState" from "users" left join "posts" on ("users"."id" = "posts"."userId")'
    )
    expect(rendered.params).toEqual(["missing", "draft", "draft", "published"])
  })

  test("renders right, full, and cross joins with postgres syntax", () => {
    const { users, posts } = makePostgresSocialGraph()

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

    expect(Postgres.Renderer.make().render(rightJoinPlan).sql).toBe(
      'select "users"."id" as "userId", "posts"."id" as "postId" from "users" right join "posts" on ("users"."id" = "posts"."userId")'
    )
    expect(Postgres.Renderer.make().render(fullJoinPlan).sql).toBe(
      'select "users"."id" as "userId", "posts"."id" as "postId" from "users" full join "posts" on ("users"."id" = "posts"."userId")'
    )
    expect(Postgres.Renderer.make().render(crossJoinPlan).sql).toBe(
      'select "users"."id" as "userId", "posts"."id" as "postId" from "users" cross join "posts"'
    )
  })

  test("renders distinct, limit, and offset with postgres placeholders", () => {
    const { users } = makePostgresSocialGraph()

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

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select distinct "users"."id" as "userId", "users"."email" as "email" from "users" order by "users"."email" asc limit $1 offset $2'
    )
    expect(rendered.params).toEqual([10, 20])
  })

  test("renders exists subqueries with shared postgres parameter ordering", () => {
    const { users, posts } = makePostgresSocialGraph()

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

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select "users"."email" as "email", exists (select "posts"."id" as "id" from "posts" where ("posts"."title" = $1)) as "hasHelloPost" from "users" where ("users"."email" = $2)'
    )
    expect(rendered.params).toEqual(["hello", "alice@example.com"])
  })

  test("renders correlated exists subqueries against outer postgres sources", () => {
    const { users, posts } = makePostgresSocialGraph()

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

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select "users"."email" as "email", exists (select "posts"."id" as "id" from "posts" where ("posts"."userId" = "users"."id")) as "hasPosts" from "users" where ("users"."email" = $1)'
    )
    expect(rendered.params).toEqual(["alice@example.com"])
  })

  test("groups by exists subquery expressions", () => {
    const { users, posts } = makePostgresSocialGraph()

    const postExists = StdRoot.Query.select({
      id: posts.id
    }).pipe(
      StdRoot.Query.from(posts),
      StdRoot.Query.where(StdRoot.Query.eq(posts.userId, users.id))
    )
    const hasPosts = StdRoot.Query.exists(postExists)

    const plan = StdRoot.Query.select({
      hasPosts,
      userCount: StdRoot.Function.count(users.id)
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.groupBy(hasPosts)
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select exists (select "posts"."id" as "id" from "posts" where ("posts"."userId" = "users"."id")) as "hasPosts", count("users"."id") as "userCount" from "users" group by exists (select "posts"."id" as "id" from "posts" where ("posts"."userId" = "users"."id"))'
    )
    expect(rendered.params).toEqual([])
  })

  test("renders window functions and windowed aggregates with postgres syntax", () => {
    const { users, posts } = makePostgresSocialGraph()

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

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select "users"."id" as "userId", row_number() over (partition by "users"."id" order by "posts"."id" asc) as "rowNumber", rank() over (partition by "users"."id" order by lower("posts"."title") desc) as "rankByTitle", count("posts"."id") over (partition by "users"."id" order by "posts"."id" asc) as "postCount", max("posts"."title") over (partition by "users"."id") as "latestTitle" from "users" left join "posts" on ("users"."id" = "posts"."userId")'
    )
    expect(rendered.params).toEqual([])
  })

  test("renders aliased postgres subqueries as derived tables", () => {
    const { users, posts } = makePostgresSocialGraph()

    const activePosts = StdRoot.Query.select({
      userId: posts.userId,
      title: posts.title
    }).pipe(
      StdRoot.Query.from(posts),
      StdRoot.Query.where(StdRoot.Query.isNotNull(posts.title))
    )

    const derivedPosts = StdRoot.Query.as(activePosts, "active_posts")

    const plan = StdRoot.Query.select({
      userId: users.id,
      title: derivedPosts.title
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.innerJoin(derivedPosts, StdRoot.Query.eq(users.id, derivedPosts.userId))
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select "users"."id" as "userId", "active_posts"."title" as "title" from "users" inner join (select "posts"."userId" as "userId", "posts"."title" as "title" from "posts" where ("posts"."title" is not null)) as "active_posts" on ("users"."id" = "active_posts"."userId")'
    )
    expect(rendered.params).toEqual([])
  })

  test("renders postgres common table expressions as aliased sources", () => {
    const { users, posts } = makePostgresSocialGraph()

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

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'with "active_posts" as (select "posts"."userId" as "userId", "posts"."title" as "title" from "posts" where ("posts"."title" is not null)) select "users"."id" as "userId", "active_posts"."title" as "title" from "users" inner join "active_posts" on ("users"."id" = "active_posts"."userId")'
    )
  })

  test("renders postgres data-modifying ctes with returning projections", () => {
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

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'with "inserted_users" as (insert into "users" ("id", "email", "bio") values ($1, $2, null) returning "users"."id" as "id", "users"."email" as "email", "users"."bio" as "bio") select "inserted_users"."id" as "id", "inserted_users"."email" as "email", "inserted_users"."bio" as "bio" from "inserted_users"'
    )
    expect(rendered.params).toEqual([
      userId,
      "alice@example.com"
    ])
  })

  test("does not duplicate registered ctes inside later derived subqueries", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid()
    })

    const insertedUsers = StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com"
    }).pipe(
      StdRoot.Query.returning({
        id: users.id
      }),
      StdRoot.Query.with("inserted_users")
    )
    const postIds = StdRoot.Query.select({
      postId: posts.id
    }).pipe(
      StdRoot.Query.from(posts),
      StdRoot.Query.as("post_ids")
    )

    const plan = StdRoot.Query.select({
      id: insertedUsers.id,
      postId: postIds.postId
    }).pipe(
      StdRoot.Query.from(insertedUsers),
      StdRoot.Query.crossJoin(postIds)
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'with "inserted_users" as (insert into "users" ("id", "email") values ($1, $2) returning "users"."id" as "id") select "inserted_users"."id" as "id", "post_ids"."postId" as "postId" from "inserted_users" cross join (select "posts"."id" as "postId" from "posts") as "post_ids"'
    )
    expect(rendered.params).toEqual([
      userId,
      "alice@example.com"
    ])
  })

  test("renders postgres lateral joins with correlated outer references", () => {
    const { users, posts } = makePostgresSocialGraph()

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

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select "users"."id" as "userId", "user_posts"."postId" as "postId" from "users" inner join lateral (select "posts"."id" as "postId", "posts"."userId" as "userId" from "posts" where ("posts"."userId" = "users"."id")) as "user_posts" on true'
    )
    expect(rendered.params).toEqual([])
  })

  test("renders recursive postgres ctes with the recursive keyword", () => {
    const { posts } = makePostgresSocialGraph()

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

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'with recursive "recursive_posts" as (select "posts"."userId" as "userId" from "posts") select "recursive_posts"."userId" as "userId" from "recursive_posts"'
    )
    expect(rendered.params).toEqual([])
  })

  test("renders postgres upsert statements with conflict targets and returning projections", () => {
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

    const rendered = Postgres.Renderer.make().render(upsertPlan)

    expect(rendered.sql).toBe(
      'insert into "users" ("id", "email", "bio") values ($1, $2, null) on conflict ("id") do update set "email" = $3 returning "users"."id" as "id", "users"."email" as "email"'
    )
    expect(rendered.params).toEqual([
      userId,
      "alice@example.com",
      "alice@new.example.com"
    ])
  })

  test("renders postgres locking clauses at the end of select queries", () => {
    const { users } = makePostgresSocialGraph()

    const plan = StdRoot.Query.select({
      id: users.id
    }).pipe(
      StdRoot.Query.from(users),
      StdRoot.Query.lock("update", { nowait: true })
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select "users"."id" as "id" from "users" for update nowait'
    )
    expect(rendered.params).toEqual([])
  })

  test("renders postgres set operators with stable operand ordering", () => {
    const { users } = makePostgresSocialGraph()

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

    expect(Postgres.Renderer.make().render(unionPlan).sql).toBe(
      '(select "users"."email" as "email" from "users" where ("users"."email" = $1)) union (select "users"."email" as "email" from "users" where ("users"."email" = $2)) union (select "users"."email" as "email" from "users" where ("users"."email" = $3))'
    )
    expect(Postgres.Renderer.make().render(unionPlan).params).toEqual([
      "alice@example.com",
      "bob@example.com",
      "carol@example.com"
    ])
    expect(Postgres.Renderer.make().render(unionPlan).projections).toEqual([
      { path: ["email"], alias: "email" }
    ])

    expect(Postgres.Renderer.make().render(intersectPlan).sql).toBe(
      '(select "users"."email" as "email" from "users" where ("users"."email" = $1)) intersect (select "users"."email" as "email" from "users" where ("users"."email" = $2))'
    )
    expect(Postgres.Renderer.make().render(intersectPlan).params).toEqual([
      "alice@example.com",
      "bob@example.com"
    ])

    expect(Postgres.Renderer.make().render(exceptPlan).sql).toBe(
      '(select "users"."email" as "email" from "users" where ("users"."email" = $1)) except (select "users"."email" as "email" from "users" where ("users"."email" = $2))'
    )
    expect(Postgres.Renderer.make().render(exceptPlan).params).toEqual([
      "alice@example.com",
      "bob@example.com"
    ])
  })

  test("renders postgres insert update and delete mutations with returning projections", () => {
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

    expect(Postgres.Renderer.make().render(insertPlan).sql).toBe(
      'insert into "users" ("id", "email", "bio") values ($1, $2, null) returning "users"."id" as "id", "users"."email" as "email", "users"."bio" as "bio"'
    )
    expect(Postgres.Renderer.make().render(insertPlan).params).toEqual([
      userId,
      "alice@example.com"
    ])

    expect(Postgres.Renderer.make().render(updatePlan).sql).toBe(
      'update "users" set "email" = $1, "bio" = null where ("users"."id" = $2) returning "users"."id" as "id", "users"."email" as "email", "users"."bio" as "bio"'
    )
    expect(Postgres.Renderer.make().render(updatePlan).params).toEqual([
      "updated@example.com",
      userId
    ])

    expect(Postgres.Renderer.make().render(deletePlan).sql).toBe(
      'delete from "users" where ("users"."id" = $1) returning "users"."id" as "id"'
    )
    expect(Postgres.Renderer.make().render(deletePlan).params).toEqual([userId])
  })

  test("renders postgres update from joined sources", () => {
    const { users, posts } = makePostgresSocialGraph()

    const plan = StdRoot.Query.returning({
      id: users.id,
      email: users.email
    })(StdRoot.Query.where(StdRoot.Query.eq(posts.title, "hello"))(
      StdRoot.Query.innerJoin(posts, StdRoot.Query.eq(posts.userId, users.id))(
        StdRoot.Query.update(users, {
          email: "author@example.com"
        })
      )
    ))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'update "users" set "email" = $1 from "posts" where ("posts"."userId" = "users"."id") and ("posts"."title" = $2) returning "users"."id" as "id", "users"."email" as "email"'
    )
    expect(rendered.params).toEqual([
      "author@example.com",
      "hello"
    ])
  })

  test("renders postgres delete using joined sources", () => {
    const { users, posts } = makePostgresSocialGraph()

    const plan = StdRoot.Query.returning({
      id: users.id
    })(StdRoot.Query.where(StdRoot.Query.eq(posts.title, "hello"))(
      StdRoot.Query.innerJoin(posts, StdRoot.Query.eq(posts.userId, users.id))(
        StdRoot.Query.delete(users)
      )
    ))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'delete from "users" using "posts" where ("posts"."userId" = "users"."id") and ("posts"."title" = $1) returning "users"."id" as "id"'
    )
    expect(rendered.params).toEqual(["hello"])
  })

  test("renders postgres multi-row and source-backed inserts", () => {
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

    expect(Postgres.Renderer.make().render(multiRowPlan).sql).toBe(
      'insert into "users" ("id", "email", "bio") values ($1, $2, null), ($3, $4, $5)'
    )
    expect(Postgres.Renderer.make().render(multiRowPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])

    expect(Postgres.Renderer.make().render(insertSelectPlan).sql).toBe(
      'insert into "archived_users" ("id", "email", "bio") select "users"."id" as "id", "users"."email" as "email", "users"."bio" as "bio" from "users"'
    )
    expect(Postgres.Renderer.make().render(insertSelectPlan).params).toEqual([])

    expect(Postgres.Renderer.make().render(insertUnnestPlan).sql).toBe(
      'insert into "users" ("id", "email", "bio") select * from unnest(cast($1 as uuid[]), cast($2 as text[]), cast($3 as text[]))'
    )
    expect(Postgres.Renderer.make().render(insertUnnestPlan).params).toEqual([
      [userId, secondUserId],
      ["alice@example.com", "bob@example.com"],
      [null, "writer"]
    ])
  })

  test("renders postgres default-values and rich conflict clauses", () => {
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
    const partialIndexConflictPlan = StdRoot.Query.onConflict({
      columns: ["email"] as const,
      where: StdRoot.Query.isNotNull(users.bio)
    }, {
      update: {
        bio: StdRoot.Query.excluded(users.bio)
      },
      where: StdRoot.Query.isNotNull(StdRoot.Query.excluded(users.bio))
    })(StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: "writer"
    }))
    const namedConstraintPlan = StdRoot.Query.onConflict({
      constraint: "users_email_key"
    }, {
      update: {
        email: StdRoot.Query.excluded(users.email)
      }
    })(StdRoot.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }))

    expect(Postgres.Renderer.make().render(defaultInsertPlan).sql).toBe(
      'insert into "audit_logs" default values'
    )

    expect(Postgres.Renderer.make().render(partialIndexConflictPlan).sql).toBe(
      'insert into "users" ("id", "email", "bio") values ($1, $2, $3) on conflict ("email") where ("users"."bio" is not null) do update set "bio" = excluded."bio" where (excluded."bio" is not null)'
    )
    expect(Postgres.Renderer.make().render(partialIndexConflictPlan).params).toEqual([
      userId,
      "alice@example.com",
      "writer"
    ])

    expect(Postgres.Renderer.make().render(namedConstraintPlan).sql).toBe(
      'insert into "users" ("id", "email", "bio") values ($1, $2, null) on conflict on constraint "users_email_key" do update set "email" = excluded."email"'
    )
    expect(Postgres.Renderer.make().render(namedConstraintPlan).params).toEqual([
      userId,
      "alice@example.com"
    ])
  })

  test("renders postgres ddl statements from schema tables", () => {
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

    expect(Postgres.Renderer.make().render(StdRoot.Query.createTable(memberships, {
      ifNotExists: true
    })).sql).toBe(
      'create table if not exists "memberships" ("id" uuid not null, "orgId" uuid not null, "role" text not null, "note" text, primary key ("id"), foreign key ("orgId") references "orgs" ("id"), unique ("orgId", "role"), constraint "role_not_empty" check (("role" <> \'\')))'
    )
    expect(Postgres.Renderer.make().render(StdRoot.Query.createTable(memberships, {
      ifNotExists: true
    })).params).toEqual([])
    expect(Postgres.Renderer.make().render(StdRoot.Query.createIndex(memberships, ["role", "orgId"] as const, {
      ifNotExists: true
    })).sql).toBe(
      'create index if not exists "memberships_role_orgId_idx" on "memberships" ("role", "orgId")'
    )
    expect(Postgres.Renderer.make().render(StdRoot.Query.dropIndex(memberships, ["role", "orgId"] as const, {
      ifExists: true
    })).sql).toBe(
      'drop index if exists "memberships_role_orgId_idx"'
    )
    expect(Postgres.Renderer.make().render(StdRoot.Query.dropTable(memberships, {
      ifExists: true
    })).sql).toBe(
      'drop table if exists "memberships"'
    )
  })

  test("renders schema-qualified postgres tables in queries and ddl", () => {
    const analytics = Postgres.Schema.make("analytics")
    const users = analytics.table("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    const events = analytics.table("events", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid().pipe(StdRoot.Column.references(() => users.id))
    })

    const plan = StdRoot.Query.select({
      eventId: events.id
    }).pipe(
      StdRoot.Query.from(events)
    )

    expect(Postgres.Renderer.make().render(plan).sql).toBe(
      'select "events"."id" as "eventId" from "analytics"."events"'
    )
    expect(Postgres.Renderer.make().render(StdRoot.Query.createTable(events, {
      ifNotExists: true
    })).sql).toBe(
      'create table if not exists "analytics"."events" ("id" uuid not null, "userId" uuid not null, primary key ("id"), foreign key ("userId") references "analytics"."users" ("id"))'
    )
  })

  test("decodes nullable joined rows through the postgres executor pipeline", () => {
    const { users, posts } = makePostgresSocialGraph()

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

    const rows = Effect.runSync(unsafeAny(Postgres.Executor.make({
      driver: Postgres.Executor.driver(() => Effect.succeed([{
        profile__id: userId,
        profile__email: "alice@example.com",
        post__id: null,
        post__title: null,
        hasPost: false
      }]))
    }).execute(plan)))

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

  test("uses the postgres entrypoint renderer and rejects unknown expression nodes", () => {
    expect(() => Postgres.Renderer.make()).not.toThrow()
    expect(() => (CoreRenderer.make as (dialect: string) => unknown)("postgres")).toThrow(
      "Renderer.make requires an explicit render implementation for dialect: postgres"
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
    }, postgresDialect)).toThrow(
      "Unsupported expression for SQL rendering"
    )
  })
})
