// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 2473-2510

// README.md:2473-2510
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect/Effect"
import { Column, Query, Table } from "effect-qb"
import { Executor } from "effect-qb/sqlite"

const memberships = Table.make("memberships", {
  id: Column.text().pipe(Column.primaryKey),
  role: Column.text()
})
const auditLogs = Table.make("audit_logs", {
  id: Column.text().pipe(Column.primaryKey),
  membershipId: Column.text()
})
const executor = Executor.make()
const insertMembership = Query.insert(memberships, { id: "member-1", role: "admin" })
const insertAuditLog = Query.insert(auditLogs, { id: "audit-1", membershipId: "member-1" })
const rejectedSignup = Effect.gen(function* () {
  yield* executor.execute(insertMembership)
  yield* executor.execute(insertAuditLog)
  return yield* Effect.fail({ _tag: "SignupRejected" as const })
}).pipe(Executor.withTransaction)
const readState = Effect.all({
  memberships: executor.execute(Query.select({ id: memberships.id }).pipe(Query.from(memberships))),
  auditLogs: executor.execute(Query.select({ id: auditLogs.id }).pipe(Query.from(auditLogs)))
})
const program = Effect.gen(function* () {
  yield* executor.execute(Query.createTable(memberships))
  yield* executor.execute(Query.createTable(auditLogs))
  yield* rejectedSignup.pipe(Effect.catchTag("SignupRejected", () => Effect.void))
  return yield* readState
}).pipe(
  Effect.provide(SqliteClient.layer({ filename: ":memory:" }))
)
const state = await Effect.runPromise(program)
console.log(state)
// { memberships: [], auditLogs: [] }

export {};
