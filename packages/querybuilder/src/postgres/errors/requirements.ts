import { read_query_capabilities, type QueryCapability, type QueryRequirement } from "../../internal/query-requirements.js"
import type { PostgresErrorClassCode } from "./catalog.js"
import type { PostgresQueryContext } from "./fields.js"
import type {
  KnownPostgresError,
  PostgresDriverError,
  UnknownPostgresDriverError,
  UnknownPostgresSqlStateError
} from "./normalize.js"

type WriteRequiredPostgresClassCode = "23" | "27" | "44"
export type PostgresQueryRequirement = Extract<QueryRequirement, "write" | "ddl" | "transaction" | "locking">

export const postgres_requirements_by_class_code = {
  "23": ["write"],
  "27": ["write"],
  "44": ["write"]
} as const satisfies Partial<Record<PostgresErrorClassCode, readonly PostgresQueryRequirement[]>>

export type PostgresQueryRequirementsError = Readonly<{
  readonly _tag: "@postgres/unknown/query-requirements"
  readonly message: string
  readonly query?: PostgresQueryContext
  readonly requiredCapabilities: readonly PostgresQueryRequirement[]
  readonly actualCapabilities: readonly QueryCapability[]
  readonly cause: PostgresDriverError
}>

export type PostgresReadQueryError =
  | Exclude<KnownPostgresError, { readonly classCode: keyof typeof postgres_requirements_by_class_code & WriteRequiredPostgresClassCode }>
  | UnknownPostgresSqlStateError
  | UnknownPostgresDriverError
  | PostgresQueryRequirementsError

const lookup_postgres_requirements = (
  classCode: string
): readonly PostgresQueryRequirement[] =>
  classCode in postgres_requirements_by_class_code
    ? postgres_requirements_by_class_code[classCode as keyof typeof postgres_requirements_by_class_code]
    : []

export const requirements_of_postgres_error = (
  error: PostgresDriverError
): readonly PostgresQueryRequirement[] =>
  "classCode" in error
    ? lookup_postgres_requirements(error.classCode)
    : []

export const narrowPostgresDriverErrorForReadQuery = (
  error: PostgresDriverError
): PostgresReadQueryError => {
  const requiredCapabilities = requirements_of_postgres_error(error)
  if (requiredCapabilities.length === 0) {
    return error as PostgresReadQueryError
  }

  return {
    _tag: "@postgres/unknown/query-requirements",
    message: "Postgres driver error requires query capabilities not provided by this plan",
    query: error.query,
    requiredCapabilities,
    actualCapabilities: read_query_capabilities,
    cause: error
  } satisfies PostgresQueryRequirementsError
}
