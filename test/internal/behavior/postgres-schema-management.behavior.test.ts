import { mkdtemp, rm } from "node:fs/promises"
import { join, relative } from "node:path"

import { describe, expect, test } from "bun:test"

import { SchemaManagement, Table } from "#postgres"
import { Column as C } from "#postgres"
import { planPostgresSchemaDiff } from "../../../src/internal/postgres-schema-diff.js"
import { toEnumModel, toTableModel, type SchemaModel } from "../../../src/internal/postgres-schema-model.js"
import { discoverSourceSchema } from "../../../src/internal/postgres-source-discovery.js"
import { planPostgresPull } from "../../../src/internal/postgres-pull.js"
import { unsafeAny } from "../../helpers/unsafe.ts"

const repoRoot = process.cwd()

describe("postgres schema management", () => {
  test("classifies safe and destructive schema changes", () => {
    const users = Table.make("users", {
      id: C.uuid(),
      email: C.text(),
      nickname: C.text().pipe(C.nullable)
    }).pipe(
      Table.index("email")
    )

    const status = SchemaManagement.enumType("status", ["pending", "active", "archived"] as const)

    const source: SchemaModel = {
      dialect: "postgres",
      enums: [toEnumModel(unsafeAny(status))],
      tables: [toTableModel(unsafeAny(users))]
    }

    const database: SchemaModel = {
      dialect: "postgres",
      enums: [toEnumModel(unsafeAny(SchemaManagement.enumType("status", ["pending", "active"] as const)))],
      tables: [{
        kind: "table",
        schemaName: "public",
        name: "users",
        columns: [
          {
            name: "id",
            ddlType: "uuid",
            dbTypeKind: "uuid",
            nullable: false,
            hasDefault: false,
            generated: false
          },
          {
            name: "email",
            ddlType: "text",
            dbTypeKind: "text",
            nullable: false,
            hasDefault: false,
            generated: false
          },
          {
            name: "legacy_flag",
            ddlType: "boolean",
            dbTypeKind: "bool",
            nullable: false,
            hasDefault: false,
            generated: false
          }
        ],
        options: []
      }]
    }

    const plan = planPostgresSchemaDiff(source, database)

    expect(plan.safeChanges.some((change) => change.kind === "alterEnumAddValue")).toBe(true)
    expect(plan.safeChanges.some((change) => change.kind === "addColumn" && change.summary.includes("nickname"))).toBe(true)
    expect(plan.safeChanges.some((change) => change.kind === "createIndex")).toBe(true)
    expect(plan.unsafeChanges.some((change) => change.kind === "dropColumn" && change.summary.includes("legacy_flag"))).toBe(true)
  })

  test("classifies enum shrink and reorder as manual destructive changes", () => {
    const database: SchemaModel = {
      dialect: "postgres",
      enums: [toEnumModel(unsafeAny(SchemaManagement.enumType("status", ["pending", "active"] as const)))],
      tables: []
    }

    const shrink = planPostgresSchemaDiff({
      dialect: "postgres",
      enums: [toEnumModel(unsafeAny(SchemaManagement.enumType("status", ["pending"] as const)))],
      tables: []
    }, database)

    const reorder = planPostgresSchemaDiff({
      dialect: "postgres",
      enums: [toEnumModel(unsafeAny(SchemaManagement.enumType("status", ["active", "pending"] as const)))],
      tables: []
    }, database)

    expect(shrink.manualChanges).toEqual([
      expect.objectContaining({
        kind: "manual",
        summary: "manual enum migration required for public.status"
      })
    ])
    expect(reorder.manualChanges).toEqual([
      expect.objectContaining({
        kind: "manual",
        summary: "manual enum migration required for public.status"
      })
    ])
  })

  test("builds pull updates for canonical factory tables", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-pull-"))
    try {
      const filePath = join(tempDir, "schema.ts")
      await Bun.write(filePath, `
import { Column as C, Table } from "#postgres"

const users = Table.make("users", {
  email: C.text()
})
`)

      const discovered = await discoverSourceSchema(repoRoot, {
        include: [`${relative(repoRoot, tempDir).replaceAll("\\", "/")}/**/*.ts`]
      })

      const database: SchemaModel = {
        dialect: "postgres",
        enums: [],
        tables: [{
          kind: "table",
          schemaName: "public",
          name: "users",
          columns: [
            {
              name: "id",
              ddlType: "uuid",
              dbTypeKind: "uuid",
              nullable: false,
              hasDefault: false,
              generated: false
            },
            {
              name: "email",
              ddlType: "text",
              dbTypeKind: "text",
              nullable: false,
              hasDefault: false,
              generated: false
            }
          ],
          options: [
            {
              kind: "primaryKey",
              columns: ["id"]
            }
          ]
        }]
      }

      const plan = await planPostgresPull(repoRoot, discovered, database)

      expect(plan.updates).toHaveLength(1)
      expect(plan.updates[0]?.after).toContain(`import { Table as __EffectQbPullTable`)
      expect(plan.updates[0]?.after).toContain(`const users = __EffectQbPullTable.make("users"`)
      expect(plan.updates[0]?.after).toContain(`id: __EffectQbPullColumn.uuid()`)
      expect(plan.updates[0]?.after).toContain(`__EffectQbPullTable.primaryKey(["id"] as const)`)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("rejects duplicate discovered table identities across source files", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-discovery-"))
    try {
      await Bun.write(join(tempDir, "users-a.ts"), `
import { Column as C, Table } from "#postgres"

export const users = Table.make("users", {
  id: C.uuid()
})
`)

      await Bun.write(join(tempDir, "users-b.ts"), `
import { Column as C, Table } from "#postgres"

export const usersDuplicate = Table.make("users", {
  id: C.uuid()
})
`)

      await expect(discoverSourceSchema(repoRoot, {
        include: [`${relative(repoRoot, tempDir).replaceAll("\\", "/")}/**/*.ts`]
      })).rejects.toThrow("Duplicate discovered table identity 'public.users'")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("discovers aliased, namespace, and class table declarations", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-discovery-shapes-"))
    try {
      await Bun.write(join(tempDir, "a-factory.ts"), `
import { Column as Col, Table as PgTable } from "#postgres"

export const users = PgTable.make("users", {
  id: Col.uuid()
})
`)

      await Bun.write(join(tempDir, "b-schema.ts"), `
import { Column as Col, Table as PgTable } from "#postgres"

const admin = PgTable.schema("admin")

export const audits = admin.table("audits", {
  id: Col.uuid()
})
`)

      await Bun.write(join(tempDir, "c-class.ts"), `
import * as Pg from "#postgres"

export class Sessions extends Pg.Table.Class<Sessions>("sessions")({
  id: Pg.Column.uuid().pipe(Pg.Column.primaryKey)
}) {}
`)

      const discovered = await discoverSourceSchema(repoRoot, {
        include: [`${relative(repoRoot, tempDir).replaceAll("\\", "/")}/**/*.ts`]
      })

      expect(discovered.declarations.map((declaration) => declaration.kind)).toEqual([
        "tableFactory",
        "tableSchema",
        "tableClass"
      ])
      expect(discovered.model.tables.map((table) => `${table.schemaName ?? "public"}.${table.name}`)).toEqual([
        "public.users",
        "admin.audits",
        "public.sessions"
      ])
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("rejects nested schema management declarations", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-discovery-nested-"))
    try {
      await Bun.write(join(tempDir, "nested.ts"), `
import { Column as C, Table } from "#postgres"

export function loadUsers() {
  const users = Table.make("users", {
    id: C.uuid()
  })
  return users
}
`)

      await expect(discoverSourceSchema(repoRoot, {
        include: [`${relative(repoRoot, tempDir).replaceAll("\\", "/")}/**/*.ts`]
      })).rejects.toThrow("Nested schema management declarations are not supported")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("rejects computed schema management declarations", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-discovery-computed-"))
    try {
      await Bun.write(join(tempDir, "computed.ts"), `
import { Column as C, Table } from "#postgres"

export const users = (() => Table.make("users", {
  id: C.uuid()
}))()
`)

      await expect(discoverSourceSchema(repoRoot, {
        include: [`${relative(repoRoot, tempDir).replaceAll("\\", "/")}/**/*.ts`]
      })).rejects.toThrow("Non-canonical schema management declaration 'users'")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
