import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

const cwd = process.cwd()
const querybuilderPackageDir = join(cwd, "packages", "querybuilder")
const databasePackageDir = join(cwd, "packages", "database")
const postgresUrl = process.env.EFFECT_DB_SMOKE_POSTGRES_URL

const querybuilderTarballPath = async () => {
  const proc = Bun.spawn([
    "bunx",
    "npm",
    "pack",
    "--json",
    querybuilderPackageDir
  ], {
    cwd,
    stdout: "pipe",
    stderr: "inherit"
  })
  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
  const start = stdout.indexOf("[")
  if (start === -1) {
    throw new Error(`Failed to parse npm pack output:\n${stdout}`)
  }
  const parsed = JSON.parse(stdout.slice(start)) as ReadonlyArray<{ readonly filename: string }>
  const filename = parsed[0]?.filename
  if (filename === undefined) {
    throw new Error(`npm pack did not return a filename:\n${stdout}`)
  }
  return resolve(cwd, filename)
}

const databaseTarballPath = async () => {
  const packageJson = JSON.parse(await Bun.file(join(databasePackageDir, "package.json")).text()) as {
    readonly name: string
    readonly version: string
  }
  const packDir = await mkdtemp(join(tmpdir(), "effect-db-pack-"))
  const filename = `${packageJson.name}-${packageJson.version}.tgz`
  await run(["bun", "pm", "pack", "--destination", packDir], databasePackageDir)
  return join(packDir, filename)
}

