/** Common SQLite driver error fields surfaced by the normalizer when present. */
export interface SqliteErrorFields {
  readonly code?: string
  readonly errno?: number
  readonly sqlState?: string
  readonly sqlMessage?: string
  readonly fatal?: boolean
  readonly sql?: string
  readonly syscall?: string
  readonly address?: string
  readonly port?: number
  readonly hostname?: string
}

/** Rendered SQL context attached to normalized SQLite execution failures. */
export interface SqliteQueryContext {
  readonly sql: string
  readonly params: readonly unknown[]
}
