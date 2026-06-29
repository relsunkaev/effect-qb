import * as StdRoot from "#standard"
import * as Std from "effect-qb"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlClient from "@effect/sql/SqlClient"
import * as SqlError from "@effect/sql/SqlError"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import type { AvailableOfPlan } from "#internal/query.ts"
import { Cast, Query as Q } from "#standard"
import { Executor, Renderer, Type } from "#postgres"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text().pipe(Std.Column.unique),
  bio: Std.Column.text().pipe(Std.Column.nullable)
})
const auditLogs = Std.Table.make("audit_logs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey, Std.Column.default(Q.literal("audit-log-id"))),
  note: Std.Column.text().pipe(Std.Column.nullable)
})
const mysqlUsers = Std.Table.make("users", {
  id: Mysql.Column.custom(Schema.UUID, Mysql.Datatypes.mysqlDatatypes.uuid()).pipe(Std.Column.primaryKey),
  email: Mysql.Column.custom(Schema.String, Mysql.Datatypes.mysqlDatatypes.text()).pipe(Std.Column.unique),
  bio: Mysql.Column.custom(Schema.String, Mysql.Datatypes.mysqlDatatypes.text()).pipe(Std.Column.nullable)
})

const insertPlan = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
})
const badInsertUnknownColumn = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: null,
  // @ts-expect-error insert values only accept known table columns
  missing: "nope"
})
void badInsertUnknownColumn
const seedRows = [
  {
    id: Cast.to(Q.literal("user-id"), Q.type.uuid()),
    email: "alice@example.com",
    bio: null
  },
  {
    id: Cast.to(Q.literal("user-id-2"), Q.type.uuid()),
    email: "bob@example.com",
    bio: "writer"
  }
] as any
const valuesSource = Q.values(seedRows).pipe(Q.as("seed"))
const insertUnnestPlan = Q.insert(users).pipe(Q.from(Q.unnest({
  id: ["user-id", "user-id-2"],
  email: ["alice@example.com", "bob@example.com"],
  bio: [null, "writer"]
} as any, "seed") as any))
const insertSelectPlan = Q.insert(users).pipe(Q.from(Q.select({
  id: users.id,
  email: users.email,
  bio: users.bio
}).pipe(
  Q.from(users)
)))

const mysqlInsertSelectSource = StdRoot.Query.select({
  id: mysqlUsers.id,
  email: mysqlUsers.email,
  bio: mysqlUsers.bio
}).pipe(
  StdRoot.Query.from(mysqlUsers)
)
const badInsertMysqlSelectSource = Q.insert(users).pipe(Q.from(mysqlInsertSelectSource))
const badInsertMysqlSelectSourceRendered = Renderer.make().render(
  // @ts-expect-error postgres insert sources cannot use mysql query plans
  badInsertMysqlSelectSource
)
void badInsertMysqlSelectSourceRendered

const defaultInsertPlan = Q.insert(auditLogs)
const insertConflictPlan = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}).pipe(Postgres.Query.onConflict({
  columns: ["email"] as const,
  where: Q.isNotNull(users.bio)
}, {
  update: {
    bio: Q.excluded(users.bio)
  },
  where: Q.isNotNull(Q.excluded(users.bio))
}))

const badInsertMysqlValue = Q.insert(auditLogs, {
  note: StdRoot.Query.literal("wrong-dialect")
})
void badInsertMysqlValue

const badUpdateMysqlValue = Q.update(users, {
  email: StdRoot.Query.literal("wrong-dialect")
})
void badUpdateMysqlValue

const badUpdateUnknownColumn = Q.update(users, {
  // @ts-expect-error update values only accept known table columns
  missing: "nope"
})
void badUpdateUnknownColumn

const badUpdateMysqlWhere = Q.update(users, {
  email: "updated@example.com"
}).pipe(
  Q.where(StdRoot.Query.literal(true))
)
const badUpdateMysqlWhereRendered = Renderer.make().render(
  badUpdateMysqlWhere
)
void badUpdateMysqlWhereRendered

const badUpsertMysqlInsertValue = Q.upsert(
  users,
  {
    id: "user-id",
    email: StdRoot.Query.literal("alice@example.com")
  },
  ["id"] as const,
  {
    email: "alice@example.com"
  }
)
void badUpsertMysqlInsertValue

