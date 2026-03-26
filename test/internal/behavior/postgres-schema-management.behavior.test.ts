import { mkdtemp, rm } from "node:fs/promises"
import { join, relative } from "node:path"

// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import * as Pg from "#postgres"
import { Column as C, Table } from "#postgres"
import * as ExpressionAst from "../../../packages/querybuilder/src/internal/expression-ast.js"
import { planPostgresSchemaDiff } from "../../../packages/database/src/internal/postgres-schema-diff.js"
import { toEnumModel, toTableModel, type SchemaModel } from "effect-qb/postgres/metadata"
import { discoverSourceSchema } from "../../../packages/database/src/internal/postgres-source-discovery.js"
import { planPostgresPull } from "../../../packages/database/src/postgres/pull.js"
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

    const status = Pg.schema("public").enum("status", ["pending", "active", "archived"] as const)

    const source: SchemaModel = {
      dialect: "postgres",
      enums: [toEnumModel(unsafeAny(status))],
      tables: [toTableModel(unsafeAny(users))]
    }

    const database: SchemaModel = {
      dialect: "postgres",
      enums: [toEnumModel(unsafeAny(Pg.schema("public").enum("status", ["pending", "active"] as const)))],
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
      enums: [toEnumModel(unsafeAny(Pg.schema("public").enum("status", ["pending", "active"] as const)))],
      tables: []
    }

    const shrink = planPostgresSchemaDiff({
      dialect: "postgres",
      enums: [toEnumModel(unsafeAny(Pg.schema("public").enum("status", ["pending"] as const)))],
      tables: []
    }, database)

    const reorder = planPostgresSchemaDiff({
      dialect: "postgres",
      enums: [toEnumModel(unsafeAny(Pg.schema("public").enum("status", ["active", "pending"] as const)))],
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

  test("detects table, column, constraint, index, and enum renames", () => {
    const source: SchemaModel = {
      dialect: "postgres",
      enums: [
        {
          kind: "enum",
          schemaName: "public",
          name: "status_new",
          values: ["pending", "active"]
        } as any
      ],
      tables: [
        {
          kind: "table",
          schemaName: "public",
          name: "members",
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
        } as any,
        {
          kind: "table",
          schemaName: "public",
          name: "contacts",
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
              name: "phone",
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
        } as any,
        {
          kind: "table",
          schemaName: "public",
          name: "flags",
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
              name: "code",
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
            },
            {
              kind: "unique",
              name: "flags_code_new_key",
              columns: ["code"]
            }
          ]
        } as any,
        {
          kind: "table",
          schemaName: "public",
          name: "events",
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
              name: "createdAt",
              ddlType: "timestamp without time zone",
              dbTypeKind: "timestamp",
              nullable: false,
              hasDefault: false,
              generated: false
            }
          ],
          options: [
            {
              kind: "primaryKey",
              columns: ["id"]
            },
            {
              kind: "index",
              name: "events_created_at_new_idx",
              columns: ["createdAt"]
            }
          ]
        } as any
      ]
    }

    const database: SchemaModel = {
      dialect: "postgres",
      enums: [
        {
          kind: "enum",
          schemaName: "public",
          name: "status_old",
          values: ["pending", "active"]
        } as any
      ],
      tables: [
        {
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
        } as any,
        {
          kind: "table",
          schemaName: "public",
          name: "contacts",
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
              name: "emailAddress",
              ddlType: "text",
              dbTypeKind: "text",
              nullable: false,
              hasDefault: false,
              generated: false
            },
            {
              name: "phone",
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
        } as any,
        {
          kind: "table",
          schemaName: "public",
          name: "flags",
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
              name: "code",
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
            },
            {
              kind: "unique",
              name: "flags_code_legacy_key",
              columns: ["code"]
            }
          ]
        } as any,
        {
          kind: "table",
          schemaName: "public",
          name: "events",
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
              name: "createdAt",
              ddlType: "timestamp without time zone",
              dbTypeKind: "timestamp",
              nullable: false,
              hasDefault: false,
              generated: false
            }
          ],
          options: [
            {
              kind: "primaryKey",
              columns: ["id"]
            },
            {
              kind: "index",
              name: "events_created_idx",
              columns: ["createdAt"]
            }
          ]
        } as any
      ]
    }

    const plan = planPostgresSchemaDiff(source, database)
    expect(plan.changes.map((change) => change.kind).sort()).toEqual([
      "renameColumn",
      "renameConstraint",
      "renameConstraint",
      "renameEnum",
      "renameIndex",
      "renameTable"
    ])
    expect(plan.safeChanges.map((change) => change.kind).sort()).toEqual([
      "renameColumn",
      "renameConstraint",
      "renameConstraint",
      "renameEnum",
      "renameIndex",
      "renameTable"
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

      const plan = await planPostgresPull(repoRoot, { include: ["**/*.ts"] }, discovered, database)

      expect(plan.updates).toHaveLength(1)
      expect(plan.updates[0]?.after).toContain(`import * as Pg from "effect-qb/postgres"`)
      expect(plan.updates[0]?.after).toContain(`import { Table, Column } from "effect-qb/postgres"`)
      expect(plan.updates[0]?.after).toContain(`import * as Schema from "effect/Schema"`)
      expect(plan.updates[0]?.after).toContain(`const users = Table.make("users"`)
      expect(plan.updates[0]?.after).toContain(`id: Column.uuid()`)
      expect(plan.updates[0]?.after).toContain(`Table.primaryKey(["id"])`)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("renders pulled json and cast chains with pipe helpers", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-pull-pipe-"))
    try {
      const discovered = {
        declarations: [],
        bindings: [],
        model: {
          dialect: "postgres",
          enums: [],
          tables: []
        }
      } as const

      const proposalProducts = Table.make("proposal_products", {
        stripe: C.jsonb(Schema.Unknown).pipe(C.nullable),
        quantity: C.int()
      }).pipe(
        Table.check("quantity_matches_stripe", (t) => {
          const stripeQuantity = unsafeAny(t.stripe).pipe(
            Pg.Function.json.get(Pg.Function.json.key("line_item")),
            Pg.Function.json.text(Pg.Function.json.key("quantity")),
            Pg.Cast.to(Pg.Type.text()),
            Pg.Cast.to(Pg.Type.int4())
          )

          return unsafeAny(Pg.Query.or(
            Pg.Query.isNull(t.stripe),
            Pg.Query.eq(unsafeAny(stripeQuantity), t.quantity)
          ))
        })
      )

      const plan = await planPostgresPull(tempDir, { include: ["src/**/*.ts"] }, discovered, {
        dialect: "postgres",
        enums: [],
        tables: [toTableModel(unsafeAny(proposalProducts))]
      })

      expect(plan.updates).toHaveLength(1)
      const after = plan.updates[0]?.after ?? ""
      expect(after).toContain(`stripe.pipe(`)
      expect(after).toContain(`Pg.Function.json.get(Pg.Function.json.key("line_item"))`)
      expect(after).toContain(`Pg.Function.json.text(Pg.Function.json.key("quantity"))`)
      expect(after).toContain(`Pg.Cast.to(Pg.Type.text())`)
      expect(after).toContain(`Pg.Cast.to(Pg.Type.int4())`)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("extends boolean groups with raw predicates through pipe", () => {
    const predicate = Pg.Query.and(
      Pg.Query.isNull(Pg.Query.column("stripe", Pg.Type.jsonb(), true)),
      Pg.Query.eq(
        Pg.Query.column("quantity", Pg.Type.int4()),
        Pg.Query.literal(0)
      )
    ).pipe(
      Pg.Query.gte(Pg.Query.column("quantity", Pg.Type.int4()), 0),
      Pg.Query.or(
        Pg.Query.isNull(Pg.Query.column("viewed_at", Pg.Type.timestamp(), true)),
        Pg.Query.gte(Pg.Query.column("viewed_at", Pg.Type.timestamp(), true), Pg.Query.literal(new Date("2024-01-01T00:00:00.000Z")))
      )
    )

    const ast = unsafeAny(predicate)[ExpressionAst.TypeId] as ExpressionAst.VariadicNode<"and">

    expect(ast.kind).toBe("and")
    expect(ast.values).toHaveLength(4)
    expect(unsafeAny(ast.values[2])[ExpressionAst.TypeId]).toMatchObject({ kind: "gte" })
    expect(unsafeAny(ast.values[3])[ExpressionAst.TypeId]).toMatchObject({ kind: "or" })
  })

  test("orders pulled additions so foreign-key targets appear first", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-pull-order-"))
    try {
      const discovered = {
        declarations: [],
        bindings: [],
        model: {
          dialect: "postgres",
          enums: [],
          tables: []
        }
      } as const

      const connections = Pg.schema("payment").table("connections", {
        id: C.uuid()
      }).pipe(
        Table.primaryKey("id")
      )

      const accountMappings = Pg.schema("payment").table("account_mappings", {
        id: C.uuid(),
        connection_id: C.uuid()
      }).pipe(
        Table.primaryKey("id"),
        Table.foreignKey({
          columns: ["connection_id"],
          target: () => connections,
          referencedColumns: ["id"]
        })
      )

      const database: SchemaModel = {
        dialect: "postgres",
        enums: [],
        tables: [
          toTableModel(unsafeAny(accountMappings)),
          toTableModel(unsafeAny(connections))
        ]
      }

      const plan = await planPostgresPull(tempDir, { include: ["src/**/*.ts"] }, discovered, database)

      expect(plan.updates).toHaveLength(1)
      const after = plan.updates[0]?.after ?? ""
      expect(after.indexOf("connections =")).toBeGreaterThan(-1)
      expect(after.indexOf("account_mappings =")).toBeGreaterThan(after.indexOf("connections ="))
      expect(after).toContain(`Column.foreignKey(() => connections.id)`)
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
import * as Pg from "#postgres"
import { Column as Col, Table as PgTable } from "#postgres"

const admin = Pg.schema("admin")

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

  test("rejects nested schema declarations", async () => {
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
      })).rejects.toThrow("Nested schema declarations are not supported")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("rejects computed schema declarations", async () => {
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
      })).rejects.toThrow("Non-canonical schema declaration 'users'")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
