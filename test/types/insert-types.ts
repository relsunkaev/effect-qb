import * as Mysql from "../../src/mysql.ts"
import { Column as C, Query as Q, Table } from "../../src/postgres.ts"

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

const valuesSource = Q.as(Q.values([
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
]), "seed")

const insertValuesPlan = Q.insert(users).pipe(Q.from(valuesSource))

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

const defaultValuesPlan = Q.defaultValues(auditLogs)

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

void insertValuesPlan
type InsertValuesCapabilities = Q.CapabilitiesOfPlan<typeof insertValuesPlan>
const insertValuesCapability: InsertValuesCapabilities = "write"
void insertValuesCapability
void insertUnnestPlan
void insertSelectPlan
void defaultValuesPlan
void insertConflictPlan

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
