import { mkdir } from "node:fs/promises"
import { join, resolve } from "node:path"

import * as SqlClient from "@effect/sql/SqlClient"
import * as Effect from "effect/Effect"

import { runPostgresUrl } from "../internal/postgres-runtime.js"
import type { SchemaChange } from "../internal/postgres-schema-diff.js"
import type { loadPostgresConfig } from "../internal/postgres-config.js"

const MIGRATION_UP_MARKER = "-- effect-db:up"
const MIGRATION_DOWN_MARKER = "-- effect-db:down"

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

export interface MigrationFile {
  readonly name: string
  readonly path: string
  readonly sql: string
  readonly downSql?: string
}

export interface AppliedMigrationRow {
  readonly id: number
  readonly name: string
}

type LoadedConfig = Awaited<ReturnType<typeof loadPostgresConfig>>

const renderStatements = (statements: readonly string[]): string =>
  statements
    .map((statement) => statement.endsWith(";") ? statement : `${statement};`)
    .join("\n")

const parseMigrationSections = (
  contents: string
): {
  readonly sql: string
  readonly downSql?: string
} => {
  const normalized = contents.replaceAll("\r\n", "\n")
  if (!normalized.includes(MIGRATION_UP_MARKER)) {
    const sql = normalized.trim()
    return {
      sql
    }
  }

  const lines = normalized.split("\n")
  let section: "up" | "down" | undefined
  const upLines: string[] = []
  const downLines: string[] = []
  for (const line of lines) {
    const marker = line.trim()
    if (marker === MIGRATION_UP_MARKER) {
      section = "up"
      continue
    }
    if (marker === MIGRATION_DOWN_MARKER) {
      section = "down"
      continue
    }
    if (section === "down") {
      downLines.push(line)
    } else {
      upLines.push(line)
    }
  }
  const sql = upLines.join("\n").trim()
  const downSql = downLines.join("\n").trim()
  return {
    sql,
    downSql: downSql.length > 0 ? downSql : undefined
  }
}

export const renderMigrationFile = (
  changes: readonly SchemaChange[]
): string => {
  const upStatements = changes
    .map((change) => change.sql)
    .filter((statement): statement is string => statement !== undefined)
  const reversible = changes.every((change) => change.rollbackSql !== undefined)
  const downStatements = reversible
    ? [...changes]
      .reverse()
      .map((change) => change.rollbackSql)
      .filter((statement): statement is string => statement !== undefined)
    : []
  const sections = [
    MIGRATION_UP_MARKER,
    renderStatements(upStatements)
  ]
  if (reversible && downStatements.length > 0) {
    sections.push(MIGRATION_DOWN_MARKER, renderStatements(downStatements))
  }
  return sections.join("\n")
}

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
): Promise<ReadonlyArray<MigrationFile>> => {
  await ensureDirectory(migrationsDir)
  const directory = resolve(migrationsDir)
  const files = (await Array.fromAsync(new Bun.Glob("*.sql").scan({
    cwd: directory,
    absolute: true
  }))).sort()
  const pending: MigrationFile[] = []
  for (const path of files) {
    const name = path.slice(path.lastIndexOf("/") + 1)
    if (appliedNames.has(name)) {
      continue
    }
    const contents = await Bun.file(path).text()
    const parsed = parseMigrationSections(contents)
    pending.push({
      name,
      path,
      sql: parsed.sql,
      downSql: parsed.downSql
    })
  }
  return pending
}

export const readMigrationFiles = async (
  migrationsDir: string
): Promise<ReadonlyArray<MigrationFile>> => {
  await ensureDirectory(migrationsDir)
  const directory = resolve(migrationsDir)
  const files = (await Array.fromAsync(new Bun.Glob("*.sql").scan({
    cwd: directory,
    absolute: true
  }))).sort()
  const parsed: MigrationFile[] = []
  for (const path of files) {
    const name = path.slice(path.lastIndexOf("/") + 1)
    const contents = await Bun.file(path).text()
    const sections = parseMigrationSections(contents)
    parsed.push({
      name,
      path,
      sql: sections.sql,
      downSql: sections.downSql
    })
  }
  return parsed
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

export const readAppliedMigrationRows = (
  tableName: string
): Effect.Effect<ReadonlyArray<AppliedMigrationRow>, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    Effect.map(
      sql.unsafe<AppliedMigrationRow>(`select id, name from ${qualifyIdentifier(tableName)} order by id`),
      (rows) => rows
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

export const rollbackMigrationFiles = (
  tableName: string,
  files: ReadonlyArray<MigrationFile>
): Effect.Effect<void, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql.withTransaction(
      Effect.forEach(files, (file) => {
        if (file.downSql === undefined) {
          return Effect.fail(new Error(`Migration '${file.name}' does not have a rollback section`))
        }
        return Effect.zipRight(
          sql.unsafe(file.downSql),
          sql.unsafe(
            `delete from ${qualifyIdentifier(tableName)} where name = $1`,
            [file.name]
          )
        )
      }, {
        discard: true
      })
    ))

export const deleteAppliedMigrationNames = (
  tableName: string,
  names: readonly string[]
): Effect.Effect<void, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql.withTransaction(
      Effect.forEach(names, (name) =>
        sql.unsafe(
          `delete from ${qualifyIdentifier(tableName)} where name = $1`,
          [name]
        ), {
          discard: true
        })
    ))

export const migrationFileLabel = (path: string): string =>
  path.slice(path.lastIndexOf("/") + 1)

export const migrationDirFromConfig = (cwd: string, dir: string): string =>
  resolve(cwd, dir)

export const loadPostgresMigrationState = async (
  loaded: LoadedConfig,
  databaseUrl: string
) => {
  const files = await readMigrationFiles(migrationDirFromConfig(loaded.cwd, loaded.config.migrations.dir))
  const appliedRows = await runPostgresUrl(databaseUrl, Effect.gen(function*() {
    yield* ensureMigrationTable(loaded.config.migrations.table)
    return yield* readAppliedMigrationRows(loaded.config.migrations.table)
  }))
  const appliedNames = new Set(appliedRows.map((row) => row.name))
  const pending = files.filter((file) => !appliedNames.has(file.name))
  return {
    files,
    appliedRows,
    appliedNames,
    pending
  }
}
