import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import * as Pg from "#postgres"
import { Column as C, Table } from "#postgres"
import { toEnumModel, toTableModel, type SchemaModel } from "effect-qb/postgres/metadata"
import { filterDiscoveredSourceSchema } from "../../../packages/database/src/internal/postgres-source-filter.js"
import * as StdRoot from "#standard"

describe("postgres source filter", () => {
  test("keeps table-referenced enums with quoted qualified ddl types", () => {
    const status = Pg.schema("audit\"schema").enum("status\"type", ["active"] as const)
    const users = StdRoot.Table.make("users", {
      status: C.custom(Schema.String, status.type()).pipe(
        C.ddlType("\"audit\"\"schema\".\"status\"\"type\"")
      )
    })
    const model: SchemaModel = {
      dialect: "postgres",
      enums: [toEnumModel(status)],
      tables: [toTableModel(users)]
    }

    const filtered = filterDiscoveredSourceSchema({
      declarations: [],
      bindings: [],
      model
    }, {
      tables: ["users"]
    })

    expect(filtered.model.enums).toEqual([
      expect.objectContaining({
        schemaName: "audit\"schema",
        name: "status\"type"
      })
    ])
  })
})
