import * as Pg from "effect-qb/postgres"
import { Table, Column } from "effect-qb/postgres"
import * as Schema from "effect/Schema"
let account_mappings = Table.make("account_mappings", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  connection_id: Column.uuid(),
  mapping_type: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "account_mapping_type",
  variant: "enum"
}).pipe(Column.ddlType("payment.account_mapping_type")),
  account_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}, "payment").pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "account_mappings_pkey", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "connection_id", order: "asc", nulls: "last" }] as const, name: "ix_account_mappings_connection_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "connection_id", order: "asc", nulls: "last" }, { column: "mapping_type", order: "asc", nulls: "last" }] as const, name: "uq_account_mappings_connection_type", unique: true, method: "btree" })
)

const connections = Table.make("connections", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  platform: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "platform",
  variant: "enum"
}).pipe(Column.ddlType("payment.platform")),
  platform_account_id: Column.varchar(255),
  access_token: Column.text(),
  refresh_token: Column.text().pipe(Column.nullable),
  token_expires_at: Column.timestamp().pipe(Column.nullable),
  status: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "connection_status",
  variant: "enum"
}).pipe(Column.ddlType("payment.connection_status"), Column.default(Pg.Query.cast(Pg.Query.literal("active"), Pg.Query.type.custom("payment.connection_status")))),
  scopes: Column.text().pipe(Column.array(), Column.nullable),
  last_sync_at: Column.timestamp().pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  bucket_config: Column.jsonb(Schema.Unknown).pipe(Column.nullable)
}, "payment").pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "connections_pkey", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_connections_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "platform", order: "asc", nulls: "last" }, { column: "platform_account_id", order: "asc", nulls: "last" }] as const, name: "uq_connections_platform_account", unique: true, method: "btree" })
)

let payout_transactions = Table.make("payout_transactions", {
  payout_id: Column.uuid(),
  transaction_id: Column.uuid()
}, "payment").pipe(
  Table.primaryKey({ columns: ["payout_id", "transaction_id"] as const, name: "payout_transactions_pkey", deferrable: false, initiallyDeferred: false })
)

let payouts = Table.make("payouts", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  connection_id: Column.uuid(),
  platform_id: Column.varchar(255).pipe(Column.nullable),
  amount: Column.int8(),
  iso_currency_code: Column.varchar(3),
  arrival_at: Column.timestamp().pipe(Column.nullable),
  schedule: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "payout_schedule",
  variant: "enum"
}).pipe(Column.ddlType("payment.payout_schedule"), Column.default(Pg.Query.cast(Pg.Query.literal("unknown"), Pg.Query.type.custom("payment.payout_schedule")))),
  status: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "payout_status",
  variant: "enum"
}).pipe(Column.ddlType("payment.payout_status"), Column.default(Pg.Query.cast(Pg.Query.literal("unknown"), Pg.Query.type.custom("payment.payout_status")))),
  type: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "payout_type",
  variant: "enum"
}).pipe(Column.ddlType("payment.payout_type"), Column.default(Pg.Query.cast(Pg.Query.literal("unknown"), Pg.Query.type.custom("payment.payout_type")))),
  method: Column.varchar(64).pipe(Column.nullable),
  destination_id: Column.varchar(255).pipe(Column.nullable),
  destination_last_four: Column.varchar(4).pipe(Column.nullable),
  destination_bank_name: Column.varchar(255).pipe(Column.nullable),
  destination_routing_number: Column.varchar(32).pipe(Column.nullable),
  destination_brand: Column.varchar(64).pipe(Column.nullable),
  bank_reference_id: Column.varchar(64).pipe(Column.nullable),
  platform_data: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  journal_id: Column.uuid().pipe(Column.nullable),
  journal_line_id: Column.uuid().pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  platform_created_at: Column.timestamp().pipe(Column.nullable)
}, "payment").pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "payouts_pkey", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "arrival_at", order: "desc", nulls: "last" }] as const, name: "ix_payouts_arrival_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_reference_id", order: "asc", nulls: "last" }] as const, name: "ix_payouts_bank_reference_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "connection_id", order: "asc", nulls: "last" }] as const, name: "ix_payouts_connection_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }] as const, name: "ix_payouts_journal_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "platform_id", order: "asc", nulls: "last" }] as const, name: "ix_payouts_platform_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "journal_line_id", order: "asc", nulls: "last" }] as const, name: "uq_payouts_journal_line_id", unique: true, method: "btree" })
)

