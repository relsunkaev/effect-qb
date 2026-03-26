import * as Effect from "effect/Effect"
import * as SqlClient from "@effect/sql/SqlClient"
import * as SqlError from "@effect/sql/SqlError"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import type { AvailableOfPlan } from "#internal/query.ts"
import { Cast, Column as C, Executor, Query as Q, Renderer, Table, Type } from "#postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})
const auditLogs = Table.make("audit_logs", {
  id: C.uuid().pipe(C.primaryKey, C.default(Q.literal("audit-log-id"))),
  note: C.text().pipe(C.nullable)
})
const mysqlUsers = Mysql.Table.make("users", {
  id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
  email: Mysql.Column.text(),
  bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
})

const insertPlan = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
})
const seedRows = [
  {
    id: Cast.to(Q.literal("user-id"), Type.uuid()),
    email: "alice@example.com",
    bio: null
  },
  {
    id: Cast.to(Q.literal("user-id-2"), Type.uuid()),
    email: "bob@example.com",
    bio: "writer"
  }
] as any
const valuesSource = Q.values(seedRows).pipe(Q.as("seed"))
const insertUnnestPlan = Q.insert(users).pipe(Q.from(Q.unnest({
  id: ["user-id", "user-id-2"],
  email: ["alice@example.com", "bob@example.com"],
  bio: [null, "writer"]
}, "seed")))
const insertSelectPlan = Q.insert(users).pipe(Q.from(Q.select({
  id: users.id,
  email: users.email,
  bio: users.bio
}).pipe(
  Q.from(users)
)))
const defaultInsertPlan = Q.insert(auditLogs)
const insertConflictPlan = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}).pipe(Q.onConflict({
  columns: ["email"] as const,
  where: Q.isNotNull(users.bio)
}, {
  update: {
    bio: Q.excluded(users.bio)
  },
  where: Q.isNotNull(Q.excluded(users.bio))
}))

const updatePlan = Q.update(users, {
  email: "updated@example.com",
  bio: null
})
const updateSeedRows = [
  {
    id: Cast.to(Q.literal("user-id"), Type.uuid()),
    email: Q.literal("updated@example.com")
  },
  {
    id: Cast.to(Q.literal("user-id-2"), Type.uuid()),
    email: Q.literal("bob@example.com")
  }
] as any
const updateValuesSource = Q.values(updateSeedRows).pipe(Q.as("incoming_users"))

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
void valuesSource
void updateValuesSource
void insertUnnestPlan
void insertSelectPlan
void defaultInsertPlan
void insertConflictPlan

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

const insertedUsers = insertReturning.pipe(Q.with("inserted_users"))

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

const invalidDefaultInsertPlan = Q.insert(users)

// @ts-expect-error default-only inserts require every insert column to be optional/generated
const invalidDefaultInsert: Q.CompletePlan<typeof invalidDefaultInsertPlan> = invalidDefaultInsertPlan

void invalidDefaultInsertPlan

// @ts-expect-error mysql conflict targets do not support named constraints
Mysql.Query.onConflict({
  constraint: "users_email_key"
}, {
  update: {
    bio: Mysql.Query.excluded(mysqlUsers.bio)
  }
})(Mysql.Query.insert(mysqlUsers, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
}))

Mysql.Query.insert(mysqlUsers, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
}).pipe(Mysql.Query.onConflict(["email"] as const, {
  update: {
    bio: Mysql.Query.excluded(mysqlUsers.bio)
  },
  // @ts-expect-error mysql conflict actions do not support where(...)
  where: Mysql.Query.isNotNull(Mysql.Query.excluded(mysqlUsers.bio))
}))

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

const pgUsers = Postgres.Table.make("users", {
  id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
  email: Postgres.Column.text()
})

const pgPosts = Postgres.Table.make("posts", {
  id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
  userId: Postgres.Column.uuid(),
  title: Postgres.Column.text().pipe(Postgres.Column.nullable)
})

const mysqlMutationUsers = Mysql.Table.make("users", {
  id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
  email: Mysql.Column.text()
})

const mysqlMutationPosts = Mysql.Table.make("posts", {
  id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
  userId: Mysql.Column.uuid(),
  title: Mysql.Column.text().pipe(Mysql.Column.nullable)
})

const postgresJoinedUpdate = Postgres.Query.innerJoin(pgPosts, Postgres.Query.eq(pgPosts.userId, pgUsers.id))(
  Postgres.Query.update(pgUsers, {
    email: "joined@example.com"
  })
)

const postgresJoinedDelete = Postgres.Query.innerJoin(pgPosts, Postgres.Query.eq(pgPosts.userId, pgUsers.id))(
  Postgres.Query.delete(pgUsers)
)

const mysqlJoinedUpdate = Mysql.Query.limit(5)(
  Mysql.Query.orderBy(mysqlMutationPosts.id)(
    Mysql.Query.lock("ignore")(
      Mysql.Query.innerJoin(mysqlMutationPosts, Mysql.Query.eq(mysqlMutationPosts.userId, mysqlMutationUsers.id))(
        Mysql.Query.update(mysqlMutationUsers, {
          email: "joined@example.com"
        })
      )
    )
  )
)

