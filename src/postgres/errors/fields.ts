/** Normalized semantic properties extracted from Postgres driver errors. */
export const postgresErrorSemanticFields = [
  "severity",
  "severityNonLocalized",
  "detail",
  "hint",
  "position",
  "internalPosition",
  "internalQuery",
  "where",
  "schemaName",
  "tableName",
  "columnName",
  "dataTypeName",
  "constraintName",
  "file",
  "line",
  "routine"
] as const

/** Semantic field names that may be relevant for a specific SQLSTATE. */
export type PostgresErrorSemanticField = typeof postgresErrorSemanticFields[number]

/** Normalized wire/protocol fields commonly exposed by Postgres drivers. */
export interface PostgresErrorFields {
  readonly severity?: string
  readonly severityNonLocalized?: string
  readonly detail?: string
  readonly hint?: string
  readonly position?: number
  readonly internalPosition?: number
  readonly internalQuery?: string
  readonly where?: string
  readonly schemaName?: string
  readonly tableName?: string
  readonly columnName?: string
  readonly dataTypeName?: string
  readonly constraintName?: string
  readonly file?: string
  readonly line?: number
  readonly routine?: string
}

/** Render context attached when an error occurred during query execution. */
export interface PostgresQueryContext {
  readonly sql: string
  readonly params: readonly unknown[]
}