const badUpsertMysqlUpdateValue = Q.upsert(
  users,
  {
    id: "user-id",
    email: "alice@example.com"
  },
  ["id"] as const,
  {
    email: StdRoot.Query.literal("alice@example.com")
  }
)
void badUpsertMysqlUpdateValue

const updatePlan = Q.update(users, {
  email: "updated@example.com",
  bio: null
})
const updateSeedRows = [
  {
    id: Cast.to(Q.literal("user-id"), Q.type.uuid()),
    email: Q.literal("updated@example.com")
  },
  {
    id: Cast.to(Q.literal("user-id-2"), Q.type.uuid()),
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

const badReturningMysqlSelection = Q.returning({
  bad: StdRoot.Query.literal("wrong-dialect")
})(insertPlan)
const badReturningMysqlSelectionRendered = Renderer.make().render(
  badReturningMysqlSelection
)
void badReturningMysqlSelectionRendered

const badReturningUnavailableSource = Q.returning({
  note: auditLogs.note
})(insertPlan)
const badReturningUnavailableSourceRendered = Renderer.make().render(
  // @ts-expect-error returning selections must be backed by available mutation sources
  badReturningUnavailableSource
)
void badReturningUnavailableSourceRendered

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
StdRoot.Query.onConflict({
  constraint: "users_email_key"
}, {
  update: {
    bio: StdRoot.Query.excluded(mysqlUsers.bio)
  }
})(StdRoot.Query.insert(mysqlUsers, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
}))

StdRoot.Query.insert(mysqlUsers, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
}).pipe(StdRoot.Query.onConflict(["email"] as const, {
  update: {
    bio: StdRoot.Query.excluded(mysqlUsers.bio)
  },
  // @ts-expect-error mysql conflict actions do not support where(...)
  where: StdRoot.Query.isNotNull(StdRoot.Query.excluded(mysqlUsers.bio))
}))

const postgresMutation = StdRoot.Query.returning({
  id: users.id
})(StdRoot.Query.delete(users))

StdRoot.Query.returning({
  id: mysqlUsers.id
})(StdRoot.Query.delete(mysqlUsers))

type PostgresMutationRow = StdRoot.Query.ResultRow<typeof postgresMutation>

const postgresMutationRow: PostgresMutationRow = { id: "user-id" }
void postgresMutationRow

const pgUsers = Std.Table.make("users", {
  id: Postgres.Column.custom(Schema.UUID, Postgres.Type.custom("uuid")).pipe(Std.Column.primaryKey),
  email: Postgres.Column.custom(Schema.String, Postgres.Type.custom("text"))
})

const pgPosts = Std.Table.make("posts", {
  id: Postgres.Column.custom(Schema.UUID, Postgres.Type.custom("uuid")).pipe(Std.Column.primaryKey),
  userId: Postgres.Column.custom(Schema.UUID, Postgres.Type.custom("uuid")),
  title: Postgres.Column.custom(Schema.String, Postgres.Type.custom("text")).pipe(Std.Column.nullable)
})

const mysqlMutationUsers = Std.Table.make("users", {
  id: Mysql.Column.custom(Schema.UUID, Mysql.Datatypes.mysqlDatatypes.uuid()).pipe(Std.Column.primaryKey),
  email: Mysql.Column.custom(Schema.String, Mysql.Datatypes.mysqlDatatypes.text())
})

const mysqlMutationPosts = Std.Table.make("posts", {
  id: Mysql.Column.custom(Schema.UUID, Mysql.Datatypes.mysqlDatatypes.uuid()).pipe(Std.Column.primaryKey),
  userId: Mysql.Column.custom(Schema.UUID, Mysql.Datatypes.mysqlDatatypes.uuid()),
  title: Mysql.Column.custom(Schema.String, Mysql.Datatypes.mysqlDatatypes.text()).pipe(Std.Column.nullable)
})

const postgresJoinedUpdate = StdRoot.Query.innerJoin(pgPosts, StdRoot.Query.eq(pgPosts.userId, pgUsers.id))(
  StdRoot.Query.update(pgUsers, {
    email: "joined@example.com"
  })
)

const postgresJoinedDelete = StdRoot.Query.innerJoin(pgPosts, StdRoot.Query.eq(pgPosts.userId, pgUsers.id))(
  StdRoot.Query.delete(pgUsers)
)

const mysqlJoinedUpdate = Mysql.Query.limit(5)(
  Mysql.Query.orderBy(mysqlMutationPosts.id)(
    Mysql.Query.ignore(
      StdRoot.Query.innerJoin(mysqlMutationPosts, StdRoot.Query.eq(mysqlMutationPosts.userId, mysqlMutationUsers.id))(
        StdRoot.Query.update(mysqlMutationUsers, {
          email: "joined@example.com"
        })
      )
    )
  )
)

