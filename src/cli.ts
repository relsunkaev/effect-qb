#!/usr/bin/env bun
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Command, Options } from "@effect/cli"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import { loadPostgresConfig, resolveDatabaseUrl } from "./internal/postgres-config.js"
import {
  applyMigrationFiles,
  applyStatements,
  ensureMigrationTable,
  migrationDirFromConfig,
  migrationFileLabel,
  readAppliedMigrationNames,
  readPendingMigrationFiles,
  writeMigrationFile
} from "./internal/postgres-migrations.js"
import { planPostgresPull, applyPullPlan, summarizePullPlan } from "./internal/postgres-pull.js"
import { runPostgresUrl } from "./internal/postgres-runtime.js"
import { planPostgresSchemaDiff, type SchemaChange, type SchemaPlan } from "./internal/postgres-schema-diff.js"
import { introspectPostgresSchema } from "./internal/postgres-introspector.js"
import { discoverSourceSchema } from "./internal/postgres-source-discovery.js"
import { tableKey, type SchemaModel } from "./internal/postgres-schema-model.js"

const toError = (cause: unknown): Error =>
  cause instanceof Error
    ? cause
    : new Error(String(cause))

const effectFromPromise = <A>(evaluate: () => Promise<A>): Effect.Effect<A, Error> =>
  Effect.tryPromise({
    try: evaluate,
    catch: toError
  })

const log = (line: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(line)
  })

const logLines = (lines: readonly string[]): Effect.Effect<void> =>
  Effect.sync(() => {
    if (lines.length > 0) {
      console.log(lines.join("\n"))
    }
  })

const summarizeSelectedPlan = (
  label: string,
  changes: readonly SchemaChange[]
): readonly string[] =>
  changes.length === 0
    ? [`${label}: none`]
    : [
        `${label}:`,
        ...changes.map((change) => `  - ${change.summary}`)
      ]

const selectedChanges = (
  plan: SchemaPlan,
  allowDestructive: boolean
): readonly SchemaChange[] =>
  allowDestructive
    ? plan.executableChanges
    : plan.executableChanges.filter((change) => change.safe)

const skippedChanges = (
  plan: SchemaPlan,
  allowDestructive: boolean
): readonly SchemaChange[] =>
  allowDestructive
    ? plan.manualChanges
    : plan.unsafeChanges

const configOption = Options.text("config").pipe(
  Options.optional,
  Options.withAlias("c"),
  Options.withDescription("Path to effect-qb.config.ts")
)

const urlOption = Options.text("url").pipe(
  Options.optional,
  Options.withDescription("Override the Postgres connection URL")
)

const dryRunOption = Options.boolean("dry-run").pipe(
  Options.withDescription("Print the computed plan without writing")
)

const allowDestructiveOption = Options.boolean("allow-destructive").pipe(
  Options.withDescription("Include destructive SQL instead of safe-only changes")
)

const nameOption = Options.text("name").pipe(
  Options.optional,
  Options.withDescription("Migration name")
)

const withLoadedConfig = <A>(
  explicitConfigPath: Option.Option<string>,
  explicitUrl: Option.Option<string>,
  f: (args: {
    readonly cwd: string
    readonly configPath?: string
    readonly databaseUrl: string
    readonly config: Awaited<ReturnType<typeof loadPostgresConfig>>["config"]
  }) => Promise<A>
): Effect.Effect<A, Error> =>
  effectFromPromise(async () => {
    const loaded = await loadPostgresConfig(process.cwd(), Option.getOrUndefined(explicitConfigPath))
    return await f({
      cwd: loaded.cwd,
      configPath: loaded.path,
      databaseUrl: resolveDatabaseUrl(loaded.config, Option.getOrUndefined(explicitUrl)),
      config: loaded.config
    })
  })

const managedMigrationTableKey = (tableName: string): string => {
  const parts = tableName.split(".")
  return parts.length === 1
    ? tableKey(undefined, parts[0]!)
    : tableKey(parts[0], parts.slice(1).join("."))
}

const withoutManagedMigrationTable = (
  model: SchemaModel,
  migrationTableName: string
): SchemaModel => {
  const ignoredKey = managedMigrationTableKey(migrationTableName)
  return {
    ...model,
    tables: model.tables.filter((table) => tableKey(table.schemaName, table.name) !== ignoredKey)
  }
}

const loadSchemaPlan = (
  cwd: string,
  config: Awaited<ReturnType<typeof loadPostgresConfig>>["config"],
  databaseUrl: string
): Promise<{
  readonly plan: SchemaPlan
  readonly discovered: Awaited<ReturnType<typeof discoverSourceSchema>>
}> =>
  (async () => {
    const discovered = await discoverSourceSchema(cwd, config.source)
    const database = withoutManagedMigrationTable(
      await runPostgresUrl(databaseUrl, introspectPostgresSchema(config.filter)),
      config.migrations.table
    )
    return {
      plan: planPostgresSchemaDiff(discovered.model, database),
      discovered
    }
  })()

