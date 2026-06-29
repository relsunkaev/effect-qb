import * as SqlClient from "effect/unstable/sql/SqlClient"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import { introspectPostgresSchema } from "../../../packages/database/src/internal/postgres-introspector.js"

describe("postgres introspector", () => {
  test("does not collapse table identities that contain dots", async () => {
    const sql = {
      unsafe<Row extends object>(statement: string) {
        if (statement.includes("from pg_class c") && statement.includes("c.relkind = 'r'")) {
          return Effect.succeed([
            {
              schema_name: "tenant.a",
              table_name: "users",
              table_oid: 1
            },
            {
              schema_name: "tenant",
              table_name: "a.users",
              table_oid: 2
            }
          ] as unknown as ReadonlyArray<Row>)
        }
        if (statement.includes("from pg_attribute a")) {
          return Effect.succeed([
            {
              schema_name: "tenant.a",
              table_name: "users",
              table_oid: 1,
              attnum: 1,
              column_name: "id",
              ddl_type: "uuid",
              db_type_kind: "uuid",
              type_schema: "pg_catalog",
              type_kind: "b",
              nullable: false,
              has_default: false,
              default_sql: null,
              generated_sql: null,
              identity_generation: "",
              attcollation_oid: 0
            },
            {
              schema_name: "tenant",
              table_name: "a.users",
              table_oid: 2,
              attnum: 1,
              column_name: "slug",
              ddl_type: "text",
              db_type_kind: "text",
              type_schema: "pg_catalog",
              type_kind: "b",
              nullable: false,
              has_default: false,
              default_sql: null,
              generated_sql: null,
              identity_generation: "",
              attcollation_oid: 0
            }
          ] as unknown as ReadonlyArray<Row>)
        }
        if (statement.includes("from pg_constraint")) {
          return Effect.succeed([] as ReadonlyArray<Row>)
        }
        if (statement.includes("from pg_index")) {
          return Effect.succeed([] as ReadonlyArray<Row>)
        }
        if (statement.includes("from pg_collation c") && statement.includes("c.collname = 'default'")) {
          return Effect.succeed([{ oid: 0 }] as unknown as ReadonlyArray<Row>)
        }
        if (statement.includes("from pg_collation c")) {
          return Effect.succeed([] as ReadonlyArray<Row>)
        }
        throw new Error(`Unexpected introspector SQL: ${statement}`)
      }
    } as unknown as SqlClient.SqlClient

    const model = await Effect.runPromise(
      Effect.provideService(introspectPostgresSchema(), SqlClient.SqlClient, sql)
    )

    expect(model.tables).toEqual([
      expect.objectContaining({
        schemaName: "tenant.a",
        name: "users",
        columns: [
          expect.objectContaining({
            name: "id"
          })
        ]
      }),
      expect.objectContaining({
        schemaName: "tenant",
        name: "a.users",
        columns: [
          expect.objectContaining({
            name: "slug"
          })
        ]
      })
    ])
  })

  test("rejects malformed catalog rows before building metadata", async () => {
    const sql = {
      unsafe<Row extends object>(statement: string) {
        if (statement.includes("from pg_class c") && statement.includes("c.relkind = 'r'")) {
          return Effect.succeed([
            {
              schema_name: "public",
              table_name: "users",
              table_oid: "not-an-oid"
            }
          ] as unknown as ReadonlyArray<Row>)
        }
        throw new Error(`Unexpected introspector SQL: ${statement}`)
      }
    } as unknown as SqlClient.SqlClient

    let failed = false
    try {
      await Effect.runPromise(
        Effect.provideService(introspectPostgresSchema(), SqlClient.SqlClient, sql)
      )
    } catch (error) {
      failed = true
      expect(String(error)).toContain("table_oid")
    }
    expect(failed).toBe(true)
  })
})
