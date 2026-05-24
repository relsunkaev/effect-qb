// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as SqlClient from "@effect/sql/SqlClient"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import * as CoreRenderer from "#internal/renderer.ts"
import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import { renderMysqlPlan } from "../../../packages/querybuilder/src/mysql/internal/renderer.ts"
import { Column as C, Executor, Scalar, RowSet, Query as Q, Function as F, Renderer, Table } from "#postgres"
import { unsafeAny, unsafeNever } from "../../helpers/unsafe.ts"
import * as StdRoot from "#standard"

const userId = "11111111-1111-1111-1111-111111111111"

describe("table definitions", () => {
  test("factory tables expose direct columns and schemas", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey, StdRoot.Column.generated(Q.literal("generated-user-id"))),
      email: StdRoot.Column.text().pipe(C.unique),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable),
      createdAt: StdRoot.Column.timestamp().pipe(StdRoot.Column.default(F.localTimestamp()))
    }).pipe(Table.index("email"))

    expect(users.columns.id).toBe(users.id)
    expect(users.columns.email).toBe(users.email)
    expect(users.id[Scalar.TypeId].dbType.kind).toBe("uuid")
    expect(users.id[Scalar.TypeId].dialect).toBe("standard")
    expect(users.id[Scalar.TypeId].nullability).toBe("never")
    expect(users[RowSet.TypeId].selection.id).toBe(users.id)
    expect(users[RowSet.TypeId].available.users.name).toBe("users")
    expect(users[RowSet.TypeId].available.users.mode).toBe("required")
    expect(Schema.isSchema(StdRoot.Table.selectSchema(users))).toBe(true)
    expect(Schema.isSchema(StdRoot.Table.insertSchema(users))).toBe(true)
    expect(Schema.isSchema(StdRoot.Table.updateSchema(users))).toBe(true)

    const insert = Schema.decodeUnknownSync(StdRoot.Table.insertSchema(users))({
      email: "alice@example.com",
      bio: null
    })
    const update = Schema.decodeUnknownSync(StdRoot.Table.updateSchema(users))({
      email: "next@example.com"
    })

    expect(insert.email).toBe("alice@example.com")
    expect(insert.bio).toBeNull()
    expect(update.email).toBe("next@example.com")

    const options = users[StdRoot.Table.OptionsSymbol]
    expect(options.map((option) => option.kind)).toEqual(["primaryKey", "unique", "index"])
  })

  test("table schema helpers derive and cache individual variants lazily", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })
    const schemaCacheSymbol = Symbol.for("effect-qb/Table/schemaCache")

    expect(unsafeAny(users)[schemaCacheSymbol]).toBeUndefined()

    const insert = StdRoot.Table.insertSchema(users)
    expect(StdRoot.Table.insertSchema(users)).toBe(insert)
    expect(unsafeAny(users)[schemaCacheSymbol].insert).toBe(insert)
    expect("select" in unsafeAny(users)[schemaCacheSymbol]).toBe(false)
    expect("update" in unsafeAny(users)[schemaCacheSymbol]).toBe(false)

    const schemas = users.schemas
    expect(users.schemas).toBe(schemas)
    expect("select" in unsafeAny(users)[schemaCacheSymbol]).toBe(false)
    expect(schemas.insert).toBe(insert)
    expect(schemas.select).toBe(StdRoot.Table.selectSchema(users))
  })

  test("table schema namespaces preserve physical schema metadata", () => {
    const analytics = Postgres.Schema.make("analytics")
    const events = analytics.table("events", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid()
    })
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })

    expect(analytics.schemaName).toBe("analytics")
    expect(events[StdRoot.Table.TypeId].schemaName).toBe("analytics")
    expect(events[StdRoot.Table.TypeId].baseName).toBe("events")
    expect(users[StdRoot.Table.TypeId].schemaName).toBeUndefined()
  })

  test("class tables expose inherited static columns and schemas", () => {
    class Users extends StdRoot.Table.Class<Users>("users")({
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey, StdRoot.Column.generated(Q.literal("generated-user-id"))),
      email: StdRoot.Column.text().pipe(C.unique),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    }) {
      static override readonly [StdRoot.Table.options] = [Table.index("email")]
    }

    expect(Users.email).toBe(Users.columns.email)
    expect(Schema.isSchema(StdRoot.Table.insertSchema(Users))).toBe(true)
    expect(Users[StdRoot.Table.OptionsSymbol].map((option) => option.kind)).toEqual(["primaryKey", "unique", "index"])
  })

  test("inline references are stored lazily", () => {
    const orgs = StdRoot.Table.make("orgs", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      name: StdRoot.Column.text()
    })

    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      orgId: StdRoot.Column.uuid().pipe(StdRoot.Column.references(() => orgs.id))
    })

    const foreignKey = users[StdRoot.Table.OptionsSymbol].find((option) => option.kind === "foreignKey")
    expect(foreignKey?.kind).toBe("foreignKey")
    if (foreignKey?.kind !== "foreignKey") {
      throw new Error("expected a foreign key option")
    }
    expect(foreignKey.references()).toEqual({
      tableName: "orgs",
      schemaName: undefined,
      columns: ["id"]
    })
  })

  test("mixed-dialect table fields are rejected", () => {
    expect(() => StdRoot.Table.make("mixed_users", {
      id: Postgres.Column.custom(Schema.UUID, Postgres.Type.uuid()),
      email: Mysql.Column.custom(Schema.String, Mysql.Datatypes.mysqlDatatypes.text())
    })).toThrow("Invalid dialects for table 'mixed_users': Mixed table dialects are not supported: postgres, mysql")
  })

  test("table-level foreign keys validate referenced columns and use physical table names", () => {
    const orgs = StdRoot.Table.make("orgs", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      slug: StdRoot.Column.text().pipe(C.unique)
    })
    const orgAlias = StdRoot.Table.alias(orgs, "org_alias")

    const memberships = StdRoot.Table.make("memberships", {
      orgId: StdRoot.Column.uuid()
    }).pipe(
      Table.foreignKey("orgId", () => orgAlias, "id")
    )

    const foreignKey = memberships[StdRoot.Table.OptionsSymbol].find((option: { kind: string }) => option.kind === "foreignKey")
    if (!foreignKey || foreignKey.kind !== "foreignKey") {
      throw new Error("expected a foreign key option")
    }

    expect(foreignKey.references()).toEqual({
      tableName: "orgs",
      schemaName: undefined,
      columns: ["id"],
      knownColumns: ["id", "slug"]
    })

    expect(() => StdRoot.Table.make("broken_memberships", {
      orgId: StdRoot.Column.uuid()
    }).pipe(
      Table.foreignKey("orgId", () => orgs, "missing")
    )).toThrow("Unknown referenced column 'missing' on table 'orgs'")

    expect(() => StdRoot.Table.make("broken_memberships_arity", {
      orgId: StdRoot.Column.uuid(),
      slug: StdRoot.Column.text()
    }).pipe(
      unsafeAny(Table.foreignKey(["orgId", "slug"], () => orgs, "id"))
    )).toThrow("Foreign key on table 'broken_memberships_arity' must reference the same number of columns")
  })

  test("postgres rich index specs normalize columns-only input", () => {
    const users = StdRoot.Table.make("rich_index_users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    }).pipe(
      Table.index({ columns: ["email"] as const })
    )

    expect(users[StdRoot.Table.OptionsSymbol].find((option) => option.kind === "index")).toMatchObject({
      kind: "index",
      columns: ["email"]
    })

    expect(() => StdRoot.Table.make("empty_manual_index_users", {
      id: StdRoot.Column.uuid()
    }).pipe(
      StdRoot.Table.option(unsafeAny({ kind: "index", columns: [] }))
    )).toThrow("Index on table 'empty_manual_index_users' requires at least one column or key")
  })

  test("class tables reject table-level primary keys", () => {
    class BadClassTable extends StdRoot.Table.Class<BadClassTable>("bad_class_table")({
      id: StdRoot.Column.uuid(),
      slug: StdRoot.Column.text()
    }) {
      static override readonly [StdRoot.Table.options] = [unsafeAny(Table.primaryKey(["id", "slug"] as const))]
    }

    expect(() => BadClassTable.schemas).toThrow("Table.Class does not support table-level primary keys; declare primary keys inline on columns")
  })

  test("aliased tables reject schema-level options", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    expect(() => Table.index("email")(unsafeAny(StdRoot.Table.alias(users, "users_alias")))).toThrow(
      "Table options can only be applied to schema tables, not aliased query sources"
    )
  })

  test("operator expressions feed query selection and source tracking", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })

    const selection = Q.select({
      id: users.id,
      emailMatches: Q.eq(users.email, Q.literal("alice@example.com")),
      bioMissing: Q.isNull(users.bio),
      kind: Q.literal("user")
    })

    expect(selection[RowSet.TypeId].required).toEqual(["users"])
    expect(selection[RowSet.TypeId].available).toEqual({})

    const sourced = selection.pipe(Q.from(users))
    expect(sourced[RowSet.TypeId].required).toEqual([])
    expect(sourced[RowSet.TypeId].available.users.name).toBe("users")
    expect(sourced[RowSet.TypeId].available.users.mode).toBe("required")
  })

  test("where and joins reconcile required and available sources", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid(),
      title: StdRoot.Column.text()
    })

    const query = Q.select({
      userId: users.id,
      postId: posts.id,
      postTitleUpper: F.upper(posts.title)
    }).pipe(
      Q.where(Q.eq(users.email, "alice@example.com")),
      Q.from(users),
      Q.innerJoin(posts, Q.eq(users.id, posts.userId)),
      Q.where(true)
    )

    expect(query[RowSet.TypeId].required).toEqual([])
    expect(query[RowSet.TypeId].available.users.name).toBe("users")
    expect(query[RowSet.TypeId].available.posts.name).toBe("posts")
    expect(query[RowSet.TypeId].available.users.mode).toBe("required")
    expect(query[RowSet.TypeId].available.posts.mode).toBe("required")

    const leftJoined = Q.select({
      userId: users.id,
      postId: posts.id,
      postTitleUpper: F.upper(posts.title)
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, true)
    )

    expect(leftJoined[RowSet.TypeId].required).toEqual([])
    expect(leftJoined[RowSet.TypeId].available.posts.name).toBe("posts")
    expect(leftJoined[RowSet.TypeId].available.posts.mode).toBe("optional")
  })

  test("renderer and executor use Query.ResultRow as the canonical output contract", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid(),
      title: StdRoot.Column.text()
    })

    const plan = Q.select({
      userId: users.id,
      postId: posts.id,
      postTitleUpper: F.upper(posts.title)
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

    const executor = Executor.custom(<PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any, any, any>>(
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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid(),
      title: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })

    const plan = Q.select({
      emailUpper: F.upper(users.email),
      postCount: F.count(posts.id),
      maxPostTitle: F.max(posts.title),
      minPostTitle: F.min(posts.title),
      fallbackTitle: F.coalesce(F.max(posts.title), Q.literal("NONE"))
    }).pipe(
      Q.from(users),
      Q.innerJoin(posts, Q.and(Q.eq(users.id, posts.userId), Q.not(false))),
      Q.groupBy(F.upper(users.email)),
      Q.orderBy(F.count(posts.id), "desc"),
      Q.orderBy(F.upper(users.email))
    )

    const renderer = Renderer.make("postgres")
    const rendered = renderer.render(plan)

    expect(rendered.sql).toBe('select upper("users"."email") as "emailUpper", count("posts"."id") as "postCount", max("posts"."title") as "maxPostTitle", min("posts"."title") as "minPostTitle", coalesce(max("posts"."title"), $1) as "fallbackTitle" from "users" inner join "posts" on (("users"."id" = "posts"."userId") and (not false)) group by upper("users"."email") order by count("posts"."id") desc, upper("users"."email") asc')
    expect(rendered.params).toEqual(["NONE"])
  })

  test("Executor.fromDriver renders, runs, and decodes nested rows", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
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

    const executor = Executor.make({ renderer, driver })
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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const plan = Q.select({
      profile: {
        id: Q.as(users.id, "user_identifier"),
        email: Q.as(F.lower(users.email), "email_lower")
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

    const rows = Effect.runSync(Executor.make({ renderer, driver }).execute(plan))
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

  test("custom renderer projection aliases decode through their result paths", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })

    const plan = Q.select({
      id: users.id
    }).pipe(
      Q.from(users)
    )

    const renderer = CoreRenderer.make("postgres", () => ({
      sql: "select users.id as custom_user_id from users",
      projections: [
        { path: ["id"], alias: "custom_user_id" }
      ]
    }))

    const driver = Executor.driver("postgres", (query) => {
      expect(query.projections).toEqual([
        { path: ["id"], alias: "custom_user_id" }
      ])
      return Effect.succeed([
        {
          custom_user_id: userId
        }
      ])
    })

    const rows = Effect.runSync(Executor.make({ renderer, driver }).execute(plan))
    expect(rows).toEqual([
      {
        id: userId
      }
    ])
  })

  test("built-in renderers trust typed projection aliases", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const invalid = Q.select({
      id: Q.as(users.id, "duplicate_alias"),
      email: Q.as(users.email, "duplicate_alias")
    }).pipe(
      Q.from(users)
    )

    const rendered = Renderer.make().render(unsafeAny(invalid))

    expect(rendered.sql).toBe('select "users"."id" as "duplicate_alias", "users"."email" as "duplicate_alias" from "users"')
    expect(rendered.projections).toEqual([
      { path: ["id"], alias: "duplicate_alias" },
      { path: ["email"], alias: "duplicate_alias" }
    ])
  })

  test("custom renderers are still validated for duplicate projection aliases", () => {
    const plan = Q.select({
      id: Q.literal("user-1")
    })

    const renderer = CoreRenderer.make("postgres", () => ({
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

    const renderer = CoreRenderer.make("postgres", () => ({
      sql: "select $1 as profile, $2 as profile_id",
      params: ["user", "user-1"],
      projections: [
        { path: ["profile"], alias: "profile" },
        { path: ["profile", "id"], alias: "profile_id" }
      ]
    }))

    expect(() => renderer.render(plan)).toThrow("Conflicting projection paths: profile conflicts with profile.id")
  })

  test("custom renderers cannot project paths outside the query selection", () => {
    const plan = Q.select({
      id: Q.literal("user-1")
    })

    const renderer = CoreRenderer.make("postgres", () => ({
      sql: "select $1 as missing_path",
      params: ["user-1"],
      projections: [
        { path: ["profile", "id"], alias: "missing_path" }
      ]
    }))

    expect(() => renderer.render(plan)).toThrow("Projection path profile.id does not exist in the query selection")
  })

  test("custom renderers must project every selected path", () => {
    const plan = Q.select({
      id: Q.literal("user-1"),
      email: Q.literal("alice@example.com")
    })

    const renderer = CoreRenderer.make("postgres", () => ({
      sql: "select $1 as id",
      params: ["user-1"],
      projections: [
        { path: ["id"], alias: "id" }
      ]
    }))

    expect(() => renderer.render(plan)).toThrow("Projection path email is missing from rendered projections")
  })

  test("Executor.fromSqlClient uses SqlClient and decodes rendered rows", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
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
    const executor = Executor.make({ renderer })
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
    const employees = StdRoot.Table.make("employees", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      managerId: StdRoot.Column.uuid().pipe(StdRoot.Column.nullable),
      name: StdRoot.Column.text()
    })

    const manager = StdRoot.Table.alias(employees, "manager")
    const report = StdRoot.Table.alias(employees, "report")

    const plan = Q.select({
      managerId: manager.id,
      reportId: report.id
    }).pipe(
      Q.from(manager),
      Q.leftJoin(report, Q.eq(report.managerId, manager.id))
    )

    expect(plan[RowSet.TypeId].available.manager).toMatchObject({
      name: "manager",
      mode: "required",
      baseName: "employees"
    })
    expect(plan[RowSet.TypeId].available.report).toMatchObject({
      name: "report",
      mode: "optional",
      baseName: "employees"
    })
    expect(plan[RowSet.TypeId].required).toEqual([])
  })

  test("renderer emits aliased self-joins with base tables and logical source names", () => {
    const employees = StdRoot.Table.make("employees", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      managerId: StdRoot.Column.uuid().pipe(StdRoot.Column.nullable),
      name: StdRoot.Column.text()
    })

    const manager = StdRoot.Table.alias(employees, "manager")
    const report = StdRoot.Table.alias(employees, "report")

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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const plan = Mysql.Query.select({
      id: users.id,
      decoratedEmail: Mysql.Function.concat(Mysql.Function.lower(users.email), "-user"),
      kind: Mysql.Query.literal("user")
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.where(Mysql.Query.eq(users.email, "alice@example.com"))
    )

    const rendered = renderMysqlPlan(unsafeNever(plan))

    expect(rendered.sql).toBe("select `users`.`id` as `id`, concat(lower(`users`.`email`), ?) as `decoratedEmail`, ? as `kind` from `users` where (`users`.`email` = ?)")
    expect(rendered.params).toEqual(["-user", "user", "alice@example.com"])
    expect(rendered.projections).toEqual([
      { path: ["id"], alias: "id" },
      { path: ["decoratedEmail"], alias: "decoratedEmail" },
      { path: ["kind"], alias: "kind" }
    ])
  })

  test("dialect entrypoints render standard root tables through built-in renderers", () => {
    const mysqlUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid(),
      email: StdRoot.Column.text()
    })
    const postgresUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid(),
      email: StdRoot.Column.text()
    })

    expect(mysqlUsers.id[Scalar.TypeId].dbType.dialect).toBe("standard")
    expect(postgresUsers.id[Scalar.TypeId].dbType.dialect).toBe("standard")

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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid(),
      email: StdRoot.Column.text()
    })

    const plan = Mysql.Query.select({
      matches: Mysql.Query.eq(users.email, "alice@example.com"),
      decorated: Mysql.Function.concat(Mysql.Function.lower(users.email), "-user"),
      kind: Mysql.Query.literal("user")
    }).pipe(
      Mysql.Query.from(users)
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe("select (`users`.`email` = ?) as `matches`, concat(lower(`users`.`email`), ?) as `decorated`, ? as `kind` from `users`")
    expect(rendered.params).toEqual(["alice@example.com", "-user", "user"])
  })
})
