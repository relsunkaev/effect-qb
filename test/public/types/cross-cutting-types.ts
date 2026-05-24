import * as Std from "effect-qb"
import * as Mysql from "effect-qb/mysql";
import * as Postgres from "effect-qb/postgres";
import { Query as Q } from "effect-qb/postgres"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text(),
  bio: Std.Column.text().pipe(Std.Column.nullable),
});

const incomingUsers = Std.Table.make("incoming_users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text(),
  bio: Std.Column.text().pipe(Std.Column.nullable),
});

const truncatePlan = Q.truncate(users, {
  restartIdentity: true,
  cascade: true,
});

const mergePlan = Q.merge(
  users,
  incomingUsers,
  Q.eq(users.id, incomingUsers.id),
  {
    whenMatched: {
      update: {
        email: incomingUsers.email,
        bio: incomingUsers.bio,
      },
    },
    whenNotMatched: {
      values: {
        id: incomingUsers.id,
        email: incomingUsers.email,
        bio: incomingUsers.bio,
      },
    },
  },
);

const completeMergePlan: Q.CompletePlan<typeof mergePlan> = mergePlan;
void completeMergePlan;

// @ts-expect-error merge source names must differ from the target source name
const duplicateMergeSourceName = Q.merge(users, users, Q.eq(users.id, users.id), {
  whenMatched: {
    delete: true,
  },
});
void duplicateMergeSourceName;

// @ts-expect-error merge requires at least one matched or not-matched action
const missingMergeActions = Q.merge(
  users,
  incomingUsers,
  Q.eq(users.id, incomingUsers.id),
);
void missingMergeActions;

Q.merge(users, incomingUsers, Q.eq(users.id, incomingUsers.id), {
  whenMatched: {
    // @ts-expect-error merge update actions require at least one assignment
    update: {},
  },
});

Q.merge(users, incomingUsers, Q.eq(users.id, incomingUsers.id), {
  whenNotMatched: {
    // @ts-expect-error merge insert actions require at least one value
    values: {},
  },
});

const badMergeMysqlPredicate = Q.merge(
  users,
  incomingUsers,
  Mysql.Query.literal(true),
  {
    whenMatched: {
      delete: true,
    },
  },
);

const badMergeMysqlPredicateRendered = Postgres.Renderer.make().render(
  // @ts-expect-error postgres merge predicates cannot use mysql expressions
  badMergeMysqlPredicate,
);
void badMergeMysqlPredicateRendered;

const badMergeMatchedPredicate = Q.merge(
  users,
  incomingUsers,
  Q.eq(users.id, incomingUsers.id),
  {
    whenMatched: {
      delete: true,
      predicate: Mysql.Query.literal(true),
    },
  },
);

const badMergeMatchedPredicateRendered = Postgres.Renderer.make().render(
  // @ts-expect-error postgres merge matched predicates cannot use mysql expressions
  badMergeMatchedPredicate,
);
void badMergeMatchedPredicateRendered;

const badMergeMatchedUpdate = Q.merge(users, incomingUsers, Q.eq(users.id, incomingUsers.id), {
  whenMatched: {
    update: {
      email: Mysql.Query.literal("alice@example.com"),
    },
  },
});

const badMergeMatchedUpdateRendered = Postgres.Renderer.make().render(
  // @ts-expect-error postgres merge updates cannot use mysql expressions
  badMergeMatchedUpdate,
);
void badMergeMatchedUpdateRendered;

const badMergeNotMatchedPredicate = Q.merge(
  users,
  incomingUsers,
  Q.eq(users.id, incomingUsers.id),
  {
    whenNotMatched: {
      predicate: Mysql.Query.literal(true),
      values: {
        id: incomingUsers.id,
        email: incomingUsers.email,
      },
    },
  },
);

const badMergeNotMatchedPredicateRendered = Postgres.Renderer.make().render(
  // @ts-expect-error postgres merge not-matched predicates cannot use mysql expressions
  badMergeNotMatchedPredicate,
);
void badMergeNotMatchedPredicateRendered;

const badMergeNotMatchedValues = Q.merge(users, incomingUsers, Q.eq(users.id, incomingUsers.id), {
  whenNotMatched: {
    values: {
      id: incomingUsers.id,
      email: Mysql.Query.literal("alice@example.com"),
    },
  },
});

const badMergeNotMatchedValuesRendered = Postgres.Renderer.make().render(
  // @ts-expect-error postgres merge insert values cannot use mysql expressions
  badMergeNotMatchedValues,
);
void badMergeNotMatchedValuesRendered;

const transactionPlan = Q.transaction({
  isolationLevel: "serializable",
  readOnly: true,
});

const commitPlan = Q.commit();
const rollbackPlan = Q.rollback();
const savepointPlan = Q.savepoint("before_merge");
const rollbackToPlan = Q.rollbackTo("before_merge");
const releaseSavepointPlan = Q.releaseSavepoint("before_merge");

type TruncateStatement = Q.StatementOfPlan<typeof truncatePlan>;
type MergeStatement = Q.StatementOfPlan<typeof mergePlan>;
type TransactionStatement = Q.StatementOfPlan<typeof transactionPlan>;
type CommitStatement = Q.StatementOfPlan<typeof commitPlan>;
type RollbackStatement = Q.StatementOfPlan<typeof rollbackPlan>;
type SavepointStatement = Q.StatementOfPlan<typeof savepointPlan>;
type RollbackToStatement = Q.StatementOfPlan<typeof rollbackToPlan>;
type ReleaseSavepointStatement = Q.StatementOfPlan<typeof releaseSavepointPlan>;

const truncateStatement: TruncateStatement = "truncate";
const mergeStatement: MergeStatement = "merge";
const transactionStatement: TransactionStatement = "transaction";
const commitStatement: CommitStatement = "commit";
const rollbackStatement: RollbackStatement = "rollback";
const savepointStatement: SavepointStatement = "savepoint";
const rollbackToStatement: RollbackToStatement = "rollbackTo";
const releaseSavepointStatement: ReleaseSavepointStatement = "releaseSavepoint";
void truncateStatement;
void mergeStatement;
void transactionStatement;
void commitStatement;
void rollbackStatement;
void savepointStatement;
void rollbackToStatement;
void releaseSavepointStatement;

type TruncateCapability = Q.CapabilitiesOfPlan<typeof truncatePlan>;
type MergeCapability = Q.CapabilitiesOfPlan<typeof mergePlan>;
type TransactionCapability = Q.CapabilitiesOfPlan<typeof transactionPlan>;

const truncateCapability: TruncateCapability = "write";
const mergeCapability: MergeCapability = "write";
const transactionCapability: TransactionCapability = "transaction";
void truncateCapability;
void mergeCapability;
void transactionCapability;

type PostgresTransactionError = Postgres.Executor.PostgresQueryError<
  typeof transactionPlan
>;
type MysqlTransactionError = Mysql.Executor.MysqlQueryError<
  typeof transactionPlan
>;

const postgresTransactionError: PostgresTransactionError =
  null as never as Postgres.Executor.PostgresExecutorError;
const mysqlTransactionError: MysqlTransactionError =
  null as never as Mysql.Executor.MysqlExecutorError;
void postgresTransactionError;
void mysqlTransactionError;

// @ts-expect-error truncate plans cannot be filtered
Q.where(Q.eq(users.id, "user-id"))(truncatePlan);

// @ts-expect-error merge plans cannot return rows through returning(...)
Q.returning({ id: users.id })(mergePlan);

// @ts-expect-error transaction statements cannot be used as a source
Q.from(users)(transactionPlan);
