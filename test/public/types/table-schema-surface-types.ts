import * as Std from "effect-qb"
import * as Schema from "effect/Schema"

import * as Mysql from "effect-qb/mysql"
import * as Postgres from "effect-qb/postgres"
import * as Sqlite from "effect-qb/sqlite"

type Assert<T extends true> = T
type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2)
      ? true
      : false
    : false

const postgresUsers = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey, Std.Column.generated(Postgres.Query.literal("generated-user-id"))),
  email: Std.Column.text(),
  bio: Std.Column.text().pipe(Std.Column.nullable)
})
// @ts-expect-error table names must be non-empty
Std.Table.make("", {
  id: Std.Column.uuid()
})
// @ts-expect-error table field names must be non-empty
Std.Table.make("empty_field", {
  "": Std.Column.uuid()
})
// @ts-expect-error class table field names must be non-empty
Std.Table.Class<unknown>("empty_field_class")({ "": Std.Column.uuid() })
const publicSchema = Postgres.Schema.make("public")
// @ts-expect-error schema-scoped table names must be non-empty
publicSchema.table("", {
  id: Std.Column.uuid()
})
// @ts-expect-error schema-scoped table field names must be non-empty
publicSchema.table("empty_field", {
  "": Std.Column.uuid()
})
// @ts-expect-error table aliases must be non-empty
Std.Table.alias(postgresUsers, "")
// @ts-expect-error schema namespace names must be non-empty
Std.Table.schema("")
// @ts-expect-error postgres schema namespace names must be non-empty
Postgres.Schema.make("")
// @ts-expect-error postgres enum names must be non-empty
publicSchema.enum("", ["pending"])
// @ts-expect-error postgres sequence names must be non-empty
publicSchema.sequence("")
// @ts-expect-error standalone postgres enum names must be non-empty
Postgres.enum("", ["pending"])
// @ts-expect-error standalone postgres sequence names must be non-empty
Postgres.sequence("")
const postgresSelectSchema = Std.Table.selectSchema(postgresUsers)
const postgresInsertSchema = Std.Table.insertSchema(postgresUsers)
const postgresUpdateSchema = Std.Table.updateSchema(postgresUsers)

type PostgresSelectFromHelper = Schema.Schema.Type<typeof postgresSelectSchema>
type PostgresSelectFromFacade = Schema.Schema.Type<typeof postgresUsers.schemas.select>
type PostgresInsertFromHelper = Schema.Schema.Type<typeof postgresInsertSchema>
type PostgresUpdateFromHelper = Schema.Schema.Type<typeof postgresUpdateSchema>

type _AssertPostgresSelectHelper = Assert<IsExact<PostgresSelectFromHelper, Std.Table.SelectOf<typeof postgresUsers>>>
type _AssertPostgresSelectFacade = Assert<IsExact<PostgresSelectFromFacade, Std.Table.SelectOf<typeof postgresUsers>>>
type _AssertPostgresInsertHelper = Assert<IsExact<PostgresInsertFromHelper, Std.Table.InsertOf<typeof postgresUsers>>>
type _AssertPostgresUpdateHelper = Assert<IsExact<PostgresUpdateFromHelper, Std.Table.UpdateOf<typeof postgresUsers>>>

const postgresInsert: PostgresInsertFromHelper = {
  email: "alice@example.com"
}
const postgresUpdate: PostgresUpdateFromHelper = {
  bio: null
}
// @ts-expect-error generated primary keys are omitted from helper-derived insert payloads
const badPostgresInsert: PostgresInsertFromHelper = { id: "not-allowed", email: "alice@example.com" }
// @ts-expect-error primary keys are omitted from helper-derived update payloads
const badPostgresUpdate: PostgresUpdateFromHelper = { id: "not-allowed" }

const mysqlUsers = Std.Table.make("mysql_users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text(),
  bio: Std.Column.text().pipe(Std.Column.nullable)
})
const mysqlInsertSchema = Std.Table.insertSchema(mysqlUsers)
const mysqlUpdateSchema = Std.Table.updateSchema(mysqlUsers)

type MysqlInsertFromHelper = Schema.Schema.Type<typeof mysqlInsertSchema>
type MysqlUpdateFromHelper = Schema.Schema.Type<typeof mysqlUpdateSchema>

type _AssertMysqlInsertHelper = Assert<IsExact<MysqlInsertFromHelper, Std.Table.InsertOf<typeof mysqlUsers>>>
type _AssertMysqlUpdateHelper = Assert<IsExact<MysqlUpdateFromHelper, Std.Table.UpdateOf<typeof mysqlUsers>>>

const mysqlInsert: MysqlInsertFromHelper = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "mysql@example.com"
}
const mysqlUpdate: MysqlUpdateFromHelper = {
  bio: null
}
// @ts-expect-error primary keys are omitted from mysql update helper payloads
const badMysqlUpdate: MysqlUpdateFromHelper = { id: "not-allowed" }

const sqliteUsers = Std.Table.make("sqlite_users", {
  id: Std.Column.text().pipe(Std.Column.primaryKey),
  email: Std.Column.text(),
  bio: Std.Column.text().pipe(Std.Column.nullable)
})
const sqliteSelectSchema = Std.Table.selectSchema(sqliteUsers)
const sqliteInsertSchema = Std.Table.insertSchema(sqliteUsers)
const sqliteUpdateSchema = Std.Table.updateSchema(sqliteUsers)

type SqliteSelectFromHelper = Schema.Schema.Type<typeof sqliteSelectSchema>
type SqliteInsertFromHelper = Schema.Schema.Type<typeof sqliteInsertSchema>
type SqliteUpdateFromHelper = Schema.Schema.Type<typeof sqliteUpdateSchema>

type _AssertSqliteSelectHelper = Assert<IsExact<SqliteSelectFromHelper, Std.Table.SelectOf<typeof sqliteUsers>>>
type _AssertSqliteInsertHelper = Assert<IsExact<SqliteInsertFromHelper, Std.Table.InsertOf<typeof sqliteUsers>>>
type _AssertSqliteUpdateHelper = Assert<IsExact<SqliteUpdateFromHelper, Std.Table.UpdateOf<typeof sqliteUsers>>>

const sqliteSelect: SqliteSelectFromHelper = {
  id: "sqlite-user-id",
  email: "sqlite@example.com",
  bio: null
}
const sqliteInsert: SqliteInsertFromHelper = {
  id: "sqlite-user-id",
  email: "sqlite@example.com"
}
const sqliteUpdate: SqliteUpdateFromHelper = {
  bio: null
}
// @ts-expect-error primary keys are omitted from sqlite update helper payloads
const badSqliteUpdate: SqliteUpdateFromHelper = { id: "not-allowed" }

void postgresInsert
void postgresUpdate
void badPostgresInsert
void badPostgresUpdate
void mysqlInsert
void mysqlUpdate
void badMysqlUpdate
void sqliteSelect
void sqliteInsert
void sqliteUpdate
void badSqliteUpdate
