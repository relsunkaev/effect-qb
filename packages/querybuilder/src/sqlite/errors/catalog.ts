export const sqliteErrorCategories = {
  sqlite: "sqlite"
} as const

export type SqliteErrorCategory = keyof typeof sqliteErrorCategories

type SqliteErrorDescriptorShape<Symbol extends string = string> = {
  readonly category: "sqlite"
  readonly number: `${number}`
  readonly symbol: Symbol
  readonly tag: `@sqlite/${Lowercase<Symbol>}`
  readonly messageTemplate: string
}

const descriptor = <Symbol extends string>(
  number: `${number}`,
  symbol: Symbol,
  messageTemplate: string
): SqliteErrorDescriptorShape<Symbol> => ({
  category: "sqlite",
  number,
  symbol,
  tag: `@sqlite/${symbol.toLowerCase()}` as `@sqlite/${Lowercase<Symbol>}`,
  messageTemplate
})

export const sqliteErrorCatalogBySymbol = {
  SQLITE_ERROR: descriptor("1", "SQLITE_ERROR", "SQL error or missing database"),
  SQLITE_INTERNAL: descriptor("2", "SQLITE_INTERNAL", "Internal SQLite logic error"),
  SQLITE_PERM: descriptor("3", "SQLITE_PERM", "Access permission denied"),
  SQLITE_ABORT: descriptor("4", "SQLITE_ABORT", "Callback routine requested an abort"),
  SQLITE_BUSY: descriptor("5", "SQLITE_BUSY", "Database file is locked"),
  SQLITE_LOCKED: descriptor("6", "SQLITE_LOCKED", "Database table is locked"),
  SQLITE_NOMEM: descriptor("7", "SQLITE_NOMEM", "Out of memory"),
  SQLITE_READONLY: descriptor("8", "SQLITE_READONLY", "Attempt to write a readonly database"),
  SQLITE_INTERRUPT: descriptor("9", "SQLITE_INTERRUPT", "Operation terminated by sqlite3_interrupt"),
  SQLITE_IOERR: descriptor("10", "SQLITE_IOERR", "Disk I/O error"),
  SQLITE_CORRUPT: descriptor("11", "SQLITE_CORRUPT", "Database disk image is malformed"),
  SQLITE_NOTFOUND: descriptor("12", "SQLITE_NOTFOUND", "Unknown opcode"),
  SQLITE_FULL: descriptor("13", "SQLITE_FULL", "Insertion failed because database is full"),
  SQLITE_CANTOPEN: descriptor("14", "SQLITE_CANTOPEN", "Unable to open the database file"),
  SQLITE_PROTOCOL: descriptor("15", "SQLITE_PROTOCOL", "Database lock protocol error"),
  SQLITE_EMPTY: descriptor("16", "SQLITE_EMPTY", "Database is empty"),
  SQLITE_SCHEMA: descriptor("17", "SQLITE_SCHEMA", "Database schema changed"),
  SQLITE_TOOBIG: descriptor("18", "SQLITE_TOOBIG", "String or blob exceeds size limit"),
  SQLITE_CONSTRAINT: descriptor("19", "SQLITE_CONSTRAINT", "Constraint violation"),
  SQLITE_MISMATCH: descriptor("20", "SQLITE_MISMATCH", "Data type mismatch"),
  SQLITE_MISUSE: descriptor("21", "SQLITE_MISUSE", "Library used incorrectly"),
  SQLITE_NOLFS: descriptor("22", "SQLITE_NOLFS", "Uses OS features not supported on host"),
  SQLITE_AUTH: descriptor("23", "SQLITE_AUTH", "Authorization denied"),
  SQLITE_FORMAT: descriptor("24", "SQLITE_FORMAT", "Auxiliary database format error"),
  SQLITE_RANGE: descriptor("25", "SQLITE_RANGE", "Bind parameter index out of range"),
  SQLITE_NOTADB: descriptor("26", "SQLITE_NOTADB", "File is not a database"),
  SQLITE_NOTICE: descriptor("27", "SQLITE_NOTICE", "Notifications from sqlite3_log"),
  SQLITE_WARNING: descriptor("28", "SQLITE_WARNING", "Warnings from sqlite3_log"),
  SQLITE_ROW: descriptor("100", "SQLITE_ROW", "sqlite3_step has another row ready"),
  SQLITE_DONE: descriptor("101", "SQLITE_DONE", "sqlite3_step has finished executing"),
  SQLITE_BUSY_RECOVERY: descriptor("261", "SQLITE_BUSY_RECOVERY", "Database is busy recovering"),
  SQLITE_BUSY_SNAPSHOT: descriptor("517", "SQLITE_BUSY_SNAPSHOT", "Database snapshot is busy"),
  SQLITE_BUSY_TIMEOUT: descriptor("773", "SQLITE_BUSY_TIMEOUT", "Blocking POSIX advisory lock timed out"),
  SQLITE_CONSTRAINT_CHECK: descriptor("275", "SQLITE_CONSTRAINT_CHECK", "CHECK constraint failed"),
  SQLITE_CONSTRAINT_FOREIGNKEY: descriptor("787", "SQLITE_CONSTRAINT_FOREIGNKEY", "FOREIGN KEY constraint failed"),
  SQLITE_CONSTRAINT_NOTNULL: descriptor("1299", "SQLITE_CONSTRAINT_NOTNULL", "NOT NULL constraint failed"),
  SQLITE_CONSTRAINT_PRIMARYKEY: descriptor("1555", "SQLITE_CONSTRAINT_PRIMARYKEY", "PRIMARY KEY constraint failed"),
  SQLITE_CONSTRAINT_UNIQUE: descriptor("2067", "SQLITE_CONSTRAINT_UNIQUE", "UNIQUE constraint failed")
} as const

export type SqliteErrorSymbol = keyof typeof sqliteErrorCatalogBySymbol

export type SqliteErrorDescriptor = (typeof sqliteErrorCatalogBySymbol)[SqliteErrorSymbol]

export type SqliteErrorNumber = SqliteErrorDescriptor["number"]

export type SqliteErrorTag = SqliteErrorDescriptor["tag"]

const sqliteErrorDescriptors = Object.values(sqliteErrorCatalogBySymbol)

export const sqliteErrorCatalogByNumber = sqliteErrorDescriptors.reduce(
  (acc, entry) => ({
    ...acc,
    [entry.number]: [...(acc[entry.number as SqliteErrorNumber] ?? []), entry]
  }),
  {} as Record<SqliteErrorNumber, readonly SqliteErrorDescriptor[]>
)

export const isSqliteErrorSymbol = (value: string): value is SqliteErrorSymbol =>
  value in sqliteErrorCatalogBySymbol

export const isSqliteErrorNumber = (value: string): value is SqliteErrorNumber =>
  value in sqliteErrorCatalogByNumber

export const getSqliteErrorDescriptor = (
  symbol: SqliteErrorSymbol
): SqliteErrorDescriptor => sqliteErrorCatalogBySymbol[symbol]

export const findSqliteErrorDescriptorsByNumber = (
  number: SqliteErrorNumber
): readonly SqliteErrorDescriptor[] => sqliteErrorCatalogByNumber[number] ?? []

export const findSqliteErrorDescriptorsByNumberLoose = (
  number: string
): readonly SqliteErrorDescriptor[] | undefined =>
  isSqliteErrorNumber(number) ? sqliteErrorCatalogByNumber[number] : undefined
