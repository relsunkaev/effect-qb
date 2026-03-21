import * as Mysql from "effect-qb/mysql"
import * as Postgres from "effect-qb/postgres"
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const incomingUsers = Table.make("incoming_users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const truncatePlan = Q.truncate(users, {
  restartIdentity: true,
  cascade: true
})

const mergePlan = Q.merge(users, incomingUsers, Q.eq(users.id, incomingUsers.id), {
  whenMatched: {
    update: {
      email: incomingUsers.email,
      bio: incomingUsers.bio
    }
  },
  whenNotMatched: {
    values: {
      id: incomingUsers.id,
      email: incomingUsers.email,
      bio: incomingUsers.bio
    }
  }
})

const transactionPlan = Q.transaction({
  isolationLevel: "serializable",
  readOnly: true
})

const commitPlan = Q.commit()
const rollbackPlan = Q.rollback()
const savepointPlan = Q.savepoint("before_merge")
const rollbackToPlan = Q.rollbackTo("before_merge")
const releaseSavepointPlan = Q.releaseSavepoint("before_merge")

type TruncateStatement = Q.StatementOfPlan<typeof truncatePlan>
type MergeStatement = Q.StatementOfPlan<typeof mergePlan>
type TransactionStatement = Q.StatementOfPlan<typeof transactionPlan>
type CommitStatement = Q.StatementOfPlan<typeof commitPlan>
type RollbackStatement = Q.StatementOfPlan<typeof rollbackPlan>
type SavepointStatement = Q.StatementOfPlan<typeof savepointPlan>
type RollbackToStatement = Q.StatementOfPlan<typeof rollbackToPlan>
type ReleaseSavepointStatement = Q.StatementOfPlan<typeof releaseSavepointPlan>

const truncateStatement: TruncateStatement = "truncate"
const mergeStatement: MergeStatement = "merge"
const transactionStatement: TransactionStatement = "transaction"
const commitStatement: CommitStatement = "commit"
const rollbackStatement: RollbackStatement = "rollback"
const savepointStatement: SavepointStatement = "savepoint"
const rollbackToStatement: RollbackToStatement = "rollbackTo"
const releaseSavepointStatement: ReleaseSavepointStatement = "releaseSavepoint"
void truncateStatement
void mergeStatement
void transactionStatement
void commitStatement
void rollbackStatement
void savepointStatement
void rollbackToStatement
void releaseSavepointStatement

type TruncateCapability = Q.CapabilitiesOfPlan<typeof truncatePlan>
type MergeCapability = Q.CapabilitiesOfPlan<typeof mergePlan>
type TransactionCapability = Q.CapabilitiesOfPlan<typeof transactionPlan>

const truncateCapability: TruncateCapability = "write"
const mergeCapability: MergeCapability = "write"
const transactionCapability: TransactionCapability = "transaction"
void truncateCapability
void mergeCapability
void transactionCapability

type PostgresTransactionError = Postgres.Executor.PostgresQueryError<typeof transactionPlan>
type MysqlTransactionError = Mysql.Executor.MysqlQueryError<typeof transactionPlan>

const postgresTransactionError: PostgresTransactionError = null as never as Postgres.Executor.PostgresExecutorError
const mysqlTransactionError: MysqlTransactionError = null as never as Mysql.Executor.MysqlExecutorError
void postgresTransactionError
void mysqlTransactionError

// @ts-expect-error truncate plans cannot be filtered
Q.where(Q.eq(users.id, "user-id"))(truncatePlan)

// @ts-expect-error merge plans cannot return rows through returning(...)
Q.returning({ id: users.id })(mergePlan)

// @ts-expect-error transaction statements cannot be used as a source
Q.from(users)(transactionPlan)