const badMysqlUpdatePostgresOrderBy = StdRoot.Query.update(mysqlMutationUsers, {
  email: "updated@example.com"
}).pipe(
  Mysql.Query.orderBy(StdRoot.Query.literal(1))
)
const badMysqlUpdatePostgresOrderByRendered = Mysql.Renderer.make().render(
  badMysqlUpdatePostgresOrderBy
)
void badMysqlUpdatePostgresOrderByRendered

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
    Mysql.Query.quick(
      StdRoot.Query.innerJoin(mysqlMutationPosts, StdRoot.Query.eq(mysqlMutationPosts.userId, mysqlMutationUsers.id))(
        StdRoot.Query.delete(mysqlMutationUsers)
      )
    )
  )
)

const mysqlMultiDelete = Mysql.Query.delete([mysqlMutationUsers, mysqlMutationPosts])

// @ts-expect-error mysql multi-target updates require unique source names
const badMysqlDuplicateMultiUpdateTarget = Mysql.Query.update([mysqlMutationUsers, mysqlMutationUsers], {
  users: {
    email: "duplicate@example.com"
  }
})
void badMysqlDuplicateMultiUpdateTarget

// @ts-expect-error mysql multi-target deletes require unique source names
const badMysqlDuplicateMultiDeleteTarget = Mysql.Query.delete([mysqlMutationUsers, mysqlMutationUsers])
void badMysqlDuplicateMultiDeleteTarget

// @ts-expect-error mysql multi-target updates cannot include postgres tables
const badMysqlMultiUpdatePostgresTarget = Mysql.Query.update([mysqlMutationUsers, pgPosts], {
  users: {
    email: "bad@example.com"
  },
  posts: {
    title: "bad"
  }
})
void badMysqlMultiUpdatePostgresTarget

// @ts-expect-error mysql multi-target deletes cannot include postgres tables
const badMysqlMultiDeletePostgresTarget = Mysql.Query.delete([mysqlMutationUsers, pgPosts])
void badMysqlMultiDeletePostgresTarget

const badMysqlMultiUpdatePostgresValue = Mysql.Query.update([mysqlMutationUsers, mysqlMutationPosts], {
  users: {
    email: StdRoot.Query.literal("bad@example.com")
  }
})
void badMysqlMultiUpdatePostgresValue

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
StdRoot.Query.update([pgUsers, pgPosts], {
  users: {
    email: "bad@example.com"
  }
})

// @ts-expect-error postgres delete does not support tuple mutation targets
StdRoot.Query.delete([pgUsers, pgPosts])

// @ts-expect-error postgres update does not support orderBy
StdRoot.Query.orderBy(pgUsers.id)(StdRoot.Query.update(pgUsers, {
  email: "bad@example.com"
}))

// @ts-expect-error postgres delete does not support limit
StdRoot.Query.limit(1)(StdRoot.Query.delete(pgUsers))

// @ts-expect-error mysql update lock does not accept quick
StdRoot.Query.lock("quick")(StdRoot.Query.update(mysqlMutationUsers, {
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
StdRoot.Query.lock("share")(StdRoot.Query.delete(mysqlMutationUsers))

const transactionEffect = Executor.withTransaction(Effect.succeed(insertRow))
const nestedTransactionEffect = Executor.withTransaction(Executor.withTransaction(Effect.succeed(insertRow)))
type TransactionEffect = typeof transactionEffect
const transactionEffectCheck: Effect.Effect<InsertRow, SqlError.SqlError, SqlClient.SqlClient> = transactionEffect
const transactionEffectValue: TransactionEffect = transactionEffect
const nestedTransactionEffectCheck: Effect.Effect<InsertRow, SqlError.SqlError, SqlClient.SqlClient> = nestedTransactionEffect
const nestedTransactionEffectValue: typeof nestedTransactionEffect = nestedTransactionEffect
void transactionEffectCheck
void transactionEffectValue
void nestedTransactionEffectCheck
void nestedTransactionEffectValue

const renderer = Renderer.make()
const executor = Executor.custom(<PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
  plan: Q.DialectCompatiblePlan<PlanValue, "postgres">
): Effect.Effect<any, never, never> => {
  void plan
  return null as never
})
void renderer
void executor
