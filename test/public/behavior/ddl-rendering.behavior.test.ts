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
      'create table "public"."users" ("id" uuid not null, "email" text not null, primary key ("id"), constraint "email_not_empty" check (("email" <> $1)))'
    )
    expect(rendered.params).toEqual([""])
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
      "create table `users` (`id` char(36) not null, `email` text not null, primary key (`id`), constraint `email_not_empty` check ((`email` <> ?)))"
    )
    expect(rendered.params).toEqual([""])
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
