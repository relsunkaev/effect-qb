import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { execPostgres } from "./helpers.ts"

const repoRoot = process.cwd()
const cliEntry = join(repoRoot, "src", "cli.ts")
const postgresUrl = "postgres://effect_qb:effect_qb@127.0.0.1:55432/effect_qb_test"

const randomId = () => Math.random().toString(36).slice(2, 10)

const renderSchemaSource = (
  schemaName: string,
  databaseUrl = postgresUrl
) => `
import { SchemaManagement } from "#postgres"

export default SchemaManagement.defineConfig({
  dialect: "postgres",
  db: {
    url: ${JSON.stringify(databaseUrl)}
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

const makeWorkspace = async (
  tableFields?: string,
  databaseUrl?: string
) => {
  const workspace = await mkdtemp(join(repoRoot, "test/.tmp-postgres-cli-"))
  const schemaName = `cli_it_${randomId()}`
  await writeFile(join(workspace, "effect-qb.config.ts"), renderSchemaSource(schemaName, databaseUrl))
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
  await writeFile(join(workspace, "effect-qb.config.ts"), renderSchemaSource(schemaName, databaseUrl))
  await writeFile(join(workspace, "schema.ts"), source.replaceAll("__SCHEMA__", schemaName))
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

    const finalPushDryRun = await runCli("push", "--config", config, "--dry-run")
    expect(finalPushDryRun.exitCode).toBe(0)
    expect(finalPushDryRun.stdout).toContain("planned changes: none")

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

test("postgres cli accepts --url overrides over the configured database url", async () => {
  const { workspace, schemaName } = await makeWorkspace(
    undefined,
    "postgres://effect_qb:effect_qb@127.0.0.1:1/effect_qb_test"
  )
  try {
    await dropSchema(schemaName)

    const config = configFile(workspace)

    const push = await runCli("push", "--config", config, "--url", postgresUrl)
    expect(push.exitCode).toBe(0)
    expect(push.stdout).toContain("applied 2 statement(s)")

    const createdTables = await execPostgres(
      `select tablename from pg_tables where schemaname = $1 order by tablename`,
      [schemaName]
    )
    expect(createdTables).toEqual([{ tablename: "users" }])
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli round-trips enum, foreign-key, generated, identity, and rich index metadata", async () => {
  const { workspace, schemaName } = await makeSourceWorkspace(`
import * as Schema from "effect/Schema"
import { Column as C, Query as Q, SchemaExpression, SchemaManagement, Table } from "#postgres"

const tables = Table.schema("__SCHEMA__")
const types = SchemaManagement.schema("__SCHEMA__")

const status = types.enumType("status", ["pending", "active"] as const)

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
  status: C.custom(Schema.String, Q.type.enum("status")).pipe(C.ddlType("\\"__SCHEMA__\\".\\"status\\"")),
  email: C.text(),
  alias: C.text().pipe(C.nullable),
  displayName: C.text().pipe(C.default(SchemaExpression.parseExpression("'guest'::text"))),
  emailLower: C.text().pipe(C.generated(SchemaExpression.parseExpression("lower(email)"))),
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
        expression: SchemaExpression.parseExpression("lower(email)"),
        order: "desc",
        nulls: "last"
      }
    ],
    include: ["displayName"] as const,
    predicate: SchemaExpression.parseExpression("email is not null")
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
    predicate: SchemaExpression.parseExpression("note is not null")
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
    expect(pulledSchema).toContain(`const status = types.enumType("status", ["pending", "active"] as const)`)
    expect(pulledSchema).toContain(`__EffectQbPullColumn.identityByDefault`)
    expect(pulledSchema).toContain(`variant: "enum"`)
    expect(pulledSchema).toContain(`users_org_id_fkey`)
    expect(pulledSchema).toContain(`users_alias_key`)
    expect(pulledSchema).toContain(`nullsNotDistinct: true`)
    expect(pulledSchema).toContain(`onDelete: "cascade"`)
    expect(pulledSchema).toContain(`deferrable: true`)
    expect(pulledSchema).toContain(`initiallyDeferred: true`)
    expect(pulledSchema).toContain(`users_email_lookup_idx`)
    expect(pulledSchema).toContain(`include: ["displayName"] as const`)
    expect(pulledSchema).toContain(`order: "desc"`)
    expect(pulledSchema).toContain(`nulls: "last"`)
    expect(pulledSchema).toContain(`users_note_idx`)
    expect(pulledSchema).toContain(`nulls: "first"`)
    expect(pulledSchema).toContain(`emailLower`)
    expect(pulledSchema).toContain(`__EffectQbPullColumn.generated(`)

    const secondPullDryRun = await runCli("pull", "--config", config, "--dry-run")
    expect(secondPullDryRun.exitCode).toBe(0)
    expect(secondPullDryRun.stdout).toContain("schema definitions are already up to date")

    const finalPushDryRun = await runCli("push", "--config", config, "--dry-run")
    expect(finalPushDryRun.exitCode).toBe(0)
    expect(finalPushDryRun.stdout).toContain("planned changes: none")
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

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
import { Column as C, Table } from "#postgres"

