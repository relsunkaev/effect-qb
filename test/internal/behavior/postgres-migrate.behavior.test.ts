import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"

import * as SqlClient from "effect/unstable/sql/SqlClient"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import { readMigrationFiles, ensureMigrationTable, readAppliedMigrationRows } from "../../../packages/database/src/postgres/migrate.js"
import { withoutManagedMigrationTable } from "../../../packages/database/src/postgres/push.js"
import type { SchemaModel } from "effect-qb/postgres/metadata"

const repoRoot = process.cwd()

describe("postgres migrations", () => {
  test("parses up and down sections and normalizes checksum line endings", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-postgres-migrate-"))
    try {
      const contents = [
        "-- effect-db:up",
        "create table users (id integer);",
        "-- effect-db:down",
        "drop table users;",
        ""
      ].join("\n")

      await Bun.write(join(tempDir, "0001_lf.sql"), contents)
      await Bun.write(join(tempDir, "0002_crlf.sql"), contents.replaceAll("\n", "\r\n"))

      const files = await readMigrationFiles(tempDir)

      expect(files.map((file) => file.name)).toEqual([
        "0001_lf.sql",
        "0002_crlf.sql"
      ])
      expect(files[0]?.sql).toBe("create table users (id integer);")
      expect(files[0]?.downSql).toBe("drop table users;")
      expect(files[0]?.checksum).toBe(files[1]?.checksum)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("renders quoted qualified migration table identifiers", async () => {
    const statements: string[] = []
    const sql = {
      unsafe<Row extends object>(statement: string) {
        statements.push(statement)
        return Effect.succeed([] as ReadonlyArray<Row>)
      }
    } as unknown as SqlClient.SqlClient

    await Effect.runPromise(
      Effect.provideService(SqlClient.SqlClient)(ensureMigrationTable(`"tenant.a"."effect.db_migrations"`), sql)
    )

    expect(statements).toEqual([
      `create table if not exists "tenant.a"."effect.db_migrations" (
    id bigint generated always as identity primary key,
    name text not null unique,
    checksum text,
    applied_at timestamptz not null default now()
  )`,
      `alter table "tenant.a"."effect.db_migrations" add column if not exists checksum text`,
      `alter table "tenant.a"."effect.db_migrations" alter column checksum drop not null`
    ])
  })

  test("filters quoted qualified managed migration tables from schema plans", () => {
    const model: SchemaModel = {
      dialect: "postgres",
      enums: [],
      tables: [
        {
          kind: "table",
          schemaName: "tenant.a",
          name: "effect.db_migrations",
          columns: [],
          options: []
        },
        {
          kind: "table",
          schemaName: "tenant.a",
          name: "users",
          columns: [],
          options: []
        }
      ]
    }

    expect(withoutManagedMigrationTable(model, `"tenant.a"."effect.db_migrations"`).tables).toEqual([
      expect.objectContaining({
        schemaName: "tenant.a",
        name: "users"
      })
    ])
  })

  test("rejects malformed applied migration ledger rows", async () => {
    const sql = {
      unsafe<Row extends object>(statement: string) {
        if (statement.includes("select id, name, checksum")) {
          return Effect.succeed([
            {
              id: "not-a-number",
              name: "0001_init.sql",
              checksum: null
            }
          ] as unknown as ReadonlyArray<Row>)
        }
        throw new Error(`Unexpected migration SQL: ${statement}`)
      }
    } as unknown as SqlClient.SqlClient

    let failed = false
    try {
      await Effect.runPromise(
        Effect.provideService(SqlClient.SqlClient)(readAppliedMigrationRows("effect_qb_migrations"), sql)
      )
    } catch (error) {
      failed = true
      expect(String(error)).toContain("id")
    }
    expect(failed).toBe(true)
  })
})
