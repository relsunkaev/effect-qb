import type { SqliteErrorNumber, SqliteErrorSymbol, SqliteErrorTag } from "./catalog.js"
import type { SqliteErrorFields, SqliteQueryContext } from "./fields.js"

/** Raw SQLite-like error shape as commonly exposed by client libraries. */
export interface SqliteErrorLike {
  readonly code?: string
  readonly errno?: string | number
  readonly sqlState?: string
  readonly sqlMessage?: string
  readonly message?: string
  readonly fatal?: boolean
  readonly sql?: string
  readonly syscall?: string
  readonly address?: string
  readonly port?: string | number
  readonly hostname?: string
}

/** Broad known-SQLite error surface used by the normalizer return type. */
export interface SqliteKnownErrorBase extends SqliteErrorFields {
  readonly _tag: SqliteErrorTag
  readonly category: "sqlite"
  readonly number: SqliteErrorNumber
  readonly symbol: SqliteErrorSymbol
  readonly messageTemplate: string
  readonly message: string
  readonly query?: SqliteQueryContext
  readonly raw: SqliteErrorLike
}