const db = Table.schema("__SCHEMA__")

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
    expect(pulledSchema).toContain(`columns: ["tenantId", "orgSlug"] as const`)
    expect(pulledSchema).toContain(`target: () => orgs`)
    expect(pulledSchema).toContain(`referencedColumns: ["tenantId", "slug"] as const`)
    expect(pulledSchema).toContain(`onDelete: "cascade"`)
    expect(pulledSchema).toContain(`onUpdate: "noAction"`)
    expect(pulledSchema).toContain(`deferrable: true`)
    expect(pulledSchema).toContain(`initiallyDeferred: true`)

    const secondPullDryRun = await runCli("pull", "--config", config, "--dry-run")
    expect(secondPullDryRun.exitCode).toBe(0)
    expect(secondPullDryRun.stdout).toContain("schema definitions are already up to date")

    const finalPushDryRun = await runCli("push", "--config", config, "--dry-run")
    expect(finalPushDryRun.exitCode).toBe(0)
    expect(finalPushDryRun.stdout).toContain("planned changes: none")
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pulls schema-builder table declarations into canonical source definitions", async () => {
  const { workspace, schemaName } = await makeSourceWorkspace(`
import { Column as C, Table } from "#postgres"

const db = Table.schema("__SCHEMA__")

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
    expect(pulledSchema).toContain(`actorName: __EffectQbPullColumn.text().pipe(__EffectQbPullColumn.nullable)`)
    expect(pulledSchema).toContain(`audits_actor_name_idx`)

    const pushDryRun = await runCli("push", "--config", config, "--dry-run")
    expect(pushDryRun.exitCode).toBe(0)
    expect(pushDryRun.stdout).toContain("planned changes: none")
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pulls class table declarations into canonical source definitions", async () => {
  const { workspace, schemaName } = await makeSourceWorkspace(`
import { Column as C, Table } from "#postgres"

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
    expect(pulledSchema).toContain(`class Sessions extends __EffectQbPullTable.Class<Sessions>("sessions", "${schemaName}")({`)
    expect(pulledSchema).toContain(`lastSeenAt: __EffectQbPullColumn.timestamp().pipe(`)
    expect(pulledSchema).toContain(`__EffectQbPullColumn.ddlType("timestamp without time zone"), __EffectQbPullColumn.nullable`)
    expect(pulledSchema).toContain(`static readonly [__EffectQbPullTable.options] = [`)
    expect(pulledSchema).toContain(`sessions_email_idx`)

    const pushDryRun = await runCli("push", "--config", config, "--dry-run")
    expect(pushDryRun.exitCode).toBe(0)
    expect(pushDryRun.stdout).toContain("planned changes: none")
  } finally {
    await dropSchema(schemaName).catch(() => undefined)
    await rm(workspace, { recursive: true, force: true })
  }
}, 30000)

test("postgres cli pull fails when database enums have no matching source declaration", async () => {
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
    expect(pull.exitCode).not.toBe(0)
    expect(`${pull.stdout}\n${pull.stderr}`).toContain(`No source enum declaration found for '${schemaName}.status'`)
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
