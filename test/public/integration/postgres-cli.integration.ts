import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import { execPostgres, withPostgresLock } from "./helpers.ts"

const repoRoot = process.cwd()
const cliEntry = join(repoRoot, "packages", "database", "src", "cli.ts")
const postgresUrl = "postgres://effect_qb:effect_qb@127.0.0.1:55432/effect_qb_test"

const randomId = () => Math.random().toString(36).slice(2, 10)

type ConfigOptions = {
  readonly databaseUrl?: string
  readonly include?: readonly string[]
  readonly exclude?: readonly string[]
  readonly filter?: {
    readonly schemas?: readonly string[]
    readonly tables?: readonly string[]
  }
  readonly migrationsDir?: string
  readonly migrationsTable?: string
  readonly nonDestructiveDefault?: boolean
}

const renderSchemaSource = (
  schemaName: string,
  options: ConfigOptions = {}
) => `
import { defineConfig } from "effect-db"

export default defineConfig({
  dialect: "postgres",
  db: {
    url: ${JSON.stringify(options.databaseUrl ?? postgresUrl)}
  },
  source: {
    include: ${JSON.stringify(options.include ?? ["schema.ts"])}${options.exclude ? `,\n    exclude: ${JSON.stringify(options.exclude)}` : ""}
  },
  filter: ${JSON.stringify({
    schemas: options.filter?.schemas ?? [schemaName],
    tables: options.filter?.tables
  })},
  migrations: {
    dir: ${JSON.stringify(options.migrationsDir ?? "migrations")},
    table: ${JSON.stringify(options.migrationsTable ?? `${schemaName}.effect_qb_migrations`)}
  },
  safety: {
    nonDestructiveDefault: ${String(options.nonDestructiveDefault ?? true)}
  }
})
`

const renderTableSource = (
  schemaName: string,
  tableFields = `  id: C.text(),
  email: C.text()`
) => `
import * as Pg from "effect-qb/postgres"
import { Column as C, Table } from "effect-qb/postgres"

const db = Pg.schema(${JSON.stringify(schemaName)})

const users = db.table("users", {
${tableFields}
}).pipe(
  Table.primaryKey("id")
)

export { users }
`

const makeWorkspace = async (
  tableFields?: string,
  databaseUrl?: string
) => {
  const workspace = await mkdtemp(join(repoRoot, "test/.tmp-postgres-cli-"))
  const schemaName = `cli_it_${randomId()}`
  await writeFile(join(workspace, "effectdb.config.ts"), renderSchemaSource(schemaName, {
    databaseUrl
  }))
  await writeFile(join(workspace, "schema.ts"), renderTableSource(schemaName, tableFields))
  return {
    workspace,
    schemaName
  }
}

const makeSourceWorkspace = async (
  source: string,
  databaseUrl?: string
) => {
  const workspace = await mkdtemp(join(repoRoot, "test/.tmp-postgres-cli-"))
  const schemaName = `cli_it_${randomId()}`
  await writeFile(join(workspace, "effectdb.config.ts"), renderSchemaSource(schemaName, {
    databaseUrl
  }))
  await writeFile(join(workspace, "schema.ts"), source.replaceAll("__SCHEMA__", schemaName).replaceAll("#postgres", "effect-qb/postgres"))
  return {
    workspace,
    schemaName
  }
}

const makeWorkspaceWithFiles = async (
  files: Readonly<Record<string, string>>,
  configOptions: ConfigOptions = {}
) => {
  const workspace = await mkdtemp(join(repoRoot, "test/.tmp-postgres-cli-"))
  const schemaName = `cli_it_${randomId()}`
  await writeFile(join(workspace, "effectdb.config.ts"), renderSchemaSource(schemaName, configOptions))
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = join(workspace, relativePath)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, contents.replaceAll("__SCHEMA__", schemaName).replaceAll("#postgres", "effect-qb/postgres"))
  }
  return {
    workspace,
    schemaName
  }
}

const makeEmptyWorkspace = async (
  configOptions: ConfigOptions = {}
) => {
  const workspace = await mkdtemp(join(repoRoot, "test/.tmp-postgres-cli-"))
  const schemaName = `cli_it_${randomId()}`
  await mkdir(join(workspace, "src"), { recursive: true })
  await writeFile(join(workspace, "effectdb.config.ts"), renderSchemaSource(schemaName, {
    include: ["src/**/*.ts"],
    ...configOptions
  }))
  return {
    workspace,
    schemaName
  }
}

const runCli = async (...args: readonly string[]): Promise<{
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}> => {
  return withPostgresLock(async () => {
    const proc = Bun.spawn([
      process.execPath,
      cliEntry,
      ...args
    ], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ])
    return {
      exitCode,
      stdout,
      stderr
    }
  })
}

const schemaFile = (workspace: string) => join(workspace, "schema.ts")
const configFile = (workspace: string) => join(workspace, "effectdb.config.ts")
const readSchema = (workspace: string) => readFile(schemaFile(workspace), "utf8")
const dropSchema = (schemaName: string) =>
  execPostgres(`drop schema if exists "${schemaName}" cascade`)
const listColumns = (schemaName: string, tableName: string) =>
  execPostgres(
    `select column_name
      from information_schema.columns
      where table_schema = $1 and table_name = $2
      order by ordinal_position`,
    [schemaName, tableName]
  )
const describeColumns = (schemaName: string, tableName: string) =>
  execPostgres(
    `select column_name, data_type, is_nullable, column_default, is_generated, generation_expression
      from information_schema.columns
      where table_schema = $1 and table_name = $2
      order by ordinal_position`,
    [schemaName, tableName]
  )
const listIndexes = (schemaName: string, tableName: string) =>
  execPostgres(
    `select indexname
      from pg_indexes
      where schemaname = $1 and tablename = $2
      order by indexname`,
    [schemaName, tableName]
  )
const listConstraints = (schemaName: string, tableName: string) =>
  execPostgres(
    `select c.conname, c.contype
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = $1 and r.relname = $2
      order by c.conname`,
    [schemaName, tableName]
  )

