import { read_query_capabilities, type QueryCapability, type QueryRequirement } from "../../internal/query-requirements.ts"
import type { MysqlQueryContext } from "./fields.ts"
import type {
  KnownMysqlError,
  MysqlDriverError,
  UnknownMysqlCodeError,
  UnknownMysqlDriverError
} from "./normalize.ts"

export type MysqlQueryRequirement = Extract<QueryRequirement, "write" | "ddl" | "transaction" | "locking">

export const mysql_requirements_by_sqlstate_prefix = {
  "23": ["write"]
} as const satisfies Partial<Record<string, readonly MysqlQueryRequirement[]>>

export type MysqlQueryRequirementsError = Readonly<{
  readonly _tag: "@mysql/unknown/query-requirements"
  readonly message: string
  readonly query?: MysqlQueryContext
  readonly requiredCapabilities: readonly MysqlQueryRequirement[]
  readonly actualCapabilities: readonly QueryCapability[]
  readonly cause: MysqlDriverError
}>

type WriteRequiredMysqlSqlState = `23${string}`

export type MysqlReadQueryError =
  | Exclude<KnownMysqlError, { readonly documentedSqlState: WriteRequiredMysqlSqlState }>
  | UnknownMysqlCodeError
  | UnknownMysqlDriverError
  | MysqlQueryRequirementsError

const requiresWriteMysqlError = (error: MysqlDriverError): boolean =>
  requirements_of_mysql_error(error).length > 0

const lookup_mysql_requirements = (
  sqlState: string
): readonly MysqlQueryRequirement[] => {
  const prefix = sqlState.slice(0, 2)
  return prefix in mysql_requirements_by_sqlstate_prefix
    ? mysql_requirements_by_sqlstate_prefix[prefix as keyof typeof mysql_requirements_by_sqlstate_prefix]
    : []
}

export const requirements_of_mysql_error = (
  error: MysqlDriverError
): readonly MysqlQueryRequirement[] => {
  if ("documentedSqlState" in error && typeof error.documentedSqlState === "string") {
    return lookup_mysql_requirements(error.documentedSqlState)
  }
  if ("sqlState" in error && typeof error.sqlState === "string") {
    return lookup_mysql_requirements(error.sqlState)
  }
  return []
}

export const narrowMysqlDriverErrorForReadQuery = (
  error: MysqlDriverError
): MysqlReadQueryError => {
  const requiredCapabilities = requirements_of_mysql_error(error)
  if (!requiresWriteMysqlError(error)) {
    return error as MysqlReadQueryError
  }

  return {
    _tag: "@mysql/unknown/query-requirements",
    message: "MySQL driver error requires query capabilities not provided by this plan",
    query: error.query,
    requiredCapabilities,
    actualCapabilities: read_query_capabilities,
    cause: error
  } satisfies MysqlQueryRequirementsError
}
