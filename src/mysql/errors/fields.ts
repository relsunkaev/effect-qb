/** Common MySQL driver error fields surfaced by the normalizer when present. */
export interface MysqlErrorFields {
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

/** Rendered SQL context attached to normalized MySQL execution failures. */
export interface MysqlQueryContext {
  readonly sql: string
  readonly params: readonly unknown[]
}

export type MySqlErrorFields = MysqlErrorFields
export type MySqlQueryContext = MysqlQueryContext
