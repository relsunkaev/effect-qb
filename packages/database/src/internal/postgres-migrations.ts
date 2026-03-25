import { mkdir } from "node:fs/promises"
import { join, resolve } from "node:path"

import * as SqlClient from "@effect/sql/SqlClient"
import * as Effect from "effect/Effect"

import type { SchemaChange } from "./postgres-schema-diff.js"

const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll("\"", "\"\"")}"`

const qualifyIdentifier = (value: string): string => {
  const parts = value.split(".").filter((part) => part.length > 0)
  return parts.map(quoteIdentifier).join(".")
}

const sanitizeName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "migration"

const migrationTableSql = (tableName: string): string =>
  `create table if not exists ${qualifyIdentifier(tableName)} (
    id bigint generated always as identity primary key,
    name text not null unique,
    applied_at timestamptz not null default now()
  )`

export const renderMigrationFile = (
  changes: readonly SchemaChange[]
): string =>
  changes
    .map((change) => change.sql)
    .filter((statement): statement is string => statement !== undefined)
    .map((statement) => statement.endsWith(";") ? statement : `${statement};`)
    .join("\n")

export const writeMigrationFile = async (
  migrationsDir: string,
  name: string,
  changes: readonly SchemaChange[]
): Promise<string> => {
  const directory = resolve(migrationsDir)
  await mkdir(directory, { recursive: true })
  const files = await Array.fromAsync(new Bun.Glob("*.sql").scan({
    cwd: directory,
    absolute: false
  }))
  const nextNumber = files
    .map((file) => /^(\d+)_/.exec(file)?.[1])
    .filter((value): value is string => value !== undefined)
    .map((value) => Number(value))
    .reduce((max, current) => Math.max(max, current), 0) + 1
  const fileName = `${String(nextNumber).padStart(4, "0")}_${sanitizeName(name)}.sql`
  const filePath = join(directory, fileName)
  await Bun.write(filePath, `${renderMigrationFile(changes)}\n`)
  return filePath
}

const ensureDirectory = async (dir: string): Promise<void> => {
  await mkdir(resolve(dir), { recursive: true })
}

export const applyStatements = (
  statements: readonly string[]
): Effect.Effect<void, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql.withTransaction(
      Effect.forEach(
        statements,
        (statement) => sql.unsafe(statement),
        { discard: true }
      )
    ))

export const readPendingMigrationFiles = async (
  migrationsDir: string,
  appliedNames: ReadonlySet<string>
): Promise<ReadonlyArray<{
  readonly name: string
  readonly path: string
  readonly sql: string
}>> => {
  await ensureDirectory(migrationsDir)
  const directory = resolve(migrationsDir)
  const files = (await Array.fromAsync(new Bun.Glob("*.sql").scan({
    cwd: directory,
    absolute: true
  }))).sort()
  const pending: Array<{
    readonly name: string
    readonly path: string
    readonly sql: string
  }> = []
  for (const path of files) {
    const name = path.slice(path.lastIndexOf("/") + 1)
    if (appliedNames.has(name)) {
      continue
    }
    pending.push({
      name,
      path,
      sql: await Bun.file(path).text()
    })
  }
  return pending
}

export const ensureMigrationTable = (
  tableName: string
): Effect.Effect<void, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    Effect.asVoid(sql.unsafe(migrationTableSql(tableName))))

export const readAppliedMigrationNames = (
  tableName: string
): Effect.Effect<ReadonlySet<string>, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    Effect.map(
      sql.unsafe<{ readonly name: string }>(`select name from ${qualifyIdentifier(tableName)} order by name`),
      (rows) => new Set(rows.map((row) => row.name))
    ))

export const applyMigrationFiles = (
  tableName: string,
  files: ReadonlyArray<{
    readonly name: string
    readonly sql: string
  }>
): Effect.Effect<void, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql.withTransaction(
      Effect.forEach(files, (file) =>
        Effect.zipRight(
          sql.unsafe(file.sql),
          sql.unsafe(
            `insert into ${qualifyIdentifier(tableName)} (name) values ($1)`,
            [file.name]
          )
        ), {
          discard: true
        })
    ))

export const migrationFileLabel = (path: string): string =>
  path.slice(path.lastIndexOf("/") + 1)

export const migrationDirFromConfig = (cwd: string, dir: string): string =>
  resolve(cwd, dir)
