import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import type { PostgresSchemaManagementConfig } from "../postgres/schema-management.js"

export interface LoadedPostgresConfig {
  readonly config: PostgresSchemaManagementConfig
  readonly cwd: string
  readonly path?: string
}

const DEFAULT_CONFIG_NAMES = [
  "effect-qb.config.ts",
  "effect-qb.config.mts",
  "effect-qb.config.js",
  "effect-qb.config.mjs"
] as const

const defaultConfig = (): PostgresSchemaManagementConfig => ({
  dialect: "postgres",
  db: {},
  source: {
    include: [
      "src/**/*.ts",
      "src/**/*.tsx",
      "src/**/*.js",
      "src/**/*.jsx"
    ]
  },
  migrations: {
    dir: "migrations",
    table: "effect_qb_migrations"
  },
  safety: {
    nonDestructiveDefault: true
  }
})

const fileExists = async (path: string): Promise<boolean> =>
  await Bun.file(path).exists()

const loadModuleConfig = async (path: string): Promise<unknown> => {
  const imported = await import(pathToFileURL(path).href)
  return imported.default ?? imported.config ?? imported
}

export const loadPostgresConfig = async (
  cwd: string,
  explicitPath?: string
): Promise<LoadedPostgresConfig> => {
  const configPath = explicitPath === undefined
    ? await (async () => {
        for (const name of DEFAULT_CONFIG_NAMES) {
          const candidate = resolve(cwd, name)
          if (await fileExists(candidate)) {
            return candidate
          }
        }
        return undefined
      })()
    : resolve(cwd, explicitPath)

  if (configPath === undefined) {
    return {
      config: defaultConfig(),
      cwd
    }
  }

  const loaded = await loadModuleConfig(configPath)
  if (typeof loaded !== "object" || loaded === null) {
    throw new Error(`Config file '${configPath}' did not export an object`)
  }

  const merged = {
    ...defaultConfig(),
    ...(loaded as Partial<PostgresSchemaManagementConfig>),
    db: {
      ...defaultConfig().db,
      ...((loaded as Partial<PostgresSchemaManagementConfig>).db ?? {})
    },
    source: {
      ...defaultConfig().source,
      ...((loaded as Partial<PostgresSchemaManagementConfig>).source ?? {})
    },
    migrations: {
      ...defaultConfig().migrations,
      ...((loaded as Partial<PostgresSchemaManagementConfig>).migrations ?? {})
    },
    safety: {
      ...defaultConfig().safety,
      ...((loaded as Partial<PostgresSchemaManagementConfig>).safety ?? {})
    }
  } satisfies PostgresSchemaManagementConfig

  if (merged.dialect !== "postgres") {
    throw new Error(`Unsupported dialect '${String((loaded as Record<string, unknown>).dialect)}'; only 'postgres' is supported`)
  }

  if (merged.source.include.length === 0) {
    throw new Error("Schema source discovery requires at least one include glob")
  }

  return {
    config: merged,
    cwd: dirname(configPath),
    path: configPath
  }
}

export const resolveDatabaseUrl = (
  config: PostgresSchemaManagementConfig,
  overrideUrl?: string
): string => {
  if (overrideUrl) {
    return overrideUrl
  }
  if (config.db.url) {
    return config.db.url
  }
  if (config.db.urlEnv) {
    const value = process.env[config.db.urlEnv]
    if (value) {
      return value
    }
    throw new Error(`Database URL env var '${config.db.urlEnv}' is not set`)
  }
  throw new Error("Database URL is required; set db.url, db.urlEnv, or pass --url")
}
