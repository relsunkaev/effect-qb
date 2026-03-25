import * as Pg from "effect-qb/postgres"
import { Table, Column } from "effect-qb/postgres"
import * as Schema from "effect/Schema"
const changeLog = Table.make("changeLog", {
  watermark: Column.text(),
  pos: Column.int8(),
  change: Column.json(Schema.Unknown),
  precommit: Column.text().pipe(Column.nullable)
}, "zero_0/cdc").pipe(
  Table.primaryKey({ columns: ["watermark", "pos"] as const, name: "changeLog_pkey", deferrable: false, initiallyDeferred: false })
)

const replicationConfig = Table.make("replicationConfig", {
  replicaVersion: Column.text(),
  publications: Column.text().pipe(Column.array()),
  resetRequired: Column.boolean().pipe(Column.nullable),
  lock: Column.int().pipe(Column.default(Pg.Query.literal(1)))
}, "zero_0/cdc").pipe(
  Table.check("replicationConfig_lock_check", Pg.Query.eq(Pg.Query.column("lock", Pg.Query.type.int4()), Pg.Query.literal(1))),
  Table.primaryKey({ columns: ["lock"] as const, name: "replicationConfig_pkey", deferrable: false, initiallyDeferred: false })
)

const replicationState = Table.make("replicationState", {
  lastWatermark: Column.text(),
  owner: Column.text().pipe(Column.nullable),
  ownerAddress: Column.text().pipe(Column.nullable),
  lock: Column.int().pipe(Column.default(Pg.Query.literal(1)))
}, "zero_0/cdc").pipe(
  Table.check("replicationState_lock_check", Pg.Query.eq(Pg.Query.column("lock", Pg.Query.type.int4()), Pg.Query.literal(1))),
  Table.primaryKey({ columns: ["lock"] as const, name: "replicationState_pkey", deferrable: false, initiallyDeferred: false })
)

const versionHistory = Table.make("versionHistory", {
  dataVersion: Column.int(),
  schemaVersion: Column.int(),
  minSafeVersion: Column.int(),
  lock: Column.char(1).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("v"), Pg.Query.type.char())))
}, "zero_0/cdc").pipe(
  Table.check("ck_schema_meta_lock", Pg.Query.eq(Pg.Query.column("lock", Pg.Query.type.char()), Pg.Query.cast(Pg.Query.literal("v"), Pg.Query.type.char()))),
  Table.primaryKey({ columns: ["lock"] as const, name: "pk_schema_meta_lock", deferrable: false, initiallyDeferred: false })
)
export { changeLog, replicationConfig, replicationState, versionHistory }