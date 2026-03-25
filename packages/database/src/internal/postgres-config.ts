import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

export type FilterConfig = {
  readonly schemas?: readonly string[]
  readonly tables?: readonly string[]
}

export type SchemaSourceConfig = {
  readonly include: readonly string[]
  readonly exclude?: readonly string[]
}

export type EffectDbConfig = {
  readonly dialect: "postgres"
  readonly db: {
    readonly url?: string
    readonly urlEnv?: string
  }
  readonly source: SchemaSourceConfig
  readonly filter?: FilterConfig
  readonly migrations: {
    readonly dir: string
    readonly table: string
  }
  readonly safety: {
    readonly nonDestructiveDefault: boolean
  }
}

export const defineConfig = <Config extends EffectDbConfig>(
  config: Config
): Config => config

export interface LoadedPostgresConfig {
  readonly config: EffectDbConfig
  readonly cwd: string
  readonly path?: string
}

const DEFAULT_CONFIG_NAMES = [
  "effectdb.config.ts",
  "effectdb.config.mts",
  "effectdb.config.js",
  "effectdb.config.mjs",
  "effect-db.config.ts",
  "effect-db.config.mts",
  "effect-db.config.js",
  "effect-db.config.mjs"
] as const

const defaultConfig = (): EffectDbConfig => ({
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
    ...(loaded as Partial<EffectDbConfig>),
    db: {
      ...defaultConfig().db,
      ...((loaded as Partial<EffectDbConfig>).db ?? {})
    },
    source: {
      ...defaultConfig().source,
      ...((loaded as Partial<EffectDbConfig>).source ?? {})
    },
    migrations: {
      ...defaultConfig().migrations,
      ...((loaded as Partial<EffectDbConfig>).migrations ?? {})
    },
    safety: {
      ...defaultConfig().safety,
      ...((loaded as Partial<EffectDbConfig>).safety ?? {})
    }
  } satisfies EffectDbConfig

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
  config: EffectDbConfig,
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
