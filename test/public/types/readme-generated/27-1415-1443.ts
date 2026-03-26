// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1415-1443

// README.md:1415-1443
import { Errors as MysqlErrors } from "effect-qb/mysql"
import { Errors as PostgresErrors } from "effect-qb/postgres"

const postgresError = PostgresErrors.normalizePostgresDriverError({
  code: "23505",
  message: "duplicate key value violates unique constraint",
  constraint: "users_email_key"
})

if (PostgresErrors.hasSqlState(postgresError, "23505")) {
  postgresError.constraintName
}

const mysqlError = MysqlErrors.normalizeMysqlDriverError({
  code: "ER_DUP_ENTRY",
  errno: 1062,
  sqlState: "23000",
  sqlMessage: "Duplicate entry 'alice@example.com' for key 'users.email'"
})

if (MysqlErrors.hasSymbol(mysqlError, "ER_DUP_ENTRY")) {
  mysqlError.number
}

if (MysqlErrors.hasNumber(mysqlError, "1062")) {
  mysqlError.symbol
}

export {};
