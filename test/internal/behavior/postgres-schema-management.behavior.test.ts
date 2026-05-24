import { mkdtemp, rm } from "node:fs/promises"
import { join, relative } from "node:path"

// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import * as Pg from "#postgres"
import { Column as C, Table } from "#postgres"
import * as ExpressionAst from "../../../packages/querybuilder/src/internal/expression-ast.js"
import { Casing } from "../../../packages/querybuilder/src/index.ts"
import { planPostgresSchemaDiff } from "../../../packages/database/src/internal/postgres-schema-diff.js"
import { fromDiscoveredValues, toEnumModel, toTableModel, type SchemaModel } from "effect-qb/postgres/metadata"
import { discoverSourceSchema } from "../../../packages/database/src/internal/postgres-source-discovery.js"
import { planPostgresPull } from "../../../packages/database/src/postgres/pull.js"
import * as StdRoot from "#standard"

const repoRoot = process.cwd()

describe("postgres schema management", () => {
  test("source table models use casing metadata as physical identifiers", () => {
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
      organizationSlug: StdRoot.Column.text().pipe(
        StdRoot.Column.references(() => organizations.accountSlug)
      ),
      accountStatus: StdRoot.Column.text(),
      createdAt: StdRoot.Column.datetime()
    }).pipe(
      Casing.withCasing({
        tables: "snake_case",
        columns: "snake_case",
        indexes: "snake_case",
        constraints: "snake_case"
      })
    )
    const memberships = membershipsBase.pipe(
      StdRoot.Table.index("accountStatus"),
      StdRoot.Table.check("AccountStatusCheck", StdRoot.Query.eq(membershipsBase.accountStatus, "active"))
    )

    const model = toTableModel(memberships as unknown as Parameters<typeof toTableModel>[0])
    const foreignKey = model.options.find((option) => option.kind === "foreignKey") as any
    const index = model.options.find((option) => option.kind === "index") as any
    const check = model.options.find((option) => option.kind === "check") as any

    expect(model.name).toBe("membership_records")
    expect(model.columns.map((column) => column.name)).toEqual([
      "id",
      "organization_slug",
      "account_status",
      "created_at"
    ])
    expect(foreignKey.columns).toEqual(["organization_slug"])
    expect(foreignKey.references()).toMatchObject({
      tableName: "organization_accounts",
      columns: ["account_slug"]
    })
    expect(index.columns).toEqual(["account_status"])
    expect(check.name).toBe("account_status_check")
    expect(Pg.SchemaExpression.normalizeDdlExpressionSql(check.predicate)).toBe("account_status = ('active')")
  })

  test("source table models reject invalid Date defaults before normalizing DDL expressions", () => {
    const events = StdRoot.Table.make("events", {
      happenedAt: StdRoot.Column.timestamp().pipe(
        StdRoot.Column.default(StdRoot.Query.literal(new Date("not a date")))
      )
    })

    expect(() => toTableModel(events as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Expected a valid Date value"
    )
  })

  test("source table models reject malformed table options before mapping metadata", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [null]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Table 'users' options require option metadata objects"
    )
  })

  test("source table models reject non-array table options before mapping metadata", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = {}

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Table 'users' options require an array"
    )
  })

  test("source table models reject unknown table option kinds before mapping metadata", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{ kind: "partition", columns: ["id"] }]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Unsupported table option kind"
    )
  })

  test("source table models reject malformed table option names before mapping metadata", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{ kind: "primaryKey", columns: ["id"], name: {} }]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Option 'primaryKey' on table 'users' requires option names to be non-empty strings"
    )

    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{ kind: "index", columns: ["id"], name: {} }]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Option 'index' on table 'users' requires option names to be non-empty strings"
    )
  })

  test("source table models reject malformed table option flags before mapping metadata", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{ kind: "unique", columns: ["id"], deferrable: "yes" }]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Option 'unique' on table 'users' requires boolean flag 'deferrable'"
    )

    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{ kind: "index", columns: ["id"], unique: "yes" }]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Option 'index' on table 'users' requires boolean flag 'unique'"
    )

    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "check",
      name: "users_id_check",
      predicate: users.id,
      noInherit: "yes"
    }]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Option 'check' on table 'users' requires boolean flag 'noInherit'"
    )
  })

  test("source table models reject malformed index key metadata before mapping metadata", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{ kind: "index", keys: [{ kind: "partition" }] }]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Index on table 'users' requires key kind to be column or expression"
    )

    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{ kind: "index", keys: [{ kind: "expression" }] }]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Index on table 'users' requires expression key expressions"
    )
  })

  test("source table models reject malformed index support identifiers before mapping metadata", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{ kind: "index", columns: ["id"], method: {} }]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Index on table 'users' requires index methods to be non-empty strings"
    )

    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "index",
      keys: [{ kind: "column", column: "id", operatorClass: {} }]
    }]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Index on table 'users' requires key operator classes to be non-empty strings"
    )

    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "index",
      keys: [{ kind: "column", column: "id", collation: {} }]
    }]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Index on table 'users' requires key collations to be non-empty strings"
    )
  })

  test("source table models reject malformed foreign key reference identifiers before mapping metadata", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      orgId: StdRoot.Column.uuid()
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "foreignKey",
      columns: ["orgId"],
      references: () => ({ tableName: 0, columns: ["id"] })
    }]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Foreign key on table 'users' requires a referenced table name"
    )

    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "foreignKey",
      columns: ["orgId"],
      references: () => ({ tableName: "orgs", schemaName: 0, columns: ["id"] })
    }]

    expect(() => toTableModel(users as unknown as Parameters<typeof toTableModel>[0])).toThrow(
      "Foreign key on table 'users' requires referenced schema names to be strings"
    )
  })

  test("classifies safe and destructive schema changes", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid(),
      email: StdRoot.Column.text(),
      nickname: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    }).pipe(
      Table.index("email")
    )

    const status = Pg.Schema.make("public").enum("status", ["pending", "active", "archived"] as const)

    const source: SchemaModel = {
      dialect: "postgres",
      enums: [toEnumModel(status as unknown as Parameters<typeof toEnumModel>[0])],
      tables: [toTableModel(users as unknown as Parameters<typeof toTableModel>[0])]
    }

    const database: SchemaModel = {
      dialect: "postgres",
      enums: [toEnumModel(Pg.Schema.make("public").enum("status", ["pending", "active"] as const) as unknown as Parameters<typeof toEnumModel>[0])],
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
      enums: [toEnumModel(Pg.Schema.make("public").enum("status", ["pending", "active"] as const) as unknown as Parameters<typeof toEnumModel>[0])],
      tables: []
    }

    const shrink = planPostgresSchemaDiff({
      dialect: "postgres",
      enums: [toEnumModel(Pg.Schema.make("public").enum("status", ["pending"] as const) as unknown as Parameters<typeof toEnumModel>[0])],
      tables: []
    }, database)

    const reorder = planPostgresSchemaDiff({
      dialect: "postgres",
      enums: [toEnumModel(Pg.Schema.make("public").enum("status", ["active", "pending"] as const) as unknown as Parameters<typeof toEnumModel>[0])],
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

  test("escapes identifiers in handcrafted schema and enum diff SQL", () => {
    const source: SchemaModel = {
      dialect: "postgres",
      enums: [
        {
          kind: "enum",
          schemaName: "audit\"schema",
          name: "status\"type",
          values: ["pending", "active"]
        }
      ],
      tables: []
    }
    const database: SchemaModel = {
      dialect: "postgres",
      enums: [
        {
          kind: "enum",
          schemaName: "audit\"schema",
          name: "status\"type",
          values: ["pending"]
        }
      ],
      tables: []
    }

    const plan = planPostgresSchemaDiff(source, database)

    expect(plan.safeChanges).toEqual([
      expect.objectContaining({
        kind: "alterEnumAddValue",
        sql: `alter type "audit""schema"."status""type" add value if not exists 'active'`
      })
    ])

    const createSchemaPlan = planPostgresSchemaDiff({
      dialect: "postgres",
      enums: [
        {
          kind: "enum",
          schemaName: "audit\"schema",
          name: "event",
          values: ["created"]
        }
      ],
      tables: []
    }, {
      dialect: "postgres",
      enums: [],
      tables: []
    })

    expect(createSchemaPlan.safeChanges).toContainEqual(
      expect.objectContaining({
        kind: "createSchema",
        sql: `create schema if not exists "audit""schema"`,
        rollbackSql: `drop schema if exists "audit""schema" cascade`
      })
    )
  })

  test("renders schema enum column types with quoted qualified identifiers", () => {
    const status = Pg.Schema.make("audit\"schema").enum("status\"type", ["active"] as const)
    const users = StdRoot.Table.make("users", {
      status: status.column()
    })

    const plan = planPostgresSchemaDiff({
      dialect: "postgres",
      enums: [toEnumModel(status as unknown as Parameters<typeof toEnumModel>[0])],
      tables: [toTableModel(users as unknown as Parameters<typeof toTableModel>[0])]
    }, {
      dialect: "postgres",
      enums: [],
      tables: []
    })

    expect(plan.safeChanges).toContainEqual(
      expect.objectContaining({
        kind: "createEnum",
        sql: `create type "audit""schema"."status""type" as enum ('active')`
      })
    )
    expect(plan.safeChanges).toContainEqual(
      expect.objectContaining({
        kind: "createTable",
        sql: `create table "public"."users" ("status" "audit""schema"."status""type" not null)`
      })
    )
  })

  test("does not collapse schema and table identities that contain dots", () => {
    const idColumn = {
      name: "id",
      ddlType: "uuid",
      dbTypeKind: "uuid",
      nullable: false,
      hasDefault: false,
      generated: false
    }
    const source: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: [
        {
          kind: "table",
          schemaName: "tenant.a",
          name: "users",
          columns: [idColumn],
          options: []
        }
      ]
    }
    const database: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: [
        {
          kind: "table",
          schemaName: "tenant",
          name: "a.users",
          columns: [idColumn],
          options: []
        }
      ]
    }

    const plan = planPostgresSchemaDiff(source, database)

    expect(plan.safeChanges).toContainEqual(
      expect.objectContaining({
        kind: "createTable",
        sql: `create table "tenant.a"."users" ("id" uuid not null)`
      })
    )
    expect(plan.unsafeChanges).toContainEqual(
      expect.objectContaining({
        kind: "dropTable",
        sql: `drop table "tenant"."a.users"`
      })
    )
  })

  test("does not collapse schema and enum identities that contain dots", () => {
    const source: SchemaModel = {
      dialect: "postgres",
      enums: [
        {
          kind: "enum",
          schemaName: "tenant.a",
          name: "status",
          values: ["active"]
        }
      ],
      tables: []
    }
    const database: SchemaModel = {
      dialect: "postgres",
      enums: [
        {
          kind: "enum",
          schemaName: "tenant",
          name: "a.status",
          values: ["active"]
        }
      ],
      tables: []
    }

    const plan = planPostgresSchemaDiff(source, database)

    expect(plan.safeChanges).toContainEqual(
      expect.objectContaining({
        kind: "createEnum",
        sql: `create type "tenant.a"."status" as enum ('active')`
      })
    )
    expect(plan.unsafeChanges).toContainEqual(
      expect.objectContaining({
        kind: "dropEnum",
        sql: `drop type "tenant"."a.status"`
      })
    )
  })

  test("does not collapse discovered enum identities that contain dots", () => {
    const tenantAStatus = Pg.Schema.make("tenant.a").enum("status", ["active"] as const)
    const tenantDottedStatus = Pg.Schema.make("tenant").enum("a.status", ["pending"] as const)

    const model = fromDiscoveredValues([tenantAStatus, tenantDottedStatus])

    expect(model.enums).toContainEqual(
      expect.objectContaining({
        schemaName: "tenant.a",
        name: "status",
        values: ["active"]
      })
    )
    expect(model.enums).toContainEqual(
      expect.objectContaining({
        schemaName: "tenant",
        name: "a.status",
        values: ["pending"]
      })
    )
  })

  test("preserves quoted qualified index support identifiers", () => {
    const source: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: [
        {
          kind: "table",
          schemaName: "public",
          name: "users",
          columns: [
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
              kind: "index",
              name: "users_email_support_idx",
              method: "gin",
              keys: [
                {
                  kind: "column",
                  column: "email",
                  collation: `"tenant.a"."special.collation"`,
                  operatorClass: `"ops.schema"."text.pattern_ops"`
                }
              ]
            }
          ]
        }
      ]
    }

    const plan = planPostgresSchemaDiff(source, {
      dialect: "postgres",
      enums: [],
      tables: []
    })

    expect(plan.safeChanges).toContainEqual(
      expect.objectContaining({
        kind: "createIndex",
        sql: `create index "users_email_support_idx" on "public"."users" using gin ("email" collate "tenant.a"."special.collation" "ops.schema"."text.pattern_ops")`
      })
    )
  })

  test("rejects invalid postgres index methods before rendering ddl", () => {
    const source: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: [
        {
          kind: "table",
          schemaName: "public",
          name: "users",
          columns: [
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
              kind: "index",
              method: "gin; drop table users",
              columns: ["email"]
            }
          ]
        }
      ]
    }

    expect(() => planPostgresSchemaDiff(source, {
      dialect: "postgres",
      enums: [],
      tables: []
    })).toThrow("Postgres index method must be an identifier")
  })

  test("rejects invalid postgres foreign key actions before rendering ddl", () => {
    const source: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: [
        {
          kind: "table",
          schemaName: "public",
          name: "orgs",
          columns: [
            {
              name: "id",
              ddlType: "uuid",
              dbTypeKind: "uuid",
              nullable: false,
              hasDefault: false,
              generated: false
            }
          ],
          options: []
        },
        {
          kind: "table",
          schemaName: "public",
          name: "memberships",
          columns: [
            {
              name: "orgId",
              ddlType: "uuid",
              dbTypeKind: "uuid",
              nullable: false,
              hasDefault: false,
              generated: false
            }
          ],
          options: [
            {
              kind: "foreignKey",
              columns: ["orgId"],
              onDelete: "cascade; drop table orgs" as never,
              references: () => ({
                tableName: "orgs",
                schemaName: "public",
                columns: ["id"]
              })
            }
          ]
        }
      ]
    }

    expect(() => planPostgresSchemaDiff(source, {
      dialect: "postgres",
      enums: [],
      tables: []
    })).toThrow("Foreign key action must be noAction, restrict, cascade, setNull, or setDefault")
  })

  test("rejects invalid postgres index key ordering metadata before rendering ddl", () => {
    const invalidOrder: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: [
        {
          kind: "table",
          schemaName: "public",
          name: "users",
          columns: [
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
              kind: "index",
              keys: [{ kind: "column", column: "email", order: "sideways" as never }]
            }
          ]
        }
      ]
    }

    expect(() => planPostgresSchemaDiff(invalidOrder, {
      dialect: "postgres",
      enums: [],
      tables: []
    })).toThrow("Postgres index key order must be asc or desc")

    const invalidNulls: SchemaModel = {
      ...invalidOrder,
      tables: [
        {
          ...invalidOrder.tables[0]!,
          options: [
            {
              kind: "index",
              keys: [{ kind: "column", column: "email", nulls: "middle" as never }]
            }
          ]
        }
      ]
    }

    expect(() => planPostgresSchemaDiff(invalidNulls, {
      dialect: "postgres",
      enums: [],
      tables: []
    })).toThrow("Postgres index key nulls must be first or last")
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
import { Column, Table } from "effect-qb"