const assertIdempotentPullPush = async (config: string) => {
  const secondPullDryRun = await runCli("pull", "--config", config, "--dry-run")
  expect(secondPullDryRun.exitCode).toBe(0)
  expect(secondPullDryRun.stdout).toContain("schema definitions are already up to date")

  const secondPull = await runCli("pull", "--config", config)
  expect(secondPull.exitCode).toBe(0)
  expect(secondPull.stdout).toContain("schema definitions are already up to date")

  const pushDryRun = await runCli("push", "--config", config, "--dry-run")
  expect(pushDryRun.exitCode).toBe(0)
  expect(pushDryRun.stdout).toContain("planned changes: none")
}

test("postgres cli supports push pull and migrations against a live database", async () => {
  const { workspace, schemaName } = await makeWorkspace()
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const pushDryRun = await runCli("push", "--config", config, "--dry-run")
    expect(pushDryRun.exitCode).toBe(0)
    expect(pushDryRun.stdout).toContain(`create schema ${schemaName}`)
    expect(pushDryRun.stdout).toContain(`create table ${schemaName}.users`)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)
    expect(push.stdout).toContain("applied 2 statement(s)")

    const createdTables = await execPostgres(
      `select tablename from pg_tables where schemaname = $1 order by tablename`,
      [schemaName]
    )
    expect(createdTables).toEqual([{ tablename: "users" }])

    await execPostgres(`
      alter table "${schemaName}"."users" add column "name" text;
      create index "users_email_idx" on "${schemaName}"."users" ("email");
    `)

    const pullDryRun = await runCli("pull", "--config", config, "--dry-run")
    expect(pullDryRun.exitCode).toBe(0)
    expect(pullDryRun.stdout).toContain("update schema.ts")

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).toBe(0)
    expect(pull.stdout).toContain("updated 1 file(s)")

    const pulledSchema = await readSchema(workspace)
    expect(pulledSchema).toContain(`name: Column.text().pipe(Column.nullable)`)
    expect(pulledSchema).toContain(`users_email_idx`)
    expect(pulledSchema).toContain(`export { users }`)

    const secondPullDryRun = await runCli("pull", "--config", config, "--dry-run")
    expect(secondPullDryRun.exitCode).toBe(0)
    expect(secondPullDryRun.stdout).toContain("schema definitions are already up to date")

    await writeFile(
      schemaFile(workspace),
      pulledSchema.replace(
        /(^  email: .*?,\n)/m,
        `$1  nickname: Column.text().pipe(Column.nullable),\n`
      )
    )

    const migrateGenerate = await runCli("migrate", "generate", "--config", config, "--name", "add_nickname")
    expect(migrateGenerate.exitCode).toBe(0)
    expect(migrateGenerate.stdout).toContain("wrote 0001_add_nickname.sql")

    const migrationSql = await readFile(join(workspace, "migrations", "0001_add_nickname.sql"), "utf8")
    expect(migrationSql).toContain(`alter table "${schemaName}"."users" add column "nickname" text;`)

    const migrateUp = await runCli("migrate", "up", "--config", config)
    expect(migrateUp.exitCode).toBe(0)
    expect(migrateUp.stdout).toContain("applied 1 migration(s)")

    const secondMigrateUp = await runCli("migrate", "up", "--config", config)
    expect(secondMigrateUp.exitCode).toBe(0)
    expect(secondMigrateUp.stdout).toContain("no pending migrations")

    const userColumns = await listColumns(schemaName, "users")
    expect(userColumns).toEqual([
      { column_name: "id" },
      { column_name: "email" },
      { column_name: "name" },
      { column_name: "nickname" }
    ])

    const appliedMigrations = await execPostgres(`
      select name
      from "${schemaName}"."effect_qb_migrations"
      order by name
    `)
    expect(appliedMigrations).toEqual([
      { name: "0001_add_nickname.sql" }
    ])

    const noOpGenerate = await runCli("migrate", "generate", "--config", config)
    expect(noOpGenerate.exitCode).toBe(0)
    expect(noOpGenerate.stdout).toContain("no executable migration changes selected")
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli blocks destructive push changes unless explicitly allowed", async () => {
  const { workspace, schemaName } = await makeWorkspace()
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const initialPush = await runCli("push", "--config", config)
    expect(initialPush.exitCode).toBe(0)

    await writeFile(
      schemaFile(workspace),
      renderTableSource(schemaName, `  id: C.text()`)
    )

    const safePush = await runCli("push", "--config", config)
    expect(safePush.exitCode).toBe(0)
    expect(safePush.stdout).toContain(`drop column ${schemaName}.users.email`)
    expect(safePush.stdout).toContain("no executable statements selected")
    expect(safePush.stdout).toContain("skipped changes:")

    expect(await listColumns(schemaName, "users")).toEqual([
      { column_name: "id" },
      { column_name: "email" }
    ])

    const destructivePush = await runCli("push", "--config", config, "--allow-destructive")
    expect(destructivePush.exitCode).toBe(0)
    expect(destructivePush.stdout).toContain("applied 1 statement(s)")

    expect(await listColumns(schemaName, "users")).toEqual([
      { column_name: "id" }
    ])
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli safe mode applies additive changes and skips destructive drift", async () => {
  const { workspace, schemaName } = await makeSourceWorkspace(`
import * as Pg from "effect-qb/postgres"
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const db = Pg.schema("__SCHEMA__")

export const users = db.table("users", {
  id: C.int().pipe(C.identityByDefault),
  email: C.text(),
  nickname: C.text().pipe(C.nullable),
  displayName: C.text().pipe(C.default(Pg.Cast.to(Q.literal("guest"), Pg.Type.text()))),
  emailLower: C.text().pipe(C.generated(F.lower(Q.column("email", Pg.Type.text()))))
}).pipe(
  Table.primaryKey({ columns: ["id"], name: "users_pkey" }),
  Table.unique({ columns: ["email"], name: "users_email_key" }),
  Table.index({ name: "users_email_idx", columns: ["email"] }),
  Table.check("users_email_check", Q.neq(Q.column("email", Pg.Type.text()), Q.literal("blocked")))
)
`)
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const initialPush = await runCli("push", "--config", config)
    expect(initialPush.exitCode).toBe(0)

    await writeFile(schemaFile(workspace), `
import * as Pg from "effect-qb/postgres"
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const db = Pg.schema(${JSON.stringify(schemaName)})

export const users = db.table("users", {
  id: C.int().pipe(C.identityByDefault),
  email: C.text().pipe(C.ddlType("character varying(255)")),
  nickname: C.text(),
  displayName: C.text().pipe(C.default(Pg.Cast.to(Q.literal("member"), Pg.Type.text()))),
  emailLower: C.text().pipe(C.generated(F.upper(Q.column("email", Pg.Type.text())))),
  notes: C.text().pipe(C.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"], name: "users_pkey" })
)
`)

    const safePush = await runCli("push", "--config", config)
    expect(safePush.exitCode).toBe(0)
    expect(safePush.stdout).toContain(`add column ${schemaName}.users.notes`)
    expect(safePush.stdout).toContain("applied 1 statement(s)")
    expect(safePush.stdout).toContain(`drop constraint ${schemaName}.users.users_email_check`)
    expect(safePush.stdout).toContain(`drop constraint ${schemaName}.users.users_email_key`)
    expect(safePush.stdout).toContain(`drop index ${schemaName}.users.users_email_idx`)
    expect(safePush.stdout).toContain(`replace column ${schemaName}.users.displayName (drop)`)
    expect(safePush.stdout).toContain(`replace column ${schemaName}.users.email (drop)`)
    expect(safePush.stdout).toContain(`replace column ${schemaName}.users.emailLower (drop)`)
    expect(safePush.stdout).toContain(`replace column ${schemaName}.users.nickname (drop)`)
    expect(safePush.stdout).toContain("skipped changes:")

    expect(await listColumns(schemaName, "users")).toEqual([
      { column_name: "id" },
      { column_name: "email" },
      { column_name: "nickname" },
      { column_name: "displayName" },
      { column_name: "emailLower" },
      { column_name: "notes" }
    ])

    const columns = await describeColumns(schemaName, "users")
    expect(columns.find((column) => column.column_name === "email")?.data_type).toBe("text")
    expect(columns.find((column) => column.column_name === "nickname")?.is_nullable).toBe("YES")
    expect(columns.find((column) => column.column_name === "displayName")?.column_default).toContain("'guest'")
    expect(columns.find((column) => column.column_name === "emailLower")?.is_generated).toBe("ALWAYS")
    expect(columns.find((column) => column.column_name === "emailLower")?.generation_expression).toContain("lower(")

    expect(await listConstraints(schemaName, "users")).toEqual([
      { conname: "users_email_check", contype: "c" },
      { conname: "users_email_key", contype: "u" },
      { conname: "users_pkey", contype: "p" }
    ])

    expect(await listIndexes(schemaName, "users")).toEqual([
      { indexname: "users_email_idx" },
      { indexname: "users_email_key" },
      { indexname: "users_pkey" }
    ])

    const secondSafePush = await runCli("push", "--config", config)
    expect(secondSafePush.exitCode).toBe(0)
    expect(secondSafePush.stdout).toContain("no executable statements selected")
    expect(secondSafePush.stdout).toContain("skipped changes:")
    expect(secondSafePush.stdout).toContain(`drop constraint ${schemaName}.users.users_email_check`)
    expect(secondSafePush.stdout).toContain(`drop index ${schemaName}.users.users_email_idx`)
    expect(secondSafePush.stdout).toContain(`replace column ${schemaName}.users.email (drop)`)
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli migrate generate can split safe and destructive changes", async () => {
  const { workspace, schemaName } = await makeWorkspace()
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const initialPush = await runCli("push", "--config", config)
    expect(initialPush.exitCode).toBe(0)

    await writeFile(
      schemaFile(workspace),
      renderTableSource(schemaName, `  id: C.text(),\n  nickname: C.text().pipe(C.nullable)`)
    )

    const safeGenerate = await runCli("migrate", "generate", "--config", config, "--name", "safe_phase")
    expect(safeGenerate.exitCode).toBe(0)
    expect(safeGenerate.stdout).toContain("wrote 0001_safe_phase.sql")
    expect(safeGenerate.stdout).toContain(`drop column ${schemaName}.users.email`)
    expect(safeGenerate.stdout).toContain("skipped changes:")

    const safeSql = await readFile(join(workspace, "migrations", "0001_safe_phase.sql"), "utf8")
    expect(safeSql).toContain(`alter table "${schemaName}"."users" add column "nickname" text;`)
    expect(safeSql).not.toContain(`drop column "email"`)

    const safeUp = await runCli("migrate", "up", "--config", config)
    expect(safeUp.exitCode).toBe(0)
    expect(safeUp.stdout).toContain("applied 1 migration(s)")

    expect(await listColumns(schemaName, "users")).toEqual([
      { column_name: "id" },
      { column_name: "email" },
      { column_name: "nickname" }
    ])

    const destructiveGenerate = await runCli(
      "migrate",
      "generate",
      "--config",
      config,
      "--allow-destructive",
      "--name",
      "destructive_phase"
    )
    expect(destructiveGenerate.exitCode).toBe(0)
    expect(destructiveGenerate.stdout).toContain("wrote 0002_destructive_phase.sql")

    const destructiveSql = await readFile(join(workspace, "migrations", "0002_destructive_phase.sql"), "utf8")
    expect(destructiveSql).toContain(`alter table "${schemaName}"."users" drop column "email";`)
    expect(destructiveSql).not.toContain(`add column "nickname"`)

    const destructiveUp = await runCli("migrate", "up", "--config", config)
    expect(destructiveUp.exitCode).toBe(0)
    expect(destructiveUp.stdout).toContain("applied 1 migration(s)")

    expect(await listColumns(schemaName, "users")).toEqual([
      { column_name: "id" },
      { column_name: "nickname" }
    ])

    const finalPushDryRun = await runCli("push", "--config", config, "--dry-run")
    expect(finalPushDryRun.exitCode).toBe(0)
    expect(finalPushDryRun.stdout).toContain("planned changes: none")
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli applies pending migrations from alternate dirs and tables in order", async () => {
  const { workspace, schemaName } = await makeWorkspace()
  try {
    await dropSchema(schemaName)

    await writeFile(join(workspace, "effectdb.config.ts"), renderSchemaSource(schemaName, {
      databaseUrl: postgresUrl,
      migrationsDir: "db/migrations",
      migrationsTable: `${schemaName}.migration_log`
    }))

    const config = configFile(workspace)

    const initialPush = await runCli("push", "--config", config)
    expect(initialPush.exitCode).toBe(0)

    await mkdir(join(workspace, "db", "migrations"), { recursive: true })
    await Bun.write(join(workspace, "db", "migrations", "0002_add_nickname.sql"), `alter table "${schemaName}"."users" add column "nickname" text;\n`)
    await Bun.write(join(workspace, "db", "migrations", "0010_add_title.sql"), `alter table "${schemaName}"."users" add column "title" text;\n`)
    await Bun.write(join(workspace, "db", "migrations", "0001_add_slug.sql"), `alter table "${schemaName}"."users" add column "slug" text;\n`)

    const migrateUp = await runCli("migrate", "up", "--config", config)
    expect(migrateUp.exitCode).toBe(0)
    expect(migrateUp.stdout).toContain("applied 3 migration(s)")
    expect(migrateUp.stdout).toContain("0001_add_slug.sql")
    expect(migrateUp.stdout).toContain("0002_add_nickname.sql")
    expect(migrateUp.stdout).toContain("0010_add_title.sql")

    expect(await listColumns(schemaName, "users")).toEqual([
      { column_name: "id" },
      { column_name: "email" },
      { column_name: "slug" },
      { column_name: "nickname" },
      { column_name: "title" }
    ])

    const recordedMigrations = await execPostgres(`
      select name
      from "${schemaName}"."migration_log"
      order by name
    `)
    expect(recordedMigrations).toEqual([
      { name: "0001_add_slug.sql" },
      { name: "0002_add_nickname.sql" },
      { name: "0010_add_title.sql" }
    ])

    const secondUp = await runCli("migrate", "up", "--config", config)
    expect(secondUp.exitCode).toBe(0)
    expect(secondUp.stdout).toContain("no pending migrations")
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli reports migration status, rolls back, and repairs orphaned records", async () => {
  const { workspace, schemaName } = await makeWorkspace()
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const initialPush = await runCli("push", "--config", config)
    expect(initialPush.exitCode).toBe(0)

    await mkdir(join(workspace, "migrations"), { recursive: true })
    await Bun.write(join(workspace, "migrations", "0001_add_slug.sql"), `
-- effect-db:up
alter table "${schemaName}"."users" add column "slug" text;
-- effect-db:down
alter table "${schemaName}"."users" drop column "slug";
`)
    await Bun.write(join(workspace, "migrations", "0002_add_nickname.sql"), `
-- effect-db:up
alter table "${schemaName}"."users" add column "nickname" text;
-- effect-db:down
alter table "${schemaName}"."users" drop column "nickname";
`)

    const statusBefore = await runCli("migrate", "status", "--config", config)
    expect(statusBefore.exitCode).toBe(0)
    expect(statusBefore.stdout).toContain("applied migrations (0):")
    expect(statusBefore.stdout).toContain("pending migrations (2):")

    const migrateUp = await runCli("migrate", "up", "--config", config)
    expect(migrateUp.exitCode).toBe(0)
    expect(migrateUp.stdout).toContain("applied 2 migration(s)")

    expect(await listColumns(schemaName, "users")).toEqual([
      { column_name: "id" },
      { column_name: "email" },
      { column_name: "slug" },
      { column_name: "nickname" }
    ])

    const statusAfterUp = await runCli("migrate", "status", "--config", config)
    expect(statusAfterUp.exitCode).toBe(0)
    expect(statusAfterUp.stdout).toContain("applied migrations (2):")
    expect(statusAfterUp.stdout).toContain("pending migrations (0):")

    const migrateDown = await runCli("migrate", "down", "--config", config, "--steps", "1")
    expect(migrateDown.exitCode).toBe(0)
    expect(migrateDown.stdout).toContain("rolled back 1 migration(s)")

    expect(await listColumns(schemaName, "users")).toEqual([
      { column_name: "id" },
      { column_name: "email" },
      { column_name: "slug" }
    ])

    await execPostgres(`
      insert into "${schemaName}"."effect_qb_migrations" (name)
      values ('9999_orphan.sql');
    `)

    const repair = await runCli("migrate", "repair", "--config", config)
    expect(repair.exitCode).toBe(0)
    expect(repair.stdout).toContain("repaired 1 migration record(s)")

    const statusAfterRepair = await runCli("migrate", "status", "--config", config)
    expect(statusAfterRepair.exitCode).toBe(0)
    expect(statusAfterRepair.stdout).toContain("applied migrations (1):")
    expect(statusAfterRepair.stdout).toContain("pending migrations (1):")
    expect(statusAfterRepair.stdout).not.toContain("9999_orphan.sql")
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli surfaces manual enum changes during push and migrate generate", async () => {
  const { workspace, schemaName } = await makeSourceWorkspace(`
import * as Schema from "effect/Schema"
import * as Pg from "effect-qb/postgres"
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const db = Pg.schema("__SCHEMA__")
const types = Pg.schema("__SCHEMA__")

const status = types.enum("status", ["pending", "active"])

export const users = db.table("users", {
  id: C.text(),
  status: C.custom(Schema.String, Pg.Type.enum("status")).pipe(C.ddlType("\\"__SCHEMA__\\".\\"status\\""))
}).pipe(
  Table.primaryKey("id")
)

export { status }
`)
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const initialPush = await runCli("push", "--config", config)
    expect(initialPush.exitCode).toBe(0)

    await writeFile(schemaFile(workspace), `
import * as Schema from "effect/Schema"
import * as Pg from "effect-qb/postgres"
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const db = Pg.schema(${JSON.stringify(schemaName)})
const types = Pg.schema(${JSON.stringify(schemaName)})

const status = types.enum("status", ["pending"])

export const users = db.table("users", {
  id: C.text(),
  status: C.custom(Schema.String, Pg.Type.enum("status")).pipe(C.ddlType(${JSON.stringify(`"${schemaName}"."status"`)}))
}).pipe(
  Table.primaryKey("id")
)

export { status }
`)

    const shrinkPush = await runCli("push", "--config", config)
    expect(shrinkPush.exitCode).toBe(0)
    expect(shrinkPush.stdout).toContain(`manual enum migration required for ${schemaName}.status`)
    expect(shrinkPush.stdout).toContain("no executable statements selected")
    expect(shrinkPush.stdout).toContain("skipped changes:")

    const shrinkGenerate = await runCli("migrate", "generate", "--config", config, "--name", "enum_shrink")
    expect(shrinkGenerate.exitCode).toBe(0)
    expect(shrinkGenerate.stdout).toContain("no executable migration changes selected")
    expect(shrinkGenerate.stdout).toContain(`manual enum migration required for ${schemaName}.status`)

    await writeFile(schemaFile(workspace), `
import * as Schema from "effect/Schema"
import * as Pg from "effect-qb/postgres"
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const db = Pg.schema(${JSON.stringify(schemaName)})
const types = Pg.schema(${JSON.stringify(schemaName)})

const status = types.enum("status", ["active", "pending"])

export const users = db.table("users", {
  id: C.text(),
  status: C.custom(Schema.String, Pg.Type.enum("status")).pipe(C.ddlType(${JSON.stringify(`"${schemaName}"."status"`)}))
}).pipe(
  Table.primaryKey("id")
)

export { status }
`)

    const reorderPush = await runCli("push", "--config", config)
    expect(reorderPush.exitCode).toBe(0)
    expect(reorderPush.stdout).toContain(`manual enum migration required for ${schemaName}.status`)
    expect(reorderPush.stdout).toContain("no executable statements selected")

    const reorderGenerate = await runCli("migrate", "generate", "--config", config, "--name", "enum_reorder")
    expect(reorderGenerate.exitCode).toBe(0)
    expect(reorderGenerate.stdout).toContain("no executable migration changes selected")
    expect(reorderGenerate.stdout).toContain(`manual enum migration required for ${schemaName}.status`)
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pull creates source definitions for unmanaged tables", async () => {
  const { workspace, schemaName } = await makeWorkspace()
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)
    const initialSchema = await readSchema(workspace)

    const initialPush = await runCli("push", "--config", config)
    expect(initialPush.exitCode).toBe(0)

    await execPostgres(`
      create table "${schemaName}"."profiles" (
        "id" text not null primary key
      );
    `)

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).toBe(0)
    expect(pull.stdout).toContain("update schema.ts")
    const nextSchema = await readSchema(workspace)
    expect(nextSchema).not.toBe(initialSchema)
    expect(nextSchema).toContain(`const profiles = db.table("profiles"`)
    expect(nextSchema).toContain(`export { users, profiles }`)
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pull fails when filtered tables reference missing source targets", async () => {
  const { workspace, schemaName } = await makeWorkspaceWithFiles({
    "schema.ts": `
import * as Pg from "effect-qb/postgres"
import { Column as C, Table } from "effect-qb/postgres"

const db = Pg.schema("__SCHEMA__")

export const users = db.table("users", {
  id: C.uuid(),
  email: C.text()
}).pipe(
  Table.primaryKey("id")
)
`
  }, {
    databaseUrl: postgresUrl,
    filter: {
      tables: ["users"]
    }
  })
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)

    await execPostgres(`
      create table "${schemaName}"."orgs" (
        "id" uuid not null primary key
      );

      alter table "${schemaName}"."users"
      add column "orgId" uuid,
      add constraint "users_org_id_fkey"
      foreign key ("orgId") references "${schemaName}"."orgs" ("id");
    `)

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).not.toBe(0)
    expect(`${pull.stdout}\n${pull.stderr}`).toContain(`Cannot render foreign key from ${schemaName}.users to missing source table '${schemaName}.orgs'`)
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli accepts --url overrides over the configured database url", async () => {
  const { workspace, schemaName } = await makeWorkspace(
    undefined,
    "postgres://effect_qb:effect_qb@127.0.0.1:1/effect_qb_test"
  )
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const failedPush = await runCli("push", "--config", config)
    expect(failedPush.exitCode).not.toBe(0)
    expect(`${failedPush.stdout}\n${failedPush.stderr}`).toContain("PgClient: Failed to connect")

    const push = await runCli("push", "--config", config, "--url", postgresUrl)
    expect(push.exitCode).toBe(0)
    expect(push.stdout).toContain("applied 2 statement(s)")

    const createdTables = await execPostgres(
      `select tablename from pg_tables where schemaname = $1 order by tablename`,
      [schemaName]
    )
    expect(createdTables).toEqual([{ tablename: "users" }])

    await execPostgres(`
      alter table "${schemaName}"."users" add column "name" text;
    `)

    const pull = await runCli("pull", "--config", config, "--url", postgresUrl)
    expect(pull.exitCode).toBe(0)
    expect(pull.stdout).toContain("updated 1 file(s)")

    const pulledSchema = await readSchema(workspace)
    expect(pulledSchema).toContain(`name: Column.text().pipe(Column.nullable)`)

    await writeFile(
      schemaFile(workspace),
      pulledSchema.replace(
        `  name: Column.text().pipe(Column.nullable)\n`,
        `  name: Column.text().pipe(Column.nullable),\n  nickname: Column.text().pipe(Column.nullable)\n`
      )
    )

    const migrateGenerate = await runCli("migrate", "generate", "--config", config, "--url", postgresUrl, "--name", "override_path")
    expect(migrateGenerate.exitCode).toBe(0)
    expect(migrateGenerate.stdout).toContain("wrote 0001_override_path.sql")

    const migrateUp = await runCli("migrate", "up", "--config", config, "--url", postgresUrl)
    expect(migrateUp.exitCode).toBe(0)
    expect(migrateUp.stdout).toContain("applied 1 migration(s)")

    expect(await listColumns(schemaName, "users")).toEqual([
      { column_name: "id" },
      { column_name: "email" },
      { column_name: "name" },
      { column_name: "nickname" }
    ])
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli honors source include exclude and table filters across multiple files", async () => {
  const { workspace, schemaName } = await makeWorkspaceWithFiles({
    "tables/users.ts": `
import * as Pg from "effect-qb/postgres"
import { Column as C, Table } from "effect-qb/postgres"

const db = Pg.schema("__SCHEMA__")

export const users = db.table("users", {
  id: C.text(),
  email: C.text()
}).pipe(
  Table.primaryKey("id")
)
`,
    "tables/orgs.ts": `
import * as Pg from "effect-qb/postgres"
import { Column as C, Table } from "effect-qb/postgres"

const db = Pg.schema("__SCHEMA__")

export const orgs = db.table("orgs", {
  id: C.text(),
  name: C.text()
}).pipe(
  Table.primaryKey("id")
)
`,
    "tables/ignored.ts": `
import * as Pg from "effect-qb/postgres"
import { Column as C, Table } from "effect-qb/postgres"

const db = Pg.schema("__SCHEMA__")

export const audits = db.table("audits", {
  id: C.text()
}).pipe(
  Table.primaryKey("id")
)
`
  }, {
    databaseUrl: postgresUrl,
    include: ["tables/**/*.ts"],
    exclude: ["tables/ignored.ts"],
    filter: {
      tables: ["users", "orgs"]
    }
  })
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)
    const ignoredBefore = await readFile(join(workspace, "tables", "ignored.ts"), "utf8")

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)

    const createdTables = await execPostgres(
      `select tablename from pg_tables where schemaname = $1 order by tablename`,
      [schemaName]
    )
    expect(createdTables).toEqual([
      { tablename: "orgs" },
      { tablename: "users" }
    ])

    await execPostgres(`
      create table "${schemaName}"."audits" (
        "id" text not null primary key
      );

      alter table "${schemaName}"."users" add column "nickname" text;
      alter table "${schemaName}"."orgs" add column "slug" text;
    `)

    const pullDryRun = await runCli("pull", "--config", config, "--dry-run")
    expect(pullDryRun.exitCode).toBe(0)
    expect(pullDryRun.stdout).toContain("update tables/orgs.ts")
    expect(pullDryRun.stdout).toContain("update tables/users.ts")
    expect(pullDryRun.stdout).not.toContain("ignored.ts")

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).toBe(0)
    expect(pull.stdout).toContain("updated 2 file(s)")

    expect(await readFile(join(workspace, "tables", "users.ts"), "utf8")).toContain("nickname")
    expect(await readFile(join(workspace, "tables", "orgs.ts"), "utf8")).toContain("slug")
    expect(await readFile(join(workspace, "tables", "ignored.ts"), "utf8")).toBe(ignoredBefore)

    const secondPullDryRun = await runCli("pull", "--config", config, "--dry-run")
    expect(secondPullDryRun.exitCode).toBe(0)
    expect(secondPullDryRun.stdout).toContain("schema definitions are already up to date")
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli round-trips enum, foreign-key, generated, identity, and rich index metadata", async () => {
  const { workspace, schemaName } = await makeSourceWorkspace(`
import * as Schema from "effect/Schema"
import * as Pg from "effect-qb/postgres"
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const tables = Pg.schema("__SCHEMA__")
const types = Pg.schema("__SCHEMA__")

const status = types.enum("status", ["pending", "active"])

const orgs = tables.table("orgs", {
  id: C.uuid(),
  slug: C.text()
}).pipe(
  Table.primaryKey({ columns: ["id"], name: "orgs_pkey" }),
  Table.unique({ columns: ["slug"], name: "orgs_slug_key" })
)

const users = tables.table("users", {
  id: C.int().pipe(C.identityByDefault),
  orgId: C.uuid(),
  status: C.custom(Schema.String, Pg.Type.enum("status")).pipe(C.ddlType("\\"__SCHEMA__\\".\\"status\\"")),
  email: C.text(),
  alias: C.text().pipe(C.nullable),
  displayName: C.text().pipe(C.default(Pg.Cast.to(Q.literal("guest"), Pg.Type.text()))),
  emailLower: C.text().pipe(C.generated(F.lower(Q.column("email", Pg.Type.text())))),
  note: C.text().pipe(C.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"], name: "users_pkey" }),
  Table.unique({ columns: ["alias"], name: "users_alias_key", nullsNotDistinct: true }),
  Table.foreignKey({
    columns: "orgId",
    target: () => orgs,
    referencedColumns: "id",
    name: "users_org_id_fkey",
    onDelete: "cascade",
    onUpdate: "noAction",
    deferrable: true,
    initiallyDeferred: true
  }),
    Table.index({
      name: "users_email_lookup_idx",
      method: "btree",
      keys: [
        {
          expression: F.lower(Q.column("email", Pg.Type.text())),
          order: "desc",
          nulls: "last"
        }
      ],
      include: ["displayName"],
      predicate: Q.isNotNull(Q.column("email", Pg.Type.text()))
    }),
    Table.index({
      name: "users_note_idx",
      keys: [
        {
          column: "note",
          order: "asc",
          nulls: "first"
        }
      ],
      predicate: Q.isNotNull(Q.column("note", Pg.Type.text()))
    })
  )

export { status, orgs, users }
`)
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)
    expect(push.stdout).toContain(`create enum ${schemaName}.status`)
    expect(push.stdout).toContain(`create table ${schemaName}.users`)

    const databaseObjects = await execPostgres(
      `select tablename from pg_tables where schemaname = $1 order by tablename`,
      [schemaName]
    )
    expect(databaseObjects).toEqual([
      { tablename: "orgs" },
      { tablename: "users" }
    ])

    const indexes = await execPostgres(
      `select indexname from pg_indexes where schemaname = $1 and tablename = 'users' order by indexname`,
      [schemaName]
    )
    expect(indexes).toEqual([
      { indexname: "users_alias_key" },
      { indexname: "users_email_lookup_idx" },
      { indexname: "users_note_idx" },
      { indexname: "users_pkey" }
    ])

    const pullDryRun = await runCli("pull", "--config", config, "--dry-run")
    expect(pullDryRun.exitCode).toBe(0)
    expect(pullDryRun.stdout).toContain("update schema.ts")

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).toBe(0)
    expect(pull.stdout).toContain("updated 1 file(s)")

    const pulledSchema = await readSchema(workspace)
    expect(pulledSchema).toContain(`const status = types.enum("status", ["pending", "active"])`)
    expect(pulledSchema).toContain(`Column.identityByDefault`)
    expect(pulledSchema).toContain(`status: status.column()`)
    expect(pulledSchema).toContain(`users_org_id_fkey`)
    expect(pulledSchema).toContain(`users_alias_key`)
    expect(pulledSchema).toContain(`nullsNotDistinct: true`)
    expect(pulledSchema).toContain(`onDelete: "cascade"`)
    expect(pulledSchema).toContain(`deferrable: true`)
    expect(pulledSchema).toContain(`initiallyDeferred: true`)
    expect(pulledSchema).toContain(`users_email_lookup_idx`)
    expect(pulledSchema).toContain(`include: ["displayName"]`)
    expect(pulledSchema).toContain(`order: "desc"`)
    expect(pulledSchema).toContain(`nulls: "last"`)
    expect(pulledSchema).toContain(`users_note_idx`)
    expect(pulledSchema).toContain(`nulls: "first"`)
    expect(pulledSchema).toContain(`emailLower`)
    expect(pulledSchema).toContain(`Column.generated(`)

    const secondPullDryRun = await runCli("pull", "--config", config, "--dry-run")
    expect(secondPullDryRun.exitCode).toBe(0)
    expect(secondPullDryRun.stdout).toContain("schema definitions are already up to date")
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pulls supported checks and deferrable constraints into canonical source definitions", async () => {
  const { workspace, schemaName } = await makeSourceWorkspace(`
import * as Pg from "effect-qb/postgres"
import { Column as C, Table } from "effect-qb/postgres"

const db = Pg.schema("__SCHEMA__")

export const users = db.table("users", {
  id: C.int(),
  email: C.text()
})
`)
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)

    await execPostgres(`
      alter table "${schemaName}"."users"
      add constraint "users_pkey" primary key ("id") deferrable initially deferred,
      add constraint "users_email_key" unique ("email") deferrable initially deferred,
      add constraint "users_email_check" check ("email" <> 'blocked') no inherit;
    `)

    const pullDryRun = await runCli("pull", "--config", config, "--dry-run")
    expect(pullDryRun.exitCode).toBe(0)
    expect(pullDryRun.stdout).toContain("update schema.ts")

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).toBe(0)
    expect(pull.stdout).toContain("updated 1 file(s)")

    const pulledSchema = await readSchema(workspace)
    expect(pulledSchema).toContain(`users_pkey`)
    expect(pulledSchema).toContain(`deferrable: true`)
    expect(pulledSchema).toContain(`initiallyDeferred: true`)
    expect(pulledSchema).toContain(`users_email_key`)
    expect(pulledSchema).toContain(`users_email_check`)
    expect(pulledSchema).toContain(`noInherit: true`)

  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli canonicalizes pulled enums, schemas, and sequences in new files", async () => {
  const { workspace, schemaName } = await makeEmptyWorkspace({
    filter: {
      schemas: undefined,
      tables: ["users"]
    }
  })
  try {
    await dropSchema(schemaName)
    const sequenceRegclass = `'${schemaName}.users_id_seq'::regclass`
    await execPostgres(`
      create schema "${schemaName}";
      create type "${schemaName}"."status" as enum ('pending', 'active');
      create sequence "${schemaName}"."users_id_seq";
      create table "${schemaName}"."users" (
        "id" bigint not null default nextval(${sequenceRegclass}),
        "status" "${schemaName}"."status" not null default 'active'::"${schemaName}"."status",
        constraint "users_pkey" primary key ("id")
      );
    `)

    const pull = await runCli("pull", "--config", configFile(workspace))
    expect(pull.exitCode).toBe(0)
    expect(pull.stdout).toContain(`create src/${schemaName}.schema.ts`)

    const pulled = await readFile(join(workspace, "src", `${schemaName}.schema.ts`), "utf8")
    expect(pulled).toContain(`const ${schemaName} = Pg.schema("${schemaName}")`)
    expect(pulled).toContain(`const status = ${schemaName}.enum("status", ["pending", "active"])`)
    expect(pulled).toContain(`status: status.column().pipe(`)
    expect(pulled).toContain(`Column.default(Pg.Query.literal("active").pipe(Pg.Cast.to(status.type())))`)
    expect(pulled).toContain(`Column.default(Pg.Function.nextVal(${schemaName}.sequence("users_id_seq")))`)
    expect(pulled).not.toContain(`Column.ddlType("${schemaName}.status")`)
  } finally {
    await rm(workspace, { recursive: true, force: true })
    await dropSchema(schemaName)
  }
})

