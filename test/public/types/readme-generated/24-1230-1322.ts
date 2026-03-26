// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1230-1233, 1244-1264, 1268-1289, 1319-1322

// README.md:1230-1233
import { Errors as PostgresErrors } from "effect-qb/postgres"
import { Errors as MysqlErrors } from "effect-qb/mysql"

{
  // README.md:1244-1264
  const descriptor = PostgresErrors.getPostgresErrorDescriptor("23505")
  descriptor.tag
  // "@postgres/integrity-constraint-violation/unique-violation"
  descriptor.classCode
  descriptor.className
  descriptor.condition
  descriptor.primaryFields

  const postgresError = PostgresErrors.normalizePostgresDriverError({
    code: "23505",
    message: "duplicate key value violates unique constraint",
    constraint: "users_email_key"
  })

  postgresError._tag
  if (PostgresErrors.hasSqlState(postgresError, "23505")) {
    postgresError.code
    postgresError.constraintName
  }
}

{
  // README.md:1268-1289
  const mysqlDescriptor = MysqlErrors.getMysqlErrorDescriptor("ER_DUP_ENTRY")
  mysqlDescriptor.tag
  // "@mysql/server/dup-entry"
  mysqlDescriptor.category
  mysqlDescriptor.number
  mysqlDescriptor.sqlState
  mysqlDescriptor.messageTemplate

  const mysqlError = MysqlErrors.normalizeMysqlDriverError({
    code: "ER_DUP_ENTRY",
    errno: 1062,
    sqlState: "23000",
    sqlMessage: "Duplicate entry 'alice@example.com' for key 'users.email'"
  })

  mysqlError._tag
  if (MysqlErrors.hasSymbol(mysqlError, "ER_DUP_ENTRY")) {
    mysqlError.symbol
    mysqlError.number
  }
}

{
  // README.md:1319-1322
  const descriptors =
    MysqlErrors.findMysqlErrorDescriptorsByNumber("MY-015144")
}

export {};
