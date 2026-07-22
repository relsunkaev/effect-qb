import * as Crypto from "effect/Crypto"
import * as Encoding from "effect/Encoding"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as SqlSchema from "effect/unstable/sql/SqlSchema"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"

import { runNodePath, runNodePlatform, type PlatformServices } from "../internal/node-platform.js"
import type { LoadedPostgresConfig } from "../internal/postgres-config.js"
import { providePostgresUrl } from "../internal/postgres-runtime.js"
import type { SchemaChange } from "../internal/postgres-schema-diff.js"

const MIGRATION_UP_MARKER = "-- effect-db:up"
const MIGRATION_DOWN_MARKER = "-- effect-db:down"
const MIGRATION_CHECKSUM_PREFIX = "sha256"

const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll("\"", "\"\"")}"`

const parseIdentifierPart = (
  input: string,
  start: number
): { readonly value: string; readonly next: number } | undefined => {
  if (input[start] === "\"") {
    let value = ""
    for (let index = start + 1; index < input.length; index++) {
      if (input[index] !== "\"") {
        value += input[index]
        continue
      }
      if (input[index + 1] === "\"") {
        value += "\""
        index++
        continue
      }
      return {
        value,
        next: index + 1
      }
    }
    return undefined
  }
  const match = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(input.slice(start))
  return match === null
    ? undefined
    : {
        value: match[0],
        next: start + match[0].length
      }
}

const parseQualifiedIdentifier = (value: string): readonly string[] | undefined => {
  const input = value.trim()
  if (input.length === 0) {
    return undefined
  }
  const parts: string[] = []
  let index = 0
  while (index < input.length) {
    const part = parseIdentifierPart(input, index)
    if (part === undefined) {
      return undefined
    }
    parts.push(part.value)
    index = part.next
    if (index === input.length) {
      return parts
    }
    if (input[index] !== ".") {
      return undefined
    }
    index += 1
  }
  return undefined
}

