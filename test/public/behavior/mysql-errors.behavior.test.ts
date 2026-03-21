import { describe, expect, test } from "bun:test"
import * as SqlClient from "@effect/sql/SqlClient"
import * as Either from "effect/Either"
import * as Effect from "effect/Effect"

import * as Mysql from "#mysql"
import { unsafeAny } from "../../helpers/unsafe.ts"

describe("mysql errors", () => {
  test("catalog descriptors expose official MySQL metadata", () => {
    const descriptor = Mysql.Errors.getMysqlErrorDescriptor("ER_DUP_ENTRY")

    expect(descriptor.symbol).toBe("ER_DUP_ENTRY")
    expect(descriptor.number).toBe("1062")
    expect(descriptor.category).toBe("server")
    expect(descriptor.sqlState).toBe("23000")
    expect(descriptor.tag).toBe("@mysql/server/dup-entry")
  })

  test("query-requirement mapping marks write-required mysql sqlstate classes explicitly", () => {
    const writeRequirements = Mysql.Errors.requirements_of_mysql_error(
      Mysql.Errors.normalizeMysqlDriverError({
        code: "ER_DUP_ENTRY",
        errno: 1062,
        sqlState: "23000",
        sqlMessage: "Duplicate entry 'alice@example.com' for key 'users.email'"
      })
    )

    const readRequirements = Mysql.Errors.requirements_of_mysql_error(
      Mysql.Errors.normalizeMysqlDriverError({
        code: "ER_PARSE_ERROR",
        errno: 1064,
        sqlState: "42000",
        sqlMessage: "You have an error in your SQL syntax"
      })
    )

    expect(writeRequirements).toEqual(["write"])
    expect(readRequirements).toEqual([])
  })

  test("fromDriver remaps write-required server failures behind query-requirements errors", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    const plan = Mysql.Query.select({
      id: users.id,
      email: users.email
    }).pipe(
      Mysql.Query.from(users)
    )

    const executor = Mysql.Executor.make({
      driver: Mysql.Executor.driver(() =>
        Effect.fail({
          code: "ER_DUP_ENTRY",
          errno: 1062,
          sqlState: "23000",
          sqlMessage: "Duplicate entry 'alice@example.com' for key 'users.email'",
          message: "Duplicate entry 'alice@example.com' for key 'users.email'",
          fatal: false
        }))
    })

    const result = Effect.runSync(Effect.either(executor.execute(plan)))

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isRight(result)) {
      throw new Error("Expected MySQL failure")
    }
    const error = result.left
    if (!("_tag" in error) || error._tag !== "@mysql/unknown/query-requirements") {
      throw new Error(`Expected @mysql/unknown/query-requirements, got ${String(error)}`)
    }
    expect(error.requiredCapabilities).toEqual(["write"])
    expect(error.actualCapabilities).toEqual(["read"])
    expect(error.cause._tag).toBe("@mysql/server/dup-entry")
    if (!("_tag" in error.cause) || error.cause._tag !== "@mysql/server/dup-entry") {
      throw new Error("Expected wrapped dup-entry")
    }
    expect(error.cause.symbol).toBe("ER_DUP_ENTRY")
    expect(error.cause.number).toBe("1062")
    expect(error.cause.sqlState).toBe("23000")
  })

  test("fromDriver preserves write-required failures for write-bearing cte plans", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    const insertedUsers = Mysql.Query.insert(users, {
      id: "11111111-1111-1111-1111-111111111111",
      email: "alice@example.com"
    }).pipe(
      Mysql.Query.returning({
        id: users.id,
        email: users.email
      }),
      Mysql.Query.with("inserted_users")
    )

    const plan = Mysql.Query.select({
      id: insertedUsers.id,
      email: insertedUsers.email
    }).pipe(
      Mysql.Query.from(insertedUsers)
    )

    const executor = Mysql.Executor.make({
      driver: Mysql.Executor.driver(() =>
        Effect.fail({
          code: "ER_DUP_ENTRY",
          errno: 1062,
          sqlState: "23000",
          sqlMessage: "Duplicate entry 'alice@example.com' for key 'users.email'",
          message: "Duplicate entry 'alice@example.com' for key 'users.email'",
          fatal: false
        }))
    })

    const result = Effect.runSync(Effect.either(executor.execute(plan)))

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isRight(result)) {
      throw new Error("Expected MySQL failure")
    }
    const error = result.left
    if (!("_tag" in error) || error._tag !== "@mysql/server/dup-entry") {
      throw new Error(`Expected @mysql/server/dup-entry, got ${String(error)}`)
    }
    expect(error.symbol).toBe("ER_DUP_ENTRY")
    expect(error.number).toBe("1062")
    expect(error.sqlState).toBe("23000")
  })

  test("fromDriver normalizes known client failures by number", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey)
    })

    const plan = Mysql.Query.select({
      id: users.id
    }).pipe(
      Mysql.Query.from(users)
    )

    const executor = Mysql.Executor.make({
      driver: Mysql.Executor.driver(() =>
        Effect.fail({
          errno: 2002,
          message: "Can't connect to local MySQL server through socket '/tmp/mysql.sock' (2)",
          fatal: true
        }))
    })

    const result = Effect.runSync(Effect.either(executor.execute(plan)))

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isRight(result)) {
      throw new Error("Expected MySQL failure")
    }
    const error = result.left
    if (!("_tag" in error) || error._tag !== "@mysql/client/connection-error") {
      throw new Error(`Expected @mysql/client/connection-error, got ${String(error)}`)
    }
    expect(error.symbol).toBe("CR_CONNECTION_ERROR")
    expect(error.number).toBe("2002")
    expect(error.fatal).toBe(true)
  })

  test("fromSqlClient normalizes allowed mysql failures through SqlClient", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey)
    })

    const plan = Mysql.Query.select({
      id: users.id
    }).pipe(
      Mysql.Query.from(users)
    )

    const executor = Mysql.Executor.make()
    const sql = {
      unsafe<Row extends object>() {
        return unsafeAny(Effect.fail({
          code: "ER_PARSE_ERROR",
          errno: 1064,
          sqlState: "42000",
          sqlMessage: "You have an error in your SQL syntax"
        }))
      }
    } as unknown as SqlClient.SqlClient

    const result = Effect.runSync(
      Effect.either(Effect.provideService(executor.execute(plan), SqlClient.SqlClient, sql))
    )

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isRight(result)) {
      throw new Error("Expected MySQL failure")
    }
    const error = result.left
    if (!("_tag" in error) || error._tag !== "@mysql/server/parse-error") {
      throw new Error(`Expected @mysql/server/parse-error, got ${String(error)}`)
    }
    expect(error.query?.sql).toBe("select `users`.`id` as `id` from `users`")
  })

  test("unknown but mysql-like catalog misses fall back to the unknown errno namespace", () => {
    const error = Mysql.Errors.normalizeMysqlDriverError({
      code: "ER_NOT_IN_OUR_CATALOG",
      errno: 999999,
      sqlMessage: "future mysql error"
    })

    expect(error._tag).toBe("@mysql/unknown/code")
    if (error._tag !== "@mysql/unknown/code") {
      throw new Error("Expected unknown code")
    }
    expect(error.code).toBe("ER_NOT_IN_OUR_CATALOG")
    expect(error.errno).toBe(999999)
  })

  test("unknown mysql codes with write-required sqlstate still map to query-requirements for read plans", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey)
    })

    const plan = Mysql.Query.select({
      id: users.id
    }).pipe(
      Mysql.Query.from(users)
    )

    const executor = Mysql.Executor.make({
      driver: Mysql.Executor.driver(() =>
        Effect.fail({
          code: "ER_FUTURE_WRITE_ERROR",
          errno: 999999,
          sqlState: "23000",
          sqlMessage: "future mysql write error"
        }))
    })

    const result = Effect.runSync(Effect.either(executor.execute(plan)))

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isRight(result)) {
      throw new Error("Expected MySQL failure")
    }
    const error = result.left
    if (!("_tag" in error) || error._tag !== "@mysql/unknown/query-requirements") {
      throw new Error(`Expected @mysql/unknown/query-requirements, got ${String(error)}`)
    }
    expect(error.requiredCapabilities).toEqual(["write"])
    expect(error.cause._tag).toBe("@mysql/unknown/code")
  })

  test("non-MySQL driver failures fall back to the unknown driver namespace", () => {
    const cause = new Error("socket closed")
    const error = Mysql.Errors.normalizeMysqlDriverError(cause)

    expect(error._tag).toBe("@mysql/unknown/driver")
    if (error._tag !== "@mysql/unknown/driver") {
      throw new Error("Expected unknown driver")
    }
    expect(error.cause).toBe(cause)
  })

  test("hasSymbol narrows normalized errors by official MySQL symbol", () => {
    const error = Mysql.Errors.normalizeMysqlDriverError({
      code: "ER_DUP_ENTRY",
      errno: 1062,
      sqlState: "23000",
      sqlMessage: "Duplicate entry 'alice@example.com' for key 'users.email'"
    })

    expect(Mysql.Errors.hasSymbol(error, "ER_DUP_ENTRY")).toBe(true)
    if (!Mysql.Errors.hasSymbol(error, "ER_DUP_ENTRY")) {
      throw new Error("Expected ER_DUP_ENTRY")
    }
    expect(error._tag).toBe("@mysql/server/dup-entry")
    expect(error.number).toBe("1062")
  })

  test("hasNumber narrows normalized errors by documented MySQL error number", () => {
    const error = Mysql.Errors.normalizeMysqlDriverError({
      code: "ER_DUP_ENTRY",
      errno: 1062,
      sqlState: "23000",
      sqlMessage: "Duplicate entry 'alice@example.com' for key 'users.email'"
    })

    expect(Mysql.Errors.hasNumber(error, "1062")).toBe(true)
    if (!Mysql.Errors.hasNumber(error, "1062")) {
      throw new Error("Expected number 1062")
    }
    expect(error.symbol).toBe("ER_DUP_ENTRY")
  })

  test("number lookups surface duplicate official MySQL entries when present", () => {
    const descriptors = Mysql.Errors.findMysqlErrorDescriptorsByNumber("MY-015144")

    expect(descriptors?.length).toBe(2)
    expect(descriptors?.map((descriptor) => descriptor.symbol)).toEqual([
      "ER_IB_MSG_FIL_STATE_MOVED_PREV",
      "ER_IB_MSG_FIL_STATE_MOVED_PREV_OR_HAS_DATADIR"
    ])
  })
})
