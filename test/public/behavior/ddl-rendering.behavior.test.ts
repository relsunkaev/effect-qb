// @ts-nocheck
import { describe, expect, test } from "bun:test"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import * as Sqlite from "#sqlite"

describe("ddl rendering behavior", () => {
  test("postgres check constraints render row-local column references", () => {
    const usersBase = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })
    const users = usersBase.pipe(
      Postgres.Table.check("email_not_empty", Postgres.Query.neq(usersBase.email, ""))
    )

    const rendered = Postgres.Renderer.make().render(Postgres.Query.createTable(users))

    expect(rendered.sql).toBe(
      'create table "public"."users" ("id" uuid not null, "email" text not null, primary key ("id"), constraint "email_not_empty" check (("email" <> \'\')))'
    )
    expect(rendered.params).toEqual([])
  })

  test("mysql check constraints render row-local column references", () => {
    const usersBase = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })
    const users = usersBase.pipe(
      Mysql.Table.check("email_not_empty", Mysql.Query.neq(usersBase.email, ""))
    )

    const rendered = Mysql.Renderer.make().render(Mysql.Query.createTable(users))

    expect(rendered.sql).toBe(
      "create table `users` (`id` char(36) not null, `email` text not null, primary key (`id`), constraint `email_not_empty` check ((`email` <> '')))"
    )
    expect(rendered.params).toEqual([])
  })

  test("postgres and mysql DDL expressions inline literals instead of bind parameters", () => {
    const postgresUsersBase = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text().pipe(Postgres.Column.default(Postgres.Query.literal("guest@example.com")))
    })
    const postgresUsers = postgresUsersBase.pipe(
      Postgres.Table.check("email_not_empty", Postgres.Query.neq(postgresUsersBase.email, ""))
    )

    const mysqlUsersBase = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text().pipe(Mysql.Column.default(Mysql.Query.literal("guest@example.com")))
    })
    const mysqlUsers = mysqlUsersBase.pipe(
      Mysql.Table.check("email_not_empty", Mysql.Query.neq(mysqlUsersBase.email, ""))
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
    const postgresOrgs = Postgres.Table.make("orgs", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey)
    })

    expect(() =>
      Postgres.Table.make("memberships", {
        id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
        orgId: Postgres.Column.uuid().pipe(Postgres.Column.foreignKey({
          target: () => postgresOrgs.id,
          onDelete: "cascade; drop table orgs"
        } as never))
      })
    ).toThrow("Foreign key action must be noAction, restrict, cascade, setNull, or setDefault")

    const mysqlMemberships = Mysql.Table.make("memberships", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      orgId: Mysql.Column.uuid()
    })
    ;(mysqlMemberships as any)[Mysql.Table.OptionsSymbol] = [
      ...(mysqlMemberships as any)[Mysql.Table.OptionsSymbol],
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

    const sqliteMemberships = Sqlite.Table.make("memberships", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      orgId: Sqlite.Column.text()
    })
    ;(sqliteMemberships as any)[Sqlite.Table.OptionsSymbol] = [
      ...(sqliteMemberships as any)[Sqlite.Table.OptionsSymbol],
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

  test("rejects unknown table option kinds at render time", () => {
    const postgresUsers = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey)
    })
    ;(postgresUsers as any)[Postgres.Table.OptionsSymbol] = [
      ...(postgresUsers as any)[Postgres.Table.OptionsSymbol],
      { kind: "partition", columns: ["id"] }
    ]
    expect(() =>
      Postgres.Renderer.make().render(Postgres.Query.createTable(postgresUsers))
    ).toThrow("Unsupported table option kind")

    const mysqlUsers = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey)
    })
    ;(mysqlUsers as any)[Mysql.Table.OptionsSymbol] = [
      ...(mysqlUsers as any)[Mysql.Table.OptionsSymbol],
      { kind: "partition", columns: ["id"] }
    ]
    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.createTable(mysqlUsers))
    ).toThrow("Unsupported table option kind")

    const sqliteUsers = Sqlite.Table.make("users", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey)
    })
    ;(sqliteUsers as any)[Sqlite.Table.OptionsSymbol] = [
      ...(sqliteUsers as any)[Sqlite.Table.OptionsSymbol],
      { kind: "partition", columns: ["id"] }
    ]
    expect(() =>
      Sqlite.Renderer.make().render(Sqlite.Query.createTable(sqliteUsers))
    ).toThrow("Unsupported table option kind")
  })

  test("rejects mysql unique constraints with unsupported postgres-only options", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text().pipe(Mysql.Column.unique.options({
        nullsNotDistinct: true
      }))
    })

    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.createTable(users))
    ).toThrow("Unsupported mysql unique constraint options")
  })

  test("rejects sqlite unique constraints with unsupported postgres-only options", () => {
    const users = Sqlite.Table.make("users", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      email: Sqlite.Column.text().pipe(Sqlite.Column.unique.options({
        deferrable: true,
        initiallyDeferred: true
      }))
    })

    expect(() =>
      Sqlite.Renderer.make().render(Sqlite.Query.createTable(users))
    ).toThrow("Unsupported sqlite unique constraint options")
  })

  test("postgres drop index qualifies indexes for schema-scoped tables", () => {
    const analytics = Postgres.schema("analytics")
    const events = analytics.table("events", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      userId: Postgres.Column.uuid()
    })

    const rendered = Postgres.Renderer.make().render(Postgres.Query.dropIndex(events, ["userId"], {
      ifExists: true
    }))

    expect(rendered.sql).toBe(
      'drop index if exists "analytics"."events_userId_idx"'
    )
  })

  test("rejects postgres createIndex with unknown columns at runtime", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    expect(() =>
      Postgres.Renderer.make().render(Postgres.Query.createIndex(users, ["missing"]))
    ).toThrow()
  })

  test("rejects postgres dropIndex with unknown columns at runtime", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    expect(() =>
      Postgres.Renderer.make().render(Postgres.Query.dropIndex(users, ["missing"]))
    ).toThrow()
  })

  test("rejects mysql createIndex with unknown columns at runtime", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.createIndex(users, ["missing"]))
    ).toThrow()
  })

  test("rejects mysql dropIndex with unknown columns at runtime", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.dropIndex(users, ["missing"]))
    ).toThrow()
  })
})
