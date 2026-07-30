import * as StdRoot from "effect-qb"
import * as Std from "effect-qb"
import * as Mysql from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import { Function as F, Query as Q } from "effect-qb"

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
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text().pipe(Std.Column.unique),
  bio: Std.Column.text().pipe(Std.Column.nullable)
})

const nonUniqueUsers = Std.Table.make("non_unique_users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text(),
  bio: Std.Column.text().pipe(Std.Column.nullable)
})

const uniqueIndexUsersBase = Std.Table.make("unique_index_users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text(),
  bio: Std.Column.text().pipe(Std.Column.nullable)
})
const uniqueIndexUsers = uniqueIndexUsersBase.pipe(
  Std.Table.index<
    typeof uniqueIndexUsersBase,
    typeof uniqueIndexUsersBase.email
  >((table) => table.email).pipe(Pg.Index.uniqueIndex)
)

const membershipsBase = Std.Table.make("memberships", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  orgId: Std.Column.uuid(),
  role: Std.Column.text(),
  note: Std.Column.text().pipe(Std.Column.nullable)
})
const memberships = membershipsBase.pipe(
  Std.Table.unique<
    typeof membershipsBase,
    readonly [typeof membershipsBase.orgId, typeof membershipsBase.role]
  >((table) => [table.orgId, table.role] as const)
)

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
} as any, "seed") as any))

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

const nestedInsertSelectSource = Q.select({
  user: {
    id: users.id,
    email: users.email,
    bio: users.bio
  }
}).pipe(
  Q.from(users)
)

// @ts-expect-error insert-select sources must use a flat selection object
const nestedInsertSelectPlan = Q.insert(users).pipe(Q.from(nestedInsertSelectSource))

const mutationInsertSelectSource = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
})

// @ts-expect-error insert-select sources only accept select-like query plans
const mutationInsertSelectPlan = Q.insert(users).pipe(Q.from(mutationInsertSelectSource))

const defaultInsertPlan = Q.insert(auditLogs)

const insertConflictPlan = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}).pipe(Pg.Query.onConflict({
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

Q.insert(nonUniqueUsers, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}).pipe(
  // @ts-expect-error postgres conflict targets must match a primary key, unique constraint, or unique index
  Q.onConflict("email", {
    update: {
      bio: Q.excluded(nonUniqueUsers.bio)
    }
  })
)

Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}).pipe(
  // @ts-expect-error postgres conflict constraint names must be non-empty
  Pg.Query.onConflict({ constraint: "" }, {
    update: {
      bio: Q.excluded(users.bio)
    }
  })
)

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

Q.upsert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
},
// @ts-expect-error upsert conflict targets only accept known table columns
["missing"] as const, {
  bio: "writer"
})

Q.upsert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}, ["email"] as const,
  // @ts-expect-error upsert update values require at least one assignment
  {})

Q.upsert(nonUniqueUsers, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
},
// @ts-expect-error upsert conflict targets must match a primary key, unique constraint, or unique index
["email"] as const, {
  bio: "writer"
})

Q.upsert(uniqueIndexUsers, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}, "email", {
  bio: "writer"
})

Q.insert(memberships, {
  id: "membership-id",
  orgId: "org-id",
  role: "admin",
  note: null
}).pipe(Q.onConflict(["role", "orgId"] as const, {
  update: {
    note: "updated"
  }
}))

Q.upsert(memberships, {
  id: "membership-id",
  orgId: "org-id",
  role: "admin",
  note: null
},
// @ts-expect-error composite conflict targets must match the full unique column set
["orgId"] as const, {
  note: "updated"
})

const invalidConflictTargetPredicatePlan = Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}).pipe(Pg.Query.onConflict({
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
void nestedInsertSelectPlan
void mutationInsertSelectPlan
void defaultInsertPlan
void insertConflictPlan
void insertStringConflictPlan

// @ts-expect-error excluded(...) only accepts bound table columns
const invalidExcludedExpression = Q.excluded(Pg.Function.lower(users.bio))
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

// @ts-expect-error returning selections require a projection object
Q.returning(users.id)(Q.insert(users, {
  id: "user-id",
  email: "alice@example.com",
  bio: "writer"
}))

// @ts-expect-error returning nested selections must project at least one expression
Q.returning({ nested: {} })(Q.insert(users, {
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

// @ts-expect-error standard conflict targets do not support named constraints
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

StdRoot.Query.insert(mysqlUsers, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
}).pipe(StdRoot.Query.onConflict("email", {
  update: {
    bio: StdRoot.Query.excluded(mysqlUsers.bio)
  }
}))

StdRoot.Query.insert(mysqlUsers, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
}).pipe(
  // @ts-expect-error mysql conflict update actions require at least one assignment
  StdRoot.Query.onConflict(["email"] as const, {
    update: {}
  })
)

// @ts-expect-error mysql excluded(...) only accepts bound table columns
const invalidMysqlExcludedExpression = StdRoot.Query.excluded(Mysql.Function.lower(mysqlUsers.bio))
void invalidMysqlExcludedExpression
