import * as Effect from "effect/Effect"
import * as SqlClient from "@effect/sql/SqlClient"
import * as SqlError from "@effect/sql/SqlError"

import * as Mysql from "../../src/mysql.ts"
import * as Postgres from "../../src/postgres.ts"
import type { AvailableOfPlan } from "../../src/query.ts"
import { Column as C, Executor, Query as Q, Renderer, Table } from "../../src/index.ts"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})
const auditLogs = Table.make("audit_logs", {
  id: C.uuid().pipe(C.primaryKey, C.hasDefault),
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
const valuesSource = Q.values([
  {
    id: Q.cast(Q.literal("user-id"), Q.type.uuid()),
    email: "alice@example.com",
    bio: null
  },
  {
    id: Q.cast(Q.literal("user-id-2"), Q.type.uuid()),
    email: "bob@example.com",
    bio: "writer"
  }
], "seed")
const insertValuesPlan = Q.insertFrom(users, valuesSource)
const insertUnnestPlan = Q.insertFrom(users, Q.insertUnnest({
  id: ["user-id", "user-id-2"],
  email: ["alice@example.com", "bob@example.com"],
  bio: [null, "writer"]
}))
const insertSelectPlan = Q.insertFrom(users, Q.select({
  id: users.id,
  email: users.email,
  bio: users.bio
}).pipe(
  Q.from(users)
))
const defaultValuesPlan = Q.defaultValues(auditLogs)
const insertConflictPlan = Q.onConflict({
  columns: ["email"] as const,
  where: Q.isNotNull(users.bio)
}, {
  update: {
    bio: Q.excluded(users.bio)
  },
  where: Q.isNotNull(Q.excluded(users.bio))
})(Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}))

const updatePlan = Q.update(users, {
  email: "updated@example.com",
  bio: null
})
const updateValuesSource = Q.values([
  {
    id: Q.cast(Q.literal("user-id"), Q.type.uuid()),
    email: Q.literal("updated@example.com")
  },
  {
    id: Q.cast(Q.literal("user-id-2"), Q.type.uuid()),
    email: Q.literal("bob@example.com")
  }
], "incoming_users")

const updateValuesId = Q.cast(updateValuesSource.id, Q.type.uuid())

const updateFromValuesPlan = Q.innerJoin(updateValuesSource, Q.eq(users.id, updateValuesId))(
  Q.update(users, {
    email: updateValuesSource.email
  })
)

const deletePlan = Q.delete(users)

type InsertStatement = Q.StatementOfPlan<typeof insertPlan>
type InsertValuesStatement = Q.StatementOfPlan<typeof insertValuesPlan>
type UpdateStatement = Q.StatementOfPlan<typeof updatePlan>
type UpdateFromValuesStatement = Q.StatementOfPlan<typeof updateFromValuesPlan>
type DeleteStatement = Q.StatementOfPlan<typeof deletePlan>

const insertStatement: InsertStatement = "insert"
const insertValuesStatement: InsertValuesStatement = "insert"
const updateStatement: UpdateStatement = "update"
const updateFromValuesStatement: UpdateFromValuesStatement = "update"
const deleteStatement: DeleteStatement = "delete"
void insertStatement
void insertValuesStatement
void updateStatement
void updateFromValuesStatement
void deleteStatement

type InsertCapabilities = Q.CapabilitiesOfPlan<typeof insertPlan>
type InsertValuesCapabilities = Q.CapabilitiesOfPlan<typeof insertValuesPlan>
type UpdateCapabilities = Q.CapabilitiesOfPlan<typeof updatePlan>
type UpdateFromValuesCapabilities = Q.CapabilitiesOfPlan<typeof updateFromValuesPlan>
type DeleteCapabilities = Q.CapabilitiesOfPlan<typeof deletePlan>

const insertCapability: InsertCapabilities = "write"
const insertValuesCapability: InsertValuesCapabilities = "write"
const updateCapability: UpdateCapabilities = "write"
const updateFromValuesCapability: UpdateFromValuesCapabilities = "write"
const deleteCapability: DeleteCapabilities = "write"
void insertCapability
void insertValuesCapability
void updateCapability
void updateFromValuesCapability
void deleteCapability
void insertValuesPlan
void insertUnnestPlan
void insertSelectPlan
void defaultValuesPlan
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

// @ts-expect-error defaultValues requires all insert columns to be optional/generated
Q.defaultValues(users)

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

Mysql.Query.onConflict(["email"] as const, {
  update: {
    bio: Mysql.Query.excluded(mysqlUsers.bio)
  },
  // @ts-expect-error mysql conflict actions do not support where(...)
  where: Mysql.Query.isNotNull(Mysql.Query.excluded(mysqlUsers.bio))
})(Mysql.Query.insert(mysqlUsers, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
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
const executor = Executor.make("postgres", <PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
  plan: Q.DialectCompatiblePlan<PlanValue, "postgres">
): Effect.Effect<any, never, never> => {
  void plan
  return null as never
})
void renderer
void executor
