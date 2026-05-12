import { read_query_capabilities, type QueryCapability, type QueryRequirement } from "../../internal/query-requirements.js"
import type { SqliteQueryContext } from "./fields.js"
import type {
  KnownSqliteError,
  SqliteDriverError,
  UnknownSqliteCodeError,
  UnknownSqliteDriverError
} from "./normalize.js"

export type SqliteQueryRequirement = Extract<QueryRequirement, "write" | "ddl" | "transaction" | "locking">

export const sqlite_requirements_by_sqlstate_prefix = {
  "23": ["write"]
} as const satisfies Partial<Record<string, readonly SqliteQueryRequirement[]>>

export type SqliteQueryRequirementsError = Readonly<{
  readonly _tag: "@sqlite/unknown/query-requirements"
  readonly message: string
  readonly query?: SqliteQueryContext
  readonly requiredCapabilities: readonly SqliteQueryRequirement[]
  readonly actualCapabilities: readonly QueryCapability[]
  readonly cause: SqliteDriverError
}>

export type SqliteReadQueryError =
  | KnownSqliteError
  | UnknownSqliteCodeError
  | UnknownSqliteDriverError
  | SqliteQueryRequirementsError

const requiresWriteSqliteError = (error: SqliteDriverError): boolean =>
  requirements_of_sqlite_error(error).length > 0

const lookup_sqlite_requirements = (
  sqlState: string
): readonly SqliteQueryRequirement[] => {
  const prefix = sqlState.slice(0, 2)
  return prefix in sqlite_requirements_by_sqlstate_prefix
    ? sqlite_requirements_by_sqlstate_prefix[prefix as keyof typeof sqlite_requirements_by_sqlstate_prefix]
    : []
}

export const requirements_of_sqlite_error = (
  error: SqliteDriverError
): readonly SqliteQueryRequirement[] => {
  if ("sqlState" in error && typeof error.sqlState === "string") {
    return lookup_sqlite_requirements(error.sqlState)
  }
  if ("symbol" in error && (error.symbol === "SQLITE_READONLY" || error.symbol.startsWith("SQLITE_CONSTRAINT"))) {
    return ["write"]
  }
  return []
}

export const narrowSqliteDriverErrorForReadQuery = (
  error: SqliteDriverError
): SqliteReadQueryError => {
  const requiredCapabilities = requirements_of_sqlite_error(error)
  if (!requiresWriteSqliteError(error)) {
    return error as SqliteReadQueryError
  }

  return {
    _tag: "@sqlite/unknown/query-requirements",
    message: "SQLite driver error requires query capabilities not provided by this plan",
    query: error.query,
    requiredCapabilities,
    actualCapabilities: read_query_capabilities,
    cause: error
  } satisfies SqliteQueryRequirementsError
}