const users = Table.make("users", {
  email: Column.text()
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
      expect(plan.updates[0]?.after).toContain(`import { Table, Column } from "effect-qb"`)
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

      const proposalProducts = StdRoot.Table.make("proposal_products", {
        stripe: C.jsonb(Schema.Unknown).pipe(StdRoot.Column.nullable),
        quantity: StdRoot.Column.int()
      }).pipe(
        Table.check("quantity_matches_stripe", (t) => {
          const stripePipe = (t.stripe as Pg.Scalar.Any).pipe as (
            ...operations: ReadonlyArray<(value: Pg.Scalar.Any) => Pg.Scalar.Any>
          ) => Pg.Scalar.Any
          const eq = Pg.Query.eq as unknown as (
            left: Pg.Scalar.Any,
            right: Pg.Scalar.Any
          ) => Pg.Scalar.Any

          const stripeQuantity = stripePipe(
            Pg.Json.json.get(Pg.Json.json.key("line_item")) as (value: Pg.Scalar.Any) => Pg.Scalar.Any,
            Pg.Json.json.text(Pg.Json.json.key("quantity")) as (value: Pg.Scalar.Any) => Pg.Scalar.Any,
            Pg.Cast.to(Pg.Type.text()) as (value: Pg.Scalar.Any) => Pg.Scalar.Any,
            Pg.Cast.to(Pg.Type.int4()) as (value: Pg.Scalar.Any) => Pg.Scalar.Any
          )

          return Pg.Query.or(
            Pg.Query.isNull(t.stripe),
            eq(stripeQuantity, t.quantity as Pg.Scalar.Any)
          )
        })
      )

      const plan = await planPostgresPull(tempDir, { include: ["src/**/*.ts"] }, discovered, {
        dialect: "postgres",
        enums: [],
        tables: [toTableModel(proposalProducts as unknown as Parameters<typeof toTableModel>[0])]
      })

      expect(plan.updates).toHaveLength(1)
      const after = plan.updates[0]?.after ?? ""
      expect(after).toContain(`stripe.pipe(`)
      expect(after).toContain(`Pg.Json.json.get(Pg.Json.json.key("line_item"))`)
      expect(after).toContain(`Pg.Json.json.text(Pg.Json.json.key("quantity"))`)
      expect(after).toContain(`Pg.Cast.to(Pg.Type.text())`)
      expect(after).toContain(`Pg.Cast.to(Pg.Type.int4())`)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("extends boolean groups with raw predicates through pipe", () => {
    type AnyInput = Pg.Scalar.Any | string | number | boolean | Date | null

    const stripe = Pg.Query.column("stripe", Pg.Type.jsonb(), true) as Pg.Scalar.Any
    const quantity = Pg.Query.column("quantity", Pg.Type.int4()) as Pg.Scalar.Any
    const viewedAt = Pg.Query.column("viewed_at", Pg.Type.timestamp(), true) as Pg.Scalar.Any
    const zero = Pg.Query.literal(0) as Pg.Scalar.Any
    const threshold = Pg.Query.literal(new Date("2024-01-01T00:00:00.000Z")) as Pg.Scalar.Any
    const and = Pg.Query.and as (
      ...values: readonly [AnyInput, ...AnyInput[]]
    ) => Pg.Scalar.Any & {
      pipe: (...values: readonly [AnyInput, ...AnyInput[]]) => Pg.Scalar.Any
    }
    const or = Pg.Query.or as (
      ...values: readonly [AnyInput, ...AnyInput[]]
    ) => Pg.Scalar.Any
    const eq = Pg.Query.eq as unknown as (
      left: AnyInput,
      right: AnyInput
    ) => Pg.Scalar.Any
    const gte = Pg.Query.gte as unknown as (
      left: AnyInput,
      right: AnyInput
    ) => Pg.Scalar.Any

    const predicate = and(
      Pg.Query.isNull(stripe),
      eq(quantity, zero)
    ).pipe(
      gte(quantity, 0),
      or(
        Pg.Query.isNull(viewedAt),
        gte(viewedAt, threshold)
      )
    )

    const ast = (predicate as unknown as {
      readonly [ExpressionAst.TypeId]: ExpressionAst.VariadicNode<"and">
    })[ExpressionAst.TypeId]

    expect(ast.kind).toBe("and")
    expect(ast.values).toHaveLength(4)
    expect((ast.values[2] as unknown as {
      readonly [ExpressionAst.TypeId]: ExpressionAst.Any
    })[ExpressionAst.TypeId]).toMatchObject({ kind: "gte" })
    expect((ast.values[3] as unknown as {
      readonly [ExpressionAst.TypeId]: ExpressionAst.Any
    })[ExpressionAst.TypeId]).toMatchObject({ kind: "or" })
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

      const connections = Pg.Schema.make("payment").table("connections", {
        id: StdRoot.Column.uuid()
      }).pipe(
        Table.primaryKey("id")
      )

      const accountMappings = Pg.Schema.make("payment").table("account_mappings", {
        id: StdRoot.Column.uuid(),
        connection_id: StdRoot.Column.uuid()
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
          toTableModel(accountMappings as unknown as Parameters<typeof toTableModel>[0]),
          toTableModel(connections as unknown as Parameters<typeof toTableModel>[0])
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

  test("renders pulled quoted sequence defaults with sequence helpers", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-pull-sequence-"))
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
      const database: SchemaModel = {
        dialect: "postgres",
        enums: [],
        tables: [{
          kind: "table",
          schemaName: "Audit\"Schema",
          name: "users",
          columns: [{
            name: "id",
            ddlType: "int8",
            dbTypeKind: "int8",
            nullable: false,
            hasDefault: true,
            generated: false,
            defaultSql: `nextval('"Audit""Schema"."User""ID_seq"'::regclass)`
          }],
          options: []
        }]
      }

      const plan = await planPostgresPull(tempDir, { include: ["src/**/*.ts"] }, discovered, database)

      expect(plan.updates).toHaveLength(1)
      const after = plan.updates[0]?.after ?? ""
      expect(after).toContain(`const Audit_Schema = Pg.Schema.make("Audit\\"Schema")`)
      expect(after).toContain(`Column.default(Pg.Function.nextVal(Audit_Schema.sequence("User\\"ID_seq")))`)
      expect(after).not.toContain("SchemaExpression.fromSql")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("renders pulled dotted-schema sequence defaults with sequence helpers", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-pull-dotted-sequence-"))
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
      const database: SchemaModel = {
        dialect: "postgres",
        enums: [],
        tables: [{
          kind: "table",
          schemaName: "tenant.a",
          name: "users",
          columns: [{
            name: "id",
            ddlType: "int8",
            dbTypeKind: "int8",
            nullable: false,
            hasDefault: true,
            generated: false,
            defaultSql: `nextval('"tenant.a"."users_id_seq"'::regclass)`
          }],
          options: []
        }]
      }

      const plan = await planPostgresPull(tempDir, { include: ["src/**/*.ts"] }, discovered, database)

      expect(plan.updates).toHaveLength(1)
      const after = plan.updates[0]?.after ?? ""
      expect(after).toContain(`const tenant_a = Pg.Schema.make("tenant.a")`)
      expect(after).toContain(`Column.default(Pg.Function.nextVal(tenant_a.sequence("users_id_seq")))`)
      expect(after).not.toContain(`Pg.Schema.make("tenant").sequence("a.users_id_seq")`)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("renders pulled quoted enum arrays with enum helpers", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-pull-enum-array-"))
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
      const database: SchemaModel = {
        dialect: "postgres",
        enums: [{
          kind: "enum",
          schemaName: "AuditSchema",
          name: "StatusType",
          values: ["active"]
        }],
        tables: [{
          kind: "table",
          schemaName: "AuditSchema",
          name: "users",
          columns: [{
            name: "statuses",
            ddlType: `"AuditSchema"."StatusType"[]`,
            dbTypeKind: "StatusType[]",
            typeSchema: "AuditSchema",
            nullable: false,
            hasDefault: false,
            generated: false
          }],
          options: []
        }]
      }

      const plan = await planPostgresPull(tempDir, { include: ["src/**/*.ts"] }, discovered, database)

      expect(plan.updates).toHaveLength(1)
      const after = plan.updates[0]?.after ?? ""
      expect(after).toContain(`statuses: AuditSchema.enum("StatusType", ["active"]).column().pipe(Pg.Column.array())`)
      expect(after).not.toContain("Column.custom(Schema.Unknown")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("rejects duplicate discovered table identities across source files", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-discovery-"))
    try {
await Bun.write(join(tempDir, "users-a.ts"), `
import { Column, Table } from "effect-qb"

export const users = Table.make("users", {
  id: Column.uuid()
})
`)

      await Bun.write(join(tempDir, "users-b.ts"), `
import { Column, Table } from "effect-qb"

export const usersDuplicate = Table.make("users", {
  id: Column.uuid()
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
import { Column as Col, Table } from "effect-qb"

export const users = Table.make("users", {
  id: Col.uuid()
})
`)

      await Bun.write(join(tempDir, "b-schema.ts"), `
import * as Pg from "#postgres"
import { Column as Col } from "effect-qb"

const admin = Pg.Schema.make("admin")

export const audits = admin.table("audits", {
  id: Col.uuid()
})
`)

await Bun.write(join(tempDir, "c-class.ts"), `
import { Column, Table } from "effect-qb"

export class Sessions extends Table.Class<Sessions>("sessions")({
  id: Column.uuid().pipe(Column.primaryKey)
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

  test("discovers schema namespaces built from Pg.Schema.make with casing pipes", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-discovery-schema-make-"))
    try {
await Bun.write(join(tempDir, "schema-make.ts"), `
import { Casing, Column } from "effect-qb"
import * as Pg from "#postgres"

const Analytics = Pg.Schema.make("analytics").pipe(
  Casing.withCasing({
    tables: "snake_case",
    columns: "snake_case"
  })
)

export const metrics = Analytics.table("UserMetrics", {
  id: Column.uuid()
})
`)

      const discovered = await discoverSourceSchema(repoRoot, {
        include: [`${relative(repoRoot, tempDir).replaceAll("\\", "/")}/**/*.ts`]
      })

      expect(discovered.declarations.map((declaration) => declaration.kind)).toEqual([
        "tableSchema"
      ])
      expect(discovered.model.tables.map((table) => `${table.schemaName ?? "public"}.${table.name}`)).toEqual([
        "analytics.user_metrics"
      ])
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("rejects nested schema declarations", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-discovery-nested-"))
    try {
await Bun.write(join(tempDir, "nested.ts"), `
import { Column, Table } from "effect-qb"

export function loadUsers() {
  const users = Table.make("users", {
    id: Column.uuid()
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

  test("discovers wrapped top-level schema declarations", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-schema-discovery-computed-"))
    try {
await Bun.write(join(tempDir, "computed.ts"), `
import { Column, Table } from "effect-qb"

export const users = (() => Table.make("users", {
  id: Column.uuid()
}))()
`)

      const discovered = await discoverSourceSchema(repoRoot, {
        include: [`${relative(repoRoot, tempDir).replaceAll("\\", "/")}/**/*.ts`]
      })

      expect(discovered.declarations).toHaveLength(1)
      expect(discovered.declarations[0]?.kind).toBe("tableFactory")
      expect(discovered.bindings[0]?.kind).toBe("table")
      expect(discovered.model.tables.map((table) => `${table.schemaName ?? "public"}.${table.name}`)).toEqual([
        "public.users"
      ])
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
