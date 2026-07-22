import { tableKey, type SchemaModel } from "effect-qb/postgres/metadata"
import * as Effect from "effect/Effect"

import { introspectPostgresSchema } from "../internal/postgres-introspector.js"
import { runNodePlatform, type PlatformServices } from "../internal/node-platform.js"
import type { EffectDbConfig } from "../internal/postgres-config.js"
import { providePostgresUrl } from "../internal/postgres-runtime.js"
import { planPostgresSchemaDiff, type SchemaChange, type SchemaPlan } from "../internal/postgres-schema-diff.js"
import { discoverSourceSchemaEffect, type DiscoveredSourceSchema } from "../internal/postgres-source-discovery.js"
import { filterDiscoveredSourceSchema } from "../internal/postgres-source-filter.js"

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

export const managedMigrationTableKey = (tableName: string): string => {
  const parts = parseQualifiedIdentifier(tableName) ?? tableName.split(".")
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

export const loadPostgresSchemaPlanEffect = (
  cwd: string,
  config: EffectDbConfig,
  databaseUrl: string
): Effect.Effect<{
  readonly plan: SchemaPlan
  readonly discovered: DiscoveredSourceSchema
}, unknown, PlatformServices> =>
  Effect.gen(function*() {
    const discovered = filterDiscoveredSourceSchema(
      yield* discoverSourceSchemaEffect(cwd, config.source),
      config.filter
    )
    const database = withoutManagedMigrationTable(
      yield* providePostgresUrl(databaseUrl, introspectPostgresSchema(config.filter)),
      config.migrations.table
    )
    return {
      plan: planPostgresSchemaDiff(discovered.model, database),
      discovered
    }
  })

export const loadPostgresSchemaPlan = (
  cwd: string,
  config: EffectDbConfig,
  databaseUrl: string
): Promise<{
  readonly plan: SchemaPlan
  readonly discovered: DiscoveredSourceSchema
}> =>
  runNodePlatform(loadPostgresSchemaPlanEffect(cwd, config, databaseUrl))
