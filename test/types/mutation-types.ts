import * as Effect from "effect/Effect"
import * as SqlClient from "@effect/sql/SqlClient"
import * as SqlError from "@effect/sql/SqlError"

import * as Mysql from "../../src/mysql.ts"
import * as Postgres from "../../src/postgres.ts"
import { Column as C, Executor, Query as Q, Renderer, Table } from "../../src/index.ts"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const insertPlan = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
})

const updatePlan = Q.update(users, {
  email: "updated@example.com",
  bio: null
})

const deletePlan = Q.delete(users)

type InsertStatement = Q.StatementOfPlan<typeof insertPlan>
type UpdateStatement = Q.StatementOfPlan<typeof updatePlan>
type DeleteStatement = Q.StatementOfPlan<typeof deletePlan>

const insertStatement: InsertStatement = "insert"
const updateStatement: UpdateStatement = "update"
const deleteStatement: DeleteStatement = "delete"
void insertStatement
void updateStatement
void deleteStatement

type InsertCapabilities = Q.CapabilitiesOfPlan<typeof insertPlan>
type UpdateCapabilities = Q.CapabilitiesOfPlan<typeof updatePlan>
type DeleteCapabilities = Q.CapabilitiesOfPlan<typeof deletePlan>

const insertCapability: InsertCapabilities = "write"
const updateCapability: UpdateCapabilities = "write"
const deleteCapability: DeleteCapabilities = "write"
void insertCapability
void updateCapability
void deleteCapability

const insertReturning = Q.returning({
  id: users.id,
  email: users.email,
  bio: users.bio
})(insertPlan)

const updateReturning = Q.returning({
  id: users.id,
  email: users.email,
  bio: users.bio
})(updatePlan)

const deleteReturning = Q.returning({
  id: users.id
})(deletePlan)

const insertedUsers = Q.with(insertReturning, "inserted_users")

const insertedUsersPlan = Q.select({
  id: insertedUsers.id,
  email: insertedUsers.email,
  bio: insertedUsers.bio
}).pipe(
  Q.from(insertedUsers)
)

type InsertedUsersRow = Q.ResultRow<typeof insertedUsersPlan>
type InsertedUsersCapabilities = Q.CapabilitiesOfPlan<typeof insertedUsersPlan>
type InsertedUsersPostgresError = Postgres.Executor.PostgresQueryError<typeof insertedUsersPlan>
type InsertedUsersMysqlError = Mysql.Executor.MysqlQueryError<typeof insertedUsersPlan>
const insertedUsersRow: InsertedUsersRow = {
  id: "user-id",
  email: "alice@example.com",
  bio: null
}
const insertedUsersCapabilityRead: InsertedUsersCapabilities = "read"
const insertedUsersCapabilityWrite: InsertedUsersCapabilities = "write"
void insertedUsersRow
void insertedUsersCapabilityRead
void insertedUsersCapabilityWrite
const insertedUsersPostgresError: InsertedUsersPostgresError = null as never as Postgres.Executor.PostgresExecutorError
const insertedUsersMysqlError: InsertedUsersMysqlError = null as never as Mysql.Executor.MysqlExecutorError
void insertedUsersPostgresError
void insertedUsersMysqlError

type InsertRow = Q.ResultRow<typeof insertReturning>
type UpdateRow = Q.ResultRow<typeof updateReturning>
type DeleteRow = Q.ResultRow<typeof deleteReturning>

const insertRow: InsertRow = {
  id: "user-id",
  email: "alice@example.com",
  bio: null
}
const updateRow: UpdateRow = {
  id: "user-id",
  email: "updated@example.com",
  bio: null
}
const deleteRow: DeleteRow = {
  id: "user-id"
}
void insertRow
void updateRow
void deleteRow

// @ts-expect-error insert plans cannot be used with from(...)
Q.from(users)(insertPlan)

// @ts-expect-error insert plans cannot be used with where(...)
Q.where(Q.eq(users.id, "user-id"))(insertPlan)

// @ts-expect-error update plans cannot be used with from(...)
Q.from(users)(updatePlan)

// @ts-expect-error delete plans cannot be used with from(...)
Q.from(users)(deletePlan)

// @ts-expect-error returning is mutation-only
Q.returning({ id: users.id })(Q.select({ id: users.id }).pipe(Q.from(users)))

const postgresMutation = Postgres.Query.returning({
  id: users.id
})(Postgres.Query.delete(users))

const mysqlMutation = Mysql.Query.returning({
  id: users.id
})(Mysql.Query.delete(users))

type PostgresMutationRow = Postgres.Query.ResultRow<typeof postgresMutation>
type MysqlMutationRow = Mysql.Query.ResultRow<typeof mysqlMutation>

const postgresMutationRow: PostgresMutationRow = { id: "user-id" }
const mysqlMutationRow: MysqlMutationRow = { id: "user-id" }
void postgresMutationRow
void mysqlMutationRow

const transactionEffect = Executor.withTransaction(Effect.succeed(insertRow))
type TransactionEffect = typeof transactionEffect
const transactionEffectCheck: Effect.Effect<InsertRow, SqlError.SqlError, SqlClient.SqlClient> = transactionEffect
const transactionEffectValue: TransactionEffect = transactionEffect
void transactionEffectCheck
void transactionEffectValue

const renderer = Renderer.make("postgres")
const executor = Executor.make("postgres", <PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
  plan: Q.DialectCompatiblePlan<PlanValue, "postgres">
): Effect.Effect<any, never, never> => {
  void plan
  return null as never
})
void renderer
void executor
