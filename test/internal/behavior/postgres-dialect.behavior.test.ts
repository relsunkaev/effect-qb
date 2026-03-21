import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import * as CoreRenderer from "#internal/renderer.ts"
import * as ExpressionAst from "#internal/expression-ast.ts"
import { postgresDialect } from "#internal/postgres-dialect.ts"
import { renderExpression } from "#internal/sql-expression-renderer.ts"
import * as Postgres from "#postgres"
import { makePostgresSocialGraph } from "../../fixtures/schema.ts"
import { buildGroupedConcatPlan } from "../../helpers/dialect-matrix.ts"
import { unsafeNever } from "../../helpers/unsafe.ts"

const userId = "11111111-1111-1111-1111-111111111111"
const secondUserId = "22222222-2222-2222-2222-222222222222"

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
      'select "daily""rollup"."event""payload" as "payload""alias" from "public"."audit""logs" as "daily""rollup"'
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
    const plan = buildGroupedConcatPlan(Postgres, users, posts)

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select (lower("users"."email") || $1 || coalesce(max("posts"."title"), $2)) as "emailLabel", min("posts"."title") as "firstTitle", count("posts"."id") as "postCount" from "public"."users" inner join "public"."posts" on ("users"."id" = "posts"."userId") group by lower("users"."email") having (count("posts"."id") = $3) order by count("posts"."id") desc'
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
      'select lower("users"."email") as "loweredEmail", count("posts"."id") as "postCount" from "public"."users" inner join "public"."posts" on ("users"."id" = "posts"."userId") group by lower("users"."email")'
    )

    const invalid = Postgres.Query.select({
      email: users.email,
      postCount: Postgres.Query.count(posts.id)
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.innerJoin(posts, Postgres.Query.eq(users.id, posts.userId)),
      Postgres.Query.groupBy(Postgres.Query.lower(users.email))
    )

    expect(() => Postgres.Renderer.make().render(unsafeNever(invalid))).toThrow(
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

  test("renders explicit casts with postgres syntax", () => {
    const { users } = makePostgresSocialGraph()

    const plan = Postgres.Query.select({
      idAsText: Postgres.Query.cast(users.id, Postgres.Query.type.text())
    }).pipe(Postgres.Query.from(users))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe('select cast("users"."id" as text) as "idAsText" from "public"."users"')
    expect(rendered.params).toEqual([])
  })

  test("renders parameterized custom datatypes through explicit casts", () => {
    const plan = Postgres.Query.select({
      sizedText: Postgres.Query.cast(
        Postgres.Query.literal("alice@example.com"),
        Postgres.Query.type.custom("varchar(255)")
      )
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe('select cast($1 as varchar(255)) as "sizedText"')
    expect(rendered.params).toEqual(["alice@example.com"])
  })

  test("renders array-style custom datatypes through explicit casts", () => {
    const plan = Postgres.Query.select({
      textArray: Postgres.Query.cast(
        Postgres.Query.literal(null),
        Postgres.Query.type.custom("text[]")
      )
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe('select cast(null as text[]) as "textArray"')
    expect(rendered.params).toEqual([])
  })

  test("renders structured datatype casts with postgres syntax", () => {
    const plan = Postgres.Query.select({
      arrayValue: Postgres.Query.cast(
        Postgres.Query.literal("{}"),
        Postgres.Query.type.array(Postgres.Query.type.text())
      ),
      rangeValue: Postgres.Query.cast(
        Postgres.Query.literal("int4range(1,10)"),
        Postgres.Query.type.range("int4range", Postgres.Query.type.int4())
      ),
      recordValue: Postgres.Query.cast(
        Postgres.Query.literal("{}"),
        Postgres.Query.type.record("user_profile", {
          displayName: Postgres.Query.type.text(),
          age: Postgres.Query.type.int4()
        })
      ),
      domainValue: Postgres.Query.cast(
        Postgres.Query.literal("alice@example.com"),
        Postgres.Query.type.domain("email_domain", Postgres.Query.type.text())
      ),
      enumValue: Postgres.Query.cast(
        Postgres.Query.literal("status_enum"),
        Postgres.Query.type.enum("status_enum")
      )
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select cast($1 as text[]) as "arrayValue", cast($2 as int4range) as "rangeValue", cast($3 as user_profile) as "recordValue", cast($4 as email_domain) as "domainValue", cast($5 as status_enum) as "enumValue"'
    )
    expect(rendered.params).toEqual(["{}", "int4range(1,10)", "{}", "alice@example.com", "status_enum"])
  })

  test("renders array and range container operators with postgres syntax", () => {
    const plan = Postgres.Query.select({
      arrayContains: Postgres.Query.contains(
        Postgres.Query.cast(Postgres.Query.literal("{}"), Postgres.Query.type.array(Postgres.Query.type.text())),
        Postgres.Query.cast(Postgres.Query.literal("{}"), Postgres.Query.type.array(Postgres.Query.type.text()))
      ),
      arrayContainedBy: Postgres.Query.containedBy(
        Postgres.Query.cast(Postgres.Query.literal("{}"), Postgres.Query.type.array(Postgres.Query.type.text())),
        Postgres.Query.cast(Postgres.Query.literal("{}"), Postgres.Query.type.array(Postgres.Query.type.text()))
      ),
      rangeOverlap: Postgres.Query.overlaps(
        Postgres.Query.cast(Postgres.Query.literal("int4range(1,10)"), Postgres.Query.type.range("int4range", Postgres.Query.type.int4())),
        Postgres.Query.cast(Postgres.Query.literal("int4range(5,15)"), Postgres.Query.type.range("int4range", Postgres.Query.type.int4()))
      )
    })

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select (cast($1 as text[]) @> cast($2 as text[])) as "arrayContains", (cast($3 as text[]) <@ cast($4 as text[])) as "arrayContainedBy", (cast($5 as int4range) && cast($6 as int4range)) as "rangeOverlap"'
    )
    expect(rendered.params).toEqual(["{}", "{}", "{}", "{}", "int4range(1,10)", "int4range(5,15)"])
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
      'select (lower("users"."email") || $1 || upper(coalesce("posts"."title", $2))) as "summary", (("posts"."title" is null) or (lower("posts"."title") = $3)) as "draftOrMissing", (("posts"."id" is not null) and (not ("users"."email" = $4))) as "active" from "public"."users" left join "public"."posts" on ("users"."id" = "posts"."userId") where ((("users"."email" = $5) or ("users"."email" = $6)) and (not (coalesce("posts"."title", $7) = $8))) order by upper(coalesce("posts"."title", $9)) desc'
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

    const plan = Postgres.Query.select({
      email: users.email
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.where(Postgres.Query.like(users.email, "%@example.com")),
      Postgres.Query.distinct(),
      Postgres.Query.orderBy(users.email),
      Postgres.Query.limit(5),
      Postgres.Query.offset(10)
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select distinct "users"."email" as "email" from "public"."users" where ("users"."email" like $1) order by "users"."email" asc limit $2 offset $3'
    )
    expect(rendered.params).toEqual(["%@example.com", 5, 10])
  })

  test("renders distinct on with postgres parameter ordering", () => {
    const { users } = makePostgresSocialGraph()

    const plan = Postgres.Query.select({
      id: users.id,
      email: users.email
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.distinctOn(users.email),
      Postgres.Query.orderBy(users.email),
      Postgres.Query.orderBy(users.id)
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select distinct on ("users"."email") "users"."id" as "id", "users"."email" as "email" from "public"."users" order by "users"."email" asc, "users"."id" asc'
    )
    expect(rendered.params).toEqual([])
  })

  test("renders the extended read predicate surface with postgres-specific operators", () => {
    const { users } = makePostgresSocialGraph()

    const plan = Postgres.Query.select({
      notEqual: Postgres.Query.neq(users.id, 5),
      lessThan: Postgres.Query.lt(users.id, 10),
      lessThanOrEqual: Postgres.Query.lte(users.id, 11),
      greaterThan: Postgres.Query.gt(users.id, 1),
      greaterThanOrEqual: Postgres.Query.gte(users.id, 0),
      emailLike: Postgres.Query.like(users.email, "%@example.com"),
      emailInsensitive: Postgres.Query.ilike(users.email, "%@EXAMPLE.COM%"),
      idRange: Postgres.Query.between(users.id, 2, 4),
      idSet: Postgres.Query.in(users.id, 7, 8, 9)
    }).pipe(
      Postgres.Query.from(users)
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("users"."id" <> $1) as "notEqual", ("users"."id" < $2) as "lessThan", ("users"."id" <= $3) as "lessThanOrEqual", ("users"."id" > $4) as "greaterThan", ("users"."id" >= $5) as "greaterThanOrEqual", ("users"."email" like $6) as "emailLike", ("users"."email" ilike $7) as "emailInsensitive", ("users"."id" between $8 and $9) as "idRange", ("users"."id" in ($10, $11, $12)) as "idSet" from "public"."users"'
    )
    expect(rendered.params).toEqual([5, 10, 11, 1, 0, "%@example.com", "%@EXAMPLE.COM%", 2, 4, 7, 8, 9])
  })

  test("renders the remaining read predicate helpers with postgres-specific syntax", () => {
    const { users } = makePostgresSocialGraph()

    const plan = Postgres.Query.select({
      notInIds: Postgres.Query.notIn(users.id, 4, 5, 6),
      distinctEmail: Postgres.Query.isDistinctFrom(users.email, "alice@example.com"),
      sameEmail: Postgres.Query.isNotDistinctFrom(users.email, "alice@example.com"),
      combined: Postgres.Query.all(
        Postgres.Query.eq(users.id, 1),
        Postgres.Query.any(
          Postgres.Query.eq(users.email, "alice@example.com"),
          Postgres.Query.eq(users.email, "bob@example.com")
        )
      ),
      label: Postgres.Query.match(users.email)
        .when("alice@example.com", "Alice")
        .when("bob@example.com", "Bob")
        .else("Other")
    }).pipe(
      Postgres.Query.from(users)
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("users"."id" not in ($1, $2, $3)) as "notInIds", ("users"."email" is distinct from $4) as "distinctEmail", ("users"."email" is not distinct from $5) as "sameEmail", (("users"."id" = $6) and (("users"."email" = $7) or ("users"."email" = $8))) as "combined", case when ("users"."email" = $9) then $10 when ("users"."email" = $11) then $12 else $13 end as "label" from "public"."users"'
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
      'select case when ("posts"."title" is null) then $1 when (lower("posts"."title") = $2) then $3 else upper(coalesce("posts"."title", $4)) end as "titleState" from "public"."users" left join "public"."posts" on ("users"."id" = "posts"."userId")'
    )
    expect(rendered.params).toEqual(["missing", "draft", "draft", "published"])
  })

  test("renders right, full, and cross joins with postgres syntax", () => {
    const { users, posts } = makePostgresSocialGraph()

    const rightJoinPlan = Postgres.Query.select({
      userId: users.id,
      postId: posts.id
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.rightJoin(posts, Postgres.Query.eq(users.id, posts.userId))
    )

    const fullJoinPlan = Postgres.Query.select({
      userId: users.id,
      postId: posts.id
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.fullJoin(posts, Postgres.Query.eq(users.id, posts.userId))
    )

    const crossJoinPlan = Postgres.Query.select({
      userId: users.id,
      postId: posts.id
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.crossJoin(posts)
    )

    expect(Postgres.Renderer.make().render(rightJoinPlan).sql).toBe(
      'select "users"."id" as "userId", "posts"."id" as "postId" from "public"."users" right join "public"."posts" on ("users"."id" = "posts"."userId")'
    )
    expect(Postgres.Renderer.make().render(fullJoinPlan).sql).toBe(
      'select "users"."id" as "userId", "posts"."id" as "postId" from "public"."users" full join "public"."posts" on ("users"."id" = "posts"."userId")'
    )
    expect(Postgres.Renderer.make().render(crossJoinPlan).sql).toBe(
      'select "users"."id" as "userId", "posts"."id" as "postId" from "public"."users" cross join "public"."posts"'
    )
  })

  test("renders distinct, limit, and offset with postgres placeholders", () => {
    const { users } = makePostgresSocialGraph()

    const plan = Postgres.Query.select({
      userId: users.id,
      email: users.email
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.distinct(),
      Postgres.Query.orderBy(users.email),
      Postgres.Query.limit(10),
      Postgres.Query.offset(20)
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select distinct "users"."id" as "userId", "users"."email" as "email" from "public"."users" order by "users"."email" asc limit $1 offset $2'
    )
    expect(rendered.params).toEqual([10, 20])
  })

  test("renders exists subqueries with shared postgres parameter ordering", () => {
    const { users, posts } = makePostgresSocialGraph()

    const postExists = Postgres.Query.select({
      id: posts.id
    }).pipe(
      Postgres.Query.from(posts),
      Postgres.Query.where(Postgres.Query.eq(posts.title, "hello"))
    )

    const plan = Postgres.Query.select({
      email: users.email,
      hasHelloPost: Postgres.Query.exists(postExists)
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.where(Postgres.Query.eq(users.email, "alice@example.com"))
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select "users"."email" as "email", exists (select "posts"."id" as "id" from "public"."posts" where ("posts"."title" = $1)) as "hasHelloPost" from "public"."users" where ("users"."email" = $2)'
    )
    expect(rendered.params).toEqual(["hello", "alice@example.com"])
  })

  test("renders correlated exists subqueries against outer postgres sources", () => {
    const { users, posts } = makePostgresSocialGraph()

    const postExists = Postgres.Query.select({
      id: posts.id
    }).pipe(
      Postgres.Query.from(posts),
      Postgres.Query.where(Postgres.Query.eq(posts.userId, users.id))
    )

    const plan = Postgres.Query.select({
      email: users.email,
      hasPosts: Postgres.Query.exists(postExists)
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.where(Postgres.Query.eq(users.email, "alice@example.com"))
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select "users"."email" as "email", exists (select "posts"."id" as "id" from "public"."posts" where ("posts"."userId" = "users"."id")) as "hasPosts" from "public"."users" where ("users"."email" = $1)'
    )
    expect(rendered.params).toEqual(["alice@example.com"])
  })

  test("renders window functions and windowed aggregates with postgres syntax", () => {
    const { users, posts } = makePostgresSocialGraph()

    const plan = Postgres.Query.select({
      userId: users.id,
      rowNumber: Postgres.Query.rowNumber({
        partitionBy: [users.id],
        orderBy: [{ value: posts.id, direction: "asc" }]
      }),
      rankByTitle: Postgres.Query.rank({
        partitionBy: [users.id],
        orderBy: [{ value: Postgres.Query.lower(posts.title), direction: "desc" }]
      }),
      postCount: Postgres.Query.over(Postgres.Query.count(posts.id), {
        partitionBy: [users.id],
        orderBy: [{ value: posts.id, direction: "asc" }]
      }),
      latestTitle: Postgres.Query.over(Postgres.Query.max(posts.title), {
        partitionBy: [users.id]
      })
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.leftJoin(posts, Postgres.Query.eq(users.id, posts.userId))
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select "users"."id" as "userId", row_number() over (partition by "users"."id" order by "posts"."id" asc) as "rowNumber", rank() over (partition by "users"."id" order by lower("posts"."title") desc) as "rankByTitle", count("posts"."id") over (partition by "users"."id" order by "posts"."id" asc) as "postCount", max("posts"."title") over (partition by "users"."id") as "latestTitle" from "public"."users" left join "public"."posts" on ("users"."id" = "posts"."userId")'
    )
    expect(rendered.params).toEqual([])
  })

  test("renders aliased postgres subqueries as derived tables", () => {
    const { users, posts } = makePostgresSocialGraph()

    const activePosts = Postgres.Query.select({
      userId: posts.userId,
      title: posts.title
    }).pipe(
      Postgres.Query.from(posts),
      Postgres.Query.where(Postgres.Query.isNotNull(posts.title))
    )

    const derivedPosts = Postgres.Query.as(activePosts, "active_posts")

    const plan = Postgres.Query.select({
      userId: users.id,
      title: derivedPosts.title
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.innerJoin(derivedPosts, Postgres.Query.eq(users.id, derivedPosts.userId))
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select "users"."id" as "userId", "active_posts"."title" as "title" from "public"."users" inner join (select "posts"."userId" as "userId", "posts"."title" as "title" from "public"."posts" where ("posts"."title" is not null)) as "active_posts" on ("users"."id" = "active_posts"."userId")'
    )
    expect(rendered.params).toEqual([])
  })

  test("renders postgres common table expressions as aliased sources", () => {
    const { users, posts } = makePostgresSocialGraph()

    const activePostsSubquery = Postgres.Query.select({
      userId: posts.userId,
      title: posts.title
    }).pipe(
      Postgres.Query.from(posts),
      Postgres.Query.where(Postgres.Query.isNotNull(posts.title))
    )
    const activePosts = activePostsSubquery.pipe(Postgres.Query.with("active_posts"))

    const plan = Postgres.Query.select({
      userId: users.id,
      title: activePosts.title
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.innerJoin(activePosts, Postgres.Query.eq(users.id, activePosts.userId))
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'with "active_posts" as (select "posts"."userId" as "userId", "posts"."title" as "title" from "public"."posts" where ("posts"."title" is not null)) select "users"."id" as "userId", "active_posts"."title" as "title" from "public"."users" inner join "active_posts" on ("users"."id" = "active_posts"."userId")'
    )
  })

  test("renders postgres data-modifying ctes with returning projections", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })

    const insertedUsers = Postgres.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }).pipe(
      Postgres.Query.returning({
        id: users.id,
        email: users.email,
        bio: users.bio
      }),
      Postgres.Query.with("inserted_users")
    )

    const plan = Postgres.Query.select({
      id: insertedUsers.id,
      email: insertedUsers.email,
      bio: insertedUsers.bio
    }).pipe(
      Postgres.Query.from(insertedUsers)
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'with "inserted_users" as (insert into "public"."users" ("id", "email", "bio") values ($1, $2, null) returning "users"."id" as "id", "users"."email" as "email", "users"."bio" as "bio") select "inserted_users"."id" as "id", "inserted_users"."email" as "email", "inserted_users"."bio" as "bio" from "inserted_users"'
    )
    expect(rendered.params).toEqual([
      userId,
      "alice@example.com"
    ])
  })

  test("renders postgres lateral joins with correlated outer references", () => {
    const { users, posts } = makePostgresSocialGraph()

    const lateralPosts = Postgres.Query.select({
        postId: posts.id,
        userId: posts.userId
      }).pipe(
        Postgres.Query.from(posts),
        Postgres.Query.where(Postgres.Query.eq(posts.userId, users.id)),
        Postgres.Query.lateral("user_posts")
      )

    const plan = Postgres.Query.select({
      userId: users.id,
      postId: lateralPosts.postId
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.innerJoin(lateralPosts, true)
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select "users"."id" as "userId", "user_posts"."postId" as "postId" from "public"."users" inner join lateral (select "posts"."id" as "postId", "posts"."userId" as "userId" from "public"."posts" where ("posts"."userId" = "users"."id")) as "user_posts" on true'
    )
    expect(rendered.params).toEqual([])
  })

  test("renders recursive postgres ctes with the recursive keyword", () => {
    const { posts } = makePostgresSocialGraph()

    const recursivePosts = Postgres.Query.select({
        userId: posts.userId
      }).pipe(
        Postgres.Query.from(posts),
        Postgres.Query.withRecursive("recursive_posts")
      )

    const plan = Postgres.Query.select({
      userId: recursivePosts.userId
    }).pipe(
      Postgres.Query.from(recursivePosts)
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'with recursive "recursive_posts" as (select "posts"."userId" as "userId" from "public"."posts") select "recursive_posts"."userId" as "userId" from "recursive_posts"'
    )
    expect(rendered.params).toEqual([])
  })

  test("renders postgres upsert statements with conflict targets and returning projections", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })

    const upsertPlan = Postgres.Query.returning({
      id: users.id,
      email: users.email
    })(Postgres.Query.upsert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }, ["id"] as const, {
      email: "alice@new.example.com"
    }))

    const rendered = Postgres.Renderer.make().render(upsertPlan)

    expect(rendered.sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") values ($1, $2, null) on conflict ("id") do update set "email" = $3 returning "users"."id" as "id", "users"."email" as "email"'
    )
    expect(rendered.params).toEqual([
      userId,
      "alice@example.com",
      "alice@new.example.com"
    ])
  })

  test("renders postgres locking clauses at the end of select queries", () => {
    const { users } = makePostgresSocialGraph()

    const plan = Postgres.Query.select({
      id: users.id
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.lock("update", { nowait: true, skipLocked: true })
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select "users"."id" as "id" from "public"."users" for update nowait skip locked'
    )
    expect(rendered.params).toEqual([])
  })

  test("renders postgres set operators with stable operand ordering", () => {
    const { users } = makePostgresSocialGraph()

    const alice = Postgres.Query.select({
      email: users.email
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.where(Postgres.Query.eq(users.email, "alice@example.com"))
    )

    const bob = Postgres.Query.select({
      email: users.email
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.where(Postgres.Query.eq(users.email, "bob@example.com"))
    )

    const carol = Postgres.Query.select({
      email: users.email
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.where(Postgres.Query.eq(users.email, "carol@example.com"))
    )

    const unionPlan = Postgres.Query.union(Postgres.Query.union(alice, bob), carol)
    const intersectPlan = Postgres.Query.intersect(alice, bob)
    const exceptPlan = Postgres.Query.except(alice, bob)

    expect(Postgres.Renderer.make().render(unionPlan).sql).toBe(
      '(select "users"."email" as "email" from "public"."users" where ("users"."email" = $1)) union (select "users"."email" as "email" from "public"."users" where ("users"."email" = $2)) union (select "users"."email" as "email" from "public"."users" where ("users"."email" = $3))'
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
      '(select "users"."email" as "email" from "public"."users" where ("users"."email" = $1)) intersect (select "users"."email" as "email" from "public"."users" where ("users"."email" = $2))'
    )
    expect(Postgres.Renderer.make().render(intersectPlan).params).toEqual([
      "alice@example.com",
      "bob@example.com"
    ])

    expect(Postgres.Renderer.make().render(exceptPlan).sql).toBe(
      '(select "users"."email" as "email" from "public"."users" where ("users"."email" = $1)) except (select "users"."email" as "email" from "public"."users" where ("users"."email" = $2))'
    )
    expect(Postgres.Renderer.make().render(exceptPlan).params).toEqual([
      "alice@example.com",
      "bob@example.com"
    ])
  })

  test("renders postgres insert update and delete mutations with returning projections", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })

    const insertPlan = Postgres.Query.returning({
      id: users.id,
      email: users.email,
      bio: users.bio
    })(Postgres.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }))

    const updatePlan = Postgres.Query.returning({
      id: users.id,
      email: users.email,
      bio: users.bio
    })(Postgres.Query.where(Postgres.Query.eq(users.id, userId))(
      Postgres.Query.update(users, {
        email: "updated@example.com",
        bio: null
      })
    ))

    const deletePlan = Postgres.Query.returning({
      id: users.id
    })(Postgres.Query.where(Postgres.Query.eq(users.id, userId))(
      Postgres.Query.delete(users)
    ))

    expect(Postgres.Renderer.make().render(insertPlan).sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") values ($1, $2, null) returning "users"."id" as "id", "users"."email" as "email", "users"."bio" as "bio"'
    )
    expect(Postgres.Renderer.make().render(insertPlan).params).toEqual([
      userId,
      "alice@example.com"
    ])

    expect(Postgres.Renderer.make().render(updatePlan).sql).toBe(
      'update "public"."users" set "email" = $1, "bio" = null where ("users"."id" = $2) returning "users"."id" as "id", "users"."email" as "email", "users"."bio" as "bio"'
    )
    expect(Postgres.Renderer.make().render(updatePlan).params).toEqual([
      "updated@example.com",
      userId
    ])

    expect(Postgres.Renderer.make().render(deletePlan).sql).toBe(
      'delete from "public"."users" where ("users"."id" = $1) returning "users"."id" as "id"'
    )
    expect(Postgres.Renderer.make().render(deletePlan).params).toEqual([userId])
  })

  test("renders postgres update from joined sources", () => {
    const { users, posts } = makePostgresSocialGraph()

    const plan = Postgres.Query.returning({
      id: users.id,
      email: users.email
    })(Postgres.Query.where(Postgres.Query.eq(posts.title, "hello"))(
      Postgres.Query.innerJoin(posts, Postgres.Query.eq(posts.userId, users.id))(
        Postgres.Query.update(users, {
          email: "author@example.com"
        })
      )
    ))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'update "public"."users" set "email" = $1 from "public"."posts" where ("posts"."userId" = "users"."id") and ("posts"."title" = $2) returning "users"."id" as "id", "users"."email" as "email"'
    )
    expect(rendered.params).toEqual([
      "author@example.com",
      "hello"
    ])
  })

  test("renders postgres delete using joined sources", () => {
    const { users, posts } = makePostgresSocialGraph()

    const plan = Postgres.Query.returning({
      id: users.id
    })(Postgres.Query.where(Postgres.Query.eq(posts.title, "hello"))(
      Postgres.Query.innerJoin(posts, Postgres.Query.eq(posts.userId, users.id))(
        Postgres.Query.delete(users)
      )
    ))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'delete from "public"."users" using "public"."posts" where ("posts"."userId" = "users"."id") and ("posts"."title" = $1) returning "users"."id" as "id"'
    )
    expect(rendered.params).toEqual(["hello"])
  })

  test("renders postgres multi-row and source-backed inserts", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })
    const archivedUsers = Postgres.Table.make("archived_users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })

    const valuesSource = Postgres.Query.as(Postgres.Query.values([
      { id: Postgres.Query.literal(userId), email: "alice@example.com", bio: null },
      { id: Postgres.Query.literal(secondUserId), email: "bob@example.com", bio: "writer" }
    ] as const), "seed")

    const multiRowPlan = Postgres.Query.insert(users).pipe(
      Postgres.Query.from(valuesSource)
    )

    const insertSelectPlan = Postgres.Query.insert(archivedUsers).pipe(
      Postgres.Query.from(Postgres.Query.select({
      id: users.id,
      email: users.email,
      bio: users.bio
    }).pipe(
      Postgres.Query.from(users)
    )))

    const insertUnnestPlan = Postgres.Query.insert(users).pipe(
      Postgres.Query.from(Postgres.Query.unnest({
      id: [userId, secondUserId],
      email: ["alice@example.com", "bob@example.com"],
      bio: [null, "writer"]
      }, "seed"))
    )

    expect(Postgres.Renderer.make().render(multiRowPlan).sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") values ($1, $2, null), ($3, $4, $5)'
    )
    expect(Postgres.Renderer.make().render(multiRowPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])

    expect(Postgres.Renderer.make().render(insertSelectPlan).sql).toBe(
      'insert into "public"."archived_users" ("id", "email", "bio") select "users"."id" as "id", "users"."email" as "email", "users"."bio" as "bio" from "public"."users"'
    )
    expect(Postgres.Renderer.make().render(insertSelectPlan).params).toEqual([])

    expect(Postgres.Renderer.make().render(insertUnnestPlan).sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") select * from unnest(cast($1 as uuid[]), cast($2 as text[]), cast($3 as text[]))'
    )
    expect(Postgres.Renderer.make().render(insertUnnestPlan).params).toEqual([
      [userId, secondUserId],
      ["alice@example.com", "bob@example.com"],
      [null, "writer"]
    ])
  })

  test("renders postgres default-values and rich conflict clauses", () => {
    const auditLogs = Postgres.Table.make("audit_logs", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey, Postgres.Column.default),
      note: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })

    const defaultInsertPlan = Postgres.Query.insert(auditLogs)
    const partialIndexConflictPlan = Postgres.Query.onConflict({
      columns: ["email"] as const,
      where: Postgres.Query.isNotNull(users.bio)
    }, {
      update: {
        bio: Postgres.Query.excluded(users.bio)
      },
      where: Postgres.Query.isNotNull(Postgres.Query.excluded(users.bio))
    })(Postgres.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: "writer"
    }))
    const namedConstraintPlan = Postgres.Query.onConflict({
      constraint: "users_email_key"
    }, {
      update: {
        email: Postgres.Query.excluded(users.email)
      }
    })(Postgres.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }))

    expect(Postgres.Renderer.make().render(defaultInsertPlan).sql).toBe(
      'insert into "public"."audit_logs" default values'
    )

    expect(Postgres.Renderer.make().render(partialIndexConflictPlan).sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") values ($1, $2, $3) on conflict ("email") where ("users"."bio" is not null) do update set "bio" = excluded."bio" where (excluded."bio" is not null)'
    )
    expect(Postgres.Renderer.make().render(partialIndexConflictPlan).params).toEqual([
      userId,
      "alice@example.com",
      "writer"
    ])

    expect(Postgres.Renderer.make().render(namedConstraintPlan).sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") values ($1, $2, null) on conflict on constraint "users_email_key" do update set "email" = excluded."email"'
    )
    expect(Postgres.Renderer.make().render(namedConstraintPlan).params).toEqual([
      userId,
      "alice@example.com"
    ])
  })

  test("renders postgres ddl statements from schema tables", () => {
    const orgs = Postgres.Table.make("orgs", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      slug: Postgres.Column.text().pipe(Postgres.Column.unique)
    })
    const memberships = Postgres.Table.make("memberships", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      orgId: Postgres.Column.uuid(),
      role: Postgres.Column.text(),
      note: Postgres.Column.text().pipe(Postgres.Column.nullable)
    }).pipe(
      Postgres.Table.foreignKey("orgId", () => orgs, "id"),
      Postgres.Table.unique(["orgId", "role"] as const),
      Postgres.Table.index(["role", "orgId"] as const)
    )

    expect(Postgres.Renderer.make().render(Postgres.Query.createTable(memberships, {
      ifNotExists: true
    })).sql).toBe(
      'create table if not exists "public"."memberships" ("id" uuid not null, "orgId" uuid not null, "role" text not null, "note" text, primary key ("id"), foreign key ("orgId") references "public"."orgs" ("id"), unique ("orgId", "role"))'
    )
    expect(Postgres.Renderer.make().render(Postgres.Query.createIndex(memberships, ["role", "orgId"] as const, {
      ifNotExists: true
    })).sql).toBe(
      'create index if not exists "memberships_role_orgId_idx" on "public"."memberships" ("role", "orgId")'
    )
    expect(Postgres.Renderer.make().render(Postgres.Query.dropIndex(memberships, ["role", "orgId"] as const, {
      ifExists: true
    })).sql).toBe(
      'drop index if exists "memberships_role_orgId_idx"'
    )
    expect(Postgres.Renderer.make().render(Postgres.Query.dropTable(memberships, {
      ifExists: true
    })).sql).toBe(
      'drop table if exists "public"."memberships"'
    )
  })

  test("renders schema-qualified postgres tables in queries and ddl", () => {
    const analytics = Postgres.Table.schema("analytics")
    const users = analytics.table("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey)
    })
    const events = analytics.table("events", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      userId: Postgres.Column.uuid().pipe(Postgres.Column.references(() => users.id))
    })

    const plan = Postgres.Query.select({
      eventId: events.id
    }).pipe(
      Postgres.Query.from(events)
    )

    expect(Postgres.Renderer.make().render(plan).sql).toBe(
      'select "events"."id" as "eventId" from "analytics"."events"'
    )
    expect(Postgres.Renderer.make().render(Postgres.Query.createTable(events, {
      ifNotExists: true
    })).sql).toBe(
      'create table if not exists "analytics"."events" ("id" uuid not null, "userId" uuid not null, primary key ("id"), foreign key ("userId") references "analytics"."users" ("id"))'
    )
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

    const rows = Effect.runSync(Postgres.Executor.make({
      driver: Postgres.Executor.driver(() => Effect.succeed([{
        profile__id: userId,
        profile__email: "alice@example.com",
        post__id: null,
        post__title: null,
        hasPost: false
      }]))
    }).execute(plan))

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
        kind: "unsupported"
      }
    } as unknown as Postgres.Expression.Any

    expect(() => renderExpression(unsupportedExpression, { params: [] }, postgresDialect)).toThrow(
      "Unsupported expression for SQL rendering"
    )
  })
})