test("postgres cli pull fails for unsupported index key definitions", async () => {
  const { workspace, schemaName } = await makeWorkspace()
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)

    await execPostgres(`
      create index "users_email_pattern_idx"
      on "${schemaName}"."users" ("email" text_pattern_ops);
    `)

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).not.toBe(0)
    expect(`${pull.stdout}\n${pull.stderr}`).toContain(`Unsupported PostgreSQL index key definition`)
    expect(`${pull.stdout}\n${pull.stderr}`).toContain(`users_email_pattern_idx`)
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pull fails for unsupported index collations", async () => {
  const { workspace, schemaName } = await makeWorkspace()
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)

    await execPostgres(`
      create index "users_email_c_idx"
      on "${schemaName}"."users" (("email" collate "C"));
    `)

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).not.toBe(0)
    expect(`${pull.stdout}\n${pull.stderr}`).toContain(`Unsupported PostgreSQL index collation`)
    expect(`${pull.stdout}\n${pull.stderr}`).toContain(`users_email_c_idx`)
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pulls composite foreign keys into canonical source definitions", async () => {
  const { workspace, schemaName } = await makeSourceWorkspace(`
import * as Pg from "effect-qb/postgres"
import { Column as C, Table } from "effect-qb/postgres"

const db = Pg.schema("__SCHEMA__")

const orgs = db.table("orgs", {
  tenantId: C.uuid(),
  slug: C.text(),
  name: C.text()
}).pipe(
  Table.primaryKey({ columns: ["tenantId", "slug"], name: "orgs_pkey" })
)

const memberships = db.table("memberships", {
  tenantId: C.uuid(),
  orgSlug: C.text(),
  userId: C.uuid().pipe(C.primaryKey)
})

export { orgs, memberships }
`)
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)

    await execPostgres(`
      alter table "${schemaName}"."memberships"
      add constraint "memberships_org_fkey"
      foreign key ("tenantId", "orgSlug")
      references "${schemaName}"."orgs" ("tenantId", "slug")
      on delete cascade
      on update no action
      deferrable initially deferred;
    `)

    const pullDryRun = await runCli("pull", "--config", config, "--dry-run")
    expect(pullDryRun.exitCode).toBe(0)
    expect(pullDryRun.stdout).toContain("update schema.ts")

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).toBe(0)
    expect(pull.stdout).toContain("updated 1 file(s)")

    const pulledSchema = await readSchema(workspace)
    expect(pulledSchema).toContain(`memberships_org_fkey`)
    expect(pulledSchema).toContain(`columns: ["tenantId", "orgSlug"]`)
    expect(pulledSchema).toContain(`target: () => orgs`)
    expect(pulledSchema).toContain(`referencedColumns: ["tenantId", "slug"]`)
    expect(pulledSchema).toContain(`onDelete: "cascade"`)
    expect(pulledSchema).toContain(`onUpdate: "noAction"`)
    expect(pulledSchema).toContain(`deferrable: true`)
    expect(pulledSchema).toContain(`initiallyDeferred: true`)

  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pulls schema-builder table declarations into canonical source definitions", async () => {
  const { workspace, schemaName } = await makeSourceWorkspace(`
import * as Pg from "effect-qb/postgres"
import { Column as C, Table } from "effect-qb/postgres"

const db = Pg.schema("__SCHEMA__")

export const audits = db.table("audits", {
  id: C.uuid().pipe(C.primaryKey),
  actorEmail: C.text()
})
`)
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)

    await execPostgres(`
      alter table "${schemaName}"."audits"
      add column "actorName" text;

      create index "audits_actor_name_idx"
      on "${schemaName}"."audits" ("actorName");
    `)

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).toBe(0)

    const pulledSchema = await readSchema(workspace)
    expect(pulledSchema).toContain(`const audits = db.table(`)
    expect(pulledSchema).toContain(`actorName: Column.text().pipe(Column.nullable, Column.index({ name: "audits_actor_name_idx"`)
    expect(pulledSchema).toContain(`audits_actor_name_idx`)

    await assertIdempotentPullPush(config)
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pulls builtin postgres columns with dedicated constructors", async () => {
  const { workspace, schemaName } = await makeWorkspace()
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)

    await execPostgres(`
      alter table "${schemaName}"."users"
      add column "short_name" varchar(32),
      add column "code" char(1),
      add column "labels" text[],
      add column "price" numeric(10,4),
      add column "amount" bigint,
      add column "observed_at" timestamp with time zone,
      add column "payload" jsonb;
    `)
    await execPostgres(`
      create index "users_payload_has_foo_idx"
      on "${schemaName}"."users" ("id")
      where "payload" ? 'foo';
    `)

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).toBe(0)
    expect(pull.stdout).toContain("updated 1 file(s)")

    const pulledSchema = await readSchema(workspace)
    expect(pulledSchema).toContain(`payload: Column.jsonb(Schema.Unknown).pipe(Column.nullable)`)
    expect(pulledSchema).toContain(`Column.varchar(32)`)
    expect(pulledSchema).toContain(`Column.char(1)`)
    expect(pulledSchema).toContain(`Column.text().pipe(Column.array(), Column.nullable)`)
    expect(pulledSchema).toContain(`Column.number({ precision: 10, scale: 4 }).pipe(Column.nullable)`)
    expect(pulledSchema).toContain(`Column.int8()`)
    expect(pulledSchema).toContain(`Column.timestamptz()`)
    expect(pulledSchema).toContain(`Pg.Json.jsonb.hasKey(`)
    expect(pulledSchema).not.toContain(`Pg.Json.json.hasKey(`)
    expect(pulledSchema).not.toContain(`kind: "int8"`)
    expect(pulledSchema).not.toContain(`Column.ddlType("numeric(10,4)")`)
    expect(pulledSchema).not.toContain(`Column.ddlType("varchar(32)")`)
    expect(pulledSchema).not.toContain(`Column.ddlType("char(1)")`)
    expect(pulledSchema).not.toContain(`Column.ddlType("text[]")`)
    expect(pulledSchema).not.toContain(`Column.ddlType("jsonb")`)

  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pulls class table declarations into canonical source definitions", async () => {
  const { workspace, schemaName } = await makeSourceWorkspace(`
import * as Pg from "effect-qb/postgres"
import { Column as C, Table } from "effect-qb/postgres"

export class Sessions extends Table.Class<Sessions>("sessions", "__SCHEMA__")({
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
}) {}
`)
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)

    await execPostgres(`
      alter table "${schemaName}"."sessions"
      add column "lastSeenAt" timestamp;

      create index "sessions_email_idx"
      on "${schemaName}"."sessions" ("email");
    `)

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).toBe(0)

    const pulledSchema = await readSchema(workspace)
    expect(pulledSchema).toContain(`class Sessions extends Table.Class<Sessions>("sessions", "${schemaName}")({`)
    expect(pulledSchema).toContain(`lastSeenAt: Column.timestamp().pipe(`)
    expect(pulledSchema).toContain(`Column.timestamp().pipe(Column.nullable)`)
    expect(pulledSchema).toContain(`email: Column.text().pipe(Column.index({ name: "sessions_email_idx"`)
    expect(pulledSchema).toContain(`sessions_email_idx`)

  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pull creates source definitions for missing enums", async () => {
  const { workspace, schemaName } = await makeWorkspace()
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)

    await execPostgres(`
      create type "${schemaName}"."status" as enum ('pending', 'active');
      alter table "${schemaName}"."users"
      add column "status" "${schemaName}"."status";
    `)

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).toBe(0)
    expect(pull.stdout).toContain("update schema.ts")
    const nextSchema = await readSchema(workspace)
    expect(nextSchema).toContain(`status: db.enum("status", ["pending", "active"]).column().pipe(Column.nullable)`)
    expect(nextSchema).toContain(`export { users }`)
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pull fails for unsupported check constraint expressions", async () => {
  const { workspace, schemaName } = await makeWorkspace()
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)

    await execPostgres(`
      alter table "${schemaName}"."users"
      add constraint "users_email_c_check"
      check ((email collate "C") <> ''::text);
    `)

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).not.toBe(0)
    expect(`${pull.stdout}\n${pull.stderr}`).toContain(`Unsupported PostgreSQL expression in check constraint users_email_c_check`)
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pull fails for unsupported default expressions", async () => {
  const { workspace, schemaName } = await makeWorkspace()
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)

    await execPostgres(`
      alter table "${schemaName}"."users"
      add column "nickname" text default ('foo' collate "C");
    `)

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).not.toBe(0)
    expect(`${pull.stdout}\n${pull.stderr}`).toContain(`Unsupported PostgreSQL expression in default for users.nickname`)
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pull fails for unsupported generated expressions", async () => {
  const { workspace, schemaName } = await makeWorkspace()
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config)
    expect(push.exitCode).toBe(0)

    await execPostgres(`
      alter table "${schemaName}"."users"
      add column "email_c" text generated always as (("email" collate "C")) stored;
    `)

    const pull = await runCli("pull", "--config", config)
    expect(pull.exitCode).not.toBe(0)
    expect(`${pull.stdout}\n${pull.stderr}`).toContain(`Unsupported PostgreSQL expression in generated expression for users.email_c`)
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)