let transactions = Table.make("transactions", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  connection_id: Column.uuid(),
  platform_id: Column.varchar(255).pipe(Column.nullable),
  order_id: Column.varchar(255).pipe(Column.nullable),
  platform_customer_id: Column.varchar(255).pipe(Column.nullable),
  payment_method_type: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "payment_method_type",
  variant: "enum"
}).pipe(Column.ddlType("payment.payment_method_type"), Column.default(Pg.Query.cast(Pg.Query.literal("other"), Pg.Query.type.custom("payment.payment_method_type")))),
  status: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "transaction_status",
  variant: "enum"
}).pipe(Column.ddlType("payment.transaction_status"), Column.default(Pg.Query.cast(Pg.Query.literal("other"), Pg.Query.type.custom("payment.transaction_status")))),
  type: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "transaction_type",
  variant: "enum"
}).pipe(Column.ddlType("payment.transaction_type"), Column.default(Pg.Query.cast(Pg.Query.literal("other"), Pg.Query.type.custom("payment.transaction_type")))),
  amount: Column.int8().pipe(Column.nullable),
  fee: Column.int8().pipe(Column.nullable),
  card_brand: Column.varchar(32).pipe(Column.nullable),
  card_last4: Column.varchar(4).pipe(Column.nullable),
  platform: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "platform",
  variant: "enum"
}).pipe(Column.ddlType("payment.platform")),
  platform_type: Column.varchar(64).pipe(Column.nullable),
  iso_currency_code: Column.varchar(3).pipe(Column.nullable),
  description: Column.text().pipe(Column.nullable),
  platform_data: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  payout_id: Column.uuid().pipe(Column.nullable),
  journal_id: Column.uuid().pipe(Column.nullable),
  journal_line_id: Column.uuid().pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  platform_created_at: Column.timestamp().pipe(Column.nullable)
}, "payment").pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "transactions_pkey", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "connection_id", order: "asc", nulls: "last" }] as const, name: "ix_transactions_connection_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }] as const, name: "ix_transactions_journal_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "payout_id", order: "asc", nulls: "last" }] as const, name: "ix_transactions_payout_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "platform_created_at", order: "desc", nulls: "last" }] as const, name: "ix_transactions_platform_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "platform_id", order: "asc", nulls: "last" }] as const, name: "ix_transactions_platform_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "type", order: "asc", nulls: "last" }] as const, name: "ix_transactions_type", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "connection_id", order: "asc", nulls: "last" }, { column: "platform_id", order: "asc", nulls: "last" }] as const, name: "uq_transactions_connection_platform", unique: true, method: "btree" }),
  Table.index({ keys: [{ column: "journal_line_id", order: "asc", nulls: "last" }] as const, name: "uq_transactions_journal_line_id", unique: true, method: "btree" })
)

const account_mapping_type = Pg.schema("payment").enum("account_mapping_type", ["clearing", "revenue", "fees", "bank"] as const)

const connection_status = Pg.schema("payment").enum("connection_status", ["active", "expired", "revoked"] as const)

const payment_method_type = Pg.schema("payment").enum("payment_method_type", ["cash", "card", "other"] as const)

const payout_schedule = Pg.schema("payment").enum("payout_schedule", ["unknown", "manual", "automatic"] as const)

const payout_status = Pg.schema("payment").enum("payout_status", ["paid", "pending", "in_transit", "cancelled", "failed", "refunded", "unknown"] as const)

const payout_type = Pg.schema("payment").enum("payout_type", ["bank_account", "card", "fpx", "unknown"] as const)

const platform = Pg.schema("payment").enum("platform", ["stripe", "square", "paypal"] as const)

const transaction_status = Pg.schema("payment").enum("transaction_status", ["success", "failure", "pending", "cancelled", "refunded", "other"] as const)

const transaction_type = Pg.schema("payment").enum("transaction_type", ["sale", "refund", "void", "payout", "fee", "other"] as const)

account_mappings = account_mappings.pipe(
  Table.foreignKey({ columns: ["connection_id"] as const, target: () => connections, referencedColumns: ["id"] as const, name: "fk_account_mappings_connection_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

payout_transactions = payout_transactions.pipe(
  Table.foreignKey({ columns: ["payout_id"] as const, target: () => payouts, referencedColumns: ["id"] as const, name: "fk_payout_transactions_payout_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["transaction_id"] as const, target: () => transactions, referencedColumns: ["id"] as const, name: "fk_payout_transactions_transaction_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

payouts = payouts.pipe(
  Table.foreignKey({ columns: ["connection_id"] as const, target: () => connections, referencedColumns: ["id"] as const, name: "fk_payouts_connection_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

transactions = transactions.pipe(
  Table.foreignKey({ columns: ["connection_id"] as const, target: () => connections, referencedColumns: ["id"] as const, name: "fk_transactions_connection_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)
export { account_mappings, connections, payout_transactions, payouts, transactions, account_mapping_type, connection_status, payment_method_type, payout_schedule, payout_status, payout_type, platform, transaction_status, transaction_type }