const run = async (
  command: readonly string[],
  workdir: string
) => {
  const proc = Bun.spawn(command, {
    cwd: workdir,
    stdout: "inherit",
    stderr: "inherit"
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}

const main = async () => {
  const querybuilderPackage = JSON.parse(await Bun.file(join(querybuilderPackageDir, "package.json")).text()) as {
    readonly peerDependencies?: { readonly effect?: string }
  }
  const effectVersion = querybuilderPackage.peerDependencies?.effect
  if (effectVersion === undefined) {
    throw new Error("effect-qb must declare an effect peer dependency")
  }

  const packedTarball = await querybuilderTarballPath()
  const packedDatabaseTarball = await databaseTarballPath()
  const consumerDir = await mkdtemp(join(tmpdir(), "effect-qb-pack-smoke-"))
  const nodeOnlyBinDir = await mkdtemp(join(tmpdir(), "effect-db-node-bin-"))

  try {
    await Bun.write(join(consumerDir, "package.json"), `${JSON.stringify({
      name: "effect-qb-pack-smoke",
      private: true,
      type: "module",
      dependencies: {
        "effect": effectVersion,
        "effect-db": `file:${packedDatabaseTarball}`,
        "effect-qb": `file:${packedTarball}`
      },
      overrides: {
        "effect-qb": `file:${packedTarball}`
      }
    }, null, 2)}\n`)

    await Bun.write(join(consumerDir, "tsconfig.json"), `${JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "Preserve",
        moduleResolution: "bundler",
        moduleDetection: "force",
        allowImportingTsExtensions: true,
        verbatimModuleSyntax: true,
        strict: true,
        noEmit: true,
        skipLibCheck: true
      },
      include: ["index.ts"]
    }, null, 2)}\n`)

    await Bun.write(join(consumerDir, "index.ts"), [
      'import { Check, Column, ForeignKey, Function, Index, Json, PrimaryKey, Query, Scalar, Table, Unique } from "effect-qb"',
      'import * as Pg from "effect-qb/postgres"',
      'import { defineConfig } from "effect-db"',
      'import * as Schema from "effect/Schema"',
      'import { tableKey } from "effect-qb/postgres/metadata"',
      "",
      'const standardUsers = Table.make("standard_users", {',
      "  id: Column.uuid().pipe(Column.primaryKey),",
      "  email: Column.text()",
      "})",
      "",
      "const standardPlan = Query.select({",
      "  id: standardUsers.id,",
      "  email: Function.lower(standardUsers.email)",
      "}).pipe(Query.from(standardUsers))",
      "",
      'const users = Table.make("users", {',
      "  id: Column.uuid().pipe(Column.primaryKey),",
      "  email: Column.text()",
      "})",
      'const memberships = Table.make("memberships", {',
      "  id: Column.uuid().pipe(Column.primaryKey),",
      "  userId: Column.uuid(),",
      "  role: Column.text()",
      "}).pipe(",
      '  PrimaryKey.make((table) => table.id).pipe(PrimaryKey.named("memberships_pkey")),',
      '  Unique.make((table) => [table.userId, table.role]).pipe(Unique.named("memberships_user_role_key")),',
      '  Index.make((table) => table.role).pipe(Index.named("memberships_role_idx"), Pg.Index.using("btree")),',
      '  ForeignKey.make((table) => table.userId, () => users.id).pipe(ForeignKey.onDelete("cascade")),',
      '  Check.make("memberships_role_check", (table) => Query.neq(table.role, ""))',
      ")",
      "",
      "const plan = Query.select({ id: users.id }).pipe(Query.from(users))",
      "const config = defineConfig({",
      '  dialect: "postgres",',
      '  db: { url: "postgres://localhost/db" },',
      '  source: { include: ["src/**/*.ts"] },',
      '  migrations: { dir: "migrations", table: "effect_qb_migrations" },',
      "  safety: { nonDestructiveDefault: true }",
      "})",
      "const userSelectSchema = Table.selectSchema(users)",
      "const membershipSelectSchema = Table.selectSchema(memberships)",
      "const userInsertSchema = Table.insertSchema(users)",
      "const userUpdateSchema = Table.updateSchema(users)",
      "const userLegacySelectSchema = users.schemas.select",
      "type PackedUserInsert = Schema.Schema.Type<typeof userInsertSchema>",
      'const packedUserInsert: PackedUserInsert = { id: "11111111-1111-1111-1111-111111111111", email: "packed@example.com" }',
      "type PackedUserUpdate = Schema.Schema.Type<typeof userUpdateSchema>",
      'const packedUserUpdate: PackedUserUpdate = { email: "next@example.com" }',
      'const key = tableKey("public", "users")',
      'const dotted = Table.make("a.b", { status: Column.text() })',
      'const split = Table.make("a", { "b.status": Column.text() })',
      'const posts = Table.make("posts", {',
      "  id: Column.uuid().pipe(Column.primaryKey),",
      "  title: Column.text().pipe(Column.nullable)",
      "})",
      "const dottedPlan = Query.select({",
      "  id: users.id,",
      '  splitStatus: split["b.status"],',
      "  dottedStatus: dotted.status",
      "}).pipe(",
      "  Query.from(users),",
      '  Query.leftJoin(split, Query.eq(split["b.status"], "right")),',
      '  Query.leftJoin(dotted, Query.eq(dotted.status, "left")),',
      "  Query.where(Query.isNotNull(dotted.status))",
      ")",
      "type DottedRow = Query.ResultRow<typeof dottedPlan>",
      'const splitCanBeNull: DottedRow["splitStatus"] = null',
      'const dottedRequired: Exclude<DottedRow["dottedStatus"], null> = "left"',
      "const valuesSource = Query.values([",
      '  { id: Query.literal(1), title: Query.literal("first") },',
      "  { id: Query.literal(2), title: Query.literal(null) }",
      ']).pipe(Query.as("seed"))',
      "const filteredValues = Query.select({",
      "  title: valuesSource.title",
      "}).pipe(",
      "  Query.where(Query.isNotNull(valuesSource.title))",
      ")",
      "type FilteredValuesRow = Query.ResultRow<typeof filteredValues>",
      'const filteredValueTitle: Exclude<FilteredValuesRow["title"], null> = "first"',
      "const titledPosts = Query.select({ title: posts.title }).pipe(",
      "  Query.from(posts),",
      "  Query.where(Query.isNotNull(posts.title))",
      ")",
      "const archivedTitledPosts = Query.select({ title: posts.title }).pipe(",
      "  Query.from(posts),",
      "  Query.where(Query.isNotNull(posts.title))",
      ")",
      "const titledUnion = Query.unionAll(titledPosts, archivedTitledPosts)",
      "type TitledUnionRow = Query.ResultRow<typeof titledUnion>",
      'const unionTitle: Exclude<TitledUnionRow["title"], null> = "first"',
      "const jsonDocs = Table.make(\"json_docs\", {",
      "  id: Column.uuid().pipe(Column.primaryKey),",
      "  payload: Column.json(Schema.Struct({",
      "    profile: Schema.Struct({",
      "      pair: Schema.Tuple([Schema.String, Schema.Number])",
      "    })",
      "  }))",
      "})",
      "const lastPairValue = jsonDocs.payload.pipe(Json.key(\"profile\"), Json.key(\"pair\"), Json.index(-1))",
      "const updatedPair = jsonDocs.payload.pipe(Json.key(\"profile\"), Json.key(\"pair\"), Json.index(-1), Json.set(true))",
      "const jsonDocsSelectSchema = Table.selectSchema(jsonDocs)",
      "type JsonDocSelect = Schema.Schema.Type<typeof jsonDocsSelectSchema>",
      "declare const jsonDocSelect: JsonDocSelect",
      "const jsonDocPair: readonly [string, number] = jsonDocSelect.payload.profile.pair",
      "type LastPairValue = Scalar.RuntimeOf<typeof lastPairValue>",
      "type UpdatedPair = Scalar.RuntimeOf<typeof updatedPair>",
      "const lastPairValueRuntime: LastPairValue = 1",
      "declare const updatedPairRuntime: UpdatedPair",
      "const updatedPairTail: boolean = updatedPairRuntime.profile.pair[1]",
      "",
      "void standardPlan",
      "void plan",
      "void config",
      "void userSelectSchema",
      "void userLegacySelectSchema",
      "void packedUserInsert",
      "void packedUserUpdate",
      "void key",
      "void dottedPlan",
      "void splitCanBeNull",
      "void dottedRequired",
      "void filteredValues",
      "void filteredValueTitle",
      "void titledUnion",
      "void unionTitle",
      "void lastPairValue",
      "void updatedPair",
      "void jsonDocPair",
      "void lastPairValueRuntime",
      "void updatedPairTail",
      ""
    ].join("\n"))

    await run(["bun", "install", "--no-save"], consumerDir)
    await run([join(cwd, "node_modules", ".bin", "tsgo"), "-p", "tsconfig.json"], consumerDir)

    const nodePath = Bun.which("node")
    if (nodePath === null) {
      throw new Error("Node.js is required for the packed effect-db smoke test")
    }
    await symlink(nodePath, join(nodeOnlyBinDir, "node"))
    await Bun.write(join(consumerDir, "node-smoke.mjs"), `
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { loadPostgresConfig } from "effect-db"
import { readMigrationFiles, writeMigrationFile } from "effect-db/postgres/migrate"
import { applyPullPlan } from "effect-db/postgres/pull"

const workspace = join(process.cwd(), "node-runtime-workspace")
await mkdir(workspace)
await writeFile(join(workspace, "effectdb.config.ts"), \`import { defineConfig } from "effect-db"

const config = {
  dialect: "postgres",
  db: { url: "postgres://localhost/effect_db" },
  source: { include: ["src/**/*.ts"] },
  migrations: { dir: "migrations", table: "effect_qb_migrations" },
  safety: { nonDestructiveDefault: true }
} satisfies Parameters<typeof defineConfig>[0]

export default defineConfig(config)\n\`)
const loaded = await loadPostgresConfig(workspace)
if (loaded.config.dialect !== "postgres") throw new Error("failed to load config under Node.js")

const migrationsDir = join(workspace, "migrations")
await writeMigrationFile(migrationsDir, "node runtime", [])
const migrations = await readMigrationFiles(migrationsDir)
if (migrations.length !== 1) throw new Error("failed to read migrations under Node.js")

const pulledPath = join(workspace, "src", "schema.ts")
await applyPullPlan({ updates: [{ filePath: pulledPath, before: "", after: "export {}\\n" }] })
if (await readFile(pulledPath, "utf8") !== "export {}\\n") throw new Error("failed to apply pull plan under Node.js")
`)
    await run([nodePath, "node-smoke.mjs"], consumerDir)
    const runCli = async (args: readonly string[]) => {
      const cli = Bun.spawn([
        join(consumerDir, "node_modules", ".bin", "effectdb"),
        ...args
      ], {
        cwd: consumerDir,
        env: {
          ...process.env,
          PATH: nodeOnlyBinDir
        },
        stdout: "pipe",
        stderr: "pipe"
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(cli.stdout).text(),
        new Response(cli.stderr).text(),
        cli.exited
      ])
      return { stdout, stderr, exitCode }
    }

    const help = await runCli(["--help"])
    if (help.exitCode !== 0 || !help.stdout.includes("effectdb")) {
      throw new Error(`Packed effect-db CLI failed under Node.js:\n${help.stdout}${help.stderr}`)
    }

    if (postgresUrl !== undefined) {
      const liveWorkspace = join(consumerDir, "packed-cli-live")
      const schemaName = `pack_smoke_${crypto.randomUUID().replaceAll("-", "")}`
      await mkdir(liveWorkspace)
      await Bun.write(join(liveWorkspace, "effectdb.config.mjs"), `
import { defineConfig } from "effect-db"

export default defineConfig({
  dialect: "postgres",
  db: { url: ${JSON.stringify(postgresUrl)} },
  source: { include: ["schema.mjs"] },
  filter: { schemas: [${JSON.stringify(schemaName)}] },
  migrations: { dir: "migrations", table: ${JSON.stringify(`${schemaName}.effect_qb_migrations`)} },
  safety: { nonDestructiveDefault: true }
})
`)
      await Bun.write(join(liveWorkspace, "schema.mjs"), `
import { Column, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const db = Pg.Schema.make(${JSON.stringify(schemaName)})
const users = db.table("users", {
  id: Column.uuid()
}).pipe(Table.primaryKey((table) => table.id))

export { users }
`)
      const push = await runCli([
        "push",
        "--config",
        join(liveWorkspace, "effectdb.config.mjs"),
        "--dry-run"
      ])
      if (
        push.exitCode !== 0 ||
        !push.stdout.includes(`create schema ${schemaName}`) ||
        !push.stdout.includes(`create table ${schemaName}.users`)
      ) {
        throw new Error(`Packed effect-db CLI live smoke failed under Node.js:\n${push.stdout}${push.stderr}`)
      }
    }
  } finally {
    await rm(consumerDir, { recursive: true, force: true })
    await rm(nodeOnlyBinDir, { recursive: true, force: true })
    await rm(packedTarball, { force: true })
    await rm(packedDatabaseTarball, { force: true })
    await rm(dirname(packedDatabaseTarball), { recursive: true, force: true })
  }
}

await main()
