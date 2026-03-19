import * as Mysql from "../../src/mysql.ts"
import { Column as C, Query as Q, Table } from "../../src/index.ts"

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

const insertManyPlan = Q.insertMany(users, [
  {
    id: "user-id",
    email: "alice@example.com",
    bio: null
  },
  {
    id: "user-id-2",
    email: "bob@example.com",
    bio: "writer"
  }
])

const insertValuesPlan = Q.insertFrom(users, Q.insertValues([
  {
    id: "user-id",
    email: "alice@example.com",
    bio: null
  },
  {
    id: "user-id-2",
    email: "bob@example.com",
    bio: "writer"
  }
]))

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

type InsertManyStatement = Q.StatementOfPlan<typeof insertManyPlan>
type InsertManyCapabilities = Q.CapabilitiesOfPlan<typeof insertManyPlan>
const insertManyStatement: InsertManyStatement = "insert"
const insertManyCapability: InsertManyCapabilities = "write"
void insertManyStatement
void insertManyCapability
void insertValuesPlan
void insertUnnestPlan
void insertSelectPlan
void defaultValuesPlan
void insertConflictPlan

// @ts-expect-error defaultValues requires all insert columns to be optional/generated
Q.defaultValues(users)

// @ts-expect-error insertFrom requires a flat selection object
Q.insertFrom(users, Q.select({
  user: {
    id: users.id
  }
}).pipe(
  Q.from(users)
))

// @ts-expect-error insertFrom requires every required insert column
Q.insertFrom(users, Q.select({
  email: users.email
}).pipe(
  Q.from(users)
))

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

// @ts-expect-error mysql conflict actions do not support where(...)
Mysql.Query.onConflict(["email"] as const, {
  update: {
    bio: Mysql.Query.excluded(mysqlUsers.bio)
  },
  where: Mysql.Query.isNotNull(Mysql.Query.excluded(mysqlUsers.bio))
})(Mysql.Query.insert(mysqlUsers, {
  id: "user-id",
  email: "alice@example.com",
  bio: null
}))
