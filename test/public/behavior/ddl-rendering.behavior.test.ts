// @ts-nocheck
import { describe, expect, test } from "bun:test"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import * as Sqlite from "#sqlite"
import * as Standard from "#standard"
import * as StdRoot from "#standard"
import * as Casing from "../../../packages/querybuilder/src/casing.ts"

describe("ddl rendering behavior", () => {
  test("standard table DDL uses each renderer's portable type spelling", () => {
    const assets = Standard.Table.make("assets", {
      id: Standard.Column.uuid().pipe(Standard.Column.primaryKey),
      size: Standard.Column.bigint(),
      ratio: Standard.Column.real(),
      payload: Standard.Column.blob()
    })
    const plan = Standard.Query.createTable(assets)

    expect(Standard.Renderer.make().render(plan).sql).toBe(
      'create table "assets" ("id" uuid not null, "size" bigint not null, "ratio" real not null, "payload" blob not null, primary key ("id"))'
    )
    expect(Postgres.Renderer.make().render(plan).sql).toBe(
      'create table "assets" ("id" uuid not null, "size" bigint not null, "ratio" real not null, "payload" bytea not null, primary key ("id"))'
    )
    expect(Mysql.Renderer.make().render(plan).sql).toBe(
      "create table `assets` (`id` char(36) not null, `size` bigint not null, `ratio` real not null, `payload` blob not null, primary key (`id`))"
    )
    expect(Sqlite.Renderer.make().render(plan).sql).toBe(
      'create table "assets" ("id" text not null, "size" bigint not null, "ratio" real not null, "payload" blob not null, primary key ("id"))'
    )
  })

  test("column DDL type overrides trust typed db type names without renderer-time validation", () => {
    const assets = StdRoot.Table.make("assets", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      metadata: StdRoot.Column.text().pipe(Postgres.Column.ddlType(""))
    })
    const plan = Postgres.Query.createTable(assets)

    expect(Postgres.Renderer.make().render(plan).sql).toContain(
      '"metadata"  not null'
    )
  })

  test("postgres check constraints render row-local column references", () => {
    const usersBase = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const users = usersBase.pipe(
      Postgres.Table.check("email_not_empty", Postgres.Query.neq(usersBase.email, ""))
    )

    const rendered = Postgres.Renderer.make().render(Postgres.Query.createTable(users))

    expect(rendered.sql).toBe(
      'create table "users" ("id" uuid not null, "email" text not null, primary key ("id"), constraint "email_not_empty" check (("email" <> \'\')))'
    )
    expect(rendered.params).toEqual([])
  })

  test("mysql check constraints render row-local column references", () => {
    const usersBase = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const users = usersBase.pipe(
      StdRoot.Table.check("email_not_empty", Mysql.Query.neq(usersBase.email, ""))
    )

    const rendered = Mysql.Renderer.make().render(Mysql.Query.createTable(users))

    expect(rendered.sql).toBe(
      "create table `users` (`id` char(36) not null, `email` text not null, primary key (`id`), constraint `email_not_empty` check ((`email` <> '')))"
    )
    expect(rendered.params).toEqual([])
  })

  test("DDL uses table-level casing for constraints and index names", () => {
    const usersBase = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      accountStatus: StdRoot.Column.text()
    })
    const users = usersBase.pipe(
      Casing.withCasing({
        columns: "snake_case",
        indexes: "snake_case",
        constraints: "snake_case"
      }),
      StdRoot.Table.check("AccountStatusCheck", StdRoot.Query.eq(usersBase.accountStatus, "active"))
    )

    expect(Postgres.Renderer.make().render(Postgres.Query.createTable(users)).sql).toContain(
      `constraint "account_status_check" check (("account_status" = 'active'))`
    )
    expect(Mysql.Renderer.make().render(Mysql.Query.createTable(users)).sql).toContain(
      "constraint `account_status_check` check ((`account_status` = 'active'))"
    )
    expect(Sqlite.Renderer.make().render(Sqlite.Query.createTable(users)).sql).toContain(
      `constraint "account_status_check" check (("account_status" = 'active'))`
    )
    expect(Postgres.Renderer.make().render(Postgres.Query.createIndex(users, ["accountStatus"])).sql).toBe(
      `create index "users_account_status_idx" on "users" ("account_status")`
    )
    expect(Postgres.Renderer.make().render(Postgres.Query.dropIndex(users, ["accountStatus"])).sql).toBe(
      `drop index "users_account_status_idx"`
    )
  })

  test("standard index DDL rejects unsupported existence modifiers", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    expect(() =>
      Standard.Renderer.make().render(Standard.Query.createIndex(users, ["email"], { ifNotExists: true }))
    ).toThrow("Unsupported standard create index options")
    expect(() =>
      Standard.Renderer.make().render(Standard.Query.dropIndex(users, ["email"], { ifExists: true }))
    ).toThrow("Unsupported standard drop index options")
  })

  test("standard table DDL rejects unsupported existence modifiers", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    expect(() =>
      Standard.Renderer.make().render(Standard.Query.createTable(users, { ifNotExists: true }))
    ).toThrow("Unsupported standard create table options")
    expect(() =>
      Standard.Renderer.make().render(Standard.Query.dropTable(users, { ifExists: true }))
    ).toThrow("Unsupported standard drop table options")
  })

  test("generated column expressions use table-level casing", () => {
    const users = StdRoot.Table.make("UserAccounts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      displayName: StdRoot.Column.text(),
      normalizedName: StdRoot.Column.text().pipe(
        StdRoot.Column.generated(
          StdRoot.Function.lower(StdRoot.Query.column("displayName", StdRoot.Query.type.text()))
        )
      )
    }).pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case"
      })
    )

    expect(Postgres.Renderer.make().render(Postgres.Query.createTable(users)).sql).toContain(
      'generated always as (lower("display_name")) stored'
    )
    expect(Mysql.Renderer.make().render(Mysql.Query.createTable(users)).sql).toContain(
      "generated always as (lower(`display_name`)) stored"
    )
    expect(Sqlite.Renderer.make().render(Sqlite.Query.createTable(users)).sql).toContain(
      'generated always as (lower("display_name")) stored'
    )
  })

  test("rejects identity columns where unsupported by the dialect", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.int().pipe(Postgres.Column.identityByDefault, StdRoot.Column.primaryKey)
    })

    expect(Postgres.Renderer.make().render(Postgres.Query.createTable(users)).sql).toBe(
      'create table "users" ("id" int generated by default as identity not null, primary key ("id"))'
    )
    expect(() =>
      Standard.Renderer.make().render(Standard.Query.createTable(users))
    ).toThrow("Unsupported standard identity column options")
    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.createTable(users))
    ).toThrow("Unsupported mysql identity column options")
    expect(() =>
      Sqlite.Renderer.make().render(Sqlite.Query.createTable(users))
    ).toThrow("Unsupported sqlite identity column options")
  })

  test("rejects array columns where unsupported by the dialect", () => {
    const docs = StdRoot.Table.make("docs", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      tags: StdRoot.Column.text().pipe(Postgres.Column.array())
    })

    expect(Postgres.Renderer.make().render(Postgres.Query.createTable(docs)).sql).toBe(
      'create table "docs" ("id" uuid not null, "tags" text[] not null, primary key ("id"))'
    )
    expect(() =>
      Standard.Renderer.make().render(Standard.Query.createTable(docs))
    ).toThrow("Unsupported standard array column options")
    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.createTable(docs))
    ).toThrow("Unsupported mysql array column options")
    expect(() =>
      Sqlite.Renderer.make().render(Sqlite.Query.createTable(docs))
    ).toThrow("Unsupported sqlite array column options")
  })

  test("postgres and mysql DDL expressions inline literals instead of bind parameters", () => {
    const postgresUsersBase = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text().pipe(StdRoot.Column.default(Postgres.Query.literal("guest@example.com")))
    })
    const postgresUsers = postgresUsersBase.pipe(
      Postgres.Table.check("email_not_empty", Postgres.Query.neq(postgresUsersBase.email, ""))
    )

    const mysqlUsersBase = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text().pipe(StdRoot.Column.default(Mysql.Query.literal("guest@example.com")))
    })
    const mysqlUsers = mysqlUsersBase.pipe(
      StdRoot.Table.check("email_not_empty", Mysql.Query.neq(mysqlUsersBase.email, ""))
    )

    const renderedPostgres = Postgres.Renderer.make().render(Postgres.Query.createTable(postgresUsers))
    const renderedMysql = Mysql.Renderer.make().render(Mysql.Query.createTable(mysqlUsers))

    expect(renderedPostgres.sql).toContain("default 'guest@example.com'")
    expect(renderedPostgres.sql).toContain(`check (("email" <> ''))`)
    expect(renderedPostgres.params).toEqual([])

    expect(renderedMysql.sql).toContain("default 'guest@example.com'")
    expect(renderedMysql.sql).toContain("check ((`email` <> ''))")
    expect(renderedMysql.params).toEqual([])
  })

  test("rejects invalid foreign key actions at runtime", () => {
    const postgresOrgs = StdRoot.Table.make("orgs", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })

    const postgresMemberships = StdRoot.Table.make("memberships", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      orgId: StdRoot.Column.uuid().pipe(Postgres.Column.foreignKey({
        target: () => postgresOrgs.id,
        onDelete: "cascade; drop table orgs"
      } as never))
    })
    expect(() =>
      Postgres.Renderer.make().render(Postgres.Query.createTable(postgresMemberships))
    ).toThrow("Foreign key action must be noAction, restrict, cascade, setNull, or setDefault")

    const mysqlMemberships = StdRoot.Table.make("memberships", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      orgId: StdRoot.Column.uuid()
    })
    ;(mysqlMemberships as any)[StdRoot.Table.OptionsSymbol] = [
      ...(mysqlMemberships as any)[StdRoot.Table.OptionsSymbol],
      {
        kind: "foreignKey",
        columns: ["orgId"],
        onUpdate: "restrict; drop table orgs",
        references: () => ({
          tableName: "orgs",
          columns: ["id"],
          knownColumns: ["id"]
        })
      }
    ]
    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.createTable(mysqlMemberships))
    ).toThrow("Foreign key action must be noAction, restrict, cascade, setNull, or setDefault")

    const sqliteMemberships = StdRoot.Table.make("memberships", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      orgId: StdRoot.Column.text()
    })
    ;(sqliteMemberships as any)[StdRoot.Table.OptionsSymbol] = [
      ...(sqliteMemberships as any)[StdRoot.Table.OptionsSymbol],
      {
        kind: "foreignKey",
        columns: ["orgId"],
        onDelete: "cascade; drop table orgs",
        references: () => ({
          tableName: "orgs",
          columns: ["id"],
          knownColumns: ["id"]
        })
      }
    ]
    expect(() =>
      Sqlite.Renderer.make().render(Sqlite.Query.createTable(sqliteMemberships))
    ).toThrow("Foreign key action must be noAction, restrict, cascade, setNull, or setDefault")
  })

  test("foreign keys render referenced table casing metadata", () => {
    const organizations = StdRoot.Table.make("OrganizationAccounts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      accountSlug: StdRoot.Column.text().pipe(StdRoot.Column.unique)
    }).pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case"
      })
    )

    const memberships = StdRoot.Table.make("MembershipRecords", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      organizationId: StdRoot.Column.uuid().pipe(
        StdRoot.Column.references(() => organizations.id)
      ),
      organizationSlug: StdRoot.Column.text()
    }).pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case"
      }),
      StdRoot.Table.foreignKey("organizationSlug", () => organizations, "accountSlug")
    )

    const rendered = Postgres.Renderer.make().render(Postgres.Query.createTable(memberships))

    expect(rendered.sql).toContain(
      'foreign key ("organization_id") references "organization_accounts" ("id")'
    )
    expect(rendered.sql).toContain(
      'foreign key ("organization_slug") references "organization_accounts" ("account_slug")'
    )
  })

  test("mysql and sqlite DDL casing maps physical identifiers", () => {
    const organizations = StdRoot.Table.make("OrganizationAccounts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      accountSlug: StdRoot.Column.text().pipe(StdRoot.Column.unique)
    }).pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case"
      })
    )

    const membershipsBase = StdRoot.Table.make("MembershipRecords", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      organizationId: StdRoot.Column.uuid().pipe(
        StdRoot.Column.references(() => organizations.id)
      ),
      organizationSlug: StdRoot.Column.text(),
      createdAt: StdRoot.Column.datetime()
    }).pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case",
        indexes: "snake_case"
      })
    )
    const memberships = membershipsBase.pipe(
      StdRoot.Table.foreignKey("organizationSlug", () => organizations, "accountSlug")
    )

    expect(Mysql.Renderer.make().render(Mysql.Query.createTable(memberships)).sql).toContain(
      "create table `membership_records` (`id` char(36) not null, `organization_id` char(36) not null, `organization_slug` text not null, `created_at` datetime not null, primary key (`id`), foreign key (`organization_id`) references `organization_accounts` (`id`), foreign key (`organization_slug`) references `organization_accounts` (`account_slug`))"
    )
    expect(Mysql.Renderer.make().render(Mysql.Query.createIndex(memberships, ["createdAt"])).sql).toBe(
      "create index `membership_records_created_at_idx` on `membership_records` (`created_at`)"
    )
    expect(Mysql.Renderer.make().render(Mysql.Query.dropIndex(memberships, ["createdAt"])).sql).toBe(
      "drop index `membership_records_created_at_idx` on `membership_records`"
    )
    expect(Sqlite.Renderer.make().render(Sqlite.Query.createTable(memberships)).sql).toContain(
      'create table "membership_records" ("id" text not null, "organization_id" text not null, "organization_slug" text not null, "created_at" datetime not null, primary key ("id"), foreign key ("organization_id") references "organization_accounts" ("id"), foreign key ("organization_slug") references "organization_accounts" ("account_slug"))'
    )
    expect(Sqlite.Renderer.make().render(Sqlite.Query.createIndex(memberships, ["createdAt"])).sql).toBe(
      'create index "membership_records_created_at_idx" on "membership_records" ("created_at")'
    )
    expect(Sqlite.Renderer.make().render(Sqlite.Query.dropIndex(memberships, ["createdAt"])).sql).toBe(
      'drop index "membership_records_created_at_idx"'
    )
  })

  test("rejects unknown table option kinds at render time", () => {
    const postgresUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(postgresUsers as any)[StdRoot.Table.OptionsSymbol] = [
      ...(postgresUsers as any)[StdRoot.Table.OptionsSymbol],
      { kind: "partition", columns: ["id"] }
    ]
    expect(() =>
      Postgres.Renderer.make().render(Postgres.Query.createTable(postgresUsers))
    ).toThrow("Unsupported table option kind")

    const mysqlUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(mysqlUsers as any)[StdRoot.Table.OptionsSymbol] = [
      ...(mysqlUsers as any)[StdRoot.Table.OptionsSymbol],
      { kind: "partition", columns: ["id"] }
    ]
    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.createTable(mysqlUsers))
    ).toThrow("Unsupported table option kind")

    const sqliteUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey)
    })
    ;(sqliteUsers as any)[StdRoot.Table.OptionsSymbol] = [
      ...(sqliteUsers as any)[StdRoot.Table.OptionsSymbol],
      { kind: "partition", columns: ["id"] }
    ]
    expect(() =>
      Sqlite.Renderer.make().render(Sqlite.Query.createTable(sqliteUsers))
    ).toThrow("Unsupported table option kind")
  })

  test("rejects malformed table option columns before rendering DDL", () => {
    const postgresUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(postgresUsers as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "primaryKey",
      columns: "id"
    }]

    const mysqlUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(mysqlUsers as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "primaryKey",
      columns: "id"
    }]

    const sqliteUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey)
    })
    ;(sqliteUsers as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "primaryKey",
      columns: "id"
    }]

    expect(() =>
      Postgres.Renderer.make().render(Postgres.Query.createTable(postgresUsers))
    ).toThrow()
    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.createTable(mysqlUsers))
    ).toThrow()
    expect(() =>
      Sqlite.Renderer.make().render(Sqlite.Query.createTable(sqliteUsers))
    ).toThrow()
  })

  test("ignores malformed table option entries without runtime validation", () => {
    const postgresUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(postgresUsers as any)[StdRoot.Table.OptionsSymbol] = [
      ...(postgresUsers as any)[StdRoot.Table.OptionsSymbol],
      null
    ]

    const mysqlUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(mysqlUsers as any)[StdRoot.Table.OptionsSymbol] = [
      ...(mysqlUsers as any)[StdRoot.Table.OptionsSymbol],
      null
    ]

    const sqliteUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey)
    })
    ;(sqliteUsers as any)[StdRoot.Table.OptionsSymbol] = [
      ...(sqliteUsers as any)[StdRoot.Table.OptionsSymbol],
      null
    ]

    expect(Postgres.Renderer.make().render(Postgres.Query.createTable(postgresUsers)).sql).toContain(
      'create table "users" ("id" uuid not null, primary key ("id"))'
    )
    expect(Mysql.Renderer.make().render(Mysql.Query.createTable(mysqlUsers)).sql).toContain(
      "create table `users` (`id` char(36) not null, primary key (`id`))"
    )
    expect(Sqlite.Renderer.make().render(Sqlite.Query.createTable(sqliteUsers)).sql).toContain(
      'create table "users" ("id" text not null, primary key ("id"))'
    )
  })

  test("rejects malformed foreign key reference columns before rendering DDL", () => {
    const orgs = StdRoot.Table.make("orgs", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      orgId: StdRoot.Column.uuid()
    }).pipe(
      StdRoot.Table.foreignKey("orgId", () => orgs, "id")
    )
    ;(users as any)[StdRoot.Table.OptionsSymbol] = (users as any)[StdRoot.Table.OptionsSymbol].map((option: any) =>
      option.kind === "foreignKey"
        ? {
          ...option,
          references: () => ({
            tableName: "orgs",
            columns: "id",
            knownColumns: ["id"]
          })
        }
        : option
    )

    expect(() =>
      Postgres.Renderer.make().render(Postgres.Query.createTable(users))
    ).toThrow()
  })

  test("foreign key renderers accept direct reference payload metadata", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      orgId: StdRoot.Column.uuid()
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [
      ...(users as any)[StdRoot.Table.OptionsSymbol],
      {
        kind: "foreignKey",
        columns: ["orgId"],
        references: {
          tableName: "orgs",
          columns: ["id"],
          knownColumns: ["id"]
        }
      }
    ]

    expect(Postgres.Renderer.make().render(Postgres.Query.createTable(users)).sql).toContain(
      'references "orgs" ("id")'
    )
    expect(Mysql.Renderer.make().render(Mysql.Query.createTable(users)).sql).toContain(
      "references `orgs` (`id`)"
    )
    expect(Sqlite.Renderer.make().render(Sqlite.Query.createTable(users)).sql).toContain(
      'references "orgs" ("id")'
    )
  })

  test("rejects malformed check constraints before rendering DDL", () => {
    const postgresUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(postgresUsers as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "check",
      name: "users_id_check"
    }]

    const mysqlUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(mysqlUsers as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "check",
      name: 123,
      predicate: Mysql.Query.eq(mysqlUsers.id, "user-id")
    }]

    const sqliteUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey)
    })
    ;(sqliteUsers as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "check",
      name: "users_id_check",
      predicate: "id is not null"
    }]

    expect(() =>
      Postgres.Renderer.make().render(Postgres.Query.createTable(postgresUsers))
    ).toThrow()
    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.createTable(mysqlUsers))
    ).toThrow()
    expect(() =>
      Sqlite.Renderer.make().render(Sqlite.Query.createTable(sqliteUsers))
    ).toThrow()
  })

  test("ddl builders trust typed clause kinds without renderer-time validation", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")

    const postgresUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    const postgresCreate = Postgres.Query.createTable(postgresUsers, { ifNotExists: true })
    ;(postgresCreate as any)[queryAst].ddl.kind = "dropTable"
    expect(Postgres.Renderer.make().render(postgresCreate).sql).toBe(
      'create table if not exists "users" ("id" uuid not null, primary key ("id"))'
    )

    const mysqlUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    const mysqlCreate = Mysql.Query.createTable(mysqlUsers, { ifNotExists: true })
    ;(mysqlCreate as any)[queryAst].ddl.kind = "dropTable"
    expect(Mysql.Renderer.make().render(mysqlCreate).sql).toBe(
      "create table if not exists `users` (`id` char(36) not null, primary key (`id`))"
    )

    const sqliteUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey)
    })
    const sqliteCreate = Sqlite.Query.createTable(sqliteUsers, { ifNotExists: true })
    ;(sqliteCreate as any)[queryAst].ddl.kind = "dropTable"
    expect(Sqlite.Renderer.make().render(sqliteCreate).sql).toBe(
      'create table if not exists "users" ("id" text not null, primary key ("id"))'
    )
  })

  test("rejects mysql unique constraints with unsupported postgres-only options", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text().pipe(StdRoot.Column.unique.options({
        nullsNotDistinct: true
      }))
    })

    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.createTable(users))
    ).toThrow("Unsupported mysql unique constraint options")
  })

  test("rejects sqlite unique constraints with unsupported postgres-only options", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text().pipe(StdRoot.Column.unique.options({
        deferrable: true,
        initiallyDeferred: true
      }))
    })

    expect(() =>
      Sqlite.Renderer.make().render(Sqlite.Query.createTable(users))
    ).toThrow("Unsupported sqlite unique constraint options")
  })

  test("rejects check constraints with unsupported postgres-only options", () => {
    const standardUsersBase = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const standardUsers = standardUsersBase.pipe(
      Postgres.Table.check({
        name: "email_not_empty",
        predicate: Standard.Query.neq(standardUsersBase.email, ""),
        noInherit: true
      })
    )

    const mysqlUsersBase = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const mysqlUsers = mysqlUsersBase.pipe(
      Postgres.Table.check({
        name: "email_not_empty",
        predicate: Mysql.Query.neq(mysqlUsersBase.email, ""),
        noInherit: true
      })
    )

    const sqliteUsersBase = StdRoot.Table.make("users", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const sqliteUsers = sqliteUsersBase.pipe(
      Postgres.Table.check({
        name: "email_not_empty",
        predicate: Sqlite.Query.neq(sqliteUsersBase.email, ""),
        noInherit: true
      })
    )

    expect(() =>
      Standard.Renderer.make().render(Standard.Query.createTable(standardUsers))
    ).toThrow("Unsupported standard check constraint options")
    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.createTable(mysqlUsers))
    ).toThrow("Unsupported mysql check constraint options")
    expect(() =>
      Sqlite.Renderer.make().render(Sqlite.Query.createTable(sqliteUsers))
    ).toThrow("Unsupported sqlite check constraint options")
  })

  test("rejects non-portable constraint options where unsupported by the dialect", () => {
    const standardUniqueUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    }).pipe(
      Postgres.Table.unique({
        columns: "email",
        nullsNotDistinct: true
      })
    )
    const standardPrimaryUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid(),
      email: StdRoot.Column.text()
    }).pipe(
      Postgres.Table.primaryKey({
        columns: "id",
        deferrable: true,
        initiallyDeferred: true
      })
    )
    const mysqlUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid()
    }).pipe(
      Postgres.Table.primaryKey({
        columns: "id",
        deferrable: true,
        initiallyDeferred: true
      })
    )
    const sqliteUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.text()
    }).pipe(
      Postgres.Table.primaryKey({
        columns: "id",
        deferrable: true,
        initiallyDeferred: true
      })
    )
    const orgs = StdRoot.Table.make("orgs", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    const memberships = StdRoot.Table.make("memberships", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      orgId: StdRoot.Column.uuid()
    }).pipe(
      Postgres.Table.foreignKey({
        columns: "orgId",
        target: () => orgs,
        referencedColumns: "id",
        deferrable: true,
        initiallyDeferred: true
      })
    )
    const standardMemberships = StdRoot.Table.make("memberships", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      orgId: StdRoot.Column.uuid()
    }).pipe(
      Postgres.Table.foreignKey({
        columns: "orgId",
        target: () => orgs,
        referencedColumns: "id",
        deferrable: true,
        initiallyDeferred: true
      })
    )

    expect(() =>
      Standard.Renderer.make().render(Standard.Query.createTable(standardUniqueUsers))
    ).toThrow("Unsupported standard unique constraint options")
    expect(() =>
      Standard.Renderer.make().render(Standard.Query.createTable(standardPrimaryUsers))
    ).toThrow("Unsupported standard primary key constraint options")
    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.createTable(mysqlUsers))
    ).toThrow("Unsupported mysql primary key constraint options")
    expect(() =>
      Sqlite.Renderer.make().render(Sqlite.Query.createTable(sqliteUsers))
    ).toThrow("Unsupported sqlite primary key constraint options")
    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.createTable(memberships))
    ).toThrow("Unsupported mysql foreign key constraint options")
    expect(() =>
      Standard.Renderer.make().render(Standard.Query.createTable(standardMemberships))
    ).toThrow("Unsupported standard foreign key constraint options")
  })

  test("postgres drop index qualifies indexes for schema-scoped tables", () => {
    const analytics = Postgres.Schema.make("analytics")
    const events = analytics.table("events", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid()
    })

    const rendered = Postgres.Renderer.make().render(Postgres.Query.dropIndex(events, ["userId"], {
      ifExists: true
    }))

    expect(rendered.sql).toBe(
      'drop index if exists "analytics"."events_userId_idx"'
    )
  })

})
