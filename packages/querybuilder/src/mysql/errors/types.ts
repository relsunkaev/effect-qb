import type { MysqlErrorNumber, MysqlErrorSymbol, MysqlErrorTag } from "./catalog.js"
import type { MysqlErrorFields, MysqlQueryContext } from "./fields.js"

/** Raw MySQL-like error shape as commonly exposed by client libraries. */
export interface MysqlErrorLike {
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

/** Broad known-MySQL error surface used by the normalizer return type. */
export interface MysqlKnownErrorBase extends Error, MysqlErrorFields {
  readonly _tag: MysqlErrorTag
  readonly category: "server" | "client" | "global"
  readonly number: MysqlErrorNumber
  readonly symbol: MysqlErrorSymbol
  readonly documentedSqlState?: string
  readonly messageTemplate: string
  readonly message: string
  readonly query?: MysqlQueryContext
  readonly raw: MysqlErrorLike
}

/** Shared constructor payload for generated MySQL error classes. */
export type MysqlKnownErrorArgs = Readonly<{
  readonly message: string
  readonly query?: MysqlQueryContext
  readonly raw: MysqlErrorLike
} & MysqlErrorFields>

/** Runtime base class shared by generated MySQL error classes. */
export abstract class MysqlKnownErrorClass extends Error implements MysqlKnownErrorBase {
  abstract readonly _tag: MysqlErrorTag
  abstract readonly category: "server" | "client" | "global"
  abstract readonly number: MysqlErrorNumber
  abstract readonly symbol: MysqlErrorSymbol
  abstract readonly documentedSqlState?: string
  abstract readonly messageTemplate: string
  readonly errno?
  readonly sqlState?
  readonly sqlMessage?
  readonly fatal?
  readonly sql?
  readonly syscall?
  readonly address?
  readonly port?
  readonly hostname?
  readonly query?
  readonly raw

  constructor(args: MysqlKnownErrorArgs) {
    super(args.message)
    this.name = new.target.name
    this.errno = args.errno
    this.sqlState = args.sqlState
    this.sqlMessage = args.sqlMessage
    this.fatal = args.fatal
    this.sql = args.sql
    this.syscall = args.syscall
    this.address = args.address
    this.port = args.port
    this.hostname = args.hostname
    this.query = args.query
    this.raw = args.raw
  }
}