const push = Command.make(
  "push",
  {
    config: configOption,
    url: urlOption,
    dryRun: dryRunOption,
    allowDestructive: allowDestructiveOption
  },
  ({ config, url, dryRun, allowDestructive }) =>
    Effect.gen(function*() {
      const { plan, discovered } = yield* withLoadedConfig(config, url, async ({ cwd, config, databaseUrl }) =>
        loadSchemaPlan(cwd, config, databaseUrl)
      )
      const selected = selectedChanges(plan, allowDestructive)
      const skipped = skippedChanges(plan, allowDestructive)
      yield* logLines([
        `discovered ${discovered.model.tables.length} table(s) and ${discovered.model.enums.length} enum(s)`,
        ...summarizeSelectedPlan("planned changes", plan.changes)
      ])
      if (dryRun) {
        return yield* logLines(skipped.length === 0
          ? []
          : summarizeSelectedPlan("skipped changes", skipped))
      }
      if (selected.length > 0) {
        yield* withLoadedConfig(config, url, ({ databaseUrl }) =>
          runPostgresUrl(
            databaseUrl,
            applyStatements(selected.map((change) => change.sql!).filter((sql): sql is string => sql !== undefined))
          )
        )
        yield* log(`applied ${selected.length} statement(s)`)
      } else {
        yield* log("no executable statements selected")
      }
      if (skipped.length > 0) {
        yield* logLines(summarizeSelectedPlan("skipped changes", skipped))
      }
    })
)

const pull = Command.make(
  "pull",
  {
    config: configOption,
    url: urlOption,
    dryRun: dryRunOption
  },
  ({ config, url, dryRun }) =>
    Effect.gen(function*() {
      const { loaded, database, discovered, plan } = yield* effectFromPromise(async () => {
        const loaded = await loadPostgresConfig(process.cwd(), Option.getOrUndefined(config))
        const databaseUrl = resolveDatabaseUrl(loaded.config, Option.getOrUndefined(url))
        const discovered = await discoverSourceSchema(loaded.cwd, loaded.config.source)
        const database = withoutManagedMigrationTable(
          await runPostgresUrl(databaseUrl, introspectPostgresSchema(loaded.config.filter)),
          loaded.config.migrations.table
        )
        const plan = await planPostgresPull(loaded.cwd, discovered, database)
        return { loaded, database, discovered, plan }
      })
      void database
      void discovered
      if (plan.updates.length === 0) {
        return yield* log("schema definitions are already up to date")
      }
      yield* logLines(summarizePullPlan(loaded.cwd, plan))
      if (!dryRun) {
        yield* effectFromPromise(() => applyPullPlan(plan))
        yield* log(`updated ${plan.updates.length} file(s)`)
      }
    })
)

const migrateGenerate = Command.make(
  "generate",
  {
    config: configOption,
    url: urlOption,
    allowDestructive: allowDestructiveOption,
    name: nameOption
  },
  ({ config, url, allowDestructive, name }) =>
    Effect.gen(function*() {
      const { loaded, plan } = yield* effectFromPromise(async () => {
        const loaded = await loadPostgresConfig(process.cwd(), Option.getOrUndefined(config))
        const databaseUrl = resolveDatabaseUrl(loaded.config, Option.getOrUndefined(url))
        const { plan } = await loadSchemaPlan(loaded.cwd, loaded.config, databaseUrl)
        return { loaded, plan }
      })
      const selected = selectedChanges(plan, allowDestructive)
      const skipped = skippedChanges(plan, allowDestructive)
      if (selected.length === 0) {
        yield* log("no executable migration changes selected")
      } else {
        const filePath = yield* effectFromPromise(() =>
          writeMigrationFile(
            migrationDirFromConfig(loaded.cwd, loaded.config.migrations.dir),
            Option.getOrElse(name, () => allowDestructive ? "schema_destructive" : "schema_safe"),
            selected
          )
        )
        yield* log(`wrote ${migrationFileLabel(filePath)}`)
      }
      if (skipped.length > 0) {
        yield* logLines(summarizeSelectedPlan("skipped changes", skipped))
      }
    })
)

const migrateUp = Command.make(
  "up",
  {
    config: configOption,
    url: urlOption
  },
  ({ config, url }) =>
    Effect.gen(function*() {
      const { loaded, databaseUrl, pending } = yield* effectFromPromise(async (): Promise<{
        readonly loaded: Awaited<ReturnType<typeof loadPostgresConfig>>
        readonly databaseUrl: string
        readonly pending: ReadonlyArray<{
          readonly name: string
          readonly path: string
          readonly sql: string
        }>
      }> => {
        const loaded = await loadPostgresConfig(process.cwd(), Option.getOrUndefined(config))
        const databaseUrl = resolveDatabaseUrl(loaded.config, Option.getOrUndefined(url))
        const pending = await runPostgresUrl(databaseUrl, Effect.gen(function*() {
          yield* ensureMigrationTable(loaded.config.migrations.table)
          const applied = yield* readAppliedMigrationNames(loaded.config.migrations.table)
          return yield* Effect.promise(() =>
            readPendingMigrationFiles(
              migrationDirFromConfig(loaded.cwd, loaded.config.migrations.dir),
              applied
            )
          )
        }))
        return { loaded, databaseUrl, pending }
      })
      if (pending.length === 0) {
        return yield* log("no pending migrations")
      }
      yield* effectFromPromise(() =>
        runPostgresUrl(
          databaseUrl,
          Effect.zipRight(
            ensureMigrationTable(loaded.config.migrations.table),
            applyMigrationFiles(loaded.config.migrations.table, pending)
          )
        )
      )
      yield* logLines([
        `applied ${pending.length} migration(s)`,
        ...pending.map((file) => `  - ${file.name}`)
      ])
    })
)

const migrate = Command.make("migrate", {}, () => Effect.void).pipe(
  Command.withSubcommands([migrateGenerate, migrateUp])
)

const root = Command.make("effect-qb", {}, () => Effect.void).pipe(
  Command.withSubcommands([push, pull, migrate])
)

const cli = Command.run(root, {
  name: "effect-qb",
  version: "0.13.0"
})

cli(Bun.argv).pipe(
  Effect.provide(BunContext.layer),
  BunRuntime.runMain
)
