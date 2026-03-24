import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { execPostgres } from "./helpers.ts"

const repoRoot = process.cwd()
const cliEntry = join(repoRoot, "src", "cli.ts")

const randomId = () => Math.random().toString(36).slice(2, 10)

const renderSchemaSource = (schemaName: string) => `
import { SchemaManagement } from "#postgres"

export default SchemaManagement.defineConfig({
  dialect: "postgres",
  db: {
    url: "postgres://effect_qb:effect_qb@127.0.0.1:55432/effect_qb_test"
  },
  source: {
    include: ["schema.ts"]
  },
  filter: {
    schemas: [${JSON.stringify(schemaName)}]
  },
  migrations: {
    dir: "migrations",
    table: ${JSON.stringify(`${schemaName}.effect_qb_migrations`)}
  },
  safety: {
    nonDestructiveDefault: true
  }
})
`

const renderTableSource = (
  schemaName: string,
  tableFields = `  id: C.text(),
  email: C.text()`
) => `
import { Column as C, Table } from "#postgres"

const db = Table.schema(${JSON.stringify(schemaName)})

const users = db.table("users", {
${tableFields}
}).pipe(
  Table.primaryKey("id")
)

export { users }
`

const makeWorkspace = async (tableFields?: string) => {
  const workspace = await mkdtemp(join(repoRoot, "test/.tmp-postgres-cli-"))
  const schemaName = `cli_it_${randomId()}`
  await writeFile(join(workspace, "effect-qb.config.ts"), renderSchemaSource(schemaName))
  await writeFile(join(workspace, "schema.ts"), renderTableSource(schemaName, tableFields))
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
}

const schemaFile = (workspace: string) => join(workspace, "schema.ts")
const configFile = (workspace: string) => join(workspace, "effect-qb.config.ts")
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
    expect(pulledSchema).toContain(`name: __EffectQbPullColumn.text().pipe(__EffectQbPullColumn.nullable)`)
    expect(pulledSchema).toContain(`users_email_idx`)
    expect(pulledSchema).toContain(`export { users }`)

    const secondPullDryRun = await runCli("pull", "--config", config, "--dry-run")
    expect(secondPullDryRun.exitCode).toBe(0)
    expect(secondPullDryRun.stdout).toContain("schema definitions are already up to date")

    await writeFile(
      schemaFile(workspace),
      pulledSchema.replace(
        `    email: __EffectQbPullColumn.text(),\n`,
        `    email: __EffectQbPullColumn.text(),\n    nickname: __EffectQbPullColumn.text().pipe(__EffectQbPullColumn.nullable),\n`
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

    const finalPushDryRun = await runCli("push", "--config", config, "--dry-run")
    expect(finalPushDryRun.exitCode).toBe(0)
    expect(finalPushDryRun.stdout).toContain("planned changes: none")
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

test("postgres cli pull fails when the database has unmanaged tables", async () => {
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
    expect(pull.exitCode).not.toBe(0)
    expect(`${pull.stdout}\n${pull.stderr}`).toContain(`No source table declaration found for '${schemaName}.profiles'`)
    expect(await readSchema(workspace)).toBe(initialSchema)
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)