const mysqlMultiUpdate = Mysql.Query.update([mysqlMutationUsers, mysqlMutationPosts], {
  users: {
    email: "multi@example.com"
  },
  posts: {
    title: "published"
  }
})

const mysqlJoinedDelete = Mysql.Query.limit(2)(
  Mysql.Query.orderBy(mysqlMutationPosts.id, "desc")(
    Mysql.Query.lock("quick")(
      Mysql.Query.innerJoin(mysqlMutationPosts, Mysql.Query.eq(mysqlMutationPosts.userId, mysqlMutationUsers.id))(
        Mysql.Query.delete(mysqlMutationUsers)
      )
    )
  )
)

const mysqlMultiDelete = Mysql.Query.delete([mysqlMutationUsers, mysqlMutationPosts])

type PostgresJoinedUpdateStatement = Q.StatementOfPlan<typeof postgresJoinedUpdate>
type PostgresJoinedDeleteStatement = Q.StatementOfPlan<typeof postgresJoinedDelete>
type MysqlJoinedUpdateStatement = Q.StatementOfPlan<typeof mysqlJoinedUpdate>
type MysqlMultiUpdateAvailable = AvailableOfPlan<typeof mysqlMultiUpdate>
type MysqlJoinedDeleteStatement = Q.StatementOfPlan<typeof mysqlJoinedDelete>
type MysqlMultiDeleteAvailable = AvailableOfPlan<typeof mysqlMultiDelete>

const postgresJoinedUpdateStatement: PostgresJoinedUpdateStatement = "update"
const postgresJoinedDeleteStatement: PostgresJoinedDeleteStatement = "delete"
const mysqlJoinedUpdateStatement: MysqlJoinedUpdateStatement = "update"
const mysqlJoinedDeleteStatement: MysqlJoinedDeleteStatement = "delete"
const mysqlMultiUpdateUsers = null as never as MysqlMultiUpdateAvailable["users"]
const mysqlMultiUpdatePosts = null as never as MysqlMultiUpdateAvailable["posts"]
const mysqlMultiDeleteUsers = null as never as MysqlMultiDeleteAvailable["users"]
const mysqlMultiDeletePosts = null as never as MysqlMultiDeleteAvailable["posts"]
void postgresJoinedUpdateStatement
void postgresJoinedDeleteStatement
void mysqlJoinedUpdateStatement
void mysqlJoinedDeleteStatement
void mysqlMultiUpdateUsers
void mysqlMultiUpdatePosts
void mysqlMultiDeleteUsers
void mysqlMultiDeletePosts

// @ts-expect-error postgres update does not support tuple mutation targets
Postgres.Query.update([pgUsers, pgPosts], {
  users: {
    email: "bad@example.com"
  }
})

// @ts-expect-error postgres delete does not support tuple mutation targets
Postgres.Query.delete([pgUsers, pgPosts])

// @ts-expect-error postgres update does not support orderBy
Postgres.Query.orderBy(pgUsers.id)(Postgres.Query.update(pgUsers, {
  email: "bad@example.com"
}))

// @ts-expect-error postgres delete does not support limit
Postgres.Query.limit(1)(Postgres.Query.delete(pgUsers))

// @ts-expect-error mysql update lock does not accept quick
Mysql.Query.lock("quick")(Mysql.Query.update(mysqlMutationUsers, {
  email: "bad@example.com"
}))

// @ts-expect-error mysql multi-target update payload keys must match target source names
const invalidMysqlMultiUpdatePayload: Q.UpdateInputOfTarget<[typeof mysqlMutationUsers, typeof mysqlMutationPosts]> = {
  comments: {
    body: "bad"
  }
}
void invalidMysqlMultiUpdatePayload

// @ts-expect-error mysql delete lock does not accept share
Mysql.Query.lock("share")(Mysql.Query.delete(mysqlMutationUsers))

const transactionEffect = Executor.withTransaction(Effect.succeed(insertRow))
const savepointEffect = Executor.withSavepoint(Effect.succeed(insertRow))
type TransactionEffect = typeof transactionEffect
const transactionEffectCheck: Effect.Effect<InsertRow, SqlError.SqlError, SqlClient.SqlClient> = transactionEffect
const transactionEffectValue: TransactionEffect = transactionEffect
const savepointEffectCheck: Effect.Effect<InsertRow, SqlError.SqlError, SqlClient.SqlClient> = savepointEffect
const savepointEffectValue: typeof savepointEffect = savepointEffect
void transactionEffectCheck
void transactionEffectValue
void savepointEffectCheck
void savepointEffectValue

const renderer = Renderer.make("postgres")
const executor = Executor.custom(<PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
  plan: Q.DialectCompatiblePlan<PlanValue, "postgres">
): Effect.Effect<any, never, never> => {
  void plan
  return null as never
})
void renderer
void executor
