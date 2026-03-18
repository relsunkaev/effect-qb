import { describe, expect, test } from "bun:test"
import * as SqlClient from "@effect/sql/SqlClient"
import * as Either from "effect/Either"
import * as Effect from "effect/Effect"

import * as Postgres from "../src/postgres.ts"
import { unsafeAny } from "./helpers/unsafe.ts"

const userId = "11111111-1111-1111-1111-111111111111"

describe("postgres errors", () => {
  test("catalog descriptors expose SQLSTATE metadata", () => {
    const descriptor = Postgres.Errors.getPostgresErrorDescriptor("23505")

    expect(descriptor.code).toBe("23505")
    expect(descriptor.condition).toBe("unique_violation")
    expect(descriptor.classCode).toBe("23")
    expect(descriptor.className).toBe("Integrity Constraint Violation")
    expect(descriptor.tag).toBe("@postgres/integrity-constraint-violation/unique-violation")
    expect(descriptor.primaryFields).toContain("constraintName")
  })

  test("query-requirement mapping marks write-required postgres classes explicitly", () => {
    const writeRequirements = Postgres.Errors.requirements_of_postgres_error(
      Postgres.Errors.normalizePostgresDriverError({
        code: "23505",
        message: "duplicate key value violates unique constraint"
      })
    )

    const readRequirements = Postgres.Errors.requirements_of_postgres_error(
      Postgres.Errors.normalizePostgresDriverError({
        code: "42601",
        message: "syntax error at or near select"
      })
    )

    expect(writeRequirements).toEqual(["write"])
    expect(readRequirements).toEqual([])
  })

  test("fromDriver remaps write-required SQLSTATE failures behind query-requirements errors", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const plan = Postgres.Query.select({
      id: users.id,
      email: users.email
    }).pipe(
      Postgres.Query.from(users)
    )

    const executor = Postgres.Executor.fromDriver(
      Postgres.Renderer.make(),
      Postgres.Executor.driver(() =>
        Effect.fail({
          code: "23505",
          message: "duplicate key value violates unique constraint",
          detail: 'Key (email)=(alice@example.com) already exists.',
          schema: "public",
          table: "users",
          constraint: "users_email_key",
          severity: "ERROR"
        }))
    )

    const result = Effect.runSync(Effect.either(executor.execute(plan)))

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isRight(result)) {
      throw new Error("Expected Postgres failure")
    }
    const error = result.left
    if (!("_tag" in error) || error._tag !== "@postgres/unknown/query-requirements") {
      throw new Error(`Expected @postgres/unknown/query-requirements, got ${String(error)}`)
    }
    expect(error.requiredCapabilities).toEqual(["write"])
    expect(error.actualCapabilities).toEqual(["read"])
    expect(error.query?.sql).toBe('select "users"."id" as "id", "users"."email" as "email" from "public"."users"')
    expect(error.cause._tag).toBe("@postgres/integrity-constraint-violation/unique-violation")
    if (!("_tag" in error.cause) || error.cause._tag !== "@postgres/integrity-constraint-violation/unique-violation") {
      throw new Error("Expected wrapped unique violation")
    }
    expect(error.cause.code).toBe("23505")
    expect(error.cause.constraintName).toBe("users_email_key")
    expect(error.cause.tableName).toBe("users")
    expect(error.cause.schemaName).toBe("public")
  })

  test("fromDriver preserves write-required failures for write-bearing cte plans", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const insertedUsers = Postgres.Query.with(
      Postgres.Query.returning({
        id: users.id,
        email: users.email
      })(Postgres.Query.insert(users, {
        id: "11111111-1111-1111-1111-111111111111",
        email: "alice@example.com"
      })),
      "inserted_users"
    )

    const plan = Postgres.Query.select({
      id: insertedUsers.id,
      email: insertedUsers.email
    }).pipe(
      Postgres.Query.from(insertedUsers)
    )

    const executor = Postgres.Executor.fromDriver(
      Postgres.Renderer.make(),
      Postgres.Executor.driver(() =>
        Effect.fail({
          code: "23505",
          message: "duplicate key value violates unique constraint",
          detail: 'Key (email)=(alice@example.com) already exists.',
          schema: "public",
          table: "users",
          constraint: "users_email_key",
          severity: "ERROR"
        }))
    )

    const result = Effect.runSync(Effect.either(executor.execute(plan)))

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isRight(result)) {
      throw new Error("Expected Postgres failure")
    }
    const error = result.left
    if (!("_tag" in error) || error._tag !== "@postgres/integrity-constraint-violation/unique-violation") {
      throw new Error(`Expected @postgres/integrity-constraint-violation/unique-violation, got ${String(error)}`)
    }
    expect(error.code).toBe("23505")
    expect(error.constraintName).toBe("users_email_key")
  })

  test("fromSqlClient normalizes syntax errors with structured fields", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey)
    })

    const plan = Postgres.Query.select({
      id: users.id
    }).pipe(
      Postgres.Query.from(users)
    )

    const executor = Postgres.Executor.fromSqlClient(Postgres.Renderer.make())
    const sql = {
      unsafe<Row extends object>() {
        return unsafeAny(Effect.fail({
          code: "42601",
          message: "syntax error at or near \"fromm\"",
          position: "15",
          hint: "Perhaps you meant FROM.",
          severity: "ERROR"
        }))
      }
    } as unknown as SqlClient.SqlClient

    const result = Effect.runSync(
      Effect.either(Effect.provideService(executor.execute(plan), SqlClient.SqlClient, sql))
    )

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isRight(result)) {
      throw new Error("Expected Postgres failure")
    }
    const error = result.left
    if (!("_tag" in error) || error._tag !== "@postgres/syntax-error-or-access-rule-violation/syntax-error") {
      throw new Error(`Expected @postgres/syntax-error-or-access-rule-violation/syntax-error, got ${String(error)}`)
    }
    expect(error.code).toBe("42601")
    expect(error.position).toBe(15)
    expect(error.hint).toBe("Perhaps you meant FROM.")
  })

  test("non-Postgres driver failures fall back to the unknown driver namespace", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey)
    })

    const plan = Postgres.Query.select({
      id: users.id
    }).pipe(
      Postgres.Query.from(users)
    )

    const cause = new Error("socket closed")

    const executor = Postgres.Executor.fromDriver(
      Postgres.Renderer.make(),
      Postgres.Executor.driver(() => Effect.fail(cause))
    )

    const result = Effect.runSync(Effect.either(executor.execute(plan)))

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isRight(result)) {
      throw new Error("Expected driver failure")
    }
    const error = result.left
    if (!("_tag" in error) || error._tag !== "@postgres/unknown/driver") {
      throw new Error(`Expected @postgres/unknown/driver, got ${String(error)}`)
    }
    expect(error.message).toBe("socket closed")
    expect(error.cause).toBe(cause)
  })

  test("unknown but well-formed SQLSTATEs fall back to the unknown sqlstate namespace", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey)
    })

    const plan = Postgres.Query.select({
      id: users.id
    }).pipe(
      Postgres.Query.from(users)
    )

    const executor = Postgres.Executor.fromDriver(
      Postgres.Renderer.make(),
      Postgres.Executor.driver(() =>
        Effect.fail({
          code: "ZZ999",
          message: "future postgres error"
        }))
    )

    const result = Effect.runSync(Effect.either(executor.execute(plan)))

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isRight(result)) {
      throw new Error("Expected driver failure")
    }
    const error = result.left
    if (!("_tag" in error) || error._tag !== "@postgres/unknown/sqlstate") {
      throw new Error(`Expected @postgres/unknown/sqlstate, got ${String(error)}`)
    }
    expect(error.code).toBe("ZZ999")
    expect(error.message).toBe("future postgres error")
  })

  test("unknown SQLSTATEs in write-required classes still map to query-requirements for read plans", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey)
    })

    const plan = Postgres.Query.select({
      id: users.id
    }).pipe(
      Postgres.Query.from(users)
    )

    const executor = Postgres.Executor.fromDriver(
      Postgres.Renderer.make(),
      Postgres.Executor.driver(() =>
        Effect.fail({
          code: "23ZZZ",
          message: "future write-class postgres error"
        }))
    )

    const result = Effect.runSync(Effect.either(executor.execute(plan)))

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isRight(result)) {
      throw new Error("Expected driver failure")
    }
    const error = result.left
    if (!("_tag" in error) || error._tag !== "@postgres/unknown/query-requirements") {
      throw new Error(`Expected @postgres/unknown/query-requirements, got ${String(error)}`)
    }
    expect(error.requiredCapabilities).toEqual(["write"])
    expect(error.cause._tag).toBe("@postgres/unknown/sqlstate")
  })

  test("hasSqlState narrows normalized errors by code", () => {
    const error = Postgres.Errors.normalizePostgresDriverError({
      code: "23505",
      message: "duplicate key value violates unique constraint",
      constraint: "users_email_key"
    })

    expect(Postgres.Errors.hasSqlState(error, "23505")).toBe(true)
    if (!Postgres.Errors.hasSqlState(error, "23505")) {
      throw new Error("Expected unique violation")
    }
    expect(error._tag).toBe("@postgres/integrity-constraint-violation/unique-violation")
    expect(error.constraintName).toBe("users_email_key")
  })
})
