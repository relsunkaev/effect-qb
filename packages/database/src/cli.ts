#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Command, Flag } from "effect/unstable/cli"
import * as Effect from "effect/Effect"
import * as Logger from "effect/Logger"
import * as Option from "effect/Option"
import * as Terminal from "effect/Terminal"

import { loadPostgresConfigEffect, resolveDatabaseUrl, type EffectDbConfig } from "./internal/postgres-config.js"
import {
  loadPostgresSchemaPlanEffect,
  selectedPostgresSchemaChanges,
  skippedPostgresSchemaChanges,
  summarizeSelectedPostgresPlan,
  withoutManagedMigrationTable
} from "./postgres/push.js"
import {
  deleteAppliedMigrationNames,
  applyMigrationFiles,
  applyStatements,
  loadAppliedMigrationRows,
  loadPostgresMigrationStateEffect,
  migrationDirFromConfigEffect,
  migrationFileLabel,
  readMigrationFilesEffect,
  rollbackMigrationFiles,
  withMigrationLock,
  writeMigrationFileEffect
} from "./postgres/migrate.js"
import { planPostgresPullEffect, applyPullPlanEffect, summarizePullPlanEffect } from "./postgres/pull.js"
import { providePostgresUrl } from "./internal/postgres-runtime.js"
import { introspectPostgresSchema } from "./internal/postgres-introspector.js"
import { filterDiscoveredSourceSchema } from "./internal/postgres-source-filter.js"
import { discoverSourceSchemaEffect } from "./internal/postgres-source-discovery.js"

const outputLines = (lines: readonly string[]) =>
  lines.length === 0
    ? Effect.void
    : Effect.flatMap(Terminal.Terminal, (terminal) => terminal.display(`${lines.join("\n")}\n`))

const logInfoLines = (lines: readonly string[]) =>
  Effect.forEach(lines, (line) => Effect.logInfo(line), { discard: true })

const logWarningLines = (lines: readonly string[]) =>
  Effect.forEach(lines, (line) => Effect.logWarning(line), { discard: true })

const configOption = Flag.string("config").pipe(
  Flag.optional,
  Flag.withAlias("c"),
  Flag.withDescription("Path to effectdb.config.ts")
)

const urlOption = Flag.string("url").pipe(
  Flag.optional,
  Flag.withDescription("Override the Postgres connection URL")
)

const dryRunOption = Flag.boolean("dry-run").pipe(
  Flag.withDescription("Print the computed plan without writing")
)

const allowDestructiveOption = Flag.boolean("allow-destructive").pipe(
  Flag.withDescription("Include destructive SQL instead of safe-only changes")
)

const nameOption = Flag.string("name").pipe(
  Flag.optional,
  Flag.withDescription("Migration name")
)

const stepsOption = Flag.integer("steps").pipe(
  Flag.optional,
  Flag.withDescription("Number of applied migrations to roll back")
)

const loadConfig = (explicitConfigPath: Option.Option<string>) =>
  loadPostgresConfigEffect(process.cwd(), Option.getOrUndefined(explicitConfigPath)).pipe(
    Effect.tap((loaded) => Effect.logDebug("loaded database config", {
      cwd: loaded.cwd,
      path: loaded.path
    }))
  )

