import { describe, expect, test } from "bun:test"
import * as SqlClient from "@effect/sql/SqlClient"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import * as Mysql from "../src/mysql.ts"
import * as Postgres from "../src/postgres.ts"
import { renderMysqlPlan } from "../src/internal/mysql-renderer.ts"
import { Column as C, Executor, Expression, Plan, Query as Q, Renderer, Table } from "../src/index.ts"

const userId = "11111111-1111-1111-1111-111111111111"

describe("table definitions", () => {
  test("factory tables expose direct columns and schemas", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey, C.generated),
      email: C.text().pipe(C.unique),
      bio: C.text().pipe(C.nullable),
      createdAt: C.timestamp().pipe(C.hasDefault)
    }).pipe(Table.index("email"))

    expect(users.columns.id).toBe(users.id)
    expect(users.columns.email).toBe(users.email)
    expect(users.id[Expression.TypeId].dbType.kind).toBe("uuid")
    expect(users.id[Expression.TypeId].dialect).toBe("postgres")
    expect(users.id[Expression.TypeId].nullability).toBe("never")
    expect(users[Plan.TypeId].selection.id).toBe(users.id)
    expect(users[Plan.TypeId].available.users.name).toBe("users")
    expect(users[Plan.TypeId].available.users.mode).toBe("required")
    expect(Schema.isSchema(users.schemas.select)).toBe(true)
    expect(Schema.isSchema(users.schemas.insert)).toBe(true)
    expect(Schema.isSchema(users.schemas.update)).toBe(true)

    const insert = Schema.decodeUnknownSync(users.schemas.insert)({
      email: "alice@example.com",
      bio: null
    })
    const update = Schema.decodeUnknownSync(users.schemas.update)({
      email: "next@example.com"
    })

    expect(insert.email).toBe("alice@example.com")
    expect(insert.bio).toBeNull()
    expect(update.email).toBe("next@example.com")

    const options = users[Table.OptionsSymbol]
    expect(options.map((option) => option.kind)).toEqual(["primaryKey", "unique", "index"])
  })

  test("class tables expose inherited static columns and schemas", () => {
    class Users extends Table.Class<Users>("users")({
      id: C.uuid().pipe(C.primaryKey, C.generated),
      email: C.text().pipe(C.unique),
      bio: C.text().pipe(C.nullable)
    }) {
      static override readonly [Table.options] = [Table.index("email")]
    }

    expect(Users.email).toBe(Users.columns.email)
    expect(Schema.isSchema(Users.schemas.insert)).toBe(true)
    expect(Users[Table.OptionsSymbol].map((option) => option.kind)).toEqual(["primaryKey", "unique", "index"])
  })

  test("inline references are stored lazily", () => {
    const orgs = Table.make("orgs", {
      id: C.uuid().pipe(C.primaryKey),
      name: C.text()
    })

    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      orgId: C.uuid().pipe(C.references(() => orgs.id))
    })

    const foreignKey = users[Table.OptionsSymbol].find((option) => option.kind === "foreignKey")
    expect(foreignKey?.kind).toBe("foreignKey")
    if (foreignKey?.kind !== "foreignKey") {
      throw new Error("expected a foreign key option")
    }
    expect(foreignKey.references()).toEqual({
      tableName: "orgs",
      columns: ["id"]
    })
  })

  test("mixed-dialect table fields are rejected", () => {
    expect(() => Table.make("mixed_users", {
      id: Postgres.Column.uuid(),
      email: Mysql.Column.text()
    })).toThrow("Invalid dialects for table 'mixed_users': Mixed table dialects are not supported: postgres, mysql")
  })

  test("table-level foreign keys validate referenced columns and use physical table names", () => {
    const orgs = Table.make("orgs", {
      id: C.uuid().pipe(C.primaryKey),
      slug: C.text().pipe(C.unique)
    })
    const orgAlias = Table.alias(orgs, "org_alias")

    const memberships = Table.make("memberships", {
      orgId: C.uuid()
    }).pipe(
      Table.foreignKey("orgId", () => orgAlias, "id")
    )

    const foreignKey = memberships[Table.OptionsSymbol].find((option: { kind: string }) => option.kind === "foreignKey")
    if (!foreignKey || foreignKey.kind !== "foreignKey") {
      throw new Error("expected a foreign key option")
    }

    expect(foreignKey.references()).toEqual({
      tableName: "orgs",
      columns: ["id"],
      knownColumns: ["id", "slug"]
    })

    expect(() => Table.make("broken_memberships", {
      orgId: C.uuid()
    }).pipe(
      Table.foreignKey("orgId", () => orgs, "missing")
    )).toThrow("Unknown referenced column 'missing' on table 'orgs'")

    expect(() => Table.make("broken_memberships_arity", {
      orgId: C.uuid(),
      slug: C.text()
    }).pipe(
      Table.foreignKey(["orgId", "slug"], () => orgs, "id") as never
    )).toThrow("Foreign key on table 'broken_memberships_arity' must reference the same number of columns")
  })

  test("table options reject empty column lists", () => {
    expect(() => Table.index([] as unknown as string[])).toThrow("Table options require at least one column")
  })

  test("class tables reject table-level primary keys", () => {
    class BadClassTable extends Table.Class<BadClassTable>("bad_class_table")({
      id: C.uuid(),
      slug: C.text()
    }) {
      static override readonly [Table.options] = [Table.primaryKey(["id", "slug"] as const) as never]
    }

    expect(() => BadClassTable.schemas).toThrow("Table.Class does not support table-level primary keys; declare primary keys inline on columns")
  })

  test("aliased tables reject schema-level options", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    expect(() => Table.index("email")(Table.alias(users, "users_alias") as never)).toThrow(
      "Table options can only be applied to schema tables, not aliased query sources"
    )
  })

  test("operator expressions feed query selection and source tracking", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text(),
      bio: C.text().pipe(C.nullable)
    })

    const selection = Q.select({
      id: users.id,
      emailMatches: Q.eq(users.email, Q.literal("alice@example.com")),
      bioMissing: Q.isNull(users.bio),
      kind: Q.literal("user")
    })

    expect(selection[Plan.TypeId].required as unknown as readonly string[]).toEqual(["users"])
    expect(selection[Plan.TypeId].available).toEqual({})
    expect(selection[Plan.TypeId].selection.kind[Expression.TypeId].source).toBeUndefined()
    expect(selection[Plan.TypeId].selection.emailMatches[Expression.TypeId].source).toEqual({
      tableName: "users",
      columnName: "email",
      baseTableName: "users"
    })

    const sourced = selection.pipe(Q.from(users))
    expect(sourced[Plan.TypeId].required as unknown as readonly string[]).toEqual([])
    expect(sourced[Plan.TypeId].available.users.name).toBe("users")
    expect(sourced[Plan.TypeId].available.users.mode).toBe("required")
  })

  test("where and joins reconcile required and available sources", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid(),
      title: C.text()
    })

    const query = Q.select({
      userId: users.id,
      postId: posts.id,
      postTitleUpper: Q.upper(posts.title)
    }).pipe(
      Q.where(Q.eq(users.email, "alice@example.com")),
      Q.from(users),
      Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
      Q.where(true)
    )

    expect(query[Plan.TypeId].required as unknown as readonly string[]).toEqual([])
    expect(query[Plan.TypeId].available.users.name).toBe("users")
    expect(query[Plan.TypeId].available.posts.name).toBe("posts")
    expect(query[Plan.TypeId].available.users.mode).toBe("required")
    expect(query[Plan.TypeId].available.posts.mode).toBe("required")

    const leftJoined = Q.select({
      userId: users.id,
      postId: posts.id,
      postTitleUpper: Q.upper(posts.title)
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, true)
    )

    expect(leftJoined[Plan.TypeId].required as unknown as readonly string[]).toEqual([])
    expect(leftJoined[Plan.TypeId].available.posts.name).toBe("posts")
    expect(leftJoined[Plan.TypeId].available.posts.mode).toBe("optional")
  })

  test("renderer and executor use Query.ResultRow as the canonical output contract", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid(),
      title: C.text()
    })

    const plan = Q.select({
      userId: users.id,
      postId: posts.id,
      postTitleUpper: Q.upper(posts.title)
    }).pipe(
      Q.where(Q.eq(users.email, "alice@example.com")),
      Q.from(users),
      Q.leftJoin(posts, true)
    )

    const renderer = Renderer.make("postgres")

    const rendered = renderer.render(plan)
    expect(rendered.sql).toBe('select "users"."id" as "userId", "posts"."id" as "postId", upper("posts"."title") as "postTitleUpper" from "users" left join "posts" on true where ("users"."email" = $1)')
    expect(rendered.dialect).toBe("postgres")
    expect(rendered.params).toEqual(["alice@example.com"])
    expect(rendered.projections).toEqual([
      { path: ["userId"], alias: "userId" },
      { path: ["postId"], alias: "postId" },
      { path: ["postTitleUpper"], alias: "postTitleUpper" }
    ])

    const executor = Executor.make("postgres", <PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any>>(
      current: Q.DialectCompatiblePlan<PlanValue, "postgres">
    ) =>
      Effect.succeed([
        {
          userId: "user-1",
          postId: null,
          postTitleUpper: null
        }
      ] as unknown as Q.ResultRows<PlanValue>))

    const rows = Effect.runSync(executor.execute(plan))
    expect(rows).toEqual([
      {
        userId: "user-1",
        postId: null,
        postTitleUpper: null
      }
    ])
  })

  test("groupBy and orderBy render aggregate queries through the expression AST", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid(),
      title: C.text().pipe(C.nullable)
    })

    const plan = Q.select({
      emailUpper: Q.upper(users.email),
      postCount: Q.count(posts.id),
      maxPostTitle: Q.max(posts.title),
      minPostTitle: Q.min(posts.title),
      fallbackTitle: Q.coalesce(Q.max(posts.title), Q.literal("NONE"))
    }).pipe(
      Q.from(users),
      Q.innerJoin(posts, Q.and(Q.eq(users.id, posts.userId), Q.not(false))),
      Q.groupBy(Q.upper(users.email)),
      Q.orderBy(Q.count(posts.id), "desc"),
      Q.orderBy(Q.upper(users.email))
    )

    const renderer = Renderer.make("postgres")
    const rendered = renderer.render(plan)

    expect(rendered.sql).toBe('select upper("users"."email") as "emailUpper", count("posts"."id") as "postCount", max("posts"."title") as "maxPostTitle", min("posts"."title") as "minPostTitle", coalesce(max("posts"."title"), $1) as "fallbackTitle" from "users" inner join "posts" on (("users"."id" = "posts"."userId") and (not false)) group by upper("users"."email") order by count("posts"."id") desc, upper("users"."email") asc')
    expect(rendered.params).toEqual(["NONE"])
  })

  test("runtime validation rejects invalid aggregate and scalar mixing without groupBy", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid()
    })

    const invalid = Q.select({
      email: users.email,
      postCount: Q.count(posts.id)
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, true)
    )

    expect(() => Renderer.make("postgres").render(invalid as never)).toThrow(
      "Invalid grouped selection: scalar expressions must be covered by groupBy(...) when aggregates are present"
    )
  })

  test("runtime validation requires exact grouped-expression matches", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const posts = Table.make("posts", {
      id: C.uuid().pipe(C.primaryKey),
      userId: C.uuid()
    })

    const groupedByDerived = Q.select({
      email: users.email,
      postCount: Q.count(posts.id)
    }).pipe(
      Q.from(users),
      Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
      Q.groupBy(Q.lower(users.email))
    )

    const groupedByBase = Q.select({
      loweredEmail: Q.lower(users.email),
      postCount: Q.count(posts.id)
    }).pipe(
      Q.from(users),
      Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
      Q.groupBy(users.email)
    )

    expect(() => Renderer.make("postgres").render(groupedByDerived as never)).toThrow(
      "Invalid grouped selection: scalar expressions must be covered by groupBy(...) when aggregates are present"
    )
    expect(() => Renderer.make("postgres").render(groupedByBase as never)).toThrow(
      "Invalid grouped selection: scalar expressions must be covered by groupBy(...) when aggregates are present"
    )
  })

  test("Executor.fromDriver renders, runs, and decodes nested rows", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const plan = Q.select({
      user: {
        id: users.id,
        email: users.email
      },
      kind: Q.literal("user")
    }).pipe(
      Q.from(users)
    )

    const renderer = Renderer.make("postgres")
    const driver = Executor.driver("postgres", (query) => {
      expect(query.sql).toBe('select "users"."id" as "user__id", "users"."email" as "user__email", $1 as "kind" from "users"')
      expect(query.params).toEqual(["user"])
      return Effect.succeed([
        {
          user__id: userId,
          user__email: "alice@example.com",
          kind: "user"
        }
      ])
    })

    const executor = Executor.fromDriver(renderer, driver)
    const rows = Effect.runSync(executor.execute(plan))

    expect(rows).toEqual([
      {
        user: {
          id: userId,
          email: "alice@example.com"
        },
        kind: "user"
      }
    ])
  })

  test("explicit projection aliases control SQL aliases without changing decoded result paths", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const plan = Q.select({
      profile: {
        id: Q.as(users.id, "user_identifier"),
        email: Q.as(Q.lower(users.email), "email_lower")
      },
      kind: Q.as("user", "kind_label")
    }).pipe(
      Q.from(users)
    )

    const renderer = Renderer.make("postgres")
    const rendered = renderer.render(plan)

    expect(rendered.sql).toBe('select "users"."id" as "user_identifier", lower("users"."email") as "email_lower", $1 as "kind_label" from "users"')
    expect(rendered.projections).toEqual([
      { path: ["profile", "id"], alias: "user_identifier" },
      { path: ["profile", "email"], alias: "email_lower" },
      { path: ["kind"], alias: "kind_label" }
    ])

    const driver = Executor.driver("postgres", (query) => {
      expect(query.projections).toEqual(rendered.projections)
      return Effect.succeed([
        {
          user_identifier: userId,
          email_lower: "alice@example.com",
          kind_label: "user"
        }
      ])
    })

    const rows = Effect.runSync(Executor.fromDriver(renderer, driver).execute(plan))
    expect(rows).toEqual([
      {
        profile: {
          id: userId,
          email: "alice@example.com"
        },
        kind: "user"
      }
    ])
  })

  test("renderer rejects duplicate explicit projection aliases", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const invalid = Q.select({
      id: Q.as(users.id, "duplicate_alias"),
      email: Q.as(users.email, "duplicate_alias")
    }).pipe(
      Q.from(users)
    )

    expect(() => Renderer.make("postgres").render(invalid)).toThrow("Duplicate projection alias: duplicate_alias")
  })

  test("custom renderers are still validated for duplicate projection aliases", () => {
    const plan = Q.select({
      id: Q.literal("user-1")
    })

    const renderer = Renderer.make("postgres", () => ({
      sql: "select $1 as duplicate_alias, $2 as duplicate_alias",
      params: ["user-1", "user-2"],
      projections: [
        { path: ["firstId"], alias: "duplicate_alias" },
        { path: ["secondId"], alias: "duplicate_alias" }
      ]
    }))

    expect(() => renderer.render(plan)).toThrow("Duplicate projection alias: duplicate_alias")
  })

  test("custom renderers are still validated for conflicting projection paths", () => {
    const plan = Q.select({
      id: Q.literal("user-1")
    })

    const renderer = Renderer.make("postgres", () => ({
      sql: "select $1 as profile, $2 as profile_id",
      params: ["user", "user-1"],
      projections: [
        { path: ["profile"], alias: "profile" },
        { path: ["profile", "id"], alias: "profile_id" }
      ]
    }))

    expect(() => renderer.render(plan)).toThrow("Conflicting projection paths: profile conflicts with profile.id")
  })

  test("Executor.fromSqlClient uses SqlClient and decodes rendered rows", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const plan = Q.select({
      profile: {
        id: users.id,
        email: users.email
      }
    }).pipe(
      Q.from(users)
    )

    const renderer = Renderer.make("postgres")
    const executor = Executor.fromSqlClient(renderer)
    const sql = {
      unsafe<A extends object>(statement: string, params?: ReadonlyArray<any>) {
        expect(statement).toBe('select "users"."id" as "profile__id", "users"."email" as "profile__email" from "users"')
        expect(params).toEqual([])
        return Effect.succeed([
          {
            profile__id: userId,
            profile__email: "alice@example.com"
          }
        ] as unknown as ReadonlyArray<A>)
      }
    } as unknown as SqlClient.SqlClient

    const rows = Effect.runSync(
      Effect.provideService(executor.execute(plan), SqlClient.SqlClient, sql)
    )

    expect(rows).toEqual([
      {
        profile: {
          id: userId,
          email: "alice@example.com"
        }
      }
    ])
  })

  test("aliased tables keep self-join source identity distinct at the plan layer", () => {
    const employees = Table.make("employees", {
      id: C.uuid().pipe(C.primaryKey),
      managerId: C.uuid().pipe(C.nullable),
      name: C.text()
    })

    const manager = Table.alias(employees, "manager")
    const report = Table.alias(employees, "report")

    const plan = Q.select({
      managerId: manager.id,
      reportId: report.id
    }).pipe(
      Q.from(manager),
      Q.leftJoin(report, Q.eq(report.managerId, manager.id))
    )

    expect(manager.id[Expression.TypeId].source as any).toEqual({
      tableName: "manager",
      columnName: "id",
      baseTableName: "employees"
    })
    expect(report.id[Expression.TypeId].source as any).toEqual({
      tableName: "report",
      columnName: "id",
      baseTableName: "employees"
    })
    expect(plan[Plan.TypeId].available.manager).toEqual({
      name: "manager",
      mode: "required",
      baseName: "employees"
    })
    expect(plan[Plan.TypeId].available.report).toEqual({
      name: "report",
      mode: "optional",
      baseName: "employees"
    })
    expect(plan[Plan.TypeId].required as unknown as readonly string[]).toEqual([])
  })

  test("renderer emits aliased self-joins with base tables and logical source names", () => {
    const employees = Table.make("employees", {
      id: C.uuid().pipe(C.primaryKey),
      managerId: C.uuid().pipe(C.nullable),
      name: C.text()
    })

    const manager = Table.alias(employees, "manager")
    const report = Table.alias(employees, "report")

    const plan = Q.select({
      managerId: manager.id,
      reportName: report.name
    }).pipe(
      Q.from(manager),
      Q.leftJoin(report, Q.eq(report.managerId, manager.id))
    )

    const rendered = Renderer.make("postgres").render(plan)

    expect(rendered.sql).toBe('select "manager"."id" as "managerId", "report"."name" as "reportName" from "employees" as "manager" left join "employees" as "report" on ("report"."managerId" = "manager"."id")')
    expect(rendered.params).toEqual([])
  })

  test("internal mysql renderer sketch uses mysql quoting, placeholders, and concat semantics", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    const plan = Mysql.Query.select({
      id: users.id,
      decoratedEmail: Mysql.Query.concat(Mysql.Query.lower(users.email), "-user"),
      kind: Mysql.Query.literal("user")
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.where(Mysql.Query.eq(users.email, "alice@example.com"))
    )

    const rendered = renderMysqlPlan(plan)

    expect(rendered.sql).toBe("select `users`.`id` as `id`, concat(lower(`users`.`email`), ?) as `decoratedEmail`, ? as `kind` from `users` where (`users`.`email` = ?)")
    expect(rendered.params).toEqual(["-user", "user", "alice@example.com"])
    expect(rendered.projections).toEqual([
      { path: ["id"], alias: "id" },
      { path: ["decoratedEmail"], alias: "decoratedEmail" },
      { path: ["kind"], alias: "kind" }
    ])
  })

  test("dialect entrypoints expose specialized columns and built-in renderers", () => {
    const mysqlUsers = Mysql.Table.make("users", {
      id: Mysql.Column.uuid(),
      email: Mysql.Column.text()
    })
    const postgresUsers = Postgres.Table.make("users", {
      id: Postgres.Column.uuid(),
      email: Postgres.Column.text()
    })

    expect(mysqlUsers.id[Expression.TypeId].dbType.dialect).toBe("mysql")
    expect(postgresUsers.id[Expression.TypeId].dbType.dialect).toBe("postgres")

    const mysqlPlan = Mysql.Query.select({
      id: mysqlUsers.id
    }).pipe(
      Mysql.Query.from(mysqlUsers)
    )
    const postgresPlan = Postgres.Query.select({
      id: postgresUsers.id
    }).pipe(
      Postgres.Query.from(postgresUsers)
    )

    expect(Mysql.Renderer.make().render(mysqlPlan).sql).toBe("select `users`.`id` as `id` from `users`")
    expect(Postgres.Renderer.make().render(postgresPlan).sql).toBe('select "users"."id" as "id" from "users"')
  })

  test("mysql query entrypoint specializes literal and operator rendering", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid(),
      email: Mysql.Column.text()
    })

    const plan = Mysql.Query.select({
      matches: Mysql.Query.eq(users.email, "alice@example.com"),
      decorated: Mysql.Query.concat(Mysql.Query.lower(users.email), "-user"),
      kind: Mysql.Query.literal("user")
    }).pipe(
      Mysql.Query.from(users)
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe("select (`users`.`email` = ?) as `matches`, concat(lower(`users`.`email`), ?) as `decorated`, ? as `kind` from `users`")
    expect(rendered.params).toEqual(["alice@example.com", "-user", "user"])
  })
})
