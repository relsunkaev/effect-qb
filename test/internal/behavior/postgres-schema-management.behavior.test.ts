import { mkdtemp, rm } from "node:fs/promises"
import { join, relative } from "node:path"

import { describe, expect, test } from "bun:test"

import { SchemaManagement, Table } from "#postgres"
import { Column as C } from "#postgres"
import { planPostgresSchemaDiff } from "../../../src/internal/postgres-schema-diff.js"
import { toEnumModel, toTableModel, type SchemaModel } from "../../../src/internal/postgres-schema-model.js"
import { discoverSourceSchema } from "../../../src/internal/postgres-source-discovery.js"
import { planPostgresPull } from "../../../src/internal/postgres-pull.js"

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
      enums: [toEnumModel(status)],
      tables: [toTableModel(users)]
    }

    const database: SchemaModel = {
      dialect: "postgres",
      enums: [toEnumModel(SchemaManagement.enumType("status", ["pending", "active"] as const))],
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
})
