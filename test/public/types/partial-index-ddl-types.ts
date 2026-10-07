import { Column, Query, Table, Type } from "effect-qb"
import { Executor, Query as SqQuery } from "effect-qb/sqlite"

const users = Table.make("partial_index_users", {
  id: Column.text().pipe(Column.primaryKey),
  email: Column.text().pipe(Column.nullable)
}).pipe(Table.option({
  kind: "index",
  columns: ["email"] as const,
  unique: true,
  predicate: Query.isNotNull(Query.column("email", Type.text()))
}))

Executor.make().execute(Query.createTable(users))
Executor.make().execute(Query.dropTable(users))
Executor.make().execute(Query.insert(users, { id: "alice", email: "alice@example.com" }).pipe(
  SqQuery.onConflict({ columns: ["email"] as const, where: Query.isNotNull(users.email) }, {
    update: { email: Query.excluded(users.email) }
  })
))
// @ts-expect-error partial indexes do not authorize an unconditional conflict target
Query.insert(users, { id: "alice", email: "alice@example.com" }).pipe(Query.onConflict("email"))
