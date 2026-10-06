// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 2293-2340

// README.md:2293-2340
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { Column, Executor, Query, Table } from "effect-qb"
import * as Sq from "effect-qb/sqlite"

const users = Table.make("users", {
  id: Column.text().pipe(Column.primaryKey),
  email: Column.text()
})
const executor = Sq.Executor.make()
const lookup = (email: string) => Query.select({ id: users.id }).pipe(
  Query.from(users), Query.where(Query.eq(users.email, email))
)
const describeCardinality = (error: Executor.ResultCardinalityError) =>
  Effect.succeed({ expected: error.expected, actual: error.actual })

const optionalUser = (email: string) => executor.execute(lookup(email)).pipe(
  Sq.Executor.atMostOne,
  Effect.map(Option.getOrNull),
  Effect.catchTag("ResultCardinalityError", describeCardinality)
)
const requiredUser = (email: string) => executor.execute(lookup(email)).pipe(
  Sq.Executor.exactlyOne,
  Effect.catchTag("ResultCardinalityError", describeCardinality)
)
const optionalCases = Effect.all({
  missing: optionalUser("missing@example.com"),
  unique: optionalUser("grace@example.com"),
  duplicate: optionalUser("shared@example.com")
})
const requiredCases = Effect.all({
  missing: requiredUser("missing@example.com"),
  unique: requiredUser("grace@example.com"),
  duplicate: requiredUser("shared@example.com")
})
const checks = Effect.all({ optional: optionalCases, required: requiredCases })
const program = executor.execute(Query.createTable(users)).pipe(
  Effect.andThen(executor.execute(Query.insert(users, { id: "ada", email: "shared@example.com" }))),
  Effect.andThen(executor.execute(Query.insert(users, { id: "linus", email: "shared@example.com" }))),
  Effect.andThen(executor.execute(Query.insert(users, { id: "grace", email: "grace@example.com" }))),
  Effect.andThen(checks),
  Effect.provide(SqliteClient.layer({ filename: ":memory:" }))
)
const outcomes = await Effect.runPromise(program)
console.log(outcomes)

export {};
