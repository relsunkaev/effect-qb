import * as Pg from "effect-qb/postgres"
import { Table, Column } from "effect-qb/postgres"
import * as Schema from "effect/Schema"
let clients = Table.make("clients", {
  clientGroupID: Column.text(),
  clientID: Column.text(),
  patchVersion: Column.text(),
  deleted: Column.boolean().pipe(Column.nullable)
}, "zero_0/cvr").pipe(
  Table.primaryKey({ columns: ["clientGroupID", "clientID"] as const, name: "clients_pkey", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "patchVersion", order: "asc", nulls: "last" }] as const, name: "client_patch_version", unique: false, method: "btree" })
)

let desires = Table.make("desires", {
  clientGroupID: Column.text(),
  clientID: Column.text(),
  queryHash: Column.text(),
  patchVersion: Column.text(),
  deleted: Column.boolean().pipe(Column.nullable),
  ttl: Column.interval().pipe(Column.nullable),
  expiresAt: Column.timestamptz().pipe(Column.nullable),
  inactivatedAt: Column.timestamptz().pipe(Column.nullable)
}, "zero_0/cvr").pipe(
  Table.primaryKey({ columns: ["clientGroupID", "clientID", "queryHash"] as const, name: "desires_pkey", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "expiresAt", order: "asc", nulls: "last" }] as const, name: "desires_expires_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "inactivatedAt", order: "asc", nulls: "last" }] as const, name: "desires_inactivated_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "patchVersion", order: "asc", nulls: "last" }] as const, name: "desires_patch_version", unique: false, method: "btree" })
)

const instances = Table.make("instances", {
  clientGroupID: Column.text(),
  version: Column.text(),
  lastActive: Column.timestamptz(),
  replicaVersion: Column.text().pipe(Column.nullable),
  owner: Column.text().pipe(Column.nullable),
  grantedAt: Column.timestamptz().pipe(Column.nullable),
  clientSchema: Column.jsonb(Schema.Unknown).pipe(Column.nullable)
}, "zero_0/cvr").pipe(
  Table.primaryKey({ columns: ["clientGroupID"] as const, name: "instances_pkey", deferrable: false, initiallyDeferred: false })
)

let queries = Table.make("queries", {
  clientGroupID: Column.text(),
  queryHash: Column.text(),
  clientAST: Column.jsonb(Schema.Unknown),
  patchVersion: Column.text().pipe(Column.nullable),
  transformationHash: Column.text().pipe(Column.nullable),
  transformationVersion: Column.text().pipe(Column.nullable),
  internal: Column.boolean().pipe(Column.nullable),
  deleted: Column.boolean().pipe(Column.nullable)
}, "zero_0/cvr").pipe(
  Table.primaryKey({ columns: ["clientGroupID", "queryHash"] as const, name: "queries_pkey", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "patchVersion", order: "asc", nulls: "first" }] as const, name: "queries_patch_version", unique: false, method: "btree" })
)

const rows = Table.make("rows", {
  clientGroupID: Column.text(),
  schema: Column.text(),
  table: Column.text(),
  rowKey: Column.jsonb(Schema.Unknown),
  rowVersion: Column.text(),
  patchVersion: Column.text(),
  refCounts: Column.jsonb(Schema.Unknown).pipe(Column.nullable)
}, "zero_0/cvr").pipe(
  Table.primaryKey({ columns: ["clientGroupID", "schema", "table", "rowKey"] as const, name: "rows_pkey", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "patchVersion", order: "asc", nulls: "last" }] as const, name: "row_patch_version", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "refCounts", order: "asc", nulls: "last" }] as const, name: "row_ref_counts", unique: false, method: "gin" })
)

const rowsVersion = Table.make("rowsVersion", {
  clientGroupID: Column.text(),
  version: Column.text()
}, "zero_0/cvr").pipe(
  Table.primaryKey({ columns: ["clientGroupID"] as const, name: "rowsVersion_pkey", deferrable: false, initiallyDeferred: false })
)

const versionHistory = Table.make("versionHistory", {
  dataVersion: Column.int(),
  schemaVersion: Column.int(),
  minSafeVersion: Column.int(),
  lock: Column.char(1).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("v"), Pg.Query.type.char())))
}, "zero_0/cvr").pipe(
  Table.check("ck_schema_meta_lock", Pg.Query.eq(Pg.Query.column("lock", Pg.Query.type.char()), Pg.Query.cast(Pg.Query.literal("v"), Pg.Query.type.char()))),
  Table.primaryKey({ columns: ["lock"] as const, name: "pk_schema_meta_lock", deferrable: false, initiallyDeferred: false })
)

clients = clients.pipe(
  Table.foreignKey({ columns: ["clientGroupID"] as const, target: () => instances, referencedColumns: ["clientGroupID"] as const, name: "fk_clients_client_group", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

desires = desires.pipe(
  Table.foreignKey({ columns: ["clientGroupID", "queryHash"] as const, target: () => queries, referencedColumns: ["clientGroupID", "queryHash"] as const, name: "fk_desires_query", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

queries = queries.pipe(
  Table.foreignKey({ columns: ["clientGroupID"] as const, target: () => instances, referencedColumns: ["clientGroupID"] as const, name: "fk_queries_client_group", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)
export { clients, desires, instances, queries, rows, rowsVersion, versionHistory }