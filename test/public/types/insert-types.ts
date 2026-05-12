import * as Mysql from "effect-qb/mysql"
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

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

const seedRows = [
  {
    id: Q.literal("user-id"),
    email: "alice@example.com",
    bio: null
  },
  {
    id: Q.literal("user-id-2"),
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

const incompleteInsertSelectSource = Q.select({
  id: users.id,
  email: users.email,
  bio: users.bio
})

// @ts-expect-error insert-select sources must be source-complete
const incompleteInsertSelectPlan = Q.insert(users).pipe(Q.from(incompleteInsertSelectSource))

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

const insertStringConflictPlan = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}).pipe(Q.onConflict("email", {
  update: {
    bio: Q.excluded(users.bio)
  }
}))

Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}).pipe(
  Q.onConflict(["email"] as const, {
    // @ts-expect-error conflict action predicates require update assignments
    where: Q.isNotNull(users.bio)
  })
)

Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}).pipe(
  // @ts-expect-error conflict update actions require at least one assignment
  Q.onConflict(["email"] as const, {
    update: {}
  })
)

const invalidConflictTargetPredicatePlan = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}).pipe(Q.onConflict({
  columns: ["email"] as const,
  where: Q.isNotNull(auditLogs.note)
}, {
  update: {
    bio: Q.excluded(users.bio)
  }
}))

// @ts-expect-error conflict target predicates must be backed by available sources before rendering
const invalidConflictTargetPredicateComplete: Q.CompletePlan<typeof invalidConflictTargetPredicatePlan> = invalidConflictTargetPredicatePlan
void invalidConflictTargetPredicateComplete

void valuesSource
void insertUnnestPlan
void insertSelectPlan
void incompleteInsertSelectPlan
void defaultInsertPlan
void insertConflictPlan
void insertStringConflictPlan

// @ts-expect-error excluded(...) only accepts bound table columns
const invalidExcludedExpression = Q.excluded(F.lower(users.bio))
void invalidExcludedExpression

const invalidDefaultInsertPlan = Q.insert(users)

// @ts-expect-error default-only inserts require every insert column to be optional/generated
const invalidDefaultInsert: Q.CompletePlan<typeof invalidDefaultInsertPlan> = invalidDefaultInsertPlan

// @ts-expect-error returning selections require at least one selected expression
Q.returning({})(Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}))

void invalidDefaultInsertPlan
const positionalInsertSource = Q.select({
  userId: users.id,
  userEmail: users.email,
  userBio: users.bio
}).pipe(
  Q.from(users)
)

// @ts-expect-error INSERT ... SELECT currently requires target column names to match the selection keys
const positionalInsertPlan = Q.insert(users).pipe(Q.from(positionalInsertSource))

void positionalInsertPlan

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

Mysql.Query.insert(mysqlUsers, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
}).pipe(Mysql.Query.onConflict("email", {
  update: {
    bio: Mysql.Query.excluded(mysqlUsers.bio)
  }
}))

Mysql.Query.insert(mysqlUsers, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
}).pipe(
  // @ts-expect-error mysql conflict update actions require at least one assignment
  Mysql.Query.onConflict(["email"] as const, {
    update: {}
  })
)

// @ts-expect-error mysql excluded(...) only accepts bound table columns
const invalidMysqlExcludedExpression = Mysql.Query.excluded(Mysql.Function.lower(mysqlUsers.bio))
void invalidMysqlExcludedExpression
