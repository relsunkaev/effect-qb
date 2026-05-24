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
import {
  discoverSourceSchema,
  type DiscoveredSourceSchema
} from "../../../packages/database/src/internal/postgres-source-discovery.js"
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

  test("source table models preserve malformed table option entries without runtime validation", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [null]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    expect(model.options).toEqual(
      expect.arrayContaining([null])
    )
  })

  test("source table models preserve non-array table options without runtime validation", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = {}

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    expect(model.options).toEqual(
      expect.arrayContaining([{}])
    )
  })

  test("source table models preserve unknown table option kinds without runtime validation", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{ kind: "partition", columns: ["id"] }]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    expect(model.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "partition",
          columns: ["id"]
        })
      ])
    )
  })

  test("source table models preserve table option names without runtime validation", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    }).pipe(
      Casing.withCasing({
        indexes: "snake_case",
        constraints: "snake_case"
      })
    )
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [
      { kind: "primaryKey", columns: ["id"], name: {} },
      { kind: "index", columns: ["id"], name: {} }
    ]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    const primaryKey = model.options.find((option) => option.kind === "primaryKey")
    const index = model.options.find((option) => option.kind === "index")

    expect(primaryKey).toMatchObject({
      kind: "primaryKey",
      name: {}
    })
    expect(index).toMatchObject({
      kind: "index",
      name: {}
    })
  })

  test("source table models preserve table option flags without runtime validation", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [
      { kind: "unique", columns: ["id"], deferrable: "yes" },
      { kind: "index", columns: ["id"], unique: "yes" },
      {
        kind: "check",
        name: "users_id_check",
        predicate: users.id,
        noInherit: "yes"
      }
    ]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    const unique = model.options.find((option) => option.kind === "unique")
    const index = model.options.find((option) => option.kind === "index")
    const check = model.options.find((option) => option.kind === "check")

    expect(unique).toMatchObject({
      kind: "unique",
      deferrable: "yes"
    })
    expect(index).toMatchObject({
      kind: "index",
      unique: "yes"
    })
    expect(check).toMatchObject({
      kind: "check",
      noInherit: "yes"
    })
  })

  test("source table models preserve malformed check metadata without runtime validation", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    }).pipe(
      Casing.withCasing({
        constraints: "snake_case"
      })
    )
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "check",
      name: {},
      predicate: "id is not null"
    }]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    const check = model.options.find((option) => option.kind === "check")
    expect(check).toMatchObject({
      kind: "check",
      name: {},
      predicate: "id is not null"
    })
  })

  test("source table models preserve empty option column arrays with casing", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    }).pipe(
      Casing.withCasing({
        columns: "snake_case"
      })
    )
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "unique",
      columns: []
    }]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    const unique = model.options.find((option) => option.kind === "unique")
    expect(unique).toMatchObject({
      kind: "unique",
      columns: []
    })
  })

  test("source table models preserve malformed non-index option columns with casing", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    }).pipe(
      Casing.withCasing({
        columns: "snake_case"
      })
    )
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [
      {
        kind: "primaryKey",
        columns: "id"
      },
      {
        kind: "unique",
        columns: "id"
      }
    ]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    const primaryKey = model.options.find((option) => option.kind === "primaryKey")
    const unique = model.options.find((option) => option.kind === "unique")
    expect(primaryKey).toMatchObject({
      kind: "primaryKey",
      columns: "id"
    })
    expect(unique).toMatchObject({
      kind: "unique",
      columns: "id"
    })
  })

  test("source table models preserve malformed index key metadata without runtime validation", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "index",
      keys: [{ kind: "partition" }, { kind: "expression" }, { kind: "column", column: {} }]
    }]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    const index = model.options.find((option) => option.kind === "index")
    expect(index).toMatchObject({
      kind: "index",
      keys: [
        { kind: "partition" },
        { kind: "expression" },
        { kind: "column", column: {} }
      ]
    })

    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "index",
      keys: {}
    }]

    const malformedObjectModel = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    const malformedObjectIndex = malformedObjectModel.options.find((option) => option.kind === "index")
    expect(malformedObjectIndex).toMatchObject({
      kind: "index",
      keys: {}
    })
  })

  test("source table models preserve null index key entries without runtime validation", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "index",
      keys: [null, { kind: "column", column: "id" }]
    }]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    const index = model.options.find((option) => option.kind === "index")
    expect(index).toMatchObject({
      kind: "index",
      keys: [null, { kind: "column", column: "id" }]
    })
  })

  test("source table models preserve empty index key arrays without runtime validation", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "index",
      keys: []
    }]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    const index = model.options.find((option) => option.kind === "index")
    expect(index).toMatchObject({
      kind: "index",
      keys: []
    })
  })

  test("source table models preserve malformed index columns without runtime validation", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    }).pipe(
      Casing.withCasing({
        columns: "snake_case"
      })
    )
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "index",
      columns: "id"
    }]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    const index = model.options.find((option) => option.kind === "index")
    expect(index).toMatchObject({
      kind: "index",
      columns: "id"
    })
  })

  test("source table models preserve index support identifiers without runtime validation", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [
      { kind: "index", columns: ["id"], method: {} },
      { kind: "index", include: {} },
      { kind: "index", columns: ["id"], predicate: "id is not null" },
      {
        kind: "index",
        keys: [{ kind: "column", column: "id", operatorClass: {} }]
      },
      {
        kind: "index",
        keys: [{ kind: "column", column: "id", collation: {} }]
      }
    ]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])

    expect(model.options[0]).toMatchObject({
      kind: "index",
      method: {}
    })
    expect(model.options[1]).toMatchObject({
      kind: "index",
      include: {}
    })
    expect(model.options[2]).toMatchObject({
      kind: "index",
      predicate: "id is not null"
    })
    expect(model.options[3]).toMatchObject({
      kind: "index",
      keys: [
        expect.objectContaining({
          operatorClass: {}
        })
      ]
    })
    expect(model.options[4]).toMatchObject({
      kind: "index",
      keys: [
        expect.objectContaining({
          collation: {}
        })
      ]
    })
  })

  test("source table models preserve foreign key reference identifiers without runtime validation", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      orgId: StdRoot.Column.uuid()
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [
      {
        kind: "foreignKey",
        columns: ["orgId"],
        references: () => ({ tableName: 0, columns: ["id"] })
      },
      {
        kind: "foreignKey",
        columns: ["orgId"],
        references: () => ({ tableName: "orgs", schemaName: 0, columns: ["id"] })
      },
      {
        kind: "foreignKey",
        columns: ["orgId"],
        references: () => ({
          tableName: 0,
          schemaName: 0,
          columns: ["id"],
          knownColumns: [0],
          casing: {
            tables: "snake_case",
            schemas: "snake_case",
            columns: "snake_case"
          }
        })
      },
      {
        kind: "foreignKey",
        columns: ["orgId"],
        references: 0
      },
      {
        kind: "foreignKey",
        columns: ["orgId"],
        references: () => ({
          tableName: "orgs",
          columns: "id",
          knownColumns: "id"
        })
      },
      {
        kind: "foreignKey",
        columns: "orgId",
        references: () => ({
          tableName: "orgs",
          columns: ["id"]
        })
      }
    ]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    const firstForeignKey = model.options[0]
    const secondForeignKey = model.options[1]
    const thirdForeignKey = model.options[2]
    const fourthForeignKey = model.options[3]
    const fifthForeignKey = model.options[4]
    const sixthForeignKey = model.options[5]

    if (firstForeignKey?.kind !== "foreignKey") {
      throw new Error("expected first foreign key option")
    }
    if (secondForeignKey?.kind !== "foreignKey") {
      throw new Error("expected second foreign key option")
    }
    if (thirdForeignKey?.kind !== "foreignKey") {
      throw new Error("expected third foreign key option")
    }
    if (fourthForeignKey?.kind !== "foreignKey") {
      throw new Error("expected fourth foreign key option")
    }
    if (fifthForeignKey?.kind !== "foreignKey") {
      throw new Error("expected fifth foreign key option")
    }
    if (sixthForeignKey?.kind !== "foreignKey") {
      throw new Error("expected sixth foreign key option")
    }

    expect(firstForeignKey.references()).toMatchObject({
      tableName: 0,
      columns: ["id"]
    })
    expect(secondForeignKey.references()).toMatchObject({
      tableName: "orgs",
      schemaName: 0,
      columns: ["id"]
    })
    expect(thirdForeignKey.references()).toMatchObject({
      tableName: 0,
      schemaName: 0,
      columns: ["id"],
      knownColumns: [0]
    })
    expect(fourthForeignKey.references()).toBe(0)
    expect(fifthForeignKey.references()).toMatchObject({
      tableName: "orgs",
      columns: "id",
      knownColumns: "id"
    })
    expect(sixthForeignKey.columns).toBe("orgId")
    expect(sixthForeignKey.references()).toMatchObject({
      tableName: "orgs",
      columns: ["id"]
    })
  })

  test("source table models accept direct foreign key reference payload metadata", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      orgId: StdRoot.Column.uuid()
    })
    ;(users as any)[StdRoot.Table.OptionsSymbol] = [{
      kind: "foreignKey",
      columns: ["orgId"],
      references: {
        tableName: "orgs",
        columns: ["id"],
        knownColumns: ["id"]
      }
    }]

    const model = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
    const foreignKey = model.options[0]
    if (foreignKey?.kind !== "foreignKey") {
      throw new Error("expected foreign key option")
    }

    expect(foreignKey.references()).toMatchObject({
      tableName: "orgs",
      columns: ["id"],
      knownColumns: ["id"]
    })
  })

  test("schema diff planning ignores malformed table option entries", () => {
    const sourceUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(sourceUsers as any)[StdRoot.Table.OptionsSymbol] = [
      ...(sourceUsers as any)[StdRoot.Table.OptionsSymbol],
      null,
      {},
      { kind: "partition", columns: ["id"] }
    ]

    const databaseUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })

    const source: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: [toTableModel(sourceUsers as unknown as Parameters<typeof toTableModel>[0])]
    }
    const database: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: [toTableModel(databaseUsers as unknown as Parameters<typeof toTableModel>[0])]
    }

    expect(() => planPostgresSchemaDiff(source, database)).not.toThrow()
    expect(planPostgresSchemaDiff(source, database).changes).toEqual([])
  })

  test("schema diff planning creates tables when source options include malformed entries", () => {
    const sourceUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(sourceUsers as any)[StdRoot.Table.OptionsSymbol] = [
      ...(sourceUsers as any)[StdRoot.Table.OptionsSymbol],
      null,
      {},
      { kind: "partition", columns: ["id"] }
    ]

    const source: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: [toTableModel(sourceUsers as unknown as Parameters<typeof toTableModel>[0])]
    }
    const database: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: []
    }

    expect(() => planPostgresSchemaDiff(source, database)).not.toThrow()
    expect(planPostgresSchemaDiff(source, database).changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "createTable",
          key: "public.users"
        })
      ])
    )
  })

  test("schema diff planning ignores malformed constraint columns in create-table rendering", () => {
    const sourceUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid()
    })
    const sourceUsersModel = toTableModel(sourceUsers as unknown as Parameters<typeof toTableModel>[0])
    ;(sourceUsersModel as any).options = [
      { kind: "unique", columns: "id" },
      { kind: "primaryKey", columns: "id" }
    ]

    const source: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: [sourceUsersModel]
    }
    const database: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: []
    }

    expect(() => planPostgresSchemaDiff(source, database)).not.toThrow()
    expect(planPostgresSchemaDiff(source, database).changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "createTable",
          key: "public.users"
        })
      ])
    )
  })

  test("schema diff planning preserves valid index keys when malformed keys are present", () => {
    const sourceUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    ;(sourceUsers as any)[StdRoot.Table.OptionsSymbol] = [
      ...(sourceUsers as any)[StdRoot.Table.OptionsSymbol],
      {
        kind: "index",
        keys: [null, { kind: "column", column: "id" }]
      }
    ]

    const source: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: [toTableModel(sourceUsers as unknown as Parameters<typeof toTableModel>[0])]
    }
    const database: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: []
    }

    expect(() => planPostgresSchemaDiff(source, database)).not.toThrow()
    expect(planPostgresSchemaDiff(source, database).changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "createTable",
          key: "public.users"
        }),
        expect.objectContaining({
          kind: "createIndex",
          key: "public.users.users_id_idx"
        })
      ])
    )
  })

  test("pull planning tolerates malformed index keys in discovered source bindings", async () => {
    const tempDir = await mkdtemp(join(process.cwd(), ".tmp-pull-malformed-index-keys-"))
    try {
      const users = StdRoot.Table.make("users", {
        id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
      })
      ;(users as any)[StdRoot.Table.OptionsSymbol] = [
        ...(users as any)[StdRoot.Table.OptionsSymbol],
        {
          kind: "index",
          keys: [null, { kind: "column", column: "id" }]
        }
      ]

      const declaration: DiscoveredSourceSchema["declarations"][number] = {
        kind: "tableFactory",
        filePath: join(tempDir, "users.ts"),
        identifier: "users",
        start: 0,
        end: 0
      }
      const discovered: DiscoveredSourceSchema = {
        declarations: [declaration],
        bindings: [{
          declaration,
          value: users,
          key: "public.users",
          kind: "table"
        }],
        model: {
          dialect: "postgres",
          enums: [],
          tables: [toTableModel(users as unknown as Parameters<typeof toTableModel>[0])]
        }
      }
      const database: SchemaModel = {
        dialect: "postgres",
        enums: [],
        tables: []
      }

      await expect(planPostgresPull(tempDir, { include: ["**/*.ts"] }, discovered, database)).resolves.toEqual({
        updates: []
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("pull planning renders database additions when table options include malformed entries", async () => {
    const tempDir = await mkdtemp(join(process.cwd(), ".tmp-pull-malformed-database-options-"))
    try {
      const users = StdRoot.Table.make("users", {
        id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
      })
      const usersModel = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
      ;(usersModel as any).options = [
        ...(usersModel as any).options,
        null,
        {},
        { kind: "partition", columns: ["id"] },
        { kind: "index", keys: [null, { kind: "column", column: "id" }] }
      ]

      const discovered: DiscoveredSourceSchema = {
        declarations: [],
        bindings: [],
        model: {
          dialect: "postgres",
          enums: [],
          tables: []
        }
      }
      const database: SchemaModel = {
        dialect: "postgres",
        enums: [],
        tables: [usersModel]
      }

      await expect(planPostgresPull(tempDir, { include: ["**/*.ts"] }, discovered, database)).resolves.toMatchObject({
        updates: [
          expect.objectContaining({
            filePath: join(tempDir, "public.schema.ts")
          })
        ]
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("pull planning ignores malformed constraint column metadata in database additions", async () => {
    const tempDir = await mkdtemp(join(process.cwd(), ".tmp-pull-malformed-constraint-columns-"))
    try {
      const users = StdRoot.Table.make("users", {
        id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
      })
      const usersModel = toTableModel(users as unknown as Parameters<typeof toTableModel>[0])
      ;(usersModel as any).options = [
        ...(usersModel as any).options,
        { kind: "unique", columns: "id" },
        { kind: "primaryKey", columns: "id" }
      ]

      const discovered: DiscoveredSourceSchema = {
        declarations: [],
        bindings: [],
        model: {
          dialect: "postgres",
          enums: [],
          tables: []
        }
      }
      const database: SchemaModel = {
        dialect: "postgres",
        enums: [],
        tables: [usersModel]
      }

      await expect(planPostgresPull(tempDir, { include: ["**/*.ts"] }, discovered, database)).resolves.toMatchObject({
        updates: [
          expect.objectContaining({
            filePath: join(tempDir, "public.schema.ts")
          })
        ]
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
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
