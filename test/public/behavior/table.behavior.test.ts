import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import * as Mysql from "#mysql"
import * as Sqlite from "#sqlite"
import { Column as C, Scalar as Expression, Function as F, Query as Q, Table } from "#postgres"
import { unsafeAny, unsafeNever } from "../../helpers/unsafe.ts"
import * as StdRoot from "#standard"

describe("table behavior", () => {
  test("rejects conflicting inline and table-level primary keys", () => {
    expect(() => StdRoot.Table.make("memberships", {
      orgId: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid(),
      role: StdRoot.Column.text()
    }).pipe(
      Table.primaryKey(["orgId", "userId"] as const)
    )).toThrow("Inline primary keys conflict with table-level primary key declaration")
  })

  test("rejects multiple table-level primary key declarations", () => {
    expect(() => StdRoot.Table.make("memberships", {
      orgId: StdRoot.Column.uuid(),
      userId: StdRoot.Column.uuid()
    }).pipe(
      Table.primaryKey("orgId"),
      Table.primaryKey("userId")
    )).toThrow("Only one primary key declaration is allowed")
  })

  test("supports composite primary keys and preserves declared column order", () => {
    const memberships = StdRoot.Table.make("memberships", {
      orgId: StdRoot.Column.uuid(),
      userId: StdRoot.Column.uuid(),
      role: StdRoot.Column.text()
    }).pipe(
      Table.primaryKey(["orgId", "userId"] as const),
      Table.index(["role", "orgId"] as const)
    )

    expect(unsafeAny(memberships)[StdRoot.Table.TypeId].primaryKey).toEqual(["orgId", "userId"])
    expect(unsafeAny(memberships)[StdRoot.Table.OptionsSymbol]).toEqual([
      { kind: "primaryKey", columns: ["orgId", "userId"] },
      { kind: "index", columns: ["role", "orgId"] }
    ])
    expect(Schema.decodeUnknownSync(StdRoot.Table.updateSchema(memberships))({
      role: "admin",
      orgId: "ignored"
    })).toEqual({
      role: "admin"
    })
  })

  test("rejects nullable columns in composite primary keys", () => {
    expect(() => Table.primaryKey(["orgId", "slug"] as const)(
      unsafeNever(StdRoot.Table.make("memberships", {
        orgId: StdRoot.Column.uuid(),
        slug: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
      }))
    )).toThrow("Primary key column 'slug' cannot be nullable")
  })

  test("aliasing an alias preserves the physical base table and normalized options", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      slug: StdRoot.Column.text().pipe(C.unique),
      email: StdRoot.Column.text()
    }).pipe(
      Table.index(["email", "slug"] as const)
    )

    const onceAliased = StdRoot.Table.alias(users, "u1")
    const twiceAliased = unsafeAny(StdRoot.Table.alias(unsafeNever(onceAliased), "u2"))

    expect(twiceAliased[StdRoot.Table.TypeId]).toMatchObject({
      name: "u2",
      baseName: "users",
      kind: "alias",
      primaryKey: ["id"]
    })
    expect(unsafeAny(twiceAliased)[StdRoot.Table.OptionsSymbol]).toEqual(unsafeAny(users)[StdRoot.Table.OptionsSymbol])
  })

  test("schema helpers and legacy schema facade work for aliases", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })
    const aliasedUsers = StdRoot.Table.alias(users, "u")
    const id = "550e8400-e29b-41d4-a716-446655440000"

    const select = StdRoot.Table.selectSchema(aliasedUsers)
    expect(aliasedUsers.schemas.select).toBe(select)
    expect(StdRoot.Table.insertSchema(aliasedUsers)).toBe(aliasedUsers.schemas.insert)
    expect(StdRoot.Table.updateSchema(aliasedUsers)).toBe(aliasedUsers.schemas.update)
    expect(Schema.decodeUnknownSync(select)({
      id,
      email: "alice@example.com",
      bio: null
    })).toEqual({
      id,
      email: "alice@example.com",
      bio: null
    })
  })

  test("factory and class tables derive the same runtime schemas for equivalent definitions", () => {
    const factoryUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey, StdRoot.Column.generated(Q.literal("generated-user-id"))),
      email: StdRoot.Column.text().pipe(C.unique),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable),
      createdAt: StdRoot.Column.timestamp().pipe(StdRoot.Column.default(F.localTimestamp()))
    }).pipe(
      Table.index("email")
    )

    class ClassUsers extends StdRoot.Table.Class<ClassUsers>("users")({
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey, StdRoot.Column.generated(Q.literal("generated-user-id"))),
      email: StdRoot.Column.text().pipe(C.unique),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable),
      createdAt: StdRoot.Column.timestamp().pipe(StdRoot.Column.default(F.localTimestamp()))
    }) {
      static readonly [StdRoot.Table.options] = [Table.index("email")]
    }

    const input = {
      email: "alice@example.com",
      bio: null
    }

    expect(Schema.decodeUnknownSync(StdRoot.Table.insertSchema(factoryUsers))(input)).toEqual(
      Schema.decodeUnknownSync(StdRoot.Table.insertSchema(ClassUsers))(input)
    )
    expect(Schema.decodeUnknownSync(StdRoot.Table.updateSchema(factoryUsers))({
      bio: null
    })).toEqual(
      Schema.decodeUnknownSync(StdRoot.Table.updateSchema(ClassUsers))({
        bio: null
      })
    )
    expect(unsafeAny(factoryUsers)[StdRoot.Table.OptionsSymbol]).toEqual(unsafeAny(ClassUsers)[StdRoot.Table.OptionsSymbol])
  })

  test("mysql and sqlite table modules expose schema helpers", () => {
    const mysqlUsers = StdRoot.Table.make("mysql_users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })
    const sqliteUsers = StdRoot.Table.make("sqlite_users", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })
    const id = "550e8400-e29b-41d4-a716-446655440000"

    expect(Schema.decodeUnknownSync(StdRoot.Table.selectSchema(mysqlUsers))({
      id,
      email: "mysql@example.com",
      bio: null
    })).toEqual({
      id,
      email: "mysql@example.com",
      bio: null
    })
    expect(Schema.decodeUnknownSync(StdRoot.Table.insertSchema(mysqlUsers))({
      id,
      email: "mysql@example.com"
    })).toEqual({
      id,
      email: "mysql@example.com"
    })
    expect(Schema.decodeUnknownSync(StdRoot.Table.updateSchema(mysqlUsers))({
      id,
      bio: null
    })).toEqual({
      bio: null
    })

    expect(Schema.decodeUnknownSync(StdRoot.Table.selectSchema(sqliteUsers))({
      id: "sqlite-user-id",
      email: "sqlite@example.com",
      bio: null
    })).toEqual({
      id: "sqlite-user-id",
      email: "sqlite@example.com",
      bio: null
    })
    expect(Schema.decodeUnknownSync(StdRoot.Table.insertSchema(sqliteUsers))({
      id: "sqlite-user-id",
      email: "sqlite@example.com"
    })).toEqual({
      id: "sqlite-user-id",
      email: "sqlite@example.com"
    })
    expect(Schema.decodeUnknownSync(StdRoot.Table.updateSchema(sqliteUsers))({
      id: "ignored",
      bio: null
    })).toEqual({
      bio: null
    })
  })

  test("column schema pipes feed derived table schemas", () => {
    const events = StdRoot.Table.make("events", {
      happenedOn: StdRoot.Column.date().pipe(StdRoot.Column.schema(Schema.DateFromString))
    })

    const decoded = Schema.decodeUnknownSync(StdRoot.Table.selectSchema(events))({
      happenedOn: "2026-03-20"
    })

    expect(decoded.happenedOn).toBeInstanceOf(Date)
    expect(decoded.happenedOn.toISOString()).toBe("2026-03-20T00:00:00.000Z")
  })

  test("column brand can be applied inline before table binding", () => {
    const accounts = StdRoot.Table.make("inline_accounts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey, StdRoot.Column.brand),
      nickname: StdRoot.Column.text().pipe(StdRoot.Column.nullable, StdRoot.Column.brand)
    })

    expect(Schema.decodeUnknownSync(StdRoot.Table.selectSchema(accounts))({
      id: "550e8400-e29b-41d4-a716-446655440000",
      nickname: null
    })).toEqual(unsafeAny({
      id: "550e8400-e29b-41d4-a716-446655440000",
      nickname: null
    }))
  })

  test("brands derived from aliases stay plain strings at runtime", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const aliasedUsers = StdRoot.Table.alias(users, "u")
    const id = "550e8400-e29b-41d4-a716-446655440000"

    expect(Schema.decodeUnknownSync(unsafeAny(users.id.pipe(StdRoot.Column.brand).schema))(id)).toBe(id)
    expect(Schema.decodeUnknownSync(unsafeAny(aliasedUsers.id.pipe(StdRoot.Column.brand).schema))(id)).toBe(id)
  })

  test("array columns can opt into nullable elements", () => {
    const strict = StdRoot.Table.make("strict_events", {
      tags: StdRoot.Column.text().pipe(C.array())
    })
    const relaxed = StdRoot.Table.make("relaxed_events", {
      tags: StdRoot.Column.text().pipe(C.array({ nullableElements: true }))
    })

    expect(() => Schema.decodeUnknownSync(StdRoot.Table.selectSchema(strict))({
      tags: ["alpha", null]
    })).toThrow()

    expect(Schema.decodeUnknownSync(StdRoot.Table.selectSchema(relaxed))({
      tags: ["alpha", null]
    })).toEqual({
      tags: ["alpha", null]
    })
  })
})
