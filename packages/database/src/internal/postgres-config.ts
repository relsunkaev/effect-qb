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

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

const assertAllowedKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string
): void => {
  const allowedKeys = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected config key '${label}.${key}'`)
    }
  }
}

const assertOptionalString = (
  value: unknown,
  label: string
): void => {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${label} must be a string`)
  }
}

const assertOptionalBoolean = (
  value: unknown,
  label: string
): void => {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`)
  }
}

const assertOptionalStringArray = (
  value: unknown,
  label: string
): void => {
  if (value === undefined) {
    return
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be an array of strings`)
  }
}

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

function validatePartialPostgresConfig(
  value: unknown,
  label = "config"
): asserts value is Partial<EffectDbConfig> {
  const config = asRecord(value, label)
  assertAllowedKeys(config, ["dialect", "db", "source", "filter", "migrations", "safety"], label)

  if ("dialect" in config && config.dialect !== "postgres") {
    throw new Error(`Unsupported dialect '${String(config.dialect)}'; only 'postgres' is supported`)
  }

  if (config.db !== undefined) {
    const db = asRecord(config.db, `${label}.db`)
    assertAllowedKeys(db, ["url", "urlEnv"], `${label}.db`)
    assertOptionalString(db.url, `${label}.db.url`)
    assertOptionalString(db.urlEnv, `${label}.db.urlEnv`)
  }

  if (config.source !== undefined) {
    const source = asRecord(config.source, `${label}.source`)
    assertAllowedKeys(source, ["include", "exclude"], `${label}.source`)
    assertOptionalStringArray(source.include, `${label}.source.include`)
    assertOptionalStringArray(source.exclude, `${label}.source.exclude`)
  }

  if (config.filter !== undefined) {
    const filter = asRecord(config.filter, `${label}.filter`)
    assertAllowedKeys(filter, ["schemas", "tables"], `${label}.filter`)
    assertOptionalStringArray(filter.schemas, `${label}.filter.schemas`)
    assertOptionalStringArray(filter.tables, `${label}.filter.tables`)
  }

  if (config.migrations !== undefined) {
    const migrations = asRecord(config.migrations, `${label}.migrations`)
    assertAllowedKeys(migrations, ["dir", "table"], `${label}.migrations`)
    assertOptionalString(migrations.dir, `${label}.migrations.dir`)
    assertOptionalString(migrations.table, `${label}.migrations.table`)
  }

  if (config.safety !== undefined) {
    const safety = asRecord(config.safety, `${label}.safety`)
    assertAllowedKeys(safety, ["nonDestructiveDefault"], `${label}.safety`)
    assertOptionalBoolean(safety.nonDestructiveDefault, `${label}.safety.nonDestructiveDefault`)
  }
}

const validateResolvedPostgresConfig = (
  config: EffectDbConfig,
  label = "config"
): void => {
  validatePartialPostgresConfig(config, label)

  if (config.source.include.length === 0) {
    throw new Error("Schema source discovery requires at least one include glob")
  }

  if (config.migrations.dir.trim().length === 0) {
    throw new Error(`${label}.migrations.dir must be a non-empty string`)
  }

  if (config.migrations.table.trim().length === 0) {
    throw new Error(`${label}.migrations.table must be a non-empty string`)
  }

  if (parseQualifiedIdentifier(config.migrations.table) === undefined) {
    throw new Error(`${label}.migrations.table must be a valid qualified identifier`)
  }
}

export const defineConfig = <Config extends EffectDbConfig>(
  config: Config
): Config => {
  validatePartialPostgresConfig(config)
  return config
}

export interface LoadedPostgresConfig {
  readonly config: EffectDbConfig
  readonly cwd: string
  readonly path?: string
}

const DEFAULT_CONFIG_NAMES = [
  "effectdb.config.ts",
  "effectdb.config.mts",
  "effectdb.config.js",
  "effectdb.config.mjs"
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
  validatePartialPostgresConfig(loaded, "config")

  const partial = loaded as Partial<EffectDbConfig>

  const merged = {
    ...defaultConfig(),
    ...partial,
    db: {
      ...defaultConfig().db,
      ...(partial.db ?? {})
    },
    source: {
      ...defaultConfig().source,
      ...(partial.source ?? {})
    },
    filter: partial.filter === undefined
      ? undefined
      : {
          ...(partial.filter ?? {})
        },
    migrations: {
      ...defaultConfig().migrations,
      ...(partial.migrations ?? {})
    },
    safety: {
      ...defaultConfig().safety,
      ...(partial.safety ?? {})
    }
  } satisfies EffectDbConfig

  validateResolvedPostgresConfig(merged)

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