const withLoadedConfig = <A, E, R>(
  explicitConfigPath: Option.Option<string>,
  explicitUrl: Option.Option<string>,
  f: (args: {
    readonly cwd: string
    readonly configPath?: string
    readonly databaseUrl: string
    readonly config: EffectDbConfig
  }) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function*() {
    const loaded = yield* loadConfig(explicitConfigPath)
    return yield* f({
      cwd: loaded.cwd,
      configPath: loaded.path,
      databaseUrl: resolveDatabaseUrl(loaded.config, Option.getOrUndefined(explicitUrl)),
      config: loaded.config
    })
  })

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
      const { plan, discovered } = yield* withLoadedConfig(config, url, ({ cwd, config, databaseUrl }) =>
        loadPostgresSchemaPlanEffect(cwd, config, databaseUrl)
      )
      const selected = selectedPostgresSchemaChanges(plan, allowDestructive)
      const skipped = skippedPostgresSchemaChanges(plan, allowDestructive)
      yield* outputLines([
        `discovered ${discovered.model.tables.length} table(s) and ${discovered.model.enums.length} enum(s)`,
        ...summarizeSelectedPostgresPlan("planned changes", plan.changes)
      ])
      if (dryRun) {
        return yield* outputLines(skipped.length === 0
          ? []
          : summarizeSelectedPostgresPlan("skipped changes", skipped))
      }
      if (selected.length > 0) {
        yield* withLoadedConfig(config, url, ({ databaseUrl }) =>
          providePostgresUrl(
            databaseUrl,
            applyStatements(selected.map((change) => change.sql!).filter((sql): sql is string => sql !== undefined))
          )
        )
        yield* Effect.logInfo(`applied ${selected.length} statement(s)`)
      } else {
        yield* Effect.logInfo("no executable statements selected")
      }
      if (skipped.length > 0) {
        yield* logWarningLines(summarizeSelectedPostgresPlan("skipped changes", skipped))
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
      const { loaded, database, discovered, plan } = yield* Effect.gen(function*() {
        const loaded = yield* loadConfig(config)
        const databaseUrl = resolveDatabaseUrl(loaded.config, Option.getOrUndefined(url))
        const discovered = filterDiscoveredSourceSchema(
          yield* discoverSourceSchemaEffect(loaded.cwd, loaded.config.source),
          loaded.config.filter
        )
        const database = withoutManagedMigrationTable(
          yield* providePostgresUrl(databaseUrl, introspectPostgresSchema(loaded.config.filter)),
          loaded.config.migrations.table
        )
        const plan = yield* planPostgresPullEffect(loaded.cwd, loaded.config.source, discovered, database)
        return { loaded, database, discovered, plan }
      })
      void database
      void discovered
      if (plan.updates.length === 0) {
        return yield* Effect.logInfo("schema definitions are already up to date")
      }
      yield* outputLines(yield* summarizePullPlanEffect(loaded.cwd, plan))
      if (!dryRun) {
        yield* applyPullPlanEffect(plan)
        yield* Effect.logInfo(`updated ${plan.updates.length} file(s)`)
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
      const { loaded, plan } = yield* Effect.gen(function*() {
        const loaded = yield* loadConfig(config)
        const databaseUrl = resolveDatabaseUrl(loaded.config, Option.getOrUndefined(url))
        const { plan } = yield* loadPostgresSchemaPlanEffect(loaded.cwd, loaded.config, databaseUrl)
        return { loaded, plan }
      })
      const selected = selectedPostgresSchemaChanges(plan, allowDestructive)
      const skipped = skippedPostgresSchemaChanges(plan, allowDestructive)
      if (selected.length === 0) {
        yield* Effect.logInfo("no executable migration changes selected")
      } else {
        const migrationsDir = yield* migrationDirFromConfigEffect(loaded.cwd, loaded.config.migrations.dir)
        const filePath = yield* writeMigrationFileEffect(
          migrationsDir,
          Option.getOrElse(name, () => allowDestructive ? "schema_destructive" : "schema_safe"),
          selected
        )
        yield* Effect.logInfo(`wrote ${migrationFileLabel(filePath)}`)
      }
      if (skipped.length > 0) {
        yield* logWarningLines(summarizeSelectedPostgresPlan("skipped changes", skipped))
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
      const { loaded, databaseUrl } = yield* Effect.gen(function*() {
        const loaded = yield* loadConfig(config)
        const databaseUrl = resolveDatabaseUrl(loaded.config, Option.getOrUndefined(url))
        return { loaded, databaseUrl }
      })
      const applied = yield* providePostgresUrl(
        databaseUrl,
        withMigrationLock(loaded.config.migrations.table, Effect.gen(function*() {
          const migrationsDir = yield* migrationDirFromConfigEffect(loaded.cwd, loaded.config.migrations.dir)
          const files = yield* readMigrationFilesEffect(migrationsDir)
          const appliedRows = yield* loadAppliedMigrationRows(loaded.config.migrations.table, files)
          const applied = new Set(appliedRows.map((row) => row.name))
          const currentPending = files.filter((file) => !applied.has(file.name))
          if (currentPending.length > 0) {
            yield* applyMigrationFiles(loaded.config.migrations.table, currentPending)
          }
          return currentPending
        }))
      )
      if (applied.length === 0) {
        return yield* Effect.logInfo("no pending migrations")
      }
      yield* logInfoLines([
        `applied ${applied.length} migration(s)`,
        ...applied.map((file) => `  - ${file.name}`)
      ])
    })
)

