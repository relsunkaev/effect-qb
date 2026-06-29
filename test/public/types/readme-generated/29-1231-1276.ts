// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1231-1276

// README.md:1231-1276
import { Effect } from "effect"
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const memberships = Table.make("memberships", {
  id: Column.text().pipe(Column.primaryKey),
  role: Column.text()
})

const auditLogs = Table.make("audit_logs", {
  id: Column.text().pipe(Column.primaryKey),
  membershipId: Column.text(),
  note: Column.text()
})

const executor = Pg.Executor.make()

const insertMembership = Query.insert(memberships, {
  id: "membership-1",
  role: "admin"
})

const updateAuditLog = Query.update(auditLogs, {
  note: "membership written"
}).pipe(
  Query.where(Query.eq(auditLogs.membershipId, "membership-1"))
)

const readMembership = Query.select({
  id: memberships.id,
  role: memberships.role
}).pipe(
  Query.from(memberships),
  Query.where(Query.eq(memberships.id, "membership-1"))
)

const writeMembership = Effect.gen(function*() {
  yield* executor.execute(insertMembership)

  // nested transaction uses a savepoint
  yield* executor.execute(updateAuditLog).pipe(Pg.Executor.withTransaction)

  return yield* executor.execute(readMembership)
}).pipe(Pg.Executor.withTransaction)

export {};
