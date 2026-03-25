import * as Pg from "effect-qb/postgres"
import { Table, Column } from "effect-qb/postgres"
import * as Schema from "effect/Schema"
const depend = Table.make("depend", {
  classid: Column.oid(),
  objid: Column.oid(),
  objsubid: Column.int(),
  refclassid: Column.oid(),
  refobjid: Column.oid(),
  refobjsubid: Column.int(),
  deptype: Column.char(1).pipe(Column.ddlType("\"char\""))
}, "pglogical")

let local_node = Table.make("local_node", {
  node_id: Column.oid(),
  node_local_interface: Column.oid()
}, "pglogical").pipe(
  Table.primaryKey({ columns: ["node_id"] as const, name: "local_node_pkey", deferrable: false, initiallyDeferred: false })
)

let local_sync_status = Table.make("local_sync_status", {
  sync_kind: Column.char(1).pipe(Column.ddlType("\"char\"")),
  sync_subid: Column.oid(),
  sync_nspname: Column.name().pipe(Column.nullable),
  sync_relname: Column.name().pipe(Column.nullable),
  sync_status: Column.char(1).pipe(Column.ddlType("\"char\"")),
  sync_statuslsn: Column.pg_lsn()
}, "pglogical").pipe(
  Table.check("local_sync_status_sync_kind_check", Pg.Query.in(Pg.Query.column("sync_kind", Pg.Query.type.custom("\"char\"")), Pg.Query.cast(Pg.Query.literal("i"), Pg.Query.type.char()), Pg.Query.cast(Pg.Query.literal("s"), Pg.Query.type.char()), Pg.Query.cast(Pg.Query.literal("d"), Pg.Query.type.char()), Pg.Query.cast(Pg.Query.literal("f"), Pg.Query.type.char()))),
  Table.unique({ columns: ["sync_subid", "sync_nspname", "sync_relname"] as const, name: "local_sync_status_sync_subid_sync_nspname_sync_relname_key", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false })
)

const node = Table.make("node", {
  node_id: Column.oid(),
  node_name: Column.name()
}, "pglogical").pipe(
  Table.unique({ columns: ["node_name"] as const, name: "node_node_name_key", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.primaryKey({ columns: ["node_id"] as const, name: "node_pkey", deferrable: false, initiallyDeferred: false })
)

let node_interface = Table.make("node_interface", {
  if_id: Column.oid(),
  if_name: Column.name(),
  if_nodeid: Column.oid().pipe(Column.nullable),
  if_dsn: Column.text()
}, "pglogical").pipe(
  Table.unique({ columns: ["if_nodeid", "if_name"] as const, name: "node_interface_if_nodeid_if_name_key", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.primaryKey({ columns: ["if_id"] as const, name: "node_interface_pkey", deferrable: false, initiallyDeferred: false })
)

const queue = Table.make("queue", {
  queued_at: Column.timestamptz(),
  role: Column.name(),
  replication_sets: Column.text().pipe(Column.array(), Column.nullable),
  message_type: Column.char(1).pipe(Column.ddlType("\"char\"")),
  message: Column.json(Schema.Unknown)
}, "pglogical")

const replication_set = Table.make("replication_set", {
  set_id: Column.oid(),
  set_nodeid: Column.oid(),
  set_name: Column.name(),
  replicate_insert: Column.boolean().pipe(Column.default(Pg.Query.literal(true))),
  replicate_update: Column.boolean().pipe(Column.default(Pg.Query.literal(true))),
  replicate_delete: Column.boolean().pipe(Column.default(Pg.Query.literal(true))),
  replicate_truncate: Column.boolean().pipe(Column.default(Pg.Query.literal(true)))
}, "pglogical").pipe(
  Table.primaryKey({ columns: ["set_id"] as const, name: "replication_set_pkey", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["set_nodeid", "set_name"] as const, name: "replication_set_set_nodeid_set_name_key", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false })
)

const replication_set_seq = Table.make("replication_set_seq", {
  set_id: Column.oid(),
  set_seqoid: Column.regclass()
}, "pglogical").pipe(
  Table.primaryKey({ columns: ["set_id", "set_seqoid"] as const, name: "replication_set_seq_pkey", deferrable: false, initiallyDeferred: false })
)

const replication_set_table = Table.make("replication_set_table", {
  set_id: Column.oid(),
  set_reloid: Column.regclass(),
  set_att_list: Column.text().pipe(Column.array(), Column.nullable),
  set_row_filter: Column.custom(Schema.Unknown, {
  dialect: "postgres",
  kind: "pg_node_tree"
}).pipe(Column.ddlType("pg_node_tree"), Column.nullable)
}, "pglogical").pipe(
  Table.primaryKey({ columns: ["set_id", "set_reloid"] as const, name: "replication_set_table_pkey", deferrable: false, initiallyDeferred: false })
)

const sequence_state = Table.make("sequence_state", {
  seqoid: Column.oid(),
  cache_size: Column.int(),
  last_value: Column.int8()
}, "pglogical").pipe(
  Table.primaryKey({ columns: ["seqoid"] as const, name: "sequence_state_pkey", deferrable: false, initiallyDeferred: false })
)

let subscription = Table.make("subscription", {
  sub_id: Column.oid(),
  sub_name: Column.name(),
  sub_origin: Column.oid(),
  sub_target: Column.oid(),
  sub_origin_if: Column.oid(),
  sub_target_if: Column.oid(),
  sub_enabled: Column.boolean().pipe(Column.default(Pg.Query.literal(true))),
  sub_slot_name: Column.name(),
  sub_replication_sets: Column.text().pipe(Column.array(), Column.nullable),
  sub_forward_origins: Column.text().pipe(Column.array(), Column.nullable),
  sub_apply_delay: Column.interval().pipe(Column.default(Pg.Query.cast(Pg.Query.literal("00:00:00"), Pg.Query.type.interval()))),
  sub_force_text_transfer: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}, "pglogical").pipe(
  Table.primaryKey({ columns: ["sub_id"] as const, name: "subscription_pkey", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["sub_name"] as const, name: "subscription_sub_name_key", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false })
)

local_node = local_node.pipe(
  Table.foreignKey({ columns: ["node_id"] as const, target: () => node, referencedColumns: ["node_id"] as const, name: "local_node_node_id_fkey", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["node_local_interface"] as const, target: () => node_interface, referencedColumns: ["if_id"] as const, name: "local_node_node_local_interface_fkey", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

local_sync_status = local_sync_status.pipe(
  Table.foreignKey({ columns: ["sync_subid"] as const, target: () => subscription, referencedColumns: ["sub_id"] as const, name: "local_sync_status_sync_subid_fkey", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

node_interface = node_interface.pipe(
  Table.foreignKey({ columns: ["if_nodeid"] as const, target: () => node, referencedColumns: ["node_id"] as const, name: "node_interface_if_nodeid_fkey", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

subscription = subscription.pipe(
  Table.foreignKey({ columns: ["sub_origin"] as const, target: () => node, referencedColumns: ["node_id"] as const, name: "subscription_sub_origin_fkey", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["sub_origin_if"] as const, target: () => node_interface, referencedColumns: ["if_id"] as const, name: "subscription_sub_origin_if_fkey", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["sub_target"] as const, target: () => node, referencedColumns: ["node_id"] as const, name: "subscription_sub_target_fkey", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["sub_target_if"] as const, target: () => node_interface, referencedColumns: ["if_id"] as const, name: "subscription_sub_target_if_fkey", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)
export { depend, local_node, local_sync_status, node, node_interface, queue, replication_set, replication_set_seq, replication_set_table, sequence_state, subscription }