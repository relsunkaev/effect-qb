import { tableKey, type SchemaModel } from "effect-qb/postgres/metadata"

import { introspectPostgresSchema } from "../internal/postgres-introspector.js"
import { runPostgresUrl } from "../internal/postgres-runtime.js"
import { planPostgresSchemaDiff, type SchemaChange, type SchemaPlan } from "../internal/postgres-schema-diff.js"
import { discoverSourceSchema } from "../internal/postgres-source-discovery.js"
import { filterDiscoveredSourceSchema } from "../internal/postgres-source-filter.js"
import type { loadPostgresConfig } from "../internal/postgres-config.js"

type LoadedConfig = Awaited<ReturnType<typeof loadPostgresConfig>>
type EffectDbConfig = LoadedConfig["config"]

export type { SchemaChange, SchemaPlan }

export const summarizeSelectedPostgresPlan = (
  label: string,
  changes: readonly SchemaChange[]
): readonly string[] =>
  changes.length === 0
    ? [`${label}: none`]
    : [
        `${label}:`,
        ...changes.map((change) => `  - ${change.summary}`)
      ]

export const selectedPostgresSchemaChanges = (
  plan: SchemaPlan,
  allowDestructive: boolean
): readonly SchemaChange[] =>
  allowDestructive
    ? plan.executableChanges
    : plan.executableChanges.filter((change) => change.safe)

export const skippedPostgresSchemaChanges = (
  plan: SchemaPlan,
  allowDestructive: boolean
): readonly SchemaChange[] =>
  allowDestructive
    ? plan.manualChanges
    : plan.unsafeChanges

export const managedMigrationTableKey = (tableName: string): string => {
  const parts = tableName.split(".")
  return parts.length === 1
    ? tableKey(undefined, parts[0]!)
    : tableKey(parts[0], parts.slice(1).join("."))
}

export const withoutManagedMigrationTable = (
  model: SchemaModel,
  migrationTableName: string
): SchemaModel => {
  const ignoredKey = managedMigrationTableKey(migrationTableName)
  return {
    ...model,
    tables: model.tables.filter((table) => tableKey(table.schemaName, table.name) !== ignoredKey)
  }
}

export const loadPostgresSchemaPlan = async (
  cwd: string,
  config: EffectDbConfig,
  databaseUrl: string
): Promise<{
  readonly plan: SchemaPlan
  readonly discovered: Awaited<ReturnType<typeof discoverSourceSchema>>
}> => {
  const discovered = filterDiscoveredSourceSchema(
    await discoverSourceSchema(cwd, config.source),
    config.filter
  )
  const database = withoutManagedMigrationTable(
    await runPostgresUrl(databaseUrl, introspectPostgresSchema(config.filter)),
    config.migrations.table
  )
  return {
    plan: planPostgresSchemaDiff(discovered.model, database),
    discovered
  }
}