const qualifyIdentifier = (value: string): string => {
  const parts = parseQualifiedIdentifier(value) ?? value.split(".").filter((part) => part.length > 0)
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
    checksum text,
    applied_at timestamptz not null default now()
  )`

const normalizeMigrationContents = (contents: string): string =>
  contents.replaceAll("\r\n", "\n")

const migrationChecksumOfEffect = (
  contents: string
): Effect.Effect<string, unknown, Crypto.Crypto> =>
  Effect.flatMap(Crypto.Crypto, (crypto) =>
    Effect.map(
      crypto.digest("SHA-256", new TextEncoder().encode(normalizeMigrationContents(contents))),
      (digest) => `${MIGRATION_CHECKSUM_PREFIX}:${Encoding.encodeHex(digest)}`
    ))

export interface MigrationFile {
  readonly name: string
  readonly path: string
  readonly sql: string
  readonly downSql?: string
  readonly checksum: string
}

export interface AppliedMigrationRow {
  readonly id: number
  readonly name: string
  readonly checksum: string | null
}

const EmptyRequest = Schema.Struct({})

const AppliedMigrationRowSchema = Schema.Struct({
  id: Schema.Union([
    Schema.Number.check(Schema.isFinite()),
    Schema.NumberFromString.check(Schema.isFinite())
  ]),
  name: Schema.String,
  checksum: Schema.NullOr(Schema.String)
})

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

export const writeMigrationFileEffect = (
  migrationsDir: string,
  name: string,
  changes: readonly SchemaChange[]
): Effect.Effect<string, unknown, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    const directory = paths.resolve(migrationsDir)
    yield* fs.makeDirectory(directory, { recursive: true })
    const files = (yield* fs.readDirectory(directory)).filter((file) => file.endsWith(".sql"))
    const nextNumber = files
      .map((file) => /^(\d+)_/.exec(file)?.[1])
      .filter((value): value is string => value !== undefined)
      .map((value) => Number(value))
      .reduce((max, current) => Math.max(max, current), 0) + 1
    const fileName = `${String(nextNumber).padStart(4, "0")}_${sanitizeName(name)}.sql`
    const filePath = paths.join(directory, fileName)
    yield* fs.writeFileString(filePath, `${renderMigrationFile(changes)}\n`)
    return filePath
  })

export const writeMigrationFile = (
  migrationsDir: string,
  name: string,
  changes: readonly SchemaChange[]
): Promise<string> =>
  runNodePlatform(writeMigrationFileEffect(migrationsDir, name, changes))

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

export const readPendingMigrationFilesEffect = (
  migrationsDir: string,
  appliedNames: ReadonlySet<string>
): Effect.Effect<ReadonlyArray<MigrationFile>, unknown, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    const directory = paths.resolve(migrationsDir)
    yield* fs.makeDirectory(directory, { recursive: true })
    const files = (yield* fs.readDirectory(directory))
      .filter((file) => file.endsWith(".sql"))
      .map((file) => paths.join(directory, file))
      .sort()
    const pending: MigrationFile[] = []
    for (const filePath of files) {
      const name = paths.basename(filePath)
      if (appliedNames.has(name)) {
        continue
      }
      const contents = yield* fs.readFileString(filePath)
      const parsed = parseMigrationSections(contents)
      pending.push({
        name,
        path: filePath,
        sql: parsed.sql,
        downSql: parsed.downSql,
        checksum: yield* migrationChecksumOfEffect(contents)
      })
    }
    return pending
  })

export const readPendingMigrationFiles = (
  migrationsDir: string,
  appliedNames: ReadonlySet<string>
): Promise<ReadonlyArray<MigrationFile>> =>
  runNodePlatform(readPendingMigrationFilesEffect(migrationsDir, appliedNames))

export const readMigrationFilesEffect = (
  migrationsDir: string
): Effect.Effect<ReadonlyArray<MigrationFile>, unknown, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  readPendingMigrationFilesEffect(migrationsDir, new Set())

export const readMigrationFiles = (
  migrationsDir: string
): Promise<ReadonlyArray<MigrationFile>> =>
  runNodePlatform(readMigrationFilesEffect(migrationsDir))

export const ensureMigrationTable = (
  tableName: string
): Effect.Effect<void, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    Effect.gen(function*() {
      yield* Effect.asVoid(sql.unsafe(migrationTableSql(tableName)))
      yield* Effect.asVoid(sql.unsafe(`alter table ${qualifyIdentifier(tableName)} add column if not exists checksum text`))
      yield* Effect.asVoid(sql.unsafe(`alter table ${qualifyIdentifier(tableName)} alter column checksum drop not null`))
    }))

export const withMigrationLock = <A, E, R>(
  tableName: string,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, unknown, SqlClient.SqlClient | R> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql.withTransaction(Effect.gen(function*() {
      yield* Effect.asVoid(sql.unsafe(
        "select pg_advisory_xact_lock(hashtext($1), 0)",
        [tableName]
      ))
      yield* ensureMigrationTable(tableName)
      return yield* effect
    })))

export const readAppliedMigrationNames = (
  tableName: string
): Effect.Effect<ReadonlySet<string>, unknown, SqlClient.SqlClient> =>
  Effect.map(
    readAppliedMigrationRows(tableName),
    (rows) => new Set(rows.map((row) => row.name))
  )

export const readAppliedMigrationRows = (
  tableName: string
): Effect.Effect<ReadonlyArray<AppliedMigrationRow>, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    SqlSchema.findAll({
      Request: EmptyRequest,
      Result: AppliedMigrationRowSchema,
      execute: () => sql.unsafe(`select id, name, checksum from ${qualifyIdentifier(tableName)} order by id`)
    })({}))

const fileByName = (
  files: ReadonlyArray<MigrationFile>
): ReadonlyMap<string, MigrationFile> =>
  new Map(files.map((file) => [file.name, file] as const))

export const verifyAppliedMigrationChecksums = (
  rows: ReadonlyArray<AppliedMigrationRow>,
  files: ReadonlyArray<MigrationFile>
): void => {
  const filesByName = fileByName(files)
  for (const row of rows) {
    const file = filesByName.get(row.name)
    if (file === undefined || row.checksum === null) {
      continue
    }
    if (row.checksum !== file.checksum) {
      throw new Error(
        `Migration checksum mismatch for '${row.name}': applied ${row.checksum} but current file is ${file.checksum}`
      )
    }
  }
}

export const synchronizeAppliedMigrationChecksums = (
  tableName: string,
  rows: ReadonlyArray<AppliedMigrationRow>,
  files: ReadonlyArray<MigrationFile>
): Effect.Effect<ReadonlyArray<AppliedMigrationRow>, unknown, SqlClient.SqlClient> => {
  const filesByName = fileByName(files)
  const pendingUpdates = rows
    .map((row) => {
      if (row.checksum !== null) {
        return undefined
      }
      const file = filesByName.get(row.name)
      return file === undefined
        ? undefined
        : {
            id: row.id,
            name: row.name,
            checksum: file.checksum
          }
    })
    .filter((update): update is { readonly id: number; readonly name: string; readonly checksum: string } => update !== undefined)

  if (pendingUpdates.length === 0) {
    verifyAppliedMigrationChecksums(rows, files)
    return Effect.succeed(rows)
  }

  return Effect.flatMap(SqlClient.SqlClient, (sql) =>
    Effect.andThen(
      Effect.forEach(
        pendingUpdates,
        (update) =>
          sql.unsafe(
            `update ${qualifyIdentifier(tableName)} set checksum = $1 where id = $2`,
            [update.checksum, update.id]
          ),
        { discard: true }
      ),
      Effect.sync(() => {
        const updatedRows = rows.map((row) => {
          const update = pendingUpdates.find((candidate) => candidate.id === row.id)
          return update === undefined
            ? row
            : {
                ...row,
                checksum: update.checksum
              }
        })
        verifyAppliedMigrationChecksums(updatedRows, files)
        return updatedRows
      })
    ))
}

export const loadAppliedMigrationRows = (
  tableName: string,
  files: ReadonlyArray<MigrationFile>
): Effect.Effect<ReadonlyArray<AppliedMigrationRow>, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(
    readAppliedMigrationRows(tableName),
    (rows) => synchronizeAppliedMigrationChecksums(tableName, rows, files)
  )

export const applyMigrationFiles = (
  tableName: string,
  files: ReadonlyArray<{
    readonly name: string
    readonly sql: string
    readonly checksum: string
  }>
): Effect.Effect<void, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    Effect.forEach(files, (file) =>
      Effect.andThen(
        sql.unsafe(file.sql),
        sql.unsafe(
          `insert into ${qualifyIdentifier(tableName)} (name, checksum) values ($1, $2)`,
          [file.name, file.checksum]
        )
      ), {
        discard: true
      }))

export const rollbackMigrationFiles = (
  tableName: string,
  files: ReadonlyArray<MigrationFile>
): Effect.Effect<void, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    Effect.forEach(files, (file) => {
      if (file.downSql === undefined) {
        return Effect.fail(new Error(`Migration '${file.name}' does not have a rollback section`))
      }
      return Effect.andThen(
        sql.unsafe(file.downSql),
        sql.unsafe(
          `delete from ${qualifyIdentifier(tableName)} where name = $1`,
          [file.name]
        )
      )
    }, {
      discard: true
    }))

export const deleteAppliedMigrationNames = (
  tableName: string,
  names: readonly string[]
): Effect.Effect<void, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    Effect.forEach(names, (name) =>
      sql.unsafe(
        `delete from ${qualifyIdentifier(tableName)} where name = $1`,
        [name]
      ), {
        discard: true
      }))

export const migrationFileLabel = (path: string): string =>
  path.slice(path.lastIndexOf("/") + 1)

export const migrationDirFromConfigEffect = (
  cwd: string,
  dir: string
): Effect.Effect<string, never, Path.Path> =>
  Effect.map(Path.Path, (paths) => paths.resolve(cwd, dir))

export const migrationDirFromConfig = (cwd: string, dir: string): string =>
  runNodePath(migrationDirFromConfigEffect(cwd, dir))

export const loadPostgresMigrationStateEffect = (
  loaded: LoadedPostgresConfig,
  databaseUrl: string
): Effect.Effect<{
  readonly files: ReadonlyArray<MigrationFile>
  readonly appliedRows: ReadonlyArray<AppliedMigrationRow>
  readonly appliedNames: ReadonlySet<string>
  readonly pending: ReadonlyArray<MigrationFile>
}, unknown, PlatformServices> =>
  Effect.gen(function*() {
    const migrationsDir = yield* migrationDirFromConfigEffect(loaded.cwd, loaded.config.migrations.dir)
    const files = yield* readMigrationFilesEffect(migrationsDir)
    const appliedRows = yield* providePostgresUrl(
      databaseUrl,
      withMigrationLock(
        loaded.config.migrations.table,
        loadAppliedMigrationRows(loaded.config.migrations.table, files)
      )
    )
    const appliedNames = new Set(appliedRows.map((row) => row.name))
    const pending = files.filter((file) => !appliedNames.has(file.name))
    return {
      files,
      appliedRows,
      appliedNames,
      pending
    }
  })

export const loadPostgresMigrationState = (
  loaded: LoadedPostgresConfig,
  databaseUrl: string
): Promise<{
  readonly files: ReadonlyArray<MigrationFile>
  readonly appliedRows: ReadonlyArray<AppliedMigrationRow>
  readonly appliedNames: ReadonlySet<string>
  readonly pending: ReadonlyArray<MigrationFile>
}> =>
  runNodePlatform(loadPostgresMigrationStateEffect(loaded, databaseUrl))
