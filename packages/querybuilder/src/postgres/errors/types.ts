import type { PostgresErrorTag, PostgresSqlStateCode } from "./catalog.js"
import type { PostgresErrorFields, PostgresQueryContext } from "./fields.js"

/** Raw Postgres-like error object as commonly exposed by client libraries. */
export interface PostgresErrorLike {
  readonly code?: string
  readonly message?: string
  readonly messagePrimary?: string
  readonly schema?: string
  readonly table?: string
  readonly column?: string
  readonly dataType?: string
  readonly constraint?: string
  readonly severity?: string
  readonly severityNonLocalized?: string
  readonly detail?: string
  readonly hint?: string
  readonly position?: string | number
  readonly internalPosition?: string | number
  readonly internalQuery?: string
  readonly where?: string
  readonly file?: string
  readonly line?: string | number
  readonly routine?: string
}

/** Broad known-Postgres error surface used by the normalizer return type. */
export interface PostgresKnownErrorBase extends Error, PostgresErrorFields {
  readonly _tag: PostgresErrorTag<PostgresSqlStateCode>
  readonly code: PostgresSqlStateCode
  readonly condition: string
  readonly classCode: string
  readonly className: string
  readonly message: string
  readonly primaryFields: readonly string[]
  readonly query?: PostgresQueryContext
  readonly raw: PostgresErrorLike
}

/** Shared constructor payload for generated Postgres error classes. */
export type PostgresKnownErrorArgs = Readonly<{
  readonly message: string
  readonly query?: PostgresQueryContext
  readonly raw: PostgresErrorLike
} & PostgresErrorFields>

/** Runtime base class shared by generated Postgres error classes. */
export abstract class PostgresKnownErrorClass extends Error implements PostgresKnownErrorBase {
  abstract readonly _tag: PostgresErrorTag<PostgresSqlStateCode>
  abstract readonly code: PostgresSqlStateCode
  abstract readonly condition: string
  abstract readonly classCode: string
  abstract readonly className: string
  abstract readonly primaryFields: readonly string[]
  readonly severity?
  readonly severityNonLocalized?
  readonly detail?
  readonly hint?
  readonly position?
  readonly internalPosition?
  readonly internalQuery?
  readonly where?
  readonly schemaName?
  readonly tableName?
  readonly columnName?
  readonly dataTypeName?
  readonly constraintName?
  readonly file?
  readonly line?
  readonly routine?
  readonly query?
  readonly raw

  constructor(args: PostgresKnownErrorArgs) {
    super(args.message)
    this.name = new.target.name
    this.severity = args.severity
    this.severityNonLocalized = args.severityNonLocalized
    this.detail = args.detail
    this.hint = args.hint
    this.position = args.position
    this.internalPosition = args.internalPosition
    this.internalQuery = args.internalQuery
    this.where = args.where
    this.schemaName = args.schemaName
    this.tableName = args.tableName
    this.columnName = args.columnName
    this.dataTypeName = args.dataTypeName
    this.constraintName = args.constraintName
    this.file = args.file
    this.line = args.line
    this.routine = args.routine
    this.query = args.query
    this.raw = args.raw
  }
}
