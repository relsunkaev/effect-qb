import * as Pg from "effect-qb/postgres"
import { Table, Column } from "effect-qb/postgres"
import * as Schema from "effect/Schema"
const clients = Table.make("clients", {
  clientGroupID: Column.text(),
  clientID: Column.text(),
  lastMutationID: Column.int8(),
  userID: Column.text().pipe(Column.nullable)
}, "zero_0").pipe(
  Table.primaryKey({ columns: ["clientGroupID", "clientID"] as const, name: "clients_pkey", deferrable: false, initiallyDeferred: false })
)

const replicas = Table.make("replicas", {
  slot: Column.text(),
  version: Column.text(),
  initialSchema: Column.json(Schema.Unknown)
}, "zero_0").pipe(
  Table.primaryKey({ columns: ["slot"] as const, name: "replicas_pkey", deferrable: false, initiallyDeferred: false })
)

const shardConfig = Table.make("shardConfig", {
  publications: Column.text().pipe(Column.array()),
  ddlDetection: Column.boolean(),
  lock: Column.boolean().pipe(Column.default(Pg.Query.literal(true)))
}, "zero_0").pipe(
  Table.check("shardConfig_lock_check", Pg.Query.column("lock", Pg.Query.type.bool())),
  Table.primaryKey({ columns: ["lock"] as const, name: "shardConfig_pkey", deferrable: false, initiallyDeferred: false })
)

const versionHistory = Table.make("versionHistory", {
  dataVersion: Column.int(),
  schemaVersion: Column.int(),
  minSafeVersion: Column.int(),
  lock: Column.char(1).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("v"), Pg.Query.type.char())))
}, "zero_0").pipe(
  Table.check("ck_schema_meta_lock", Pg.Query.eq(Pg.Query.column("lock", Pg.Query.type.char()), Pg.Query.cast(Pg.Query.literal("v"), Pg.Query.type.char()))),
  Table.primaryKey({ columns: ["lock"] as const, name: "pk_schema_meta_lock", deferrable: false, initiallyDeferred: false })
)
export { clients, replicas, shardConfig, versionHistory }