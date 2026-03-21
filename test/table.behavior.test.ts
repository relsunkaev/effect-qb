import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import { Column as C, Expression, Table } from "../src/postgres.ts"
import { unsafeAny, unsafeNever } from "./helpers/unsafe.ts"

describe("table behavior", () => {
  test("rejects conflicting inline and table-level primary keys", () => {
    expect(() => Table.make("memberships", {
      orgId: C.uuid().pipe(C.primaryKey),
      userId: C.uuid(),
      role: C.text()
    }).pipe(
      Table.primaryKey(["orgId", "userId"] as const)
    )).toThrow("Inline primary keys conflict with table-level primary key declaration")
  })

  test("rejects multiple table-level primary key declarations", () => {
    expect(() => Table.make("memberships", {
      orgId: C.uuid(),
      userId: C.uuid()
    }).pipe(
      Table.primaryKey("orgId"),
      Table.primaryKey("userId")
    )).toThrow("Only one primary key declaration is allowed")
  })

  test("supports composite primary keys and preserves declared column order", () => {
    const memberships = Table.make("memberships", {
      orgId: C.uuid(),
      userId: C.uuid(),
      role: C.text()
    }).pipe(
      Table.primaryKey(["orgId", "userId"] as const),
      Table.index(["role", "orgId"] as const)
    )

    expect(memberships[Table.TypeId].primaryKey).toEqual(["orgId", "userId"])
    expect(memberships[Table.OptionsSymbol]).toEqual([
      { kind: "primaryKey", columns: ["orgId", "userId"] },
      { kind: "index", columns: ["role", "orgId"] }
    ])
    expect(Schema.decodeUnknownSync(memberships.schemas.update)({
      role: "admin",
      orgId: "ignored"
    })).toEqual({
      role: "admin"
    })
  })

  test("rejects nullable columns in composite primary keys", () => {
    expect(() => Table.primaryKey(["orgId", "slug"] as const)(
      unsafeNever(Table.make("memberships", {
        orgId: C.uuid(),
        slug: C.text().pipe(C.nullable)
      }))
    )).toThrow("Primary key column 'slug' cannot be nullable")
  })

  test("aliasing an alias preserves the physical base table and normalized options", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      slug: C.text().pipe(C.unique),
      email: C.text()
    }).pipe(
      Table.index(["email", "slug"] as const)
    )

    const onceAliased = Table.alias(users, "u1")
    const twiceAliased = unsafeAny(Table.alias(unsafeNever(onceAliased), "u2"))

    expect(twiceAliased[Table.TypeId]).toMatchObject({
      name: "u2",
      baseName: "users",
      kind: "alias",
      primaryKey: ["id"]
    })
    expect(unsafeAny(twiceAliased.id![Expression.TypeId].source)).toEqual({
      tableName: "u2",
      columnName: "id",
      baseTableName: "users"
    })
    expect(twiceAliased[Table.OptionsSymbol]).toEqual(users[Table.OptionsSymbol])
  })

  test("factory and class tables derive the same runtime schemas for equivalent definitions", () => {
    const factoryUsers = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey, C.generated),
      email: C.text().pipe(C.unique),
      bio: C.text().pipe(C.nullable),
      createdAt: C.timestamp().pipe(C.default)
    }).pipe(
      Table.index("email")
    )

    class ClassUsers extends Table.Class<ClassUsers>("users")({
      id: C.uuid().pipe(C.primaryKey, C.generated),
      email: C.text().pipe(C.unique),
      bio: C.text().pipe(C.nullable),
      createdAt: C.timestamp().pipe(C.default)
    }) {
      static override readonly [Table.options] = [Table.index("email")]
    }

    const input = {
      email: "alice@example.com",
      bio: null
    }

    expect(Schema.decodeUnknownSync(factoryUsers.schemas.insert)(input)).toEqual(
      Schema.decodeUnknownSync(ClassUsers.schemas.insert)(input)
    )
    expect(Schema.decodeUnknownSync(factoryUsers.schemas.update)({
      bio: null
    })).toEqual(
      Schema.decodeUnknownSync(ClassUsers.schemas.update)({
        bio: null
      })
    )
    expect(factoryUsers[Table.OptionsSymbol]).toEqual(ClassUsers[Table.OptionsSymbol])
  })

  test("column schema pipes feed derived table schemas", () => {
    const events = Table.make("events", {
      happenedOn: C.date().pipe(C.schema(Schema.DateFromString))
    })

    const decoded = Schema.decodeUnknownSync(events.schemas.select)({
      happenedOn: "2026-03-20"
    })

    expect(decoded.happenedOn).toBeInstanceOf(Date)
    expect(decoded.happenedOn.toISOString()).toBe("2026-03-20T00:00:00.000Z")
  })
})