const migrateStatus = Command.make(
  "status",
  {
    config: configOption,
    url: urlOption
  },
  ({ config, url }) =>
    Effect.gen(function*() {
      const { loaded, databaseUrl, appliedRows, pending } = yield* Effect.gen(function*() {
        const loaded = yield* loadConfig(config)
        const databaseUrl = resolveDatabaseUrl(loaded.config, Option.getOrUndefined(url))
        const state = yield* loadPostgresMigrationStateEffect(loaded, databaseUrl)
        return {
          loaded,
          databaseUrl,
          appliedRows: state.appliedRows,
          pending: state.pending
        }
      })
      void loaded
      void databaseUrl
      yield* outputLines([
        `applied migrations (${appliedRows.length}):`,
        ...appliedRows.map((row) => `  - ${row.name}`),
        `pending migrations (${pending.length}):`,
        ...pending.map((file) => `  - ${file.name}`)
      ])
    })
)

const migrateDown = Command.make(
  "down",
  {
    config: configOption,
    url: urlOption,
    dryRun: dryRunOption,
    steps: stepsOption
  },
  ({ config, url, dryRun, steps }) =>
    Effect.gen(function*() {
      const { loaded, databaseUrl, selected } = yield* Effect.gen(function*() {
        const loaded = yield* loadConfig(config)
        const databaseUrl = resolveDatabaseUrl(loaded.config, Option.getOrUndefined(url))
        const state = yield* loadPostgresMigrationStateEffect(loaded, databaseUrl)
        const stepCount = Math.max(1, Option.getOrElse(steps, () => 1))
        const applied = [...state.appliedRows].slice(Math.max(0, state.appliedRows.length - stepCount)).reverse()
        const fileByName = new Map(state.files.map((file) => [file.name, file]))
        const selected = applied.map((row) => {
          const file = fileByName.get(row.name)
          if (file === undefined) {
            throw new Error(`Migration file '${row.name}' is missing from '${loaded.config.migrations.dir}'`)
          }
          if (file.downSql === undefined) {
            throw new Error(`Migration '${row.name}' does not have a rollback section`)
          }
          return file
        })
        return {
          loaded,
          databaseUrl,
          selected
        }
      })
      if (selected.length === 0) {
        return yield* Effect.logInfo("no applied migrations")
      }
      yield* outputLines([
        `rollback migrations (${selected.length}):`,
        ...selected.map((file) => `  - ${file.name}`)
      ])
      if (!dryRun) {
        yield* providePostgresUrl(
          databaseUrl,
          withMigrationLock(
            loaded.config.migrations.table,
            rollbackMigrationFiles(loaded.config.migrations.table, selected)
          )
        )
        yield* Effect.logInfo(`rolled back ${selected.length} migration(s)`)
      }
    })
)

const migrateRepair = Command.make(
  "repair",
  {
    config: configOption,
    url: urlOption,
    dryRun: dryRunOption
  },
  ({ config, url, dryRun }) =>
    Effect.gen(function*() {
      const { loaded, databaseUrl, orphanNames } = yield* Effect.gen(function*() {
        const loaded = yield* loadConfig(config)
        const databaseUrl = resolveDatabaseUrl(loaded.config, Option.getOrUndefined(url))
        const state = yield* loadPostgresMigrationStateEffect(loaded, databaseUrl)
        const fileNames = new Set(state.files.map((file) => file.name))
        const orphanNames = state.appliedRows
          .map((row) => row.name)
          .filter((name) => !fileNames.has(name))
        return {
          loaded,
          databaseUrl,
          orphanNames
        }
      })
      if (orphanNames.length === 0) {
        return yield* Effect.logInfo("migration ledger is already aligned")
      }
      yield* outputLines([
        `repairing ${orphanNames.length} orphaned migration record(s):`,
        ...orphanNames.map((name) => `  - ${name}`)
      ])
      if (!dryRun) {
        yield* providePostgresUrl(
          databaseUrl,
          withMigrationLock(
            loaded.config.migrations.table,
            deleteAppliedMigrationNames(loaded.config.migrations.table, orphanNames)
          )
        )
        yield* Effect.logInfo(`repaired ${orphanNames.length} migration record(s)`)
      }
    })
)

const migrate = Command.make("migrate", {}, () => Effect.void).pipe(
  Command.withSubcommands([migrateGenerate, migrateStatus, migrateUp, migrateDown, migrateRepair])
)

const root = Command.make("effectdb", {}, () => Effect.void).pipe(
  Command.withSubcommands([push, pull, migrate])
)

const cli = Command.run(root, {
  version: "0.20.0"
})

cli.pipe(
  Effect.provideService(Logger.LogToStderr, true),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)
