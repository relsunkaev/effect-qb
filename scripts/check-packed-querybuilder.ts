import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const cwd = process.cwd()
const packageDir = join(cwd, "packages", "querybuilder")
const tarballPath = async () => {
  const proc = Bun.spawn([
    "bunx",
    "npm",
    "pack",
    "--json",
    packageDir
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
  const packedTarball = await tarballPath()
  const consumerDir = await mkdtemp(join(tmpdir(), "effect-qb-pack-smoke-"))

  try {
    await Bun.write(join(consumerDir, "package.json"), `${JSON.stringify({
      name: "effect-qb-pack-smoke",
      private: true,
      type: "module",
      dependencies: {
        "@effect/experimental": "^0.57.0",
        "@effect/sql": "^0.48.0",
        "effect": "^3.19.3",
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
      'import { Column as StandardColumn, Function as StandardFunction, Query as StandardQuery, Table as StandardTable } from "effect-qb"',
      'import { Column, Query, Table } from "effect-qb/postgres"',
      'import { Column as MysqlColumn, Json as MysqlJson, Scalar as MysqlScalar, Table as MysqlTable } from "effect-qb/mysql"',
      'import * as Schema from "effect/Schema"',
      'import { tableKey } from "effect-qb/postgres/metadata"',
      "",
      'const standardUsers = StandardTable.make("standard_users", {',
      "  id: StandardColumn.uuid().pipe(StandardColumn.primaryKey),",
      "  email: StandardColumn.text()",
      "})",
      "",
      "const standardPlan = StandardQuery.select({",
      "  id: standardUsers.id,",
      "  email: StandardFunction.lower(standardUsers.email)",
      "}).pipe(StandardQuery.from(standardUsers))",
      "",
      'const users = Table.make("users", {',
      "  id: Column.uuid().pipe(Column.primaryKey),",
      "  email: Column.text()",
      "})",
      "",
      "const plan = Query.select({ id: users.id }).pipe(Query.from(users))",
      "const userSelectSchema = Table.selectSchema(users)",
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
      "  Query.where(Query.isNotNull(valuesSource.title)),",
      "  Query.from(valuesSource)",
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
      "const jsonDocs = MysqlTable.make(\"json_docs\", {",
      "  id: MysqlColumn.uuid().pipe(MysqlColumn.primaryKey),",
      "  payload: MysqlColumn.json(Schema.Struct({",
      "    profile: Schema.Struct({",
      "      pair: Schema.Tuple(Schema.String, Schema.Number)",
      "    })",
      "  }))",
      "})",
      "const lastPairValue = MysqlJson.json.get(",
      "  jsonDocs.payload,",
      "  MysqlJson.json.path(MysqlJson.json.key(\"profile\"), MysqlJson.json.key(\"pair\"), MysqlJson.json.index(-1))",
      ")",
      "const updatedPair = MysqlJson.json.set(",
      "  jsonDocs.payload,",
      "  MysqlJson.json.path(MysqlJson.json.key(\"profile\"), MysqlJson.json.key(\"pair\"), MysqlJson.json.index(-1)),",
      "  true",
      ")",
      "const jsonDocsSelectSchema = MysqlTable.selectSchema(jsonDocs)",
      "type JsonDocSelect = Schema.Schema.Type<typeof jsonDocsSelectSchema>",
      "declare const jsonDocSelect: JsonDocSelect",
      "const jsonDocPair: readonly [string, number] = jsonDocSelect.payload.profile.pair",
      "type LastPairValue = MysqlScalar.RuntimeOf<typeof lastPairValue>",
      "type UpdatedPair = MysqlScalar.RuntimeOf<typeof updatedPair>",
      "const lastPairValueRuntime: LastPairValue = 1",
      "declare const updatedPairRuntime: UpdatedPair",
      "const updatedPairTail: boolean = updatedPairRuntime.profile.pair[1]",
      "",
      "void standardPlan",
      "void plan",
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
  } finally {
    await rm(consumerDir, { recursive: true, force: true })
    await rm(packedTarball, { force: true })
  }
}

await main()
