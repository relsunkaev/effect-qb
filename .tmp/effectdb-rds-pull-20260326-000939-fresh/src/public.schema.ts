import * as Pg from "effect-qb/postgres"
import { Table, Column } from "effect-qb/postgres"
import * as Schema from "effect/Schema"
let account_connections = Table.make("account_connections", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  workspace_id: Column.uuid()
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_account_connections", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["workspace_id", "id"] as const, name: "uq_account_connections_workspace_id_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_account_connections_workspace_id", unique: false, method: "btree" })
)

let account_refs_codat_account = Table.make("account_refs_codat_account", {
  account_id: Column.uuid(),
  company_id: Column.uuid(),
  codat_account_id: Column.text()
}).pipe(
  Table.primaryKey({ columns: ["account_id", "company_id", "codat_account_id"] as const, name: "pk_account_refs_codat_account", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["account_id"] as const, name: "uq_account_refs_codat_account_account_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "codat_account_id"] as const, name: "uq_account_refs_codat_account_company_id_codat_account_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false })
)

let account_refs_qbo_account = Table.make("account_refs_qbo_account", {
  qbo_item_id: Column.int8(),
  qbo_account_id: Column.text(),
  account_id: Column.uuid(),
  meta: Column.jsonb(Schema.Unknown),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["qbo_item_id", "qbo_account_id"] as const, name: "pk_account_refs_qbo_account", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["account_id"] as const, name: "uq_account_refs_qbo_account_account_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["qbo_item_id", "qbo_account_id"] as const, name: "uq_account_refs_qbo_account_qbo_item_id_qbo_account_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "account_id", order: "asc", nulls: "last" }] as const, name: "ix_account_refs_qbo_account_account_id_covering", unique: false, method: "btree", include: ["qbo_item_id", "qbo_account_id", "meta", "created_at", "updated_at"] as const })
)

let accounts = Table.make("accounts", {
  category_id: Column.int().pipe(Column.nullable),
  company_id: Column.uuid(),
  name: Column.text(),
  id: Column.uuid(),
  status: Column.varchar(32),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  notes: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  workspace_id: Column.uuid(),
  connection_id: Column.uuid().pipe(Column.nullable),
  reconciliation_frequency: Column.varchar(32).pipe(Column.nullable),
  opening_balance_id: Column.uuid().pipe(Column.nullable),
  closing_balance_id: Column.uuid().pipe(Column.nullable),
  first_recon_year: Column.int().pipe(Column.nullable),
  opening_balance_required: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  closing_balance_required: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_accounts", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "id"] as const, name: "uq_accounts_company_id_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "name"] as const, name: "uq_accounts_company_id_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "category_id", order: "asc", nulls: "last" }, { column: "company_id", order: "asc", nulls: "last" }, { column: "id", order: "asc", nulls: "last" }] as const, name: "ix_accounts_category_company_id", unique: false, method: "btree", predicate: Pg.Query.isNotNull(Pg.Query.column("status", Pg.Query.type.varchar())) }),
  Table.index({ keys: [{ column: "category_id", order: "asc", nulls: "last" }] as const, name: "ix_accounts_category_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "closing_balance_id", order: "asc", nulls: "last" }] as const, name: "ix_accounts_closing_balance_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_accounts_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "category_id", order: "asc", nulls: "last" }] as const, name: "ix_accounts_company_id_category_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }] as const, name: "ix_accounts_company_id_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "connection_id", order: "asc", nulls: "last" }] as const, name: "ix_accounts_connection_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "opening_balance_id", order: "asc", nulls: "last" }] as const, name: "ix_accounts_opening_balance_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_accounts_workspace_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }, { column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_accounts_workspace_id_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }, { column: "connection_id", order: "asc", nulls: "last" }] as const, name: "ix_accounts_workspace_id_connection_id", unique: false, method: "btree" })
)

let adjustment_history = Table.make("adjustment_history", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  journal_id: Column.uuid(),
  bookkeeper_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  year: Column.int(),
  adjusting_journal_id: Column.uuid().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_adjustment_history", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "adjusting_journal_id", order: "asc", nulls: "last" }] as const, name: "ix_adjustment_history_adjusting_journal_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bookkeeper_id", order: "asc", nulls: "last" }] as const, name: "ix_adjustment_history_bookkeeper_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_adjustment_history_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }] as const, name: "ix_adjustment_history_journal_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "year", order: "asc", nulls: "last" }] as const, name: "ix_adjustment_history_year", unique: false, method: "btree" })
)

const administrators = Table.make("administrators", {
  uuid: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  email: Column.text(),
  email_verified: Column.boolean(),
  sub: Column.text(),
  first_name: Column.text(),
  last_name: Column.text(),
  picture: Column.text(),
  token: Column.jsonb(Schema.Unknown),
  permissions: Column.jsonb(Schema.Unknown),
  created_at: Column.timestamp(),
  updated_at: Column.timestamp()
}).pipe(
  Table.primaryKey({ columns: ["uuid"] as const, name: "pk_administrators", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_administrators_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "email", order: "asc", nulls: "last" }] as const, name: "ix_administrators_email", unique: true, method: "btree" }),
  Table.index({ keys: [{ column: "email_verified", order: "asc", nulls: "last" }] as const, name: "ix_administrators_email_verified", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "first_name", order: "asc", nulls: "last" }] as const, name: "ix_administrators_first_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "last_name", order: "asc", nulls: "last" }] as const, name: "ix_administrators_last_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "picture", order: "asc", nulls: "last" }] as const, name: "ix_administrators_picture", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "sub", order: "asc", nulls: "last" }] as const, name: "ix_administrators_sub", unique: true, method: "btree" }),
  Table.index({ keys: [{ column: "updated_at", order: "asc", nulls: "last" }] as const, name: "ix_administrators_updated_at", unique: false, method: "btree" })
)

let agent_conversations = Table.make("agent_conversations", {
  agent_id: Column.uuid(),
  target_id: Column.varchar(256)
}).pipe(
  Table.primaryKey({ columns: ["agent_id", "target_id"] as const, name: "pk_agent_conversations", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "target_id", order: "asc", nulls: "last" }] as const, name: "ix_agent_conversations_target_id", unique: false, method: "btree" })
)

const agents = Table.make("agents", {
  id: Column.uuid(),
  name: Column.varchar(255),
  context: Column.jsonb(Schema.Unknown),
  snapshot: Column.jsonb(Schema.Unknown)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_agents", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "name", order: "asc", nulls: "last" }] as const, name: "ix_agents_name", unique: false, method: "btree" })
)

let airtable_proposals = Table.make("airtable_proposals", {
  workspace_id: Column.uuid(),
  number: Column.int(),
  crm_airtable_id: Column.char(17).pipe(Column.nullable),
  status: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("DRAFT"), Pg.Query.type.varchar()))),
  out_of_date: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  airtable: Column.jsonb(Schema.Unknown).pipe(Column.nullable, Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb())))
}).pipe(
  Table.primaryKey({ columns: ["workspace_id", "number"] as const, name: "pk_proposals", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["crm_airtable_id"] as const, name: "uq_proposals_crm_airtable_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_airtable_proposals_workspace_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_proposals_workspace_id", unique: false, method: "btree" })
)

const alembic_version = Table.make("alembic_version", {
  version_num: Column.varchar()
}).pipe(
  Table.primaryKey({ columns: ["version_num"] as const, name: "alembic_version_pkey", deferrable: false, initiallyDeferred: false })
)

const analysis_snapshots = Table.make("analysis_snapshots", {
  created_at: Column.timestamp(),
  company_id: Column.uuid(),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  churned: Column.boolean(),
  churned_at: Column.timestamp().pipe(Column.nullable),
  features: Column.jsonb(Schema.Unknown)
}).pipe(
  Table.primaryKey({ columns: ["company_id"] as const, name: "analysis_snapshots_pkey", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "churned", order: "asc", nulls: "last" }] as const, name: "ix_analysis_snapshots_churned", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_analysis_snapshots_created_at", unique: false, method: "btree" })
)

const awsdms_ddl_audit = Table.make("awsdms_ddl_audit", {
  c_key: Column.int8().pipe(Column.default(Pg.Function.nextVal(Pg.Query.cast(Pg.Query.literal("awsdms_ddl_audit_c_key_seq"), Pg.Query.type.regclass())))),
  c_time: Column.timestamp().pipe(Column.nullable),
  c_user: Column.varchar(64).pipe(Column.nullable),
  c_txn: Column.varchar(16).pipe(Column.nullable),
  c_tag: Column.varchar(24).pipe(Column.nullable),
  c_oid: Column.int().pipe(Column.nullable),
  c_name: Column.varchar(64).pipe(Column.nullable),
  c_schema: Column.varchar(64).pipe(Column.nullable),
  c_ddlqry: Column.text().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["c_key"] as const, name: "awsdms_ddl_audit_pkey", deferrable: false, initiallyDeferred: false })
)

let balances = Table.make("balances", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  account_id: Column.uuid(),
  balance_date: Column.date(),
  amount: Column.int(),
  file_id: Column.uuid(),
  journal_line_id: Column.uuid().pipe(Column.nullable),
  status: Column.varchar(16),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  meta: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb())))
}).pipe(
  Table.check("ck_balances_ck_balances_nonaccepted_requires_null_journal_line", Pg.Query.or(Pg.Query.eq(Pg.Query.cast(Pg.Query.column("status", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("accepted"), Pg.Query.type.text())), Pg.Query.isNull(Pg.Query.column("journal_line_id", Pg.Query.type.uuid(), true)))),
  Table.primaryKey({ columns: ["id"] as const, name: "pk_balances", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["account_id", "balance_date", "file_id"] as const, name: "uq_balances_account_date_file", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "account_id", order: "asc", nulls: "last" }] as const, name: "ix_balances_account_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "balance_date", order: "asc", nulls: "last" }] as const, name: "ix_balances_balance_date", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "file_id", order: "asc", nulls: "last" }] as const, name: "ix_balances_file_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "journal_line_id", order: "asc", nulls: "last" }] as const, name: "ix_balances_journal_line_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "status", order: "asc", nulls: "last" }] as const, name: "ix_balances_status", unique: false, method: "btree" })
)

const bookkeepers = Table.make("bookkeepers", {
  uuid: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  email: Column.varchar(320),
  full_name: Column.text(),
  phone_number: Column.text(),
  about: Column.text().pipe(Column.nullable),
  photo_url: Column.text().pipe(Column.nullable),
  meeting_link: Column.text().pipe(Column.nullable),
  title: Column.text().pipe(Column.nullable),
  role: Column.varchar(32),
  active: Column.boolean().pipe(Column.default(Pg.Query.literal(true))),
  team: Column.varchar(32).pipe(Column.nullable),
  can_manage_bookkeepers: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  can_hard_close: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  timezone: Column.varchar(4).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("MST"), Pg.Query.type.varchar()))),
  can_manage_cancellations: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  can_manage_questionnaire_templates: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}).pipe(
  Table.primaryKey({ columns: ["uuid"] as const, name: "pk_bookkeepers", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "full_name", order: "asc", nulls: "last" }] as const, name: "ix_bookkeepers_full_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "phone_number", order: "asc", nulls: "last" }] as const, name: "ix_bookkeepers_phone_number", unique: false, method: "btree" })
)

let calendar_events = Table.make("calendar_events", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  workspace_id: Column.uuid(),
  company_id: Column.uuid(),
  platform: Column.text(),
  external_event_id: Column.text(),
  status: Column.text(),
  invitee_email: Column.text(),
  invitee_name: Column.text(),
  event_title: Column.text(),
  start_time: Column.timestamp(),
  end_time: Column.timestamp(),
  platform_payload: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_calendar_events", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["platform", "external_event_id"] as const, name: "uq_calendar_events_platform_external_ids", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_calendar_events_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_calendar_events_company_workspace", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "external_event_id", order: "asc", nulls: "last" }] as const, name: "ix_calendar_events_external_event_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "invitee_email", order: "asc", nulls: "last" }] as const, name: "ix_calendar_events_invitee_email", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "platform", order: "asc", nulls: "last" }] as const, name: "ix_calendar_events_platform", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "platform", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }] as const, name: "ix_calendar_events_platform_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "start_time", order: "asc", nulls: "last" }] as const, name: "ix_calendar_events_start_time", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_calendar_events_workspace_id", unique: false, method: "btree" })
)

let cancellation_events = Table.make("cancellation_events", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  workspace_id: Column.uuid(),
  proposal_id: Column.uuid(),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  changes: Column.jsonb(Schema.Unknown)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_cancellation_events", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "proposal_id", order: "asc", nulls: "last" }] as const, name: "ix_cancellation_events_proposal_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_cancellation_events_workspace_id", unique: false, method: "btree" })
)

let categories = Table.make("categories", {
  id: Column.int().pipe(Column.default(Pg.Function.nextVal(Pg.Query.cast(Pg.Query.literal("uplinq_accounts_id_seq"), Pg.Query.type.regclass())))),
  parent_id: Column.int(),
  child_id: Column.int(),
  department_id: Column.int().pipe(Column.nullable),
  cost_center_id: Column.int().pipe(Column.nullable),
  child_name: Column.varchar(64),
  department_name: Column.varchar(64).pipe(Column.nullable),
  type: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "type",
  variant: "enum"
}).pipe(Column.ddlType("type"), Column.nullable),
  subtype: Column.varchar(64).pipe(Column.nullable),
  name: Column.varchar(64).pipe(Column.nullable),
  detail: Column.varchar(64).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_categories", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["parent_id", "child_id", "cost_center_id", "department_id"] as const, name: "uq_categories_number", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "child_id", order: "asc", nulls: "last" }] as const, name: "ix_categories_child_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "child_name", order: "asc", nulls: "last" }] as const, name: "ix_categories_child_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "cost_center_id", order: "asc", nulls: "last" }] as const, name: "ix_categories_cost_center_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "department_id", order: "asc", nulls: "last" }] as const, name: "ix_categories_department_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "department_name", order: "asc", nulls: "last" }] as const, name: "ix_categories_department_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "detail", order: "asc", nulls: "last" }] as const, name: "ix_categories_detail", unique: false, method: "btree", predicate: Pg.Query.isNotNull(Pg.Query.column("detail", Pg.Query.type.varchar(), true)) }),
  Table.index({ keys: [{ column: "id", order: "asc", nulls: "last" }] as const, name: "ix_categories_id_covering", unique: false, method: "btree", include: ["child_name", "parent_id", "type", "subtype", "name"] as const }),
  Table.index({ keys: [{ column: "name", order: "asc", nulls: "last" }] as const, name: "ix_categories_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "parent_id", order: "asc", nulls: "last" }] as const, name: "ix_categories_parent_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "parent_id", order: "asc", nulls: "last" }, { column: "id", order: "asc", nulls: "last" }] as const, name: "ix_categories_parent_id_covering", unique: false, method: "btree", include: ["child_id", "child_name", "cost_center_id", "department_id", "department_name"] as const }),
  Table.index({ keys: [{ column: "subtype", order: "asc", nulls: "last" }] as const, name: "ix_categories_subtype", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "type", order: "asc", nulls: "last" }] as const, name: "ix_categories_type", unique: false, method: "btree" })
)

let categorization_rule_history = Table.make("categorization_rule_history", {
  id: Column.uuid(),
  rule_id: Column.uuid(),
  intent: Column.varchar(),
  source: Column.varchar(),
  source_id: Column.varchar().pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  event: Column.jsonb(Schema.Unknown),
  state: Column.jsonb(Schema.Unknown)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_categorization_rule_history", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ expression: Pg.Query.cast(Pg.Function.json.text(Pg.Query.column("event", Pg.Query.type.jsonb()), Pg.Function.json.key("status")), Pg.Query.type.text()), order: "asc", nulls: "last" }] as const, name: "ix_categorization_rule_history_event_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "rule_id", order: "asc", nulls: "last" }] as const, name: "ix_categorization_rule_history_rule_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "source", order: "asc", nulls: "last" }] as const, name: "ix_categorization_rule_history_source", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "source_id", order: "asc", nulls: "last" }] as const, name: "ix_categorization_rule_history_source_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "event", order: "asc", nulls: "last" }] as const, name: "rules_history_event_gin_idx", unique: false, method: "gin" })
)

let categorization_rules = Table.make("categorization_rules", {
  id: Column.uuid(),
  company_id: Column.uuid(),
  account_id: Column.uuid().pipe(Column.nullable),
  name: Column.varchar(64),
  order: Column.int(),
  type: Column.varchar(4).pipe(Column.nullable),
  conditions: Column.jsonb(Schema.Unknown),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  status: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "rulestatus",
  variant: "enum"
}).pipe(Column.ddlType("rulestatus")),
  explanation_type: Column.varchar(32).pipe(Column.nullable),
  payee_id: Column.uuid().pipe(Column.nullable),
  visible_to_customer: Column.boolean().pipe(Column.nullable, Column.default(Pg.Query.literal(false))),
  bidirectional: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  description: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb())))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_uplinq_rules", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "account_id", order: "asc", nulls: "last" }] as const, name: "ix_categorization_rules_account_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_categorization_rules_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "id", order: "asc", nulls: "last" }] as const, name: "ix_categorization_rules_company_id_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }] as const, name: "ix_categorization_rules_company_id_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "name", order: "asc", nulls: "last" }] as const, name: "ix_categorization_rules_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "order", order: "asc", nulls: "last" }] as const, name: "ix_categorization_rules_order", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "payee_id", order: "asc", nulls: "last" }] as const, name: "ix_categorization_rules_payee_id", unique: false, method: "btree" })
)

const chat_messages = Table.make("chat_messages", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  target_id: Column.varchar(256),
  target_type: Column.varchar(32),
  message_type: Column.varchar(32),
  creator_type: Column.varchar(32),
  created_by: Column.varchar(128),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  text: Column.text().pipe(Column.nullable),
  meta: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  archived_at: Column.timestamp().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_chat_messages", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "archived_at", order: "asc", nulls: "last" }] as const, name: "ix_chat_messages_archived_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_chat_messages_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "id", order: "asc", nulls: "last" }] as const, name: "ix_chat_messages_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "target_id", order: "asc", nulls: "last" }] as const, name: "ix_chat_messages_target_id", unique: false, method: "btree" })
)

let check_events = Table.make("check_events", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  check_name: Column.varchar(128),
  type: Column.varchar(64),
  entity_id: Column.uuid(),
  entity_type: Column.varchar(64),
  explanation: Column.text().pipe(Column.nullable),
  created_by: Column.varchar(128).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_check_events", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_check_events_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "check_name", order: "asc", nulls: "last" }, { column: "entity_id", order: "asc", nulls: "last" }] as const, name: "ix_check_events_company_id_check_name_entity_id", unique: false, method: "btree" })
)

let checkouts = Table.make("checkouts", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  workspace_id: Column.uuid()
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_checkouts", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["id", "workspace_id"] as const, name: "uq_checkouts_id_workspace_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false })
)

const checks = Table.make("checks", {
  name: Column.varchar(),
  description: Column.text().pipe(Column.nullable),
  frequency: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "checkfrequency",
  variant: "enum"
}).pipe(Column.ddlType("checkfrequency"))
}).pipe(
  Table.primaryKey({ columns: ["name"] as const, name: "pk_checks", deferrable: false, initiallyDeferred: false })
)

const child_categories = Table.make("child_categories", {
  number: Column.int(),
  name: Column.varchar(64)
}).pipe(
  Table.check("ck_child_categories_lower", Pg.Query.gte(Pg.Query.column("number", Pg.Query.type.int4()), Pg.Query.literal(0))),
  Table.check("ck_child_categories_upper", Pg.Query.lte(Pg.Query.column("number", Pg.Query.type.int4()), Pg.Query.literal(99))),
  Table.primaryKey({ columns: ["name"] as const, name: "pk_child_categories", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["name", "number"] as const, name: "uq_child_categories_name_number", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false })
)

let companies = Table.make("companies", {
  uuid: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  name: Column.varchar(),
  dba: Column.varchar().pipe(Column.nullable),
  logo: Column.varchar(),
  description: Column.varchar().pipe(Column.nullable),
  airtable_id: Column.char(17).pipe(Column.nullable),
  website_url: Column.varchar().pipe(Column.nullable),
  phone_number: Column.varchar(),
  industry: Column.varchar(),
  entity_type: Column.varchar(),
  accounting_basis: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "accountingbasis",
  variant: "enum"
}).pipe(Column.ddlType("accountingbasis"), Column.default(Pg.Query.cast(Pg.Query.literal("cash"), Pg.Query.type.enum("accountingbasis")))),
  work_system: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "worksystem",
  variant: "enum"
}).pipe(Column.ddlType("worksystem"), Column.default(Pg.Query.cast(Pg.Query.literal("uplinq"), Pg.Query.type.enum("worksystem")))),
  communications: Column.jsonb(Schema.Unknown),
  stripe: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  custom_pricing: Column.jsonb(Schema.Unknown),
  partner_code: Column.varchar(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  bookkeeper_uuid: Column.uuid().pipe(Column.nullable),
  accounting_specialist_uuid: Column.uuid().pipe(Column.nullable),
  gpt_enabled: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  stripe_customer_id: Column.varchar(64).pipe(Column.nullable),
  health: Column.int().pipe(Column.default(Pg.Query.literal(0))),
  workspace_id: Column.uuid(),
  crm_airtable_id: Column.char(17).pipe(Column.nullable),
  checkout_id: Column.uuid().pipe(Column.nullable),
  start_year: Column.int().pipe(Column.nullable),
  primary_contact_id: Column.uuid().pipe(Column.nullable),
  has_previous_accountant: Column.boolean().pipe(Column.nullable),
  tax_specialist_a_uuid: Column.uuid().pipe(Column.nullable),
  tax_specialist_b_uuid: Column.uuid().pipe(Column.nullable),
  business_start_date: Column.date().pipe(Column.nullable),
  initialization_specialist_uuid: Column.uuid().pipe(Column.nullable),
  custom_columns: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  birthday: Column.date().pipe(Column.nullable),
  tax_airtable_id: Column.char(17).pipe(Column.nullable),
  tax_admin_uuid: Column.uuid().pipe(Column.nullable),
  hubspot_company_id: Column.varchar(32).pipe(Column.nullable),
  onboarded_at: Column.timestamp().pipe(Column.nullable),
  federal_filing_types: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  tallyfor_client_id: Column.uuid().pipe(Column.nullable),
  can_email_financials: Column.boolean().pipe(Column.default(Pg.Query.literal(true))),
  is_demo: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}).pipe(
  Table.primaryKey({ columns: ["uuid"] as const, name: "pk_companies", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["tallyfor_client_id"] as const, name: "uq_companies_tallyfor_client_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["workspace_id", "uuid"] as const, name: "uq_companies_workspace_id_uuid", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ expression: Pg.Function.call("jsonb_date_to_date", Pg.Query.column("custom_columns", Pg.Query.type.jsonb()), Pg.Query.cast(Pg.Query.literal("6f9ddffc-8a7f-412c-9c80-a2bf3d6c2ad7"), Pg.Query.type.text())), order: "asc", nulls: "last" }] as const, name: "idx_companies_grid_view_custom_col_6f9ddffc_date", unique: false, method: "btree", predicate: Pg.Function.jsonb.hasKey(Pg.Query.column("custom_columns", Pg.Query.type.jsonb()), "6f9ddffc-8a7f-412c-9c80-a2bf3d6c2ad7") }),
  Table.index({ keys: [{ column: "accounting_basis", order: "asc", nulls: "last" }] as const, name: "ix_companies_accounting_basis", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "accounting_specialist_uuid", order: "asc", nulls: "last" }] as const, name: "ix_companies_accounting_specialist_uuid", unique: false, method: "btree", predicate: Pg.Query.isNotNull(Pg.Query.column("accounting_specialist_uuid", Pg.Query.type.uuid(), true)) }),
  Table.index({ keys: [{ column: "airtable_id", order: "asc", nulls: "last" }] as const, name: "ix_companies_airtable_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "birthday", order: "asc", nulls: "last" }] as const, name: "ix_companies_birthday", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bookkeeper_uuid", order: "asc", nulls: "last" }] as const, name: "ix_companies_bookkeeper_uuid", unique: false, method: "btree", predicate: Pg.Query.isNotNull(Pg.Query.column("bookkeeper_uuid", Pg.Query.type.uuid(), true)) }),
  Table.index({ keys: [{ column: "business_start_date", order: "asc", nulls: "last" }] as const, name: "ix_companies_business_start_date", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "checkout_id", order: "asc", nulls: "last" }] as const, name: "ix_companies_checkout_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "checkout_id", order: "asc", nulls: "last" }, { column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_companies_checkout_id_workspace_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "crm_airtable_id", order: "asc", nulls: "last" }] as const, name: "ix_companies_crm_airtable_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "dba", order: "asc", nulls: "last" }] as const, name: "ix_companies_dba", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "entity_type", order: "asc", nulls: "last" }] as const, name: "ix_companies_entity_type", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "gpt_enabled", order: "asc", nulls: "last" }] as const, name: "ix_companies_gpt_enabled", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "health", order: "asc", nulls: "last" }] as const, name: "ix_companies_health", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "hubspot_company_id", order: "asc", nulls: "last" }] as const, name: "ix_companies_hubspot_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "industry", order: "asc", nulls: "last" }] as const, name: "ix_companies_industry", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "initialization_specialist_uuid", order: "asc", nulls: "last" }] as const, name: "ix_companies_initialization_specialist_uuid", unique: false, method: "btree", predicate: Pg.Query.isNotNull(Pg.Query.column("initialization_specialist_uuid", Pg.Query.type.uuid(), true)) }),
  Table.index({ keys: [{ column: "logo", order: "asc", nulls: "last" }] as const, name: "ix_companies_logo", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "name", order: "asc", nulls: "last" }] as const, name: "ix_companies_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "partner_code", order: "asc", nulls: "last" }] as const, name: "ix_companies_partner_code", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "phone_number", order: "asc", nulls: "last" }] as const, name: "ix_companies_phone_number", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "stripe_customer_id", order: "asc", nulls: "last" }] as const, name: "ix_companies_stripe_customer_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "tax_admin_uuid", order: "asc", nulls: "last" }] as const, name: "ix_companies_tax_admin_uuid", unique: false, method: "btree", predicate: Pg.Query.isNotNull(Pg.Query.column("tax_admin_uuid", Pg.Query.type.uuid(), true)) }),
  Table.index({ keys: [{ column: "tax_airtable_id", order: "asc", nulls: "last" }] as const, name: "ix_companies_tax_airtable_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "tax_specialist_a_uuid", order: "asc", nulls: "last" }] as const, name: "ix_companies_tax_specialist_a_uuid", unique: false, method: "btree", predicate: Pg.Query.isNotNull(Pg.Query.column("tax_specialist_a_uuid", Pg.Query.type.uuid(), true)) }),
  Table.index({ keys: [{ column: "tax_specialist_b_uuid", order: "asc", nulls: "last" }] as const, name: "ix_companies_tax_specialist_b_uuid", unique: false, method: "btree", predicate: Pg.Query.isNotNull(Pg.Query.column("tax_specialist_b_uuid", Pg.Query.type.uuid(), true)) }),
  Table.index({ keys: [{ column: "website_url", order: "asc", nulls: "last" }] as const, name: "ix_companies_website_url", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "work_system", order: "asc", nulls: "last" }] as const, name: "ix_companies_work_system", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_companies_workspace_id", unique: false, method: "btree" })
)

let companies_products = Table.make("companies_products", {
  company_uuid: Column.uuid(),
  product_name: Column.varchar(64),
  years: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("[]"), Pg.Query.type.jsonb()))),
  airtable_id: Column.char(17).pipe(Column.nullable),
  custom_description: Column.text().pipe(Column.nullable),
  notes: Column.text().pipe(Column.nullable),
  airtable: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  crm_airtable_id: Column.char(17).pipe(Column.nullable)
}).pipe(
  Table.unique({ columns: ["airtable_id"] as const, name: "ix_companies_products_airtable_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["crm_airtable_id"] as const, name: "ix_companies_products_crm_airtable_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.primaryKey({ columns: ["company_uuid", "product_name"] as const, name: "pk_companies_products", deferrable: false, initiallyDeferred: false })
)

let companies_stripe_subscription_schedules = Table.make("companies_stripe_subscription_schedules", {
  company_uuid: Column.uuid(),
  stripe_subscription_schedule_id: Column.varchar(64)
}).pipe(
  Table.primaryKey({ columns: ["company_uuid", "stripe_subscription_schedule_id"] as const, name: "pk_companies_stripe_subscription_schedules", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }] as const, name: "ix_companies_stripe_subscription_schedules_company_uuid", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "stripe_subscription_schedule_id", order: "asc", nulls: "last" }, { column: "company_uuid", order: "asc", nulls: "last" }] as const, name: "ix_companies_stripe_subscription_schedules_stripe_id_company", unique: false, method: "btree" })
)

let companies_stripe_subscriptions = Table.make("companies_stripe_subscriptions", {
  company_uuid: Column.uuid(),
  stripe_subscription_id: Column.varchar(64)
}).pipe(
  Table.primaryKey({ columns: ["company_uuid", "stripe_subscription_id"] as const, name: "pk_companies_stripe_subscriptions", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }] as const, name: "ix_companies_stripe_subscriptions_company_uuid", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "stripe_subscription_id", order: "asc", nulls: "last" }, { column: "company_uuid", order: "asc", nulls: "last" }] as const, name: "ix_companies_stripe_subscriptions_stripe_id_company", unique: false, method: "btree" })
)

let company_addresses = Table.make("company_addresses", {
  company_id: Column.uuid(),
  address_line_1: Column.text().pipe(Column.nullable),
  address_line_2: Column.text().pipe(Column.nullable),
  city: Column.text().pipe(Column.nullable),
  state: Column.varchar(2).pipe(Column.nullable),
  postal_code: Column.varchar(9).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["company_id"] as const, name: "pk_company_addresses", deferrable: false, initiallyDeferred: false })
)

const company_audit_logs = Table.make("company_audit_logs", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  workspace_id: Column.uuid(),
  row_data: Column.jsonb(Schema.Unknown),
  dml_type: Column.varchar(32),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  created_by: Column.varchar(320)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_company_audit_logs", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_company_audit_logs_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_company_audit_logs_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_company_audit_logs_workspace_id", unique: false, method: "btree" })
)

let company_bookkeeping_deliverables = Table.make("company_bookkeeping_deliverables", {
  uuid: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_uuid: Column.uuid(),
  delivery_date: Column.timestamp().pipe(Column.nullable),
  company_action_required_by: Column.timestamp().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["uuid"] as const, name: "pk_company_bookkeeping_deliverables", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_action_required_by", order: "asc", nulls: "last" }] as const, name: "ix_company_bookkeeping_deliverables_company_action_required_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "delivery_date", order: "asc", nulls: "last" }] as const, name: "ix_company_bookkeeping_deliverables_delivery_date", unique: false, method: "btree" })
)

const company_checkout_audit_logs = Table.make("company_checkout_audit_logs", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  checkout_id: Column.uuid(),
  company_id: Column.uuid(),
  row_data: Column.jsonb(Schema.Unknown),
  dml_type: Column.varchar(32),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  created_by: Column.varchar(320)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_company_checkout_audit_logs", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "checkout_id", order: "asc", nulls: "last" }] as const, name: "ix_company_checkout_audit_logs_checkout_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_company_checkout_audit_logs_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_company_checkout_audit_logs_created_by", unique: false, method: "btree" })
)

let company_checkouts = Table.make("company_checkouts", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  type: Column.varchar(32),
  stripe: Column.jsonb(Schema.Unknown),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_company_checkouts", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "type"] as const, name: "uq_company_checkouts_company_id_type", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false })
)

let company_errors = Table.make("company_errors", {
  uuid: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_uuid: Column.uuid(),
  created_at: Column.timestamp(),
  created_by: Column.varchar(320),
  status_error: Column.text().pipe(Column.default(Pg.Query.cast(Pg.Query.literal("NO_ERROR"), Pg.Query.type.text()))),
  description: Column.text().pipe(Column.nullable),
  action_url: Column.text().pipe(Column.nullable),
  action_prompt: Column.text().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["uuid"] as const, name: "pk_company_errors", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_company_errors_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "status_error", order: "asc", nulls: "last" }] as const, name: "ix_company_errors_status_error", unique: false, method: "btree" })
)

let company_events = Table.make("company_events", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_uuid: Column.uuid(),
  type: Column.varchar(32),
  data: Column.jsonb(Schema.Unknown),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  source_type: Column.varchar(32),
  source_id: Column.text()
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_company_events", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "type", order: "asc", nulls: "last" }, { column: "created_at", order: "desc", nulls: "first" }] as const, name: "ix_company_events_company_type_created", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_company_events_company_uuid_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "type", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_company_events_company_uuid_type", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_company_events_latest_closing", unique: false, method: "btree", predicate: Pg.Query.eq(Pg.Query.cast(Pg.Query.column("type", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("CLOSING"), Pg.Query.type.text())) }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_company_events_latest_monthly_closing", unique: false, method: "btree", predicate: Pg.Query.eq(Pg.Query.cast(Pg.Query.column("type", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("MONTHLY_CLOSING"), Pg.Query.type.text())) }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_company_events_latest_qbo_sign_off", unique: false, method: "btree", predicate: Pg.Query.eq(Pg.Query.cast(Pg.Query.column("type", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("QBO_SIGN_OFF"), Pg.Query.type.text())) })
)

let company_grid_columns = Table.make("company_grid_columns", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  name: Column.varchar(128),
  type: Column.varchar(32),
  possible_values: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  description: Column.text().pipe(Column.nullable),
  tag: Column.varchar(128).pipe(Column.nullable),
  default_value: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  definition: Column.text().pipe(Column.nullable),
  is_locked: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_company_grid_columns", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["name"] as const, name: "uq_company_grid_columns_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_company_grid_columns_created_by", unique: false, method: "btree" })
)

let company_grid_view_columns = Table.make("company_grid_view_columns", {
  sequence: Column.int(),
  view_id: Column.uuid(),
  column_id: Column.uuid(),
  filter: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  sort: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  pin: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  size: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  hide: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}).pipe(
  Table.primaryKey({ columns: ["sequence", "view_id"] as const, name: "pk_company_grid_view_columns", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "column_id", order: "asc", nulls: "last" }] as const, name: "ix_company_grid_view_columns_column_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "sequence", order: "asc", nulls: "last" }] as const, name: "ix_company_grid_view_columns_sequence", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "view_id", order: "asc", nulls: "last" }] as const, name: "ix_company_grid_view_columns_view_id", unique: false, method: "btree" })
)

let company_grid_view_favorites = Table.make("company_grid_view_favorites", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  view_id: Column.uuid(),
  bookkeeper_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_company_grid_view_favorites", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bookkeeper_id", order: "asc", nulls: "last" }] as const, name: "ix_company_grid_view_favorites_bookkeeper_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "view_id", order: "asc", nulls: "last" }] as const, name: "ix_company_grid_view_favorites_view_id", unique: false, method: "btree" })
)

let company_grid_view_invites = Table.make("company_grid_view_invites", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  view_id: Column.uuid(),
  access: Column.varchar(32),
  bookkeeper_id: Column.uuid(),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_company_grid_view_invites", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bookkeeper_id", order: "asc", nulls: "last" }] as const, name: "ix_company_grid_view_invites_bookkeeper_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_company_grid_view_invites_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "view_id", order: "asc", nulls: "last" }] as const, name: "ix_company_grid_view_invites_view_id", unique: false, method: "btree" })
)

let company_grid_views = Table.make("company_grid_views", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  name: Column.varchar(128),
  tag: Column.varchar(128).pipe(Column.nullable),
  is_public: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  is_locked: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  filters: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  last_opened_at: Column.timestamp().pipe(Column.nullable),
  last_opened_by: Column.uuid().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_company_grid_views", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_company_grid_views_created_by", unique: false, method: "btree" })
)

const company_product_audit_logs = Table.make("company_product_audit_logs", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  product_name: Column.varchar(64),
  company_id: Column.uuid(),
  row_data: Column.jsonb(Schema.Unknown),
  dml_type: Column.varchar(32),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  created_by: Column.varchar(320)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_company_product_audit_logs", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_company_product_audit_logs_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_company_product_audit_logs_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "product_name", order: "asc", nulls: "last" }] as const, name: "ix_company_product_audit_logs_product_name", unique: false, method: "btree" })
)

let company_statuses = Table.make("company_statuses", {
  uuid: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_uuid: Column.uuid(),
  created_at: Column.timestamp(),
  created_by: Column.varchar(320),
  status: Column.text().pipe(Column.default(Pg.Query.cast(Pg.Query.literal("ONBOARDING"), Pg.Query.type.text()))),
  description: Column.text().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["uuid"] as const, name: "pk_company_statuses", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }] as const, name: "ix_company_statuses_company_uuid", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_company_statuses_company_uuid_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_company_statuses_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "status", order: "asc", nulls: "last" }] as const, name: "ix_company_statuses_status", unique: false, method: "btree" })
)

let company_taxes = Table.make("company_taxes", {
  company_id: Column.uuid(),
  tax_filing_basis: Column.varchar(16).pipe(Column.nullable),
  last_year_filed: Column.int().pipe(Column.nullable),
  in_progress_filings: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  reports_sales_tax: Column.boolean().pipe(Column.nullable),
  sales_tax_filing_frequency: Column.text().pipe(Column.nullable),
  has_filed_taxes: Column.boolean().pipe(Column.nullable),
  sales_tax_up_to_date: Column.boolean().pipe(Column.nullable),
  requires_job_costing: Column.boolean().pipe(Column.nullable),
  has_different_fiscal_year: Column.boolean().pipe(Column.nullable),
  fiscal_year_end_month: Column.int().pipe(Column.nullable),
  factoring: Column.varchar(16).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["company_id"] as const, name: "pk_company_taxes", deferrable: false, initiallyDeferred: false })
)

const cost_centers = Table.make("cost_centers", {
  number: Column.int(),
  name: Column.varchar(64)
}).pipe(
  Table.check("ck_cost_centers_lower", Pg.Query.gte(Pg.Query.column("number", Pg.Query.type.int4()), Pg.Query.literal(1))),
  Table.check("ck_cost_centers_upper", Pg.Query.lte(Pg.Query.column("number", Pg.Query.type.int4()), Pg.Query.literal(9))),
  Table.primaryKey({ columns: ["number"] as const, name: "pk_uplinq_cost_centers", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["name"] as const, name: "uq_cost_centers_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false })
)

let credentials = Table.make("credentials", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  status: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("REQUESTED"), Pg.Query.type.varchar()))),
  link: Column.varchar(255).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  created_by: Column.varchar(320),
  company_id: Column.uuid(),
  institution_name: Column.varchar(255).pipe(Column.nullable),
  has_qbo_statement_access: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_credentials", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_credentials_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }] as const, name: "ix_credentials_company_id_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_credentials_created_by", unique: false, method: "btree" })
)

let customer_refs_qbo_customer = Table.make("customer_refs_qbo_customer", {
  qbo_item_id: Column.int8(),
  qbo_customer_id: Column.varchar(),
  customer_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  meta: Column.jsonb(Schema.Unknown)
}).pipe(
  Table.primaryKey({ columns: ["qbo_item_id", "qbo_customer_id"] as const, name: "pk_customer_refs_qbo_customer", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["customer_id"] as const, name: "uq_customer_refs_qbo_customer_customer_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false })
)

const customer_satisfaction_ratings = Table.make("customer_satisfaction_ratings", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid().pipe(Column.nullable),
  user_id: Column.uuid(),
  score: Column.int().pipe(Column.nullable),
  feedback: Column.text().pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  type: Column.varchar(32),
  status: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("TO_ASK"), Pg.Query.type.varchar()))),
  responded_at: Column.timestamp().pipe(Column.nullable),
  hubspot_id: Column.varchar(32).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_customer_satisfaction_ratings", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "status", order: "asc", nulls: "last" }] as const, name: "ix_customer_satisfaction_ratings_status", unique: false, method: "btree" })
)

let customers = Table.make("customers", {
  id: Column.uuid(),
  company_id: Column.uuid(),
  parent_id: Column.uuid().pipe(Column.nullable),
  name: Column.varchar(),
  is_job: Column.boolean(),
  status: Column.text(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_customers", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "name"] as const, name: "uq_customers_company_id_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["id", "company_id"] as const, name: "uq_customers_id_company_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_customers_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "name", order: "asc", nulls: "last" }] as const, name: "ix_customers_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "parent_id", order: "asc", nulls: "last" }] as const, name: "ix_customers_parent_id", unique: false, method: "btree" })
)

let dashboards = Table.make("dashboards", {
  uuid: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_uuid: Column.uuid(),
  data_url: Column.text(),
  embed_url_desktop: Column.text(),
  embed_url_mobile: Column.text().pipe(Column.nullable),
  dashboard_url_desktop: Column.text(),
  dashboard_url_mobile: Column.text().pipe(Column.nullable),
  type: Column.text(),
  version: Column.text(),
  weight: Column.int(),
  created_at: Column.timestamp(),
  updated_at: Column.timestamp()
}).pipe(
  Table.unique({ columns: ["company_uuid", "type", "version"] as const, name: "dashboards_company_uuid_type_version", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.primaryKey({ columns: ["uuid"] as const, name: "pk_dashboards", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_dashboards_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "dashboard_url_desktop", order: "asc", nulls: "last" }] as const, name: "ix_dashboards_dashboard_url_desktop", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "dashboard_url_mobile", order: "asc", nulls: "last" }] as const, name: "ix_dashboards_dashboard_url_mobile", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "data_url", order: "asc", nulls: "last" }] as const, name: "ix_dashboards_data_url", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "embed_url_desktop", order: "asc", nulls: "last" }] as const, name: "ix_dashboards_embed_url_desktop", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "embed_url_mobile", order: "asc", nulls: "last" }] as const, name: "ix_dashboards_embed_url_mobile", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "type", order: "asc", nulls: "last" }] as const, name: "ix_dashboards_type", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "updated_at", order: "asc", nulls: "last" }] as const, name: "ix_dashboards_updated_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "version", order: "asc", nulls: "last" }] as const, name: "ix_dashboards_version", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "weight", order: "asc", nulls: "last" }] as const, name: "ix_dashboards_weight", unique: false, method: "btree" })
)

const departments = Table.make("departments", {
  number: Column.int(),
  name: Column.varchar(64)
}).pipe(
  Table.check("ck_departments_lower", Pg.Query.gte(Pg.Query.column("number", Pg.Query.type.int4()), Pg.Query.literal(1))),
  Table.check("ck_departments_upper", Pg.Query.lte(Pg.Query.column("number", Pg.Query.type.int4()), Pg.Query.literal(9))),
  Table.primaryKey({ columns: ["name"] as const, name: "pk_departments", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["name", "number"] as const, name: "uq_departments_name_number", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false })
)

let deprecated_products = Table.make("deprecated_products", {
  old_product_name: Column.varchar(64),
  new_product_name: Column.varchar(64),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["old_product_name", "new_product_name"] as const, name: "pk_deprecated_products", deferrable: false, initiallyDeferred: false })
)

let email_conversation_companies = Table.make("email_conversation_companies", {
  conversation_id: Column.uuid(),
  company_id: Column.uuid()
}).pipe(
  Table.primaryKey({ columns: ["conversation_id", "company_id"] as const, name: "pk_email_conversation_companies", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_email_conversation_companies_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "conversation_id", order: "asc", nulls: "last" }] as const, name: "ix_email_conversation_companies_conversation_id", unique: false, method: "btree" })
)

let email_conversations = Table.make("email_conversations", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  workspace_id: Column.uuid().pipe(Column.nullable),
  needs_matching: Column.boolean().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_email_conversations", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "id", order: "asc", nulls: "last" }] as const, name: "ix_email_conversations_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "needs_matching", order: "asc", nulls: "last" }] as const, name: "ix_email_conversations_needs_matching", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_email_conversations_workspace_id", unique: false, method: "btree" })
)

let email_message_recipients = Table.make("email_message_recipients", {
  email_message_id: Column.uuid(),
  email: Column.varchar(320),
  type: Column.varchar(32)
}).pipe(
  Table.primaryKey({ columns: ["email_message_id", "email"] as const, name: "pk_email_message_recipients", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "email", order: "asc", nulls: "last" }] as const, name: "ix_email_message_recipients_email", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "email_message_id", order: "asc", nulls: "last" }] as const, name: "ix_email_message_recipients_email_message_id", unique: false, method: "btree" })
)

let email_messages = Table.make("email_messages", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  header_message_id: Column.varchar(998),
  conversation_id: Column.uuid(),
  sender_email: Column.varchar(320),
  subject: Column.text(),
  snippet: Column.text(),
  html: Column.text(),
  text: Column.text(),
  has_attachments: Column.boolean(),
  sent_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  sentiment: Column.int().pipe(Column.nullable),
  urgency: Column.int().pipe(Column.nullable),
  summary: Column.text().pipe(Column.nullable),
  viewed_by: Column.varchar(320).pipe(Column.nullable),
  events: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  graph: Column.jsonb(Schema.Unknown).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_email_messages", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["header_message_id"] as const, name: "uq_email_messages_header_message_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "conversation_id", order: "asc", nulls: "last" }] as const, name: "ix_email_messages_conversation_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "conversation_id", order: "asc", nulls: "last" }, { column: "sent_at", order: "desc", nulls: "first" }] as const, name: "ix_email_messages_conversation_id_sent_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "conversation_id", order: "asc", nulls: "last" }, { column: "viewed_by", order: "asc", nulls: "last" }, { column: "sent_at", order: "desc", nulls: "first" }] as const, name: "ix_email_messages_conversation_id_viewed_by_sent_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "id", order: "asc", nulls: "last" }] as const, name: "ix_email_messages_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "sender_email", order: "asc", nulls: "last" }] as const, name: "ix_email_messages_sender_email", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "sent_at", order: "asc", nulls: "last" }] as const, name: "ix_email_messages_sent_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "header_message_id", order: "asc", nulls: "last" }] as const, name: "ix_header_message_id_hash", unique: false, method: "hash" })
)

let file_upload_request_templates = Table.make("file_upload_request_templates", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  name: Column.text(),
  department: Column.varchar(64).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("BOOKKEEPING"), Pg.Query.type.varchar()))),
  type: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("STATEMENT"), Pg.Query.type.varchar()))),
  description: Column.text(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  created_by: Column.varchar(320),
  years: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  months: Column.jsonb(Schema.Unknown).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_file_upload_request_templates", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["name"] as const, name: "uq_file_upload_request_templates_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false })
)

let file_upload_requests = Table.make("file_upload_requests", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  name: Column.text(),
  type: Column.varchar(32),
  account_id: Column.uuid().pipe(Column.nullable),
  description: Column.text().pipe(Column.nullable),
  status: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("OPEN"), Pg.Query.type.varchar()))),
  created_by: Column.varchar(320),
  department: Column.varchar(64).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("BOOKKEEPING"), Pg.Query.type.varchar()))),
  template_id: Column.uuid().pipe(Column.nullable),
  years: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  months: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  questionnaire_item_rule_id: Column.uuid().pipe(Column.nullable),
  questionnaire_item_id: Column.uuid().pipe(Column.nullable),
  questionnaire_assignment_id: Column.uuid().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_file_upload_requests", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "id"] as const, name: "uq_file_upload_requests_company_id_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "name"] as const, name: "uq_file_upload_requests_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "file_upload_requests_company_id_index", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "questionnaire_item_id", order: "asc", nulls: "last" }] as const, name: "ix_file_upload_requests_questionnaire_item_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "questionnaire_item_rule_id", order: "asc", nulls: "last" }] as const, name: "ix_file_upload_requests_questionnaire_item_rule_id", unique: false, method: "btree" })
)

let files = Table.make("files", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  bank_account_id: Column.uuid().pipe(Column.nullable),
  company_id: Column.uuid(),
  name: Column.text(),
  start_date: Column.date().pipe(Column.nullable),
  end_date: Column.date().pipe(Column.nullable),
  key: Column.text(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  uploaded_by: Column.varchar(320).pipe(Column.nullable),
  ocrolus_status: Column.text().pipe(Column.nullable),
  uploaded_at: Column.timestamp().pipe(Column.nullable),
  error_message: Column.text().pipe(Column.nullable),
  description: Column.text().pipe(Column.nullable),
  account_id: Column.uuid().pipe(Column.nullable),
  type: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("STATEMENT"), Pg.Query.type.varchar()))),
  file_upload_request_id: Column.uuid().pipe(Column.nullable),
  department: Column.varchar(64).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("BOOKKEEPING"), Pg.Query.type.varchar()))),
  added_to_tax_server: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  payee_id: Column.uuid().pipe(Column.nullable),
  book_pk: Column.int().pipe(Column.nullable),
  document_pk: Column.int().pipe(Column.nullable),
  ai_metadata: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  year: Column.int().pipe(Column.nullable),
  project_id: Column.uuid().pipe(Column.nullable),
  internal_only: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  plaid_statement_id: Column.varchar(64).pipe(Column.nullable),
  file_data: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  extraction_verified_at: Column.timestamp().pipe(Column.nullable),
  extraction_verified_by: Column.text().pipe(Column.nullable),
  file_size: Column.int8().pipe(Column.nullable)
}).pipe(
  Table.check("ck_files_account_id_bank_account_id", Pg.Query.or(Pg.Query.isNull(Pg.Query.column("bank_account_id", Pg.Query.type.uuid(), true)), Pg.Query.isNull(Pg.Query.column("account_id", Pg.Query.type.uuid(), true)))),
  Table.check("ck_files_ck_files_type_bank_account_id", Pg.Query.or(Pg.Query.eq(Pg.Query.cast(Pg.Query.column("type", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("STATEMENT"), Pg.Query.type.text())), Pg.Query.isNull(Pg.Query.column("bank_account_id", Pg.Query.type.uuid(), true)))),
  Table.check("ck_files_start_date_end_date", Pg.Query.lte(Pg.Query.column("start_date", Pg.Query.type.date(), true), Pg.Query.column("end_date", Pg.Query.type.date(), true))),
  Table.primaryKey({ columns: ["id"] as const, name: "pk_statements", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["account_id", "id"] as const, name: "uq_files_account_id_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["account_id", "name"] as const, name: "uq_files_account_id_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["document_pk"] as const, name: "uq_files_document_pk", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["key"] as const, name: "uq_files_key", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["bank_account_id", "id"] as const, name: "uq_statements_bank_account_id_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["bank_account_id", "name"] as const, name: "uq_statements_bank_account_id_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "files_company_id_index", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }, { column: "start_date", order: "asc", nulls: "last" }, { column: "end_date", order: "asc", nulls: "last" }] as const, name: "idx_files_bank_account_start", unique: false, method: "btree", predicate: Pg.Query.eq(Pg.Query.cast(Pg.Query.column("type", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("STATEMENT"), Pg.Query.type.text())) }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }] as const, name: "idx_files_bank_account_verifying", unique: false, method: "btree", predicate: Pg.Query.eq(Pg.Query.column("ocrolus_status", Pg.Query.type.text(), true), Pg.Query.cast(Pg.Query.literal("VERIFYING"), Pg.Query.type.text())) }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "uploaded_at", order: "asc", nulls: "last" }] as const, name: "idx_files_company_uploaded", unique: false, method: "btree", predicate: Pg.Query.isNotNull(Pg.Query.column("uploaded_at", Pg.Query.type.timestamp(), true)) }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }, { column: "start_date", order: "asc", nulls: "last" }] as const, name: "ix_files_bank_account_start", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "book_pk", order: "asc", nulls: "last" }] as const, name: "ix_files_book_pk", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "id", order: "asc", nulls: "last" }] as const, name: "ix_files_id_covering", unique: false, method: "btree", include: ["start_date", "ocrolus_status"] as const }),
  Table.index({ keys: [{ column: "plaid_statement_id", order: "asc", nulls: "last" }] as const, name: "ix_files_plaid_statement_id", unique: false, method: "btree" })
)

let fixed_assets = Table.make("fixed_assets", {
  id: Column.uuid(),
  company_id: Column.uuid(),
  name: Column.varchar(64),
  asset_account_id: Column.uuid(),
  accumulated_account_id: Column.uuid(),
  expense_account_id: Column.uuid()
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_fixed_assets", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "name"] as const, name: "uq_fixed_assets_company_id_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "accumulated_account_id", order: "asc", nulls: "last" }] as const, name: "ix_fixed_assets_accumulated_account_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "asset_account_id", order: "asc", nulls: "last" }] as const, name: "ix_fixed_assets_asset_account_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_fixed_assets_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "expense_account_id", order: "asc", nulls: "last" }] as const, name: "ix_fixed_assets_expense_account_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "name", order: "asc", nulls: "last" }] as const, name: "ix_fixed_assets_name", unique: false, method: "btree" })
)

const gmail_cursors = Table.make("gmail_cursors", {
  account_email: Column.varchar(320),
  latest_history_id: Column.int()
}).pipe(
  Table.primaryKey({ columns: ["account_email"] as const, name: "pk_gmail_cursors", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "account_email", order: "asc", nulls: "last" }] as const, name: "ix_gmail_cursors_account_email", unique: false, method: "btree" })
)

let gmail_message_refs = Table.make("gmail_message_refs", {
  id: Column.varchar(36),
  inbox_owner: Column.varchar(320),
  thread_id: Column.varchar(36),
  meta: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  deleted: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  email_message_id: Column.uuid().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id", "inbox_owner"] as const, name: "pk_gmail_message_refs", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "email_message_id", order: "asc", nulls: "last" }] as const, name: "ix_gmail_message_refs_email_message_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "id", order: "asc", nulls: "last" }] as const, name: "ix_gmail_message_refs_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "thread_id", order: "asc", nulls: "last" }] as const, name: "ix_gmail_message_refs_thread_id", unique: false, method: "btree" })
)

let hand_off_projects = Table.make("hand_off_projects", {
  hand_off_id: Column.uuid(),
  project_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["hand_off_id", "project_id"] as const, name: "pk_hand_off_projects", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "hand_off_id", order: "asc", nulls: "last" }] as const, name: "ix_hand_off_projects_hand_off_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "project_id", order: "asc", nulls: "last" }] as const, name: "ix_hand_off_projects_project_id", unique: false, method: "btree" })
)

let hand_off_statuses = Table.make("hand_off_statuses", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  hand_off_id: Column.uuid(),
  status: Column.varchar(32),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_hand_off_statuses", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_hand_off_statuses_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "hand_off_id", order: "asc", nulls: "last" }] as const, name: "ix_hand_off_statuses_hand_off_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "hand_off_id", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_hand_off_statuses_hand_off_id_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "status", order: "asc", nulls: "last" }] as const, name: "ix_hand_off_statuses_status", unique: false, method: "btree" })
)

let hand_offs = Table.make("hand_offs", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  from_team: Column.varchar(32),
  to_team: Column.varchar(32),
  reviewer_id: Column.uuid().pipe(Column.nullable),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_hand_offs", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_hand_offs_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_hand_offs_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "reviewer_id", order: "asc", nulls: "last" }] as const, name: "ix_hand_offs_reviewer_id", unique: false, method: "btree" })
)

let ignored_transactions = Table.make("ignored_transactions", {
  transaction_id: Column.uuid(),
  statement_id: Column.uuid(),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["transaction_id"] as const, name: "pk_ignored_transactions", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_ignored_transactions_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "statement_id", order: "asc", nulls: "last" }] as const, name: "ix_ignored_transactions_statement_id", unique: false, method: "btree" })
)

let issues = Table.make("issues", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  check_name: Column.varchar(128),
  name: Column.varchar(64),
  meta: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  owner_type: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("BOOKKEEPER"), Pg.Query.type.varchar()))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  closed_at: Column.timestamp().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_issues", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_issues_company_id", unique: false, method: "btree" })
)

const jobs = Table.make("jobs", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  name: Column.varchar(64),
  company_id: Column.uuid(),
  status: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("RUNNING"), Pg.Query.type.varchar()))),
  meta: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_jobs", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_jobs_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "name", order: "asc", nulls: "last" }] as const, name: "ix_jobs_company_id_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "name", order: "asc", nulls: "last" }, { column: "created_at", order: "desc", nulls: "first" }] as const, name: "ix_jobs_company_name_created_item", unique: false, method: "btree", predicate: Pg.Query.eq(Pg.Query.cast(Pg.Query.column("name", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("SYNC_QBO_ITEM"), Pg.Query.type.text())) }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "name", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }, { column: "created_at", order: "desc", nulls: "first" }] as const, name: "ix_jobs_company_name_status_created_closed", unique: false, method: "btree", predicate: Pg.Query.and(Pg.Query.eq(Pg.Query.cast(Pg.Query.column("name", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("SYNC_QBO_CLOSED_DATE"), Pg.Query.type.text())), Pg.Query.eq(Pg.Query.cast(Pg.Query.column("status", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("SUCCEEDED"), Pg.Query.type.text()))) }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "name", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }, { column: "created_at", order: "desc", nulls: "first" }] as const, name: "ix_jobs_company_name_status_created_item_succeeded", unique: false, method: "btree", predicate: Pg.Query.and(Pg.Query.eq(Pg.Query.cast(Pg.Query.column("name", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("SYNC_QBO_ITEM"), Pg.Query.type.text())), Pg.Query.eq(Pg.Query.cast(Pg.Query.column("status", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("SUCCEEDED"), Pg.Query.type.text()))) }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "name", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }, { column: "created_at", order: "desc", nulls: "first" }] as const, name: "ix_jobs_company_name_status_created_reconciled", unique: false, method: "btree", predicate: Pg.Query.and(Pg.Query.eq(Pg.Query.cast(Pg.Query.column("name", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("SYNC_QBO_TRANSACTIONS_RECONCILED"), Pg.Query.type.text())), Pg.Query.eq(Pg.Query.cast(Pg.Query.column("status", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("SUCCEEDED"), Pg.Query.type.text()))) }),
  Table.index({ keys: [{ column: "id", order: "asc", nulls: "last" }] as const, name: "ix_jobs_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "name", order: "asc", nulls: "last" }] as const, name: "ix_jobs_name", unique: false, method: "btree" })
)

let journal_connection_events = Table.make("journal_connection_events", {
  id: Column.uuid(),
  connection_id: Column.uuid().pipe(Column.nullable),
  journal_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  source: Column.varchar(64),
  source_id: Column.varchar(64).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_journal_connection_events", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "connection_id", order: "asc", nulls: "last" }] as const, name: "ix_journal_connection_events_connection_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }] as const, name: "ix_journal_connection_events_journal_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }] as const, name: "ix_journal_connection_events_journal_id_covering", unique: false, method: "btree", include: ["connection_id"] as const }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_journal_connections_journal_id_source", unique: false, method: "btree" })
)

let linqs = Table.make("linqs", {
  uuid: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  source_uuid: Column.uuid(),
  target_uuid: Column.uuid(),
  start_date: Column.date().pipe(Column.nullable),
  end_date: Column.date().pipe(Column.nullable),
  status: Column.text(),
  created_at: Column.timestamp(),
  updated_at: Column.timestamp()
}).pipe(
  Table.unique({ columns: ["source_uuid", "target_uuid", "status"] as const, name: "linqs_source_uuid_target_uuid_status", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.primaryKey({ columns: ["uuid"] as const, name: "pk_linqs", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_linqs_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "end_date", order: "asc", nulls: "last" }] as const, name: "ix_linqs_end_date", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "start_date", order: "asc", nulls: "last" }] as const, name: "ix_linqs_start_date", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "status", order: "asc", nulls: "last" }] as const, name: "ix_linqs_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "updated_at", order: "asc", nulls: "last" }] as const, name: "ix_linqs_updated_at", unique: false, method: "btree" })
)

let linqs_versions = Table.make("linqs_versions", {
  uuid: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  linq_uuid: Column.uuid(),
  permissions: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  created_at: Column.timestamp(),
  updated_at: Column.timestamp()
}).pipe(
  Table.primaryKey({ columns: ["uuid"] as const, name: "pk_linqs_versions", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_linqs_versions_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "updated_at", order: "asc", nulls: "last" }] as const, name: "ix_linqs_versions_updated_at", unique: false, method: "btree" })
)

let meeting_turns = Table.make("meeting_turns", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  meeting_id: Column.uuid(),
  speaker_display_name: Column.varchar(256),
  speaker_calendar_invited_email: Column.varchar(320).pipe(Column.nullable),
  text: Column.text(),
  timestamp: Column.varchar(16),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_meeting_turns", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "meeting_id", order: "asc", nulls: "last" }] as const, name: "ix_meeting_turns_meeting_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "speaker_calendar_invited_email", order: "asc", nulls: "last" }] as const, name: "ix_meeting_turns_speaker_calendar_invited_email", unique: false, method: "btree" })
)

let meetings = Table.make("meetings", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  recording_id: Column.int(),
  generated_title: Column.varchar(512),
  meeting_title: Column.varchar(512).pipe(Column.nullable),
  url: Column.text().pipe(Column.nullable),
  share_url: Column.text().pipe(Column.nullable),
  scheduled_start_time: Column.timestamp().pipe(Column.nullable),
  scheduled_end_time: Column.timestamp().pipe(Column.nullable),
  recording_start_time: Column.timestamp().pipe(Column.nullable),
  recording_end_time: Column.timestamp().pipe(Column.nullable),
  participants: Column.jsonb(Schema.Unknown),
  recorded_by: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  transcript_language: Column.varchar(8).pipe(Column.nullable),
  summary: Column.text().pipe(Column.nullable),
  summary_template_name: Column.varchar(64).pipe(Column.nullable),
  workspace_id: Column.uuid().pipe(Column.nullable),
  purpose: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_meetings", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "id", order: "asc", nulls: "last" }] as const, name: "ix_meetings_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "purpose", order: "asc", nulls: "last" }] as const, name: "ix_meetings_purpose", unique: false, method: "gin" }),
  Table.index({ keys: [{ column: "recording_id", order: "asc", nulls: "last" }] as const, name: "ix_meetings_recording_id", unique: true, method: "btree" }),
  Table.index({ keys: [{ column: "recording_start_time", order: "asc", nulls: "last" }] as const, name: "ix_meetings_recording_start_time", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_meetings_workspace_id", unique: false, method: "btree" })
)

let merchant_payees = Table.make("merchant_payees", {
  merchant: Column.varchar(128),
  company_id: Column.uuid(),
  payee_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  created_by: Column.varchar(320)
}).pipe(
  Table.primaryKey({ columns: ["merchant", "company_id"] as const, name: "pk_merchant_payees", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_merchant_payees_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_merchant_payees_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "merchant", order: "asc", nulls: "last" }] as const, name: "ix_merchant_payees_merchant", unique: false, method: "btree" })
)

let notification_views = Table.make("notification_views", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  notification_id: Column.uuid(),
  user_id: Column.uuid().pipe(Column.nullable),
  bookkeeper_id: Column.uuid().pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.check("ck_notification_views_ck_notification_views_id_not_null", Pg.Query.neq(Pg.Query.isNull(Pg.Query.column("user_id", Pg.Query.type.uuid(), true)), Pg.Query.isNull(Pg.Query.column("bookkeeper_id", Pg.Query.type.uuid(), true)))),
  Table.primaryKey({ columns: ["id"] as const, name: "pk_notification_views", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["notification_id", "user_id", "bookkeeper_id"] as const, name: "uq_notification_views", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bookkeeper_id", order: "asc", nulls: "last" }] as const, name: "ix_notification_views_bookkeeper_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "notification_id", order: "asc", nulls: "last" }] as const, name: "ix_notification_views_notification_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "notification_id", order: "asc", nulls: "last" }, { column: "bookkeeper_id", order: "asc", nulls: "last" }] as const, name: "ix_notification_views_notification_id_bookkeeper_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "notification_id", order: "asc", nulls: "last" }, { column: "user_id", order: "asc", nulls: "last" }] as const, name: "ix_notification_views_notification_id_user_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "user_id", order: "asc", nulls: "last" }] as const, name: "ix_notification_views_user_id", unique: false, method: "btree" })
)

let notifications = Table.make("notifications", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  entity_id: Column.uuid(),
  type: Column.varchar(32),
  source_id: Column.varchar(320),
  source_type: Column.varchar(32),
  send_after: Column.timestamp().pipe(Column.nullable),
  sent_at: Column.timestamp().pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_notifications", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_notifications_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "entity_id", order: "asc", nulls: "last" }] as const, name: "ix_notifications_company_id_entity_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "entity_id", order: "asc", nulls: "last" }] as const, name: "ix_notifications_entity_id", unique: false, method: "btree" })
)

const ocrolus_books = Table.make("ocrolus_books", {
  pk: Column.int(),
  uuid: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  company_id: Column.uuid()
}).pipe(
  Table.primaryKey({ columns: ["pk"] as const, name: "pk_ocrolus_books_pk", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_ocrolus_books_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "uuid", order: "asc", nulls: "last" }] as const, name: "ix_ocrolus_books_uuid", unique: true, method: "btree" })
)

let ocrolus_uploads = Table.make("ocrolus_uploads", {
  pk: Column.int().pipe(Column.default(Pg.Function.nextVal(Pg.Query.cast(Pg.Query.literal("ocrolus_uploads_pk_seq"), Pg.Query.type.regclass())))),
  uuid: Column.uuid(),
  name: Column.text(),
  status: Column.varchar(16),
  book_id: Column.int(),
  hash: Column.varchar(40),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["pk"] as const, name: "pk_ocrolus_uploads", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["book_id", "hash"] as const, name: "uq_ocrolus_uploads_book_id_hash", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["uuid"] as const, name: "uq_ocrolus_uploads_uuid", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "book_id", order: "asc", nulls: "last" }] as const, name: "ix_ocrolus_uploads_book_id", unique: false, method: "btree" })
)

const parent_categories = Table.make("parent_categories", {
  number: Column.int(),
  subtype: Column.varchar(64),
  name: Column.varchar(64),
  description: Column.varchar(128).pipe(Column.nullable),
  type: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "type",
  variant: "enum"
}).pipe(Column.ddlType("type"))
}).pipe(
  Table.check("ck_parent_categories_lower", Pg.Query.gte(Pg.Query.column("number", Pg.Query.type.int4()), Pg.Query.literal(1000))),
  Table.check("ck_parent_categories_upper", Pg.Query.lte(Pg.Query.column("number", Pg.Query.type.int4()), Pg.Query.literal(9999))),
  Table.primaryKey({ columns: ["number"] as const, name: "pk_parent_categories", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["name", "subtype"] as const, name: "uq_parent_categories_name_subtype", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "number", order: "asc", nulls: "last" }] as const, name: "ix_parent_categories_number_covering", unique: false, method: "btree", include: ["type", "subtype", "name"] as const }),
  Table.index({ keys: [{ column: "subtype", order: "asc", nulls: "last" }] as const, name: "ix_parent_categories_subtype", unique: false, method: "btree" })
)

let payee_balance_reviews = Table.make("payee_balance_reviews", {
  payee_id: Column.uuid(),
  year: Column.int(),
  status: Column.varchar(32),
  error_reason: Column.text().pipe(Column.nullable),
  reviewed_by_user_id: Column.uuid(),
  amount_1099: Column.int8(),
  amount_total: Column.int8(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["payee_id", "year"] as const, name: "pk_payee_balance_reviews", deferrable: false, initiallyDeferred: false })
)

let payees = Table.make("payees", {
  id: Column.uuid(),
  company_id: Column.uuid(),
  name: Column.varchar(128),
  address_line_1: Column.text().pipe(Column.nullable),
  address_line_2: Column.text().pipe(Column.nullable),
  city: Column.varchar(64).pipe(Column.nullable),
  state: Column.varchar(2).pipe(Column.nullable),
  zip: Column.varchar(10).pipe(Column.nullable),
  country: Column.varchar(2).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("US"), Pg.Query.type.varchar()))),
  phone_number: Column.varchar(10).pipe(Column.nullable),
  contact_person: Column.varchar(64).pipe(Column.nullable),
  email: Column.varchar(64).pipe(Column.nullable),
  tax_id_type: Column.varchar(4).pipe(Column.nullable),
  tax_id: Column.varchar(9).pipe(Column.nullable),
  entity_type: Column.varchar(64).pipe(Column.nullable),
  status: Column.text(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  w9_unavailable: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  needs_1099: Column.boolean().pipe(Column.nullable),
  canonical_id: Column.uuid().pipe(Column.nullable),
  address_verification_status: Column.varchar(64).pipe(Column.nullable),
  tax_id_verification_status: Column.varchar(64).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_uplinq_payees", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "name"] as const, name: "uq_payees_company_id_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "canonical_id", order: "asc", nulls: "last" }] as const, name: "ix_payees_canonical_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_payees_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "name", order: "asc", nulls: "last" }] as const, name: "ix_payees_name", unique: false, method: "btree" })
)

let payees_refs_qbo_vendor = Table.make("payees_refs_qbo_vendor", {
  qbo_item_id: Column.int8(),
  qbo_vendor_id: Column.varchar(),
  payee_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  meta: Column.jsonb(Schema.Unknown)
}).pipe(
  Table.primaryKey({ columns: ["qbo_item_id", "qbo_vendor_id"] as const, name: "pk_payees_refs_qbo_vendor", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["payee_id"] as const, name: "uq_payees_refs_qbo_vendor_payee_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false })
)

let plaid_enrich_meta = Table.make("plaid_enrich_meta", {
  bank_transaction_id: Column.uuid(),
  meta: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["bank_transaction_id"] as const, name: "pk_plaid_enrich_meta", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bank_transaction_id", order: "asc", nulls: "last" }] as const, name: "ix_plaid_enrich_meta_bank_transaction_id", unique: false, method: "btree" })
)

let product_children = Table.make("product_children", {
  parent_product_name: Column.varchar(64),
  child_product_name: Column.varchar(64),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  default_include: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}).pipe(
  Table.primaryKey({ columns: ["parent_product_name", "child_product_name"] as const, name: "pk_product_children", deferrable: false, initiallyDeferred: false })
)

const products = Table.make("products", {
  name: Column.varchar(64),
  description: Column.varchar(),
  stripe_product_id: Column.varchar(64).pipe(Column.nullable),
  status: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("ACTIVE"), Pg.Query.type.varchar()))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  type: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("ONGOING"), Pg.Query.type.varchar()))),
  requires_quantity: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  base_price: Column.int().pipe(Column.nullable),
  hubspot_ongoing_product_id: Column.varchar(32).pipe(Column.nullable),
  hubspot_historical_product_id: Column.varchar(32).pipe(Column.nullable),
  deadline: Column.date().pipe(Column.nullable),
  extended_deadline: Column.date().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["name"] as const, name: "pk_products", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["stripe_product_id"] as const, name: "uq_products_stripe_product_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "description", order: "asc", nulls: "last" }] as const, name: "ix_products_description", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "hubspot_historical_product_id", order: "asc", nulls: "last" }] as const, name: "ix_products_hubspot_historical_product_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "hubspot_ongoing_product_id", order: "asc", nulls: "last" }] as const, name: "ix_products_hubspot_ongoing_product_id", unique: false, method: "btree" })
)

let project_custom_column_events = Table.make("project_custom_column_events", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  project_id: Column.uuid(),
  column_id: Column.uuid(),
  old_value: Column.jsonb(Schema.Unknown),
  new_value: Column.jsonb(Schema.Unknown),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_project_custom_column_events", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "column_id", order: "asc", nulls: "last" }] as const, name: "ix_project_custom_column_events_column_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_project_custom_column_events_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "project_id", order: "asc", nulls: "last" }] as const, name: "ix_project_custom_column_events_project_id", unique: false, method: "btree" })
)

let project_events = Table.make("project_events", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  project_id: Column.uuid(),
  bookkeeper_created_by: Column.uuid().pipe(Column.nullable),
  user_created_by: Column.uuid().pipe(Column.nullable),
  old_data: Column.jsonb(Schema.Unknown),
  new_data: Column.jsonb(Schema.Unknown),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_project_events", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bookkeeper_created_by", order: "asc", nulls: "last" }] as const, name: "ix_project_events_bookkeeper_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_project_events_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "project_id", order: "asc", nulls: "last" }] as const, name: "ix_project_events_project_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "user_created_by", order: "asc", nulls: "last" }] as const, name: "ix_project_events_user_created_by", unique: false, method: "btree" })
)

let project_grid_columns = Table.make("project_grid_columns", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  name: Column.varchar(128),
  tag: Column.varchar(128).pipe(Column.nullable),
  type: Column.varchar(32),
  definition: Column.text().pipe(Column.nullable),
  description: Column.text().pipe(Column.nullable),
  possible_values: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  default_value: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  is_locked: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  relevant_product_names: Column.jsonb(Schema.Unknown).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_project_grid_columns", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["name"] as const, name: "uq_project_grid_columns_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_project_grid_columns_created_by", unique: false, method: "btree" })
)

let project_grid_view_columns = Table.make("project_grid_view_columns", {
  sequence: Column.int(),
  view_id: Column.uuid(),
  column_id: Column.uuid().pipe(Column.nullable),
  filter: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  sort: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  pin: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  size: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  hide: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  company_grid_column_id: Column.uuid().pipe(Column.nullable)
}).pipe(
  Table.check("ck_project_grid_view_columns_ck_column_id_or_company_gr_e2b3", Pg.Query.or(Pg.Query.isNotNull(Pg.Query.column("column_id", Pg.Query.type.uuid(), true)), Pg.Query.isNotNull(Pg.Query.column("company_grid_column_id", Pg.Query.type.uuid(), true)))),
  Table.check("ck_project_grid_view_columns_ck_column_id_or_company_gr_ec97", Pg.Query.or(Pg.Query.isNull(Pg.Query.column("column_id", Pg.Query.type.uuid(), true)), Pg.Query.isNull(Pg.Query.column("company_grid_column_id", Pg.Query.type.uuid(), true)))),
  Table.primaryKey({ columns: ["sequence", "view_id"] as const, name: "pk_project_grid_view_columns", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "column_id", order: "asc", nulls: "last" }] as const, name: "ix_project_grid_view_columns_column_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_grid_column_id", order: "asc", nulls: "last" }] as const, name: "ix_project_grid_view_columns_company_grid_column_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "sequence", order: "asc", nulls: "last" }] as const, name: "ix_project_grid_view_columns_sequence", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "view_id", order: "asc", nulls: "last" }] as const, name: "ix_project_grid_view_columns_view_id", unique: false, method: "btree" })
)

let project_grid_view_favorites = Table.make("project_grid_view_favorites", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  view_id: Column.uuid(),
  bookkeeper_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_project_grid_view_favorites", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bookkeeper_id", order: "asc", nulls: "last" }] as const, name: "ix_project_grid_view_favorites_bookkeeper_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "view_id", order: "asc", nulls: "last" }] as const, name: "ix_project_grid_view_favorites_view_id", unique: false, method: "btree" })
)

let project_grid_view_managers = Table.make("project_grid_view_managers", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  view_id: Column.uuid(),
  bookkeeper_id: Column.uuid(),
  created_by: Column.uuid(),
  created_at: Column.timestamptz().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_project_grid_view_managers", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["view_id", "bookkeeper_id"] as const, name: "uq_project_grid_view_managers_view_id_bookkeeper_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bookkeeper_id", order: "asc", nulls: "last" }] as const, name: "ix_project_grid_view_managers_bookkeeper_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "view_id", order: "asc", nulls: "last" }] as const, name: "ix_project_grid_view_managers_view_id", unique: false, method: "btree" })
)

let project_grid_views = Table.make("project_grid_views", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  name: Column.varchar(128),
  tag: Column.varchar(128).pipe(Column.nullable),
  team: Column.varchar(32).pipe(Column.nullable),
  is_public: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  is_locked: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  filters: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  row_group: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  order_by_group_count: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  expand_all_rows: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  last_opened_at: Column.timestamp().pipe(Column.nullable),
  last_opened_by: Column.uuid().pipe(Column.nullable),
  owner_id: Column.uuid().pipe(Column.nullable),
  manager_id: Column.uuid().pipe(Column.nullable),
  icon: Column.varchar(64).pipe(Column.nullable),
  icon_color: Column.varchar(16).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_project_grid_views", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_project_grid_views_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "manager_id", order: "asc", nulls: "last" }] as const, name: "ix_project_grid_views_manager_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "owner_id", order: "asc", nulls: "last" }] as const, name: "ix_project_grid_views_owner_id", unique: false, method: "btree" })
)

let project_statuses = Table.make("project_statuses", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  project_id: Column.uuid(),
  status: Column.varchar(64),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  project_type: Column.varchar(32)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_project_statuses", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_project_statuses_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_project_statuses_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "project_id", order: "asc", nulls: "last" }] as const, name: "ix_project_statuses_project_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "project_id", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_project_statuses_project_id_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "project_id", order: "asc", nulls: "last" }, { column: "project_type", order: "asc", nulls: "last" }] as const, name: "ix_project_statuses_project_id_project_type", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "status", order: "asc", nulls: "last" }] as const, name: "ix_project_statuses_status", unique: false, method: "btree" })
)

let projects = Table.make("projects", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  proposal_product_id: Column.uuid().pipe(Column.nullable),
  team: Column.varchar(32),
  name: Column.varchar(255),
  year: Column.int().pipe(Column.nullable),
  product_name: Column.varchar(64),
  custom_columns: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  reviewer_id: Column.uuid().pipe(Column.nullable),
  type: Column.varchar(32),
  difficulty: Column.int().pipe(Column.nullable),
  meta: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  priority: Column.int(),
  due_date: Column.date().pipe(Column.nullable),
  calculated_due_date: Column.date().pipe(Column.nullable),
  tallyfor_binder_id: Column.uuid().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_projects", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "id"] as const, name: "uq_projects_company_id_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "name"] as const, name: "uq_projects_company_id_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["id", "type"] as const, name: "uq_projects_id_type", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["tallyfor_binder_id"] as const, name: "uq_projects_tallyfor_binder_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_projects_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_projects_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "name", order: "asc", nulls: "last" }] as const, name: "ix_projects_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "product_name", order: "asc", nulls: "last" }] as const, name: "ix_projects_product_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "reviewer_id", order: "asc", nulls: "last" }] as const, name: "ix_projects_reviewer_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "team", order: "asc", nulls: "last" }] as const, name: "ix_projects_team", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "year", order: "asc", nulls: "last" }] as const, name: "ix_projects_year", unique: false, method: "btree" })
)

let proposal_companies = Table.make("proposal_companies", {
  proposal_id: Column.uuid(),
  company_id: Column.uuid(),
  num_bank_accounts: Column.int(),
  notes: Column.text().pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  books_complete_up_to: Column.date().pipe(Column.nullable),
  taxes_complete_up_to: Column.date().pipe(Column.nullable),
  hidden: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  workspace_id: Column.uuid(),
  hubspot_deal_id: Column.varchar(32).pipe(Column.nullable),
  tax_services_excluded: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  schedule_c_excluded: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}).pipe(
  Table.primaryKey({ columns: ["proposal_id", "company_id"] as const, name: "pk_proposal_companies", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["hubspot_deal_id"] as const, name: "uq_proposal_companies_hubspot_deal_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "proposal_id", order: "asc", nulls: "last" }, { column: "hidden", order: "asc", nulls: "last" }] as const, name: "idx_proposal_companies_proposal_hidden", unique: false, method: "btree", include: ["company_id"] as const }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_proposal_companies_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_proposal_companies_workspace_id", unique: false, method: "btree" })
)

let proposal_contacts = Table.make("proposal_contacts", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  workspace_id: Column.uuid(),
  email: Column.varchar(320),
  first_name: Column.varchar(255),
  last_name: Column.varchar(255),
  is_primary: Column.boolean(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  phone_number: Column.varchar(15).pipe(Column.nullable),
  timezone: Column.varchar(64).pipe(Column.nullable),
  contact_method: Column.jsonb(Schema.Unknown).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_proposal_contacts", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["email"] as const, name: "uq_proposal_contacts_email", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_proposal_contacts_workspace_id", unique: false, method: "btree" })
)

let proposal_products = Table.make("proposal_products", {
  proposal_id: Column.uuid(),
  company_id: Column.uuid(),
  product_name: Column.varchar(64),
  status: Column.varchar(64),
  services_paused_on: Column.date().pipe(Column.nullable),
  services_canceled_on: Column.date().pipe(Column.nullable),
  billing_start_date: Column.date().pipe(Column.nullable),
  stripe: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  billing_included: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  services_start_date: Column.date(),
  services_end_date: Column.date().pipe(Column.nullable),
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  year: Column.int().pipe(Column.nullable),
  quantity: Column.int().pipe(Column.nullable),
  parent_id: Column.uuid().pipe(Column.nullable),
  auto_renews_on: Column.date().pipe(Column.nullable),
  notes: Column.text().pipe(Column.nullable),
  custom_product_name: Column.varchar(128).pipe(Column.nullable),
  auto_renew_billing: Column.boolean().pipe(Column.default(Pg.Query.literal(true))),
  hubspot_line_item_id: Column.varchar(32).pipe(Column.nullable),
  amount_paid: Column.int().pipe(Column.nullable),
  services_complete_up_to: Column.date().pipe(Column.nullable),
  canceled_by: Column.uuid().pipe(Column.nullable),
  canceled_at: Column.timestamp().pipe(Column.nullable)
}).pipe(
  Table.check("billing_included_or_stripe_not_null", Pg.Query.or(Pg.Query.and(Pg.Query.and(Pg.Query.isNotNull(Pg.Query.column("billing_included", Pg.Query.type.bool())), Pg.Query.eq(Pg.Query.column("billing_included", Pg.Query.type.bool()), Pg.Query.literal(true))), Pg.Query.isNull(Pg.Query.column("stripe", Pg.Query.type.jsonb(), true))), Pg.Query.and(Pg.Query.and(Pg.Query.isNotNull(Pg.Query.column("billing_included", Pg.Query.type.bool())), Pg.Query.eq(Pg.Query.column("billing_included", Pg.Query.type.bool()), Pg.Query.literal(false))), Pg.Query.isNotNull(Pg.Query.column("stripe", Pg.Query.type.jsonb(), true))))),
  Table.primaryKey({ columns: ["id"] as const, name: "pk_proposal_products", deferrable: false, initiallyDeferred: false }),
  Table.check("quantity_matches_stripe", Pg.Query.or(Pg.Query.isNull(Pg.Query.column("stripe", Pg.Query.type.jsonb(), true)), Pg.Query.eq(Pg.Query.cast(Pg.Query.cast(Pg.Function.json.text(Pg.Query.cast(Pg.Function.json.get(Pg.Query.column("stripe", Pg.Query.type.jsonb(), true), Pg.Function.json.key("line_item")), Pg.Query.type.text()), Pg.Function.json.key("quantity")), Pg.Query.type.text()), Pg.Query.type.int4()), Pg.Query.column("quantity", Pg.Query.type.int4(), true)))),
  Table.check("services_start_date_lte_services_end_date", Pg.Query.lte(Pg.Query.column("services_start_date", Pg.Query.type.date()), Pg.Query.column("services_end_date", Pg.Query.type.date(), true))),
  Table.check("stripe_unit_amount_gt_0", Pg.Query.or(Pg.Query.isNull(Pg.Query.column("stripe", Pg.Query.type.jsonb(), true)), Pg.Query.gte(Pg.Query.cast(Pg.Query.cast(Pg.Function.json.text(Pg.Query.cast(Pg.Function.json.get(Pg.Query.cast(Pg.Function.json.get(Pg.Query.column("stripe", Pg.Query.type.jsonb(), true), Pg.Function.json.key("line_item")), Pg.Query.type.text()), Pg.Function.json.key("price_data")), Pg.Query.type.text()), Pg.Function.json.key("unit_amount")), Pg.Query.type.text()), Pg.Query.type.numeric()), Pg.Query.cast(Pg.Query.literal(0), Pg.Query.type.numeric())))),
  Table.unique({ columns: ["proposal_id", "company_id", "product_name", "custom_product_name", "parent_id", "year"] as const, name: "uq_proposal_id_company_id_product_name_custom_parent_id_year", nullsNotDistinct: true, deferrable: false, initiallyDeferred: false }),
  Table.check("year_matches_services_start_date_or_end_date", Pg.Query.case().when(Pg.Query.isNull(Pg.Query.column("year", Pg.Query.type.int4(), true)), Pg.Query.literal(true)).when(Pg.Query.and(Pg.Query.isNotNull(Pg.Query.column("services_start_date", Pg.Query.type.date())), Pg.Query.neq(Pg.Function.call("extract", "year", Pg.Query.column("services_start_date", Pg.Query.type.date())), Pg.Query.cast(Pg.Query.column("year", Pg.Query.type.int4(), true), Pg.Query.type.numeric()))), Pg.Query.literal(false)).when(Pg.Query.and(Pg.Query.isNotNull(Pg.Query.column("services_end_date", Pg.Query.type.date(), true)), Pg.Query.neq(Pg.Function.call("extract", "year", Pg.Query.column("services_end_date", Pg.Query.type.date(), true)), Pg.Query.cast(Pg.Query.column("year", Pg.Query.type.int4(), true), Pg.Query.type.numeric()))), Pg.Query.literal(false)).else(Pg.Query.literal(true))),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "services_start_date", order: "asc", nulls: "last" }] as const, name: "idx_proposal_products_company_bookkeeping_start", unique: false, method: "btree", include: ["proposal_id"] as const, predicate: Pg.Query.eq(Pg.Query.cast(Pg.Query.column("product_name", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Function.call("any", Pg.Query.cast(Pg.Function.call("array", Pg.Query.cast(Pg.Query.literal("Bookkeeping"), Pg.Query.type.varchar()), Pg.Query.cast(Pg.Query.literal("Catch Up"), Pg.Query.type.varchar())), Pg.Query.type.array(Pg.Query.type.text())))) }),
  Table.index({ keys: [{ column: "proposal_id", order: "asc", nulls: "last" }, { column: "company_id", order: "asc", nulls: "last" }] as const, name: "idx_proposal_products_proposal_company", unique: false, method: "btree", include: ["product_name", "year", "stripe"] as const }),
  Table.index({ keys: [{ expression: Pg.Query.cast(Pg.Function.json.text(Pg.Query.cast(Pg.Function.json.get(Pg.Query.cast(Pg.Function.json.get(Pg.Query.column("stripe", Pg.Query.type.jsonb(), true), Pg.Function.json.key("line_item")), Pg.Query.type.text()), Pg.Function.json.key("price_data")), Pg.Query.type.text()), Pg.Function.json.key("product")), Pg.Query.type.text()), order: "asc", nulls: "last" }] as const, name: "idx_proposal_products_stripe_product_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_proposal_products_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "hubspot_line_item_id", order: "asc", nulls: "last" }] as const, name: "ix_proposal_products_hubspot_line_item_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "parent_id", order: "asc", nulls: "last" }] as const, name: "ix_proposal_products_parent_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "product_name", order: "asc", nulls: "last" }] as const, name: "ix_proposal_products_product_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "product_name", order: "asc", nulls: "last" }, { column: "company_id", order: "asc", nulls: "last" }, { column: "proposal_id", order: "asc", nulls: "last" }] as const, name: "ix_proposal_products_product_name_company", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "proposal_id", order: "asc", nulls: "last" }] as const, name: "ix_proposal_products_proposal_id", unique: false, method: "btree" })
)

let proposal_sent_events = Table.make("proposal_sent_events", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  proposal_id: Column.uuid(),
  contact_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  created_by: Column.uuid(),
  hash: Column.varchar(64)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_proposal_sent_events", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "contact_id", order: "asc", nulls: "last" }] as const, name: "ix_proposal_sent_events_contact_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_proposal_sent_events_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "proposal_id", order: "asc", nulls: "last" }] as const, name: "ix_proposal_sent_events_proposal_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "proposal_id", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_proposal_sent_events_proposal_id_created_at", unique: false, method: "btree" })
)

let proposal_signed_events = Table.make("proposal_signed_events", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  proposal_id: Column.uuid(),
  signatory_email: Column.varchar(320),
  signature: Column.text(),
  pdf_key: Column.varchar(255),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  signatory_first_name: Column.varchar(255),
  signatory_last_name: Column.varchar(255),
  signature_type: Column.varchar(64),
  hash: Column.varchar(64)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_proposal_signed_events", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["proposal_id", "signatory_email", "hash"] as const, name: "uq_proposal_signed_events_proposal_id_signatory_email_hash", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "proposal_id", order: "asc", nulls: "last" }] as const, name: "ix_proposal_signed_events_proposal_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "proposal_id", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_proposal_signed_events_proposal_id_created_at", unique: false, method: "btree" })
)

let proposals = Table.make("proposals", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  workspace_id: Column.uuid(),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  canceled_by: Column.uuid().pipe(Column.nullable),
  canceled_at: Column.timestamp().pipe(Column.nullable),
  deleted_by: Column.uuid().pipe(Column.nullable),
  deleted_at: Column.timestamp().pipe(Column.nullable),
  crm_airtable_id: Column.varchar(17).pipe(Column.nullable),
  qwilr_link: Column.varchar(255).pipe(Column.nullable),
  hubspot_proposal_id: Column.varchar(32).pipe(Column.nullable),
  is_editing: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_proposals_new", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["crm_airtable_id"] as const, name: "uq_proposals_airtable_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "idx_proposals_workspace_created", unique: false, method: "btree", predicate: Pg.Query.and(Pg.Query.isNull(Pg.Query.column("deleted_at", Pg.Query.type.timestamp(), true)), Pg.Query.isNull(Pg.Query.column("canceled_at", Pg.Query.type.timestamp(), true))) }),
  Table.index({ keys: [{ column: "canceled_by", order: "asc", nulls: "last" }] as const, name: "ix_proposals_canceled_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_proposals_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "deleted_by", order: "asc", nulls: "last" }] as const, name: "ix_proposals_deleted_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_proposals_new_workspace_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_proposals_workspace_id_created_at", unique: false, method: "btree" })
)

let qbo_bank_feed_accounts = Table.make("qbo_bank_feed_accounts", {
  qbo_item_id: Column.int8(),
  qbo_account_id: Column.varchar(64),
  bank_feed_connection_id: Column.uuid().pipe(Column.nullable),
  name: Column.varchar(64).pipe(Column.nullable),
  mask: Column.varchar(64).pipe(Column.nullable),
  account_type: Column.varchar(64).pipe(Column.nullable),
  status: Column.varchar(64).pipe(Column.nullable),
  account_category: Column.varchar(64).pipe(Column.nullable),
  unmatched_txn_count: Column.int().pipe(Column.nullable),
  num_txn_to_review: Column.int().pipe(Column.nullable),
  last_successful_transaction_time: Column.timestamp().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["qbo_item_id", "qbo_account_id"] as const, name: "pk_qbo_bank_feed_accounts", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bank_feed_connection_id", order: "asc", nulls: "last" }] as const, name: "ix_qbo_bank_feed_accounts_bank_feed_connection_id", unique: false, method: "btree" })
)

let qbo_bank_feed_connections = Table.make("qbo_bank_feed_connections", {
  id: Column.uuid(),
  qbo_item_id: Column.int8(),
  name: Column.varchar(64).pipe(Column.nullable),
  provider_type: Column.varchar(64).pipe(Column.nullable),
  authorization_method: Column.varchar(64).pipe(Column.nullable),
  last_successful_refresh_time: Column.timestamp().pipe(Column.nullable),
  status: Column.varchar(64).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_qbo_bank_feed_connections", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "qbo_item_id", order: "asc", nulls: "last" }] as const, name: "ix_qbo_bank_feed_connections_qbo_item_id", unique: false, method: "btree" })
)

let qbo_bridge_item_access_tokens = Table.make("qbo_bridge_item_access_tokens", {
  access_token: Column.varchar(1000),
  item_id: Column.int8(),
  refresh_token: Column.varchar(128),
  access_token_expires_at: Column.timestamp(),
  refresh_token_expires_at: Column.timestamp(),
  created_at: Column.timestamp()
}).pipe(
  Table.primaryKey({ columns: ["access_token"] as const, name: "pk_qbo_bridge_item_access_tokens", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "item_id", order: "asc", nulls: "last" }, { column: "access_token_expires_at", order: "asc", nulls: "last" }] as const, name: "ix_item_access_tokens_item_id_access_token_expires_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "item_id", order: "asc", nulls: "last" }] as const, name: "ix_qbo_bridge_item_access_tokens_item_id", unique: false, method: "btree" })
)

const qbo_bridge_items = Table.make("qbo_bridge_items", {
  id: Column.int8().pipe(Column.default(Pg.Function.nextVal(Pg.Query.cast(Pg.Query.literal("qbo_bridge_items_id_seq"), Pg.Query.type.regclass())))),
  company_id: Column.uuid(),
  name: Column.text(),
  status: Column.varchar(64).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("ACTIVE"), Pg.Query.type.varchar()))),
  redirect_uri: Column.text(),
  created_at: Column.timestamp(),
  updated_at: Column.timestamp(),
  last_webhook_at: Column.timestamp().pipe(Column.nullable),
  in_use: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_qbo_bridge_items_items", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_qbo_bridge_items_company_id", unique: false, method: "btree" })
)

let qbo_event_logs = Table.make("qbo_event_logs", {
  id: Column.int8().pipe(Column.default(Pg.Function.nextVal(Pg.Query.cast(Pg.Query.literal("qbo_event_logs_id_seq"), Pg.Query.type.regclass())))),
  company_id: Column.uuid(),
  qbo_item_id: Column.int8(),
  operation: Column.text(),
  entity: Column.text(),
  entity_id: Column.text(),
  received_at: Column.timestamp(),
  processed_at: Column.timestamp().pipe(Column.nullable),
  error: Column.text().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_qbo_event_logs", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_qbo_event_logs_company_id", unique: false, method: "btree" })
)

const qbo_items = Table.make("qbo_items", {
  id: Column.int8().pipe(Column.default(Pg.Function.nextVal(Pg.Query.cast(Pg.Query.literal("qbo_items_id_seq"), Pg.Query.type.regclass())))),
  company_id: Column.uuid(),
  name: Column.text(),
  initial_sync_done: Column.boolean(),
  sync_started: Column.timestamp().pipe(Column.nullable),
  sync_stage: Column.text().pipe(Column.nullable),
  sync_progress: Column.text().pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.currentDate())),
  last_synced_at: Column.timestamp().pipe(Column.nullable),
  bank_feed_sync_last_successful_at: Column.timestamp().pipe(Column.nullable),
  bank_feed_sync_last_failed_at: Column.timestamp().pipe(Column.nullable),
  bank_feed_connections_sync_initiated: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  bank_feed_vacuum_rules_enabled: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  bank_feed_non_vacuum_rules_enabled: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_qbo_items", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_qbo_items_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "name", order: "asc", nulls: "last" }] as const, name: "ix_qbo_items_name", unique: false, method: "btree" })
)

let qbo_linked_txns = Table.make("qbo_linked_txns", {
  qbo_item_id: Column.int8(),
  parent_qbo_id: Column.text(),
  child_qbo_id: Column.text(),
  created_at: Column.timestamptz().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["qbo_item_id", "parent_qbo_id", "child_qbo_id"] as const, name: "pk_qbo_linked_txns", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "qbo_item_id", order: "asc", nulls: "last" }, { column: "parent_qbo_id", order: "asc", nulls: "last" }] as const, name: "ix_qbo_linked_txns_parent", unique: false, method: "btree" })
)

let questionnaire_answers = Table.make("questionnaire_answers", {
  assignment_id: Column.uuid(),
  item_id: Column.uuid(),
  entry_index: Column.int().pipe(Column.default(Pg.Query.literal(0))),
  value: Column.jsonb(Schema.Unknown),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  notes: Column.text().pipe(Column.nullable),
  user_id: Column.uuid().pipe(Column.nullable),
  bookkeeper_id: Column.uuid().pipe(Column.nullable),
  autofill_status: Column.varchar(16).pipe(Column.nullable)
}).pipe(
  Table.check("ck_questionnaire_answers_ck_questionnaire_answers_autof_5c36", Pg.Query.eq(Pg.Query.cast(Pg.Query.column("autofill_status", Pg.Query.type.varchar(), true), Pg.Query.type.text()), Pg.Function.call("any", Pg.Query.cast(Pg.Function.call("array", Pg.Query.cast(Pg.Query.literal("unconfirmed"), Pg.Query.type.varchar()), Pg.Query.cast(Pg.Query.literal("confirmed"), Pg.Query.type.varchar())), Pg.Query.type.array(Pg.Query.type.text()))))),
  Table.primaryKey({ columns: ["id"] as const, name: "pk_company_questionnaire_answers", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["assignment_id", "item_id", "entry_index"] as const, name: "uq_questionnaire_answers_composite", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "assignment_id", order: "asc", nulls: "last" }] as const, name: "ix_questionnaire_answers_assignment_id", unique: false, method: "btree" })
)

let questionnaire_assignments = Table.make("questionnaire_assignments", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  version_id: Column.uuid(),
  assigned_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  assigned_by: Column.uuid(),
  status: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("OPEN"), Pg.Query.type.varchar()))),
  year: Column.int().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_company_questionnaire_assignments", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }] as const, name: "ix_company_questionnaire_assignments_company_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "status", order: "asc", nulls: "last" }] as const, name: "ix_company_questionnaire_assignments_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_questionnaire_assignments_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "version_id", order: "asc", nulls: "last" }] as const, name: "ix_questionnaire_assignments_version_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "version_id", order: "asc", nulls: "last" }, { expression: Pg.Function.coalesce(Pg.Query.column("year", Pg.Query.type.int4(), true), Pg.Query.literal(0)), order: "asc", nulls: "last" }] as const, name: "uq_questionnaire_assignments_company_version_year", unique: true, method: "btree" })
)

let questionnaire_item_file_request_rules = Table.make("questionnaire_item_file_request_rules", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  item_id: Column.uuid(),
  trigger_value: Column.text(),
  file_request_template_id: Column.uuid(),
  per_year: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_questionnaire_item_file_request_rules", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["item_id", "trigger_value", "file_request_template_id"] as const, name: "uq_questionnaire_item_fr_rules", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "item_id", order: "asc", nulls: "last" }] as const, name: "ix_questionnaire_item_fr_rules_item_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "file_request_template_id", order: "asc", nulls: "last" }] as const, name: "ix_questionnaire_item_fr_rules_template_id", unique: false, method: "btree" })
)

let questionnaire_template_items = Table.make("questionnaire_template_items", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  version_id: Column.uuid(),
  kind: Column.varchar(16),
  label: Column.text(),
  description: Column.text().pipe(Column.nullable),
  input_type: Column.varchar(32).pipe(Column.nullable),
  parent_id: Column.uuid().pipe(Column.nullable),
  options: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  position: Column.int(),
  stable_id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  autofill: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  conditions: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  file_request_template_id: Column.uuid().pipe(Column.nullable),
  per_year: Column.boolean().pipe(Column.default(Pg.Query.literal(false)))
}).pipe(
  Table.check("ck_questionnaire_template_items_ck_field_requires_parent", Pg.Query.or(Pg.Query.eq(Pg.Query.cast(Pg.Query.column("kind", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Function.call("any", Pg.Query.cast(Pg.Function.call("array", Pg.Query.cast(Pg.Query.literal("header"), Pg.Query.type.varchar()), Pg.Query.cast(Pg.Query.literal("group"), Pg.Query.type.varchar())), Pg.Query.type.array(Pg.Query.type.text())))), Pg.Query.isNotNull(Pg.Query.column("parent_id", Pg.Query.type.uuid(), true)))),
  Table.primaryKey({ columns: ["id"] as const, name: "pk_questionnaire_template_items", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "parent_id", order: "asc", nulls: "last" }] as const, name: "ix_questionnaire_template_items_parent_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "version_id", order: "asc", nulls: "last" }] as const, name: "ix_questionnaire_template_items_version_id", unique: false, method: "btree" })
)

let questionnaire_template_versions = Table.make("questionnaire_template_versions", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  template_id: Column.uuid(),
  version: Column.int(),
  status: Column.varchar(16).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("draft"), Pg.Query.type.varchar()))),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  published_by: Column.uuid().pipe(Column.nullable),
  published_at: Column.timestamp().pipe(Column.nullable),
  archived_by: Column.uuid().pipe(Column.nullable),
  archived_at: Column.timestamp().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_questionnaire_template_versions", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "template_id", order: "asc", nulls: "last" }] as const, name: "ix_questionnaire_template_versions_template_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "template_id", order: "asc", nulls: "last" }] as const, name: "uq_one_active_per_template", unique: true, method: "btree", predicate: Pg.Query.eq(Pg.Query.cast(Pg.Query.column("status", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("active"), Pg.Query.type.text())) }),
  Table.index({ keys: [{ column: "template_id", order: "asc", nulls: "last" }] as const, name: "uq_one_draft_per_template", unique: true, method: "btree", predicate: Pg.Query.eq(Pg.Query.cast(Pg.Query.column("status", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("draft"), Pg.Query.type.text())) }),
  Table.index({ keys: [{ column: "template_id", order: "asc", nulls: "last" }, { column: "version", order: "asc", nulls: "last" }] as const, name: "uq_questionnaire_template_versions_template_id_version", unique: true, method: "btree" })
)

let questionnaire_templates = Table.make("questionnaire_templates", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  name: Column.text(),
  description: Column.text().pipe(Column.nullable),
  created_by: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  year_required: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  icon: Column.text().pipe(Column.nullable),
  icon_color: Column.text().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_questionnaire_templates", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["name"] as const, name: "uq_questionnaire_templates_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false })
)

let quests = Table.make("quests", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  name: Column.varchar(128),
  description: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  owner_type: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("BOOKKEEPER"), Pg.Query.type.varchar()))),
  priority: Column.int2().pipe(Column.default(Pg.Query.cast(Pg.Query.literal("0"), Pg.Query.type.int2()))),
  data_start: Column.date().pipe(Column.nullable),
  data_end: Column.date().pipe(Column.nullable),
  frequency: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "questfrequency",
  variant: "enum"
}).pipe(Column.ddlType("questfrequency"), Column.nullable),
  blocks_close: Column.boolean().pipe(Column.default(Pg.Query.literal(true))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  closed_at: Column.timestamp().pipe(Column.nullable),
  effort: Column.int().pipe(Column.nullable),
  category: Column.varchar(64).pipe(Column.nullable),
  schedule_id: Column.uuid().pipe(Column.nullable),
  order: Column.int().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_quests", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_quests_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "owner_type", order: "asc", nulls: "last" }, { column: "order", order: "asc", nulls: "last" }] as const, name: "ix_quests_company_id_owner_type_order", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "data_end", order: "asc", nulls: "last" }] as const, name: "ix_quests_data_end", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "data_start", order: "asc", nulls: "last" }] as const, name: "ix_quests_data_start", unique: false, method: "btree" })
)

let quests_credentials = Table.make("quests_credentials", {
  quest_id: Column.uuid(),
  credential_id: Column.uuid()
}).pipe(
  Table.primaryKey({ columns: ["quest_id", "credential_id"] as const, name: "pk_quests_credentials", deferrable: false, initiallyDeferred: false })
)

let quests_file_upload_requests = Table.make("quests_file_upload_requests", {
  quest_id: Column.uuid(),
  file_upload_request_id: Column.uuid()
}).pipe(
  Table.primaryKey({ columns: ["quest_id", "file_upload_request_id"] as const, name: "pk_quests_file_upload_requests", deferrable: false, initiallyDeferred: false })
)

let quests_third_party_apps = Table.make("quests_third_party_apps", {
  quest_id: Column.uuid(),
  third_party_app_id: Column.uuid()
}).pipe(
  Table.primaryKey({ columns: ["quest_id", "third_party_app_id"] as const, name: "pk_quests_third_party_apps", deferrable: false, initiallyDeferred: false })
)

let reconciliations = Table.make("reconciliations", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  start_balance_id: Column.uuid(),
  end_balance_id: Column.uuid(),
  company_id: Column.uuid(),
  bank_account_id: Column.uuid(),
  created_by: Column.uuid().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_reconciliations", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }] as const, name: "ix_reconciliations_bank_account_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }] as const, name: "ix_reconciliations_bank_account_id_voided_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_reconciliations_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_reconciliations_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "end_balance_id", order: "asc", nulls: "last" }] as const, name: "ix_reconciliations_end_balance_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "start_balance_id", order: "asc", nulls: "last" }] as const, name: "ix_reconciliations_start_balance_id", unique: false, method: "btree" })
)

let sent_email_attachments = Table.make("sent_email_attachments", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  index: Column.int(),
  sent_email_id: Column.uuid(),
  name: Column.varchar(256),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "email_event_attachments_pkey", deferrable: false, initiallyDeferred: false })
)

let sent_email_deliveries = Table.make("sent_email_deliveries", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  sent_email_id: Column.uuid(),
  event: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
})

let sent_email_opens = Table.make("sent_email_opens", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  sent_email_id: Column.uuid(),
  event: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
})

const sent_emails = Table.make("sent_emails", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  recipient: Column.varchar(64),
  subject: Column.text(),
  sent_by: Column.varchar(64).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  company_id: Column.uuid().pipe(Column.nullable),
  bookkeeper_id: Column.uuid().pipe(Column.nullable),
  tag: Column.varchar(64).pipe(Column.nullable),
  message_id: Column.varchar(256).pipe(Column.nullable),
  workspace_id: Column.uuid().pipe(Column.nullable),
  entity_id: Column.varchar(64).pipe(Column.nullable),
  entity_type: Column.varchar(64).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "email_events_pkey", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_sent_emails_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "tag", order: "asc", nulls: "last" }] as const, name: "ix_sent_emails_company_id_tag", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "tag", order: "asc", nulls: "last" }, { column: "created_at", order: "desc", nulls: "first" }] as const, name: "ix_sent_emails_company_id_tag_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "entity_id", order: "asc", nulls: "last" }] as const, name: "ix_sent_emails_entity_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_sent_emails_workspace_id", unique: false, method: "btree" })
)

const stripe_customers = Table.make("stripe_customers", {
  id: Column.varchar(64),
  email: Column.varchar(320).pipe(Column.nullable),
  stripe: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_stripe_customers", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "email", order: "asc", nulls: "last" }] as const, name: "ix_stripe_customers_email", unique: false, method: "btree" })
)

let stripe_invoice_line_items = Table.make("stripe_invoice_line_items", {
  id: Column.varchar(64),
  stripe_product_id: Column.varchar(64),
  stripe_invoice_id: Column.varchar(64),
  stripe_subscription_id: Column.varchar(64).pipe(Column.nullable),
  stripe: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_stripe_invoice_line_items", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ expression: Pg.Query.cast(Pg.Query.cast(Pg.Function.json.text(Pg.Query.column("stripe", Pg.Query.type.jsonb()), Pg.Function.json.key("amount")), Pg.Query.type.text()), Pg.Query.type.int4()), order: "asc", nulls: "last" }] as const, name: "idx_stripe_invoice_line_items_amount", unique: false, method: "btree" }),
  Table.index({ keys: [{ expression: Pg.Query.cast(Pg.Query.cast(Pg.Function.json.text(Pg.Query.column("stripe", Pg.Query.type.jsonb()), Pg.Function.json.key("created")), Pg.Query.type.text()), Pg.Query.type.int4()), order: "asc", nulls: "last" }] as const, name: "idx_stripe_invoice_line_items_created", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "stripe_invoice_id", order: "asc", nulls: "last" }] as const, name: "ix_stripe_invoice_line_items_stripe_invoice_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "stripe_product_id", order: "asc", nulls: "last" }] as const, name: "ix_stripe_invoice_line_items_stripe_product_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "stripe_subscription_id", order: "asc", nulls: "last" }] as const, name: "ix_stripe_invoice_line_items_stripe_subscription_id", unique: false, method: "btree" })
)

let stripe_invoices = Table.make("stripe_invoices", {
  id: Column.varchar(64),
  stripe_customer_id: Column.varchar(64),
  stripe_subscription_id: Column.varchar(64).pipe(Column.nullable),
  stripe: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_stripe_invoices", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ expression: Pg.Query.cast(Pg.Function.json.text(Pg.Query.column("stripe", Pg.Query.type.jsonb()), Pg.Function.json.key("status")), Pg.Query.type.text()), order: "asc", nulls: "last" }] as const, name: "idx_stripe_invoices_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "stripe_customer_id", order: "asc", nulls: "last" }] as const, name: "ix_stripe_invoices_stripe_customer_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "stripe_subscription_id", order: "asc", nulls: "last" }] as const, name: "ix_stripe_invoices_stripe_subscription_id", unique: false, method: "btree" })
)

let stripe_subscription_line_items = Table.make("stripe_subscription_line_items", {
  id: Column.varchar(64),
  stripe_product_id: Column.varchar(64),
  stripe_subscription_id: Column.varchar(64),
  stripe: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_stripe_subscription_line_items", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "stripe_product_id", order: "asc", nulls: "last" }] as const, name: "ix_stripe_subscription_line_items_stripe_product_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "stripe_subscription_id", order: "asc", nulls: "last" }] as const, name: "ix_stripe_subscription_line_items_stripe_subscription_id", unique: false, method: "btree" })
)

let stripe_subscription_schedule_phase_line_items = Table.make("stripe_subscription_schedule_phase_line_items", {
  stripe_subscription_schedule_id: Column.varchar(64),
  stripe_subscription_schedule_phase_id: Column.varchar(64),
  id: Column.varchar(64),
  stripe_product_id: Column.varchar(64),
  stripe: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["stripe_subscription_schedule_id", "stripe_subscription_schedule_phase_id", "id"] as const, name: "pk_stripe_subscription_schedule_phase_line_items", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "stripe_product_id", order: "asc", nulls: "last" }] as const, name: "ix_stripe_subscription_schedule_phase_line_items_product_id", unique: false, method: "btree" })
)

let stripe_subscription_schedule_phases = Table.make("stripe_subscription_schedule_phases", {
  stripe_subscription_schedule_id: Column.varchar(64),
  id: Column.varchar(64),
  stripe: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["stripe_subscription_schedule_id", "id"] as const, name: "pk_stripe_subscription_schedule_phases", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "stripe_subscription_schedule_id", order: "asc", nulls: "last" }] as const, name: "ix_stripe_subscription_schedule_phases_schedule_id", unique: false, method: "btree" })
)

let stripe_subscription_schedules = Table.make("stripe_subscription_schedules", {
  id: Column.varchar(64),
  stripe_customer_id: Column.varchar(64),
  stripe_subscription_id: Column.varchar(64).pipe(Column.nullable),
  stripe: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_stripe_subscription_schedules", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ expression: Pg.Query.cast(Pg.Function.json.text(Pg.Query.column("stripe", Pg.Query.type.jsonb()), Pg.Function.json.key("status")), Pg.Query.type.text()), order: "asc", nulls: "last" }] as const, name: "idx_stripe_subscription_schedules_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "stripe_customer_id", order: "asc", nulls: "last" }] as const, name: "ix_stripe_subscription_schedules_customer_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "stripe_subscription_id", order: "asc", nulls: "last" }] as const, name: "ix_stripe_subscription_schedules_subscription_id", unique: false, method: "btree" })
)

let stripe_subscriptions = Table.make("stripe_subscriptions", {
  id: Column.varchar(64),
  stripe_customer_id: Column.varchar(64),
  stripe: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_stripe_subscriptions", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ expression: Pg.Query.cast(Pg.Function.json.text(Pg.Query.column("stripe", Pg.Query.type.jsonb()), Pg.Function.json.key("status")), Pg.Query.type.text()), order: "asc", nulls: "last" }] as const, name: "idx_stripe_subscriptions_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "stripe_customer_id", order: "asc", nulls: "last" }] as const, name: "ix_stripe_subscriptions_customer_id", unique: false, method: "btree" })
)

const summary_email_targets = Table.make("summary_email_targets", {
  company_id: Column.uuid(),
  email: Column.text()
}).pipe(
  Table.primaryKey({ columns: ["company_id", "email"] as const, name: "summary_email_targets_pk", deferrable: false, initiallyDeferred: false })
)

let tallyfor_binders = Table.make("tallyfor_binders", {
  id: Column.uuid(),
  client_id: Column.uuid(),
  name: Column.varchar(255).pipe(Column.nullable),
  year: Column.varchar(4),
  link: Column.uuid().pipe(Column.nullable),
  form: Column.varchar(32).pipe(Column.nullable),
  version: Column.int().pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_tallyfor_binders", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["client_id", "year"] as const, name: "uq_tallyfor_binders_client_id_year", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "client_id", order: "asc", nulls: "last" }] as const, name: "ix_tallyfor_binders_client_id", unique: false, method: "btree" })
)

const tallyfor_clients = Table.make("tallyfor_clients", {
  id: Column.uuid(),
  name: Column.varchar(255),
  return_type: Column.varchar(32),
  client_type: Column.varchar(32).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_tallyfor_clients", deferrable: false, initiallyDeferred: false })
)

let task_assigned_to_events = Table.make("task_assigned_to_events", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  task_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  assignee: Column.uuid().pipe(Column.nullable),
  created_by: Column.varchar(64)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_task_assigned_to_events", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_task_assigned_to_events_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_task_assigned_to_events_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "task_id", order: "asc", nulls: "last" }] as const, name: "ix_task_assigned_to_events_task_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "task_id", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_task_assigned_to_events_task_id_created_at", unique: false, method: "btree" })
)

let task_status_events = Table.make("task_status_events", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  task_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  status: Column.varchar(32),
  created_by: Column.varchar(64)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_task_status_events", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_task_status_events_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_task_status_events_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "status", order: "asc", nulls: "last" }] as const, name: "ix_task_status_events_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "task_id", order: "asc", nulls: "last" }] as const, name: "ix_task_status_events_task_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "task_id", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_task_status_events_task_id_created_at", unique: false, method: "btree" })
)

let tasks = Table.make("tasks", {
  company_id: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  workspace_id: Column.uuid(),
  title: Column.varchar(128),
  context: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  status: Column.varchar(32),
  priority: Column.int2().pipe(Column.nullable),
  assigned_to: Column.uuid().pipe(Column.nullable),
  related_task: Column.uuid().pipe(Column.nullable),
  task_relation_type: Column.varchar(64).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "tasks_pk", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "title", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }, { column: "updated_at", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "idx_tasks_efforts_query", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "assigned_to", order: "asc", nulls: "last" }] as const, name: "ix_tasks_assigned_to", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_tasks_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_tasks_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "related_task", order: "asc", nulls: "last" }] as const, name: "ix_tasks_related_task", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "status", order: "asc", nulls: "last" }] as const, name: "ix_tasks_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "title", order: "asc", nulls: "last" }] as const, name: "ix_tasks_title", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "updated_at", order: "asc", nulls: "last" }] as const, name: "ix_tasks_updated_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "workspace_id", order: "asc", nulls: "last" }] as const, name: "ix_tasks_workspace_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "title", order: "asc", nulls: "last" }] as const, name: "tasks_company_id_title_index", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "title", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }] as const, name: "tasks_company_id_title_status_index", unique: false, method: "btree" })
)

const tax_forms = Table.make("tax_forms", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  type: Column.varchar(32),
  year: Column.int(),
  tax_year_offset: Column.int().pipe(Column.default(Pg.Query.literal(0))),
  meta: Column.jsonb(Schema.Unknown),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  ocrolus_pk: Column.int().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_tax_forms", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "type", "year"] as const, name: "uq_tax_forms_company_id_type_year", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_tax_forms_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "type", order: "asc", nulls: "last" }, { column: "year", order: "asc", nulls: "last" }] as const, name: "ix_tax_forms_form_type_year", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "ocrolus_pk", order: "asc", nulls: "last" }] as const, name: "ix_tax_forms_ocrolus_pk", unique: false, method: "btree" })
)

let tax_statuses = Table.make("tax_statuses", {
  uuid: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_uuid: Column.uuid(),
  created_at: Column.timestamp(),
  created_by: Column.varchar(320),
  status: Column.text(),
  description: Column.text().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["uuid"] as const, name: "pk_tax_statuses", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }] as const, name: "ix_tax_statuses_company_uuid", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_tax_statuses_company_uuid_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_tax_statuses_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "status", order: "asc", nulls: "last" }] as const, name: "ix_tax_statuses_status", unique: false, method: "btree" })
)

let third_party_apps = Table.make("third_party_apps", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  company_id: Column.uuid(),
  name: Column.varchar(255),
  description: Column.text(),
  logo: Column.varchar(255).pipe(Column.nullable),
  status: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("REQUESTED"), Pg.Query.type.varchar()))),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  created_by: Column.varchar(320),
  bookkeeper_description: Column.text().pipe(Column.nullable),
  use_case: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  years: Column.jsonb(Schema.Unknown).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_third_party_apps", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_third_party_apps_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_third_party_apps_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "name", order: "asc", nulls: "last" }] as const, name: "ix_third_party_apps_name", unique: false, method: "btree" })
)

let thread_messages = Table.make("thread_messages", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  thread_name: Column.varchar(128).pipe(Column.nullable),
  company_uuid: Column.uuid(),
  text: Column.text(),
  created_by: Column.varchar(320).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  viewed_at: Column.timestamp().pipe(Column.nullable),
  viewed_by: Column.varchar(320).pipe(Column.nullable),
  user_type: Column.varchar(32),
  entity_id: Column.uuid().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_thread_messages", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "thread_name", order: "asc", nulls: "last" }, { column: "user_type", order: "asc", nulls: "last" }, { column: "viewed_at", order: "asc", nulls: "last" }] as const, name: "ix_thread_messages", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "thread_name", order: "asc", nulls: "last" }, { column: "created_at", order: "desc", nulls: "first" }] as const, name: "ix_thread_messages_company_thread_created", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "thread_name", order: "asc", nulls: "last" }] as const, name: "ix_thread_messages_company_thread_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "thread_name", order: "asc", nulls: "last" }, { column: "user_type", order: "asc", nulls: "last" }] as const, name: "ix_thread_messages_company_thread_name_user_viewed", unique: false, method: "btree", predicate: Pg.Query.isNull(Pg.Query.column("viewed_at", Pg.Query.type.timestamp(), true)) }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "thread_name", order: "asc", nulls: "last" }, { column: "user_type", order: "asc", nulls: "last" }, { column: "viewed_at", order: "asc", nulls: "last" }] as const, name: "ix_thread_messages_company_thread_user_viewed", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "thread_name", order: "asc", nulls: "last" }] as const, name: "ix_thread_messages_count_lookup_partial_uuid", unique: false, method: "btree", predicate: Pg.Query.and(Pg.Query.and(Pg.Query.regexMatch(Pg.Query.cast(Pg.Query.column("thread_name", Pg.Query.type.varchar(), true), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"), Pg.Query.type.text())), Pg.Query.eq(Pg.Query.cast(Pg.Query.column("user_type", Pg.Query.type.varchar()), Pg.Query.type.text()), Pg.Query.cast(Pg.Query.literal("USER"), Pg.Query.type.text()))), Pg.Query.isNull(Pg.Query.column("viewed_at", Pg.Query.type.timestamp(), true))) }),
  Table.index({ keys: [{ column: "entity_id", order: "asc", nulls: "last" }] as const, name: "ix_thread_messages_entity_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "thread_name", order: "asc", nulls: "last" }, { column: "user_type", order: "asc", nulls: "last" }] as const, name: "ix_thread_messages_lookup", unique: false, method: "btree", predicate: Pg.Query.isNull(Pg.Query.column("viewed_at", Pg.Query.type.timestamp(), true)) }),
  Table.index({ keys: [{ column: "thread_name", order: "asc", nulls: "last" }] as const, name: "ix_thread_messages_thread_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "thread_name", order: "asc", nulls: "last" }, { column: "company_uuid", order: "asc", nulls: "last" }] as const, name: "ix_thread_messages_thread_name_company", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "thread_name", order: "asc", nulls: "last" }, { column: "company_uuid", order: "asc", nulls: "last" }] as const, name: "ix_thread_messages_thread_name_company_uuid", unique: false, method: "btree" })
)

let threads = Table.make("threads", {
  name: Column.varchar(128),
  company_uuid: Column.uuid(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  data: Column.jsonb(Schema.Unknown).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("{}"), Pg.Query.type.jsonb()))),
  created_by: Column.varchar(320).pipe(Column.nullable),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  type: Column.varchar(32).pipe(Column.default(Pg.Query.cast(Pg.Query.literal("THREAD"), Pg.Query.type.varchar())))
}).pipe(
  Table.primaryKey({ columns: ["name", "company_uuid"] as const, name: "pk_threads", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }] as const, name: "ix_threads_company_uuid", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_uuid", order: "asc", nulls: "last" }, { column: "name", order: "asc", nulls: "last" }] as const, name: "ix_threads_company_uuid_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_threads_created_at", unique: false, method: "btree" })
)

let unprocessed_transactions = Table.make("unprocessed_transactions", {
  source_id: Column.varchar(64),
  company_id: Column.uuid(),
  bank_account_id: Column.uuid(),
  type: Column.varchar(16),
  date: Column.date(),
  description: Column.text(),
  amount: Column.int8(),
  source_meta: Column.jsonb(Schema.Unknown),
  created_at: Column.timestamp()
}).pipe(
  Table.primaryKey({ columns: ["source_id"] as const, name: "pk_unprocessed_transactions", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "amount", order: "asc", nulls: "last" }] as const, name: "ix_unprocessed_transactions_amount", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }] as const, name: "ix_unprocessed_transactions_bank_account_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_unprocessed_transactions_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "date", order: "asc", nulls: "last" }] as const, name: "ix_unprocessed_transactions_date", unique: false, method: "btree" })
)

let uplinq_bank_account_balances = Table.make("uplinq_bank_account_balances", {
  id: Column.uuid(),
  bank_account_id: Column.uuid(),
  balance: Column.int8().pipe(Column.nullable),
  available: Column.int8().pipe(Column.nullable),
  limit: Column.int8().pipe(Column.nullable),
  currency: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "currency",
  variant: "enum"
}).pipe(Column.ddlType("currency"), Column.nullable),
  as_of: Column.timestamp(),
  statement_id: Column.uuid().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_uplinq_bank_account_balances", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }, { expression: Pg.Query.cast(Pg.Query.column("as_of", Pg.Query.type.timestamp()), Pg.Query.type.date()), order: "asc", nulls: "last" }, { column: "statement_id", order: "asc", nulls: "last" }, { column: "as_of", order: "desc", nulls: "first" }] as const, name: "idx_bal_baid_date_stmt_asof_notnull", unique: false, method: "btree", predicate: Pg.Query.isNotNull(Pg.Query.column("balance", Pg.Query.type.int8(), true)) }),
  Table.index({ keys: [{ column: "statement_id", order: "asc", nulls: "last" }, { column: "as_of", order: "asc", nulls: "last" }] as const, name: "idx_bank_balances_statement_as_of", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "as_of", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_account_balances_as_of", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_account_balances_bank_account_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }, { column: "as_of", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_account_balances_bank_account_id_as_of", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }, { column: "statement_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_account_balances_bank_account_id_statement_id", unique: false, method: "btree" })
)

let uplinq_bank_account_company_history = Table.make("uplinq_bank_account_company_history", {
  id: Column.uuid(),
  bank_account_id: Column.uuid(),
  company_id: Column.uuid(),
  created_at: Column.timestamp()
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_uplinq_bank_account_company_history", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_account_company_history_bank_account_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_account_company_history_company_id", unique: false, method: "btree" })
)

let uplinq_bank_account_plaid_refs = Table.make("uplinq_bank_account_plaid_refs", {
  bank_account_id: Column.uuid(),
  source_id: Column.varchar(96),
  created_at: Column.timestamp()
}).pipe(
  Table.primaryKey({ columns: ["bank_account_id", "source_id"] as const, name: "pk_uplinq_bank_account_refs", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["source_id"] as const, name: "uq_uplinq_bank_account_plaid_refs_source_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }, { column: "created_at", order: "desc", nulls: "first" }] as const, name: "idx_plaid_refs_account_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }, { column: "created_at", order: "desc", nulls: "first" }] as const, name: "idx_ubapr_bank_created", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_account_plaid_refs_bank_account_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_account_plaid_refs_bank_account_id_covering", unique: false, method: "btree", include: ["source_id"] as const })
)

let uplinq_bank_accounts = Table.make("uplinq_bank_accounts", {
  id: Column.uuid(),
  company_id: Column.uuid(),
  institution_name: Column.varchar(64),
  mask: Column.varchar(64).pipe(Column.nullable),
  name: Column.text(),
  official_name: Column.text().pipe(Column.nullable),
  type: Column.varchar(64),
  subtype: Column.varchar(64).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  status: Column.varchar(64),
  hidden: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  airtable_id: Column.char(17).pipe(Column.nullable),
  description: Column.text().pipe(Column.nullable),
  opening_statement_id: Column.uuid().pipe(Column.nullable),
  closing_statement_id: Column.uuid().pipe(Column.nullable),
  read_only_access: Column.boolean().pipe(Column.default(Pg.Query.literal(false))),
  credentials_id: Column.uuid().pipe(Column.nullable),
  account_id: Column.uuid()
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_uplinq_bank_accounts", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["account_id"] as const, name: "uq_uplinq_bank_accounts_account_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "id"] as const, name: "uq_uplinq_bank_accounts_company_id_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "institution_name", "mask", "name", "type"] as const, name: "uq_uplinq_bank_accounts_company_id_institution_name_mas_cb4d", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "account_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_accounts_account_id_covering", unique: false, method: "btree", include: ["id", "company_id", "institution_name", "type", "subtype", "mask", "name", "opening_statement_id", "closing_statement_id"] as const }),
  Table.index({ keys: [{ column: "airtable_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_accounts_airtable_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "closing_statement_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_accounts_closing_statement_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_accounts_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "credentials_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_accounts_credentials_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "hidden", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_accounts_hidden", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "institution_name", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_accounts_institution_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "mask", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_accounts_mask", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "name", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_accounts_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "opening_statement_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_accounts_opening_statement_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "status", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_accounts_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "type", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_accounts_type", unique: false, method: "btree" })
)

let uplinq_bank_transaction_csv_refs = Table.make("uplinq_bank_transaction_csv_refs", {
  bank_transaction_id: Column.uuid(),
  statement_id: Column.uuid(),
  source_meta: Column.jsonb(Schema.Unknown),
  created_at: Column.timestamp()
}).pipe(
  Table.primaryKey({ columns: ["bank_transaction_id"] as const, name: "pk_uplinq_bank_transaction_csv_refs", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "statement_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transaction_csv_refs_statement_id", unique: false, method: "btree" })
)

let uplinq_bank_transaction_ocrolus_refs = Table.make("uplinq_bank_transaction_ocrolus_refs", {
  bank_transaction_id: Column.uuid(),
  source_id: Column.varchar(),
  created_at: Column.timestamp(),
  statement_id: Column.uuid(),
  source_meta: Column.jsonb(Schema.Unknown)
}).pipe(
  Table.primaryKey({ columns: ["bank_transaction_id", "source_id"] as const, name: "pk_uplinq_bank_transaction_ocrolus_refs", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["source_id"] as const, name: "uq_uplinq_bank_transaction_ocrolus_refs_source_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bank_transaction_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transaction_ocrolus_refs_bank_transaction_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "statement_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transaction_ocrolus_refs_statement_id", unique: false, method: "btree" })
)

let uplinq_bank_transaction_plaid_refs = Table.make("uplinq_bank_transaction_plaid_refs", {
  bank_transaction_id: Column.uuid(),
  source_id: Column.varchar(64),
  source_meta: Column.jsonb(Schema.Unknown),
  created_at: Column.timestamp(),
  updated_at: Column.timestamp().pipe(Column.nullable),
  deleted_at: Column.timestamp().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["bank_transaction_id", "source_id"] as const, name: "pk_uplinq_bank_transaction_refs", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["source_id"] as const, name: "uq_uplinq_bank_transaction_plaid_refs_source_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bank_transaction_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transaction_plaid_refs_bank_transaction_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transaction_plaid_refs_created_at", unique: false, method: "btree" })
)

let uplinq_bank_transactions = Table.make("uplinq_bank_transactions", {
  id: Column.uuid(),
  bank_account_id: Column.uuid(),
  company_id: Column.uuid(),
  date: Column.date(),
  amount: Column.int8(),
  currency: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "currency",
  variant: "enum"
}).pipe(Column.ddlType("currency")),
  description: Column.text(),
  name: Column.text().pipe(Column.nullable),
  merchant_name: Column.text().pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  statement_id: Column.uuid().pipe(Column.nullable),
  journal_line_id: Column.uuid(),
  deleted_at: Column.timestamp().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_uplinq_bank_transactions_id", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["journal_line_id"] as const, name: "uq_uplinq_bank_transactions_journal_line_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "journal_line_id", order: "asc", nulls: "last" }, { column: "bank_account_id", order: "asc", nulls: "last" }, { column: "date", order: "asc", nulls: "last" }] as const, name: "ix_ubt_jl_id_null_merch_incl", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "amount", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transactions_amount", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transactions_bank_account_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transactions_bank_account_id_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }, { column: "date", order: "asc", nulls: "last" }, { column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transactions_bank_account_id_date", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "bank_account_id", order: "asc", nulls: "last" }, { column: "date", order: "asc", nulls: "last" }, { column: "amount", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transactions_bank_account_id_date_amount", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "bank_account_id", order: "asc", nulls: "last" }, { column: "updated_at", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transactions_bank_account_id_updated_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transactions_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "amount", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transactions_company_id_amount", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "date", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transactions_company_id_date", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "date", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transactions_date", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "deleted_at", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transactions_deleted_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "merchant_name", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transactions_merchant_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "statement_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_bank_transactions_statement_id", unique: false, method: "btree" })
)

let uplinq_journal_adjustments = Table.make("uplinq_journal_adjustments", {
  adjusted_parent_id: Column.uuid(),
  adjusting_child_id: Column.uuid()
}).pipe(
  Table.primaryKey({ columns: ["adjusted_parent_id", "adjusting_child_id"] as const, name: "pk_uplinq_journal_adjustments", deferrable: false, initiallyDeferred: false })
)

const uplinq_journal_audit_logs = Table.make("uplinq_journal_audit_logs", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  journal_id: Column.uuid(),
  company_id: Column.uuid(),
  row_data: Column.jsonb(Schema.Unknown),
  dml_type: Column.varchar(32),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  created_by: Column.varchar(320)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_uplinq_journal_audit_logs", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_audit_logs_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_by", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_audit_logs_created_by", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_audit_logs_journal_id", unique: false, method: "btree" })
)

let uplinq_journal_comments = Table.make("uplinq_journal_comments", {
  id: Column.uuid(),
  journal_id: Column.uuid(),
  user_id: Column.uuid().pipe(Column.nullable),
  bookkeeper_id: Column.uuid().pipe(Column.nullable),
  source: Column.text(),
  text: Column.text(),
  viewed: Column.boolean(),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  company_id: Column.uuid()
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_uplinq_journal_comments", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bookkeeper_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_comments_bookkeeper_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_comments_journal_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "user_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_comments_user_id", unique: false, method: "btree" })
)

const uplinq_journal_history = Table.make("uplinq_journal_history", {
  id: Column.uuid(),
  journal_id: Column.uuid(),
  source_id: Column.varchar(64).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  event: Column.jsonb(Schema.Unknown),
  state: Column.jsonb(Schema.Unknown),
  intent: Column.varchar(64),
  source: Column.varchar(64)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_uplinq_journal_history", deferrable: false, initiallyDeferred: false })
)

const uplinq_journal_line_audit_logs = Table.make("uplinq_journal_line_audit_logs", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  journal_line_id: Column.uuid(),
  journal_id: Column.uuid(),
  row_data: Column.jsonb(Schema.Unknown),
  dml_type: Column.varchar(32),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  created_by: Column.varchar(320)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_uplinq_journal_line_audit_logs", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_line_audit_logs_journal_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "journal_line_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_line_audit_logs_journal_line_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ expression: Pg.Query.cast(Pg.Function.json.text(Pg.Query.column("row_data", Pg.Query.type.jsonb()), Pg.Function.json.key("account_id")), Pg.Query.type.text()), order: "asc", nulls: "last" }] as const, name: "uplinq_journal_line_audit_logs_expr_idx", unique: false, method: "btree" })
)

let uplinq_journal_line_reconciliations = Table.make("uplinq_journal_line_reconciliations", {
  line_id: Column.uuid(),
  reconciliation_id: Column.uuid()
}).pipe(
  Table.primaryKey({ columns: ["line_id", "reconciliation_id"] as const, name: "pk_uplinq_journal_line_reconciliations", deferrable: false, initiallyDeferred: false })
)

let uplinq_journal_lines = Table.make("uplinq_journal_lines", {
  id: Column.uuid(),
  journal_id: Column.uuid(),
  amount: Column.int8(),
  description: Column.text().pipe(Column.nullable),
  company_id: Column.uuid(),
  payee_id: Column.uuid().pipe(Column.nullable),
  account_id: Column.uuid().pipe(Column.nullable),
  customer_id: Column.uuid().pipe(Column.nullable),
  reconciliation_id: Column.uuid().pipe(Column.nullable),
  exclude_from_1099_calc: Column.boolean().pipe(Column.nullable)
}).pipe(
  Table.check("check_customer_id_or_payee_id_null", Pg.Query.or(Pg.Query.isNull(Pg.Query.column("customer_id", Pg.Query.type.uuid(), true)), Pg.Query.isNull(Pg.Query.column("payee_id", Pg.Query.type.uuid(), true)))),
  Table.primaryKey({ columns: ["id"] as const, name: "pk_uplinq_journal_lines", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }, { column: "account_id", order: "asc", nulls: "last" }] as const, name: "idx_journal_lines_journal_account", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }, { column: "account_id", order: "asc", nulls: "last" }] as const, name: "idx_ujl_missing_payee_lookup", unique: false, method: "btree", predicate: Pg.Query.and(Pg.Query.and(Pg.Query.isNull(Pg.Query.column("payee_id", Pg.Query.type.uuid(), true)), Pg.Query.isNull(Pg.Query.column("customer_id", Pg.Query.type.uuid(), true))), Pg.Query.gt(Pg.Query.column("amount", Pg.Query.type.int8()), Pg.Query.literal(0))) }),
  Table.index({ keys: [{ column: "account_id", order: "asc", nulls: "last" }, { column: "journal_id", order: "asc", nulls: "last" }, { column: "reconciliation_id", order: "asc", nulls: "last" }] as const, name: "ix_ujl_account_journal_reconciliation_nonzero", unique: false, method: "btree", predicate: Pg.Query.neq(Pg.Query.column("amount", Pg.Query.type.int8()), Pg.Query.literal(0)) }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "account_id", order: "asc", nulls: "last" }, { column: "journal_id", order: "asc", nulls: "last" }] as const, name: "ix_ujl_company_account_journal_inc_amt", unique: false, method: "btree", include: ["amount"] as const }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "journal_id", order: "asc", nulls: "last" }, { column: "id", order: "asc", nulls: "last" }] as const, name: "ix_ujl_company_journal_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "journal_id", order: "asc", nulls: "last" }] as const, name: "ix_ujl_company_journal_inc_amount", unique: false, method: "btree", include: ["amount"] as const }),
  Table.index({ keys: [{ column: "account_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_account_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "account_id", order: "asc", nulls: "last" }, { column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_account_id_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "account_id", order: "asc", nulls: "last" }, { column: "journal_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_account_journal", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "amount", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_amount", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "account_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_company_account", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "account_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_company_id_account_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "amount", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_company_id_amount", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "exclude_from_1099_calc", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_company_id_exclude_from_1099_calc", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "customer_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_customer_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "exclude_from_1099_calc", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_exclude_from_1099_calc", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_journal_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }, { column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_journal_id_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "payee_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_payee_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "reconciliation_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_lines_reconciliation_id", unique: false, method: "btree" })
)

let uplinq_journal_refs_codat_journals = Table.make("uplinq_journal_refs_codat_journals", {
  journal_id: Column.uuid(),
  company_id: Column.uuid(),
  source_id: Column.varchar(64),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["journal_id", "company_id", "source_id"] as const, name: "pk_uplinq_journal_refs_codat_journals", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["company_id", "source_id"] as const, name: "uq_uplinq_journal_refs_codat_journals", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "journal_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_refs_codat_journals_journal_id", unique: false, method: "btree" })
)

let uplinq_journal_refs_qbo_journal = Table.make("uplinq_journal_refs_qbo_journal", {
  qbo_item_id: Column.int8(),
  qbo_journal_id: Column.text(),
  journal_id: Column.uuid(),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  meta: Column.jsonb(Schema.Unknown),
  company_id: Column.uuid()
}).pipe(
  Table.primaryKey({ columns: ["qbo_item_id", "qbo_journal_id"] as const, name: "pk_uplinq_journal_refs_qbo_journal", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["journal_id"] as const, name: "uq_uplinq_journal_refs_qbo_journal_journal_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ expression: Pg.Query.cast(Pg.Function.json.text(Pg.Query.column("meta", Pg.Query.type.jsonb()), Pg.Function.json.key("transaction_type")), Pg.Query.type.text()), order: "asc", nulls: "last" }] as const, name: "idx_uplinq_journal_refs_qbo_journal_meta_transaction_type", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_refs_qbo_journal_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { expression: Pg.Function.call("text_to_date", Pg.Query.cast(Pg.Function.json.text(Pg.Query.column("meta", Pg.Query.type.jsonb()), Pg.Function.json.key("TxnDate")), Pg.Query.type.text())), order: "asc", nulls: "last" }, { expression: Pg.Query.cast(Pg.Function.json.text(Pg.Query.column("meta", Pg.Query.type.jsonb()), Pg.Function.json.key("cleared")), Pg.Query.type.text()), order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_refs_qbo_journal_company_id_txn_date_cleared", unique: false, method: "btree" }),
  Table.index({ keys: [{ expression: Pg.Query.cast(Pg.Function.json.text(Pg.Query.column("meta", Pg.Query.type.jsonb()), Pg.Function.json.key("cleared")), Pg.Query.type.text()), order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_refs_qbo_journal_meta_cleared", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "qbo_item_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_refs_qbo_journal_qbo_item_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "updated_at", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_refs_qbo_journal_updated_at", unique: false, method: "btree" })
)

let uplinq_journal_warning = Table.make("uplinq_journal_warning", {
  journal_id: Column.uuid(),
  account_id: Column.uuid().pipe(Column.nullable),
  suppressed: Column.text().pipe(Column.nullable),
  rule_stem: Column.varchar(255).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["journal_id"] as const, name: "pk_uplinq_journal_warning", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "rule_stem", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journal_warning_rule_stem", unique: false, method: "btree" })
)

const uplinq_journals = Table.make("uplinq_journals", {
  id: Column.uuid(),
  company_id: Column.uuid(),
  posted_on: Column.date(),
  approved_on: Column.date().pipe(Column.nullable),
  type: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "uplinqjournaltype",
  variant: "enum"
}).pipe(Column.ddlType("uplinqjournaltype")),
  currency: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "currency",
  variant: "enum"
}).pipe(Column.ddlType("currency")),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  description: Column.text().pipe(Column.nullable),
  status: Column.custom(Schema.String, {
  dialect: "postgres",
  kind: "uplinqjournalstatus",
  variant: "enum"
}).pipe(Column.ddlType("uplinqjournalstatus"), Column.default(Pg.Query.cast(Pg.Query.literal("DRAFT"), Pg.Query.type.enum("uplinqjournalstatus")))),
  user_comment: Column.text().pipe(Column.nullable),
  connection_id: Column.uuid().pipe(Column.nullable),
  update_source: Column.varchar(32).pipe(Column.nullable),
  update_source_id: Column.uuid().pipe(Column.nullable),
  status_sort_key: Column.int().pipe(Column.nullable, Column.generated(Pg.Query.case().when(Pg.Query.eq(Pg.Query.column("status", Pg.Query.type.enum("uplinqjournalstatus")), Pg.Query.cast(Pg.Query.literal("UNCLEAR"), Pg.Query.type.enum("uplinqjournalstatus"))), Pg.Query.literal(1)).when(Pg.Query.eq(Pg.Query.column("status", Pg.Query.type.enum("uplinqjournalstatus")), Pg.Query.cast(Pg.Query.literal("PENDING_REVIEW"), Pg.Query.type.enum("uplinqjournalstatus"))), Pg.Query.literal(2)).when(Pg.Query.eq(Pg.Query.column("status", Pg.Query.type.enum("uplinqjournalstatus")), Pg.Query.cast(Pg.Query.literal("DRAFT"), Pg.Query.type.enum("uplinqjournalstatus"))), Pg.Query.literal(3)).when(Pg.Query.eq(Pg.Query.column("status", Pg.Query.type.enum("uplinqjournalstatus")), Pg.Query.cast(Pg.Query.literal("READY"), Pg.Query.type.enum("uplinqjournalstatus"))), Pg.Query.literal(4)).when(Pg.Query.eq(Pg.Query.column("status", Pg.Query.type.enum("uplinqjournalstatus")), Pg.Query.cast(Pg.Query.literal("DENIED"), Pg.Query.type.enum("uplinqjournalstatus"))), Pg.Query.literal(5)).when(Pg.Query.eq(Pg.Query.column("status", Pg.Query.type.enum("uplinqjournalstatus")), Pg.Query.cast(Pg.Query.literal("APPROVED"), Pg.Query.type.enum("uplinqjournalstatus"))), Pg.Query.literal(6)).else(Pg.Query.literal(7))))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_uplinq_journals", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["id", "company_id"] as const, name: "uq_uplinq_journals_id_company_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "posted_on", order: "asc", nulls: "last" }] as const, name: "idx_journals_company_status_posted", unique: false, method: "btree", predicate: Pg.Query.neq(Pg.Query.column("status", Pg.Query.type.enum("uplinqjournalstatus")), Pg.Query.cast(Pg.Query.literal("DELETED"), Pg.Query.type.enum("uplinqjournalstatus"))) }),
  Table.index({ keys: [{ column: "id", order: "asc", nulls: "last" }] as const, name: "ix_uj_id_not_deleted", unique: false, method: "btree", predicate: Pg.Query.neq(Pg.Query.column("status", Pg.Query.type.enum("uplinqjournalstatus")), Pg.Query.cast(Pg.Query.literal("DELETED"), Pg.Query.type.enum("uplinqjournalstatus"))) }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }, { column: "posted_on", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_co_status_posted_non_opening", unique: false, method: "btree", predicate: Pg.Query.neq(Pg.Query.column("type", Pg.Query.type.enum("uplinqjournaltype")), Pg.Query.cast(Pg.Query.literal("OPENING"), Pg.Query.type.enum("uplinqjournaltype"))) }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "posted_on", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_company_id_posted_on", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "posted_on", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }, { column: "connection_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_company_id_posted_on_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_company_id_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { expression: Pg.Query.case().when(Pg.Query.eq(Pg.Query.column("status", Pg.Query.type.enum("uplinqjournalstatus")), Pg.Query.cast(Pg.Query.literal("UNCLEAR"), Pg.Query.type.enum("uplinqjournalstatus"))), Pg.Query.literal(1)).when(Pg.Query.eq(Pg.Query.column("status", Pg.Query.type.enum("uplinqjournalstatus")), Pg.Query.cast(Pg.Query.literal("PENDING_REVIEW"), Pg.Query.type.enum("uplinqjournalstatus"))), Pg.Query.literal(2)).else(Pg.Query.literal(3)), order: "asc", nulls: "last" }, { column: "id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_company_id_status_order", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "type", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }, { column: "posted_on", order: "asc", nulls: "last" }, { column: "connection_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_company_id_type_status_posted_on", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "update_source_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_company_id_update_source_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "connection_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_connection_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "status_sort_key", order: "desc", nulls: "first" }, { column: "id", order: "asc", nulls: "last" }, { column: "posted_on", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_default_sort", unique: false, method: "btree", predicate: Pg.Query.neq(Pg.Query.column("status", Pg.Query.type.enum("uplinqjournalstatus")), Pg.Query.cast(Pg.Query.literal("DELETED"), Pg.Query.type.enum("uplinqjournalstatus"))) }),
  Table.index({ keys: [{ column: "id", order: "asc", nulls: "last" }, { column: "company_id", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_id_company_id_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "id", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_id_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "posted_on", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_posted_on", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "posted_on", order: "asc", nulls: "last" }, { column: "status", order: "asc", nulls: "last" }, { column: "company_id", order: "asc", nulls: "last" }, { column: "type", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_posted_on_status_company_type", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "status", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_status", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "update_source", order: "asc", nulls: "last" }, { column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_update_source_company_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "update_source_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_journals_update_source_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "posted_on", order: "asc", nulls: "last" }, { column: "id", order: "asc", nulls: "last" }] as const, name: "uplinq_journals_company_id_posted_on_id_idx", unique: false, method: "btree", predicate: Pg.Query.neq(Pg.Query.column("status", Pg.Query.type.enum("uplinqjournalstatus")), Pg.Query.cast(Pg.Query.literal("DELETED"), Pg.Query.type.enum("uplinqjournalstatus"))) })
)

let uplinq_plaid_account_exclusions = Table.make("uplinq_plaid_account_exclusions", {
  company_id: Column.uuid(),
  account_key: Column.text(),
  institution_id: Column.varchar(96),
  name: Column.text(),
  mask: Column.varchar(64).pipe(Column.nullable),
  type: Column.varchar(64),
  subtype: Column.varchar(64).pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["company_id", "account_key"] as const, name: "pk_uplinq_plaid_account_exclusions", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "company_id", order: "asc", nulls: "last" }, { column: "institution_id", order: "asc", nulls: "last" }] as const, name: "ix_uplinq_plaid_account_exclusions_company_institution", unique: false, method: "btree" })
)

const users = Table.make("users", {
  uuid: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  email: Column.varchar(320),
  email_verified: Column.boolean(),
  sub: Column.text(),
  first_name: Column.text(),
  last_name: Column.text(),
  picture: Column.text(),
  token: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  bk_tutorial_seen: Column.boolean(),
  created_at: Column.timestamp(),
  updated_at: Column.timestamp(),
  phone_number: Column.varchar(15).pipe(Column.nullable),
  intensity: Column.int().pipe(Column.nullable),
  user_companies_meta: Column.jsonb(Schema.Unknown).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["uuid"] as const, name: "pk_users", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "bk_tutorial_seen", order: "asc", nulls: "last" }] as const, name: "ix_users_bk_tutorial_seen", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_users_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "email", order: "asc", nulls: "last" }] as const, name: "ix_users_email", unique: true, method: "btree" }),
  Table.index({ keys: [{ column: "email_verified", order: "asc", nulls: "last" }] as const, name: "ix_users_email_verified", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "first_name", order: "asc", nulls: "last" }] as const, name: "ix_users_first_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "last_name", order: "asc", nulls: "last" }] as const, name: "ix_users_last_name", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "picture", order: "asc", nulls: "last" }] as const, name: "ix_users_picture", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "sub", order: "asc", nulls: "last" }] as const, name: "ix_users_sub", unique: true, method: "btree" }),
  Table.index({ keys: [{ column: "updated_at", order: "asc", nulls: "last" }] as const, name: "ix_users_updated_at", unique: false, method: "btree" })
)

let users_companies = Table.make("users_companies", {
  user_uuid: Column.uuid(),
  company_uuid: Column.uuid(),
  permissions: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  created_at: Column.timestamp(),
  updated_at: Column.timestamp(),
  last_seen_at: Column.timestamp().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["user_uuid", "company_uuid"] as const, name: "pk_users_companies", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["user_uuid", "company_uuid"] as const, name: "users_companies_user_uuid_company_uuid", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_users_companies_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "updated_at", order: "asc", nulls: "last" }] as const, name: "ix_users_companies_updated_at", unique: false, method: "btree" })
)

let users_companies_activities = Table.make("users_companies_activities", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  user_id: Column.uuid(),
  company_id: Column.uuid(),
  meta: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  created_at: Column.timestamp()
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_users_companies_activities", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_users_companies_activities_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "user_id", order: "asc", nulls: "last" }, { column: "company_id", order: "asc", nulls: "last" }] as const, name: "ix_users_companies_activities_user_company", unique: false, method: "btree" })
)

let users_linqs = Table.make("users_linqs", {
  user_uuid: Column.uuid(),
  linq_uuid: Column.uuid(),
  created_at: Column.timestamp(),
  updated_at: Column.timestamp()
}).pipe(
  Table.primaryKey({ columns: ["user_uuid", "linq_uuid"] as const, name: "pk_users_linqs", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["user_uuid", "linq_uuid"] as const, name: "users_linqs_user_uuid_linq_uuid", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "created_at", order: "asc", nulls: "last" }] as const, name: "ix_users_linqs_created_at", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "updated_at", order: "asc", nulls: "last" }] as const, name: "ix_users_linqs_updated_at", unique: false, method: "btree" })
)

let users_preferences = Table.make("users_preferences", {
  user_uuid: Column.uuid(),
  can_send_weekly_update: Column.boolean(),
  can_send_bookkeeper_comment: Column.boolean(),
  timezone: Column.varchar(64).pipe(Column.nullable),
  contact_method_old: Column.varchar(64).pipe(Column.nullable),
  contact_method: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  can_send_w9_reminders: Column.boolean().pipe(Column.nullable),
  can_send_year_end_reminders: Column.boolean().pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["user_uuid"] as const, name: "pk_users_preferences", deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "can_send_bookkeeper_comment", order: "asc", nulls: "last" }] as const, name: "ix_users_preferences_can_send_bookkeeper_comment", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "can_send_w9_reminders", order: "asc", nulls: "last" }] as const, name: "ix_users_preferences_can_send_w9_reminders", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "can_send_weekly_update", order: "asc", nulls: "last" }] as const, name: "ix_users_preferences_can_send_weekly_update", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "can_send_year_end_reminders", order: "asc", nulls: "last" }] as const, name: "ix_users_preferences_can_send_year_end_reminders", unique: false, method: "btree" })
)

const whitelisted_emails = Table.make("whitelisted_emails", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  email: Column.varchar(128),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now()))
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "whitelisted_emails_pkey", deferrable: false, initiallyDeferred: false })
)

let workspaces = Table.make("workspaces", {
  id: Column.uuid().pipe(Column.default(Pg.Function.uuidGenerateV4())),
  name: Column.varchar(128),
  crm_airtable_id: Column.char(17).pipe(Column.nullable),
  primary_user_id: Column.uuid().pipe(Column.nullable),
  created_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  updated_at: Column.timestamp().pipe(Column.default(Pg.Function.now())),
  onboarding_specialist_id: Column.uuid().pipe(Column.nullable),
  onboarded_at: Column.timestamp().pipe(Column.nullable),
  airtable_id: Column.char(17).pipe(Column.nullable),
  salesman_email: Column.varchar(320).pipe(Column.nullable),
  tax_airtable_id: Column.char(17).pipe(Column.nullable),
  salesman_id: Column.uuid().pipe(Column.nullable),
  hubspot_contact_id: Column.varchar(32).pipe(Column.nullable)
}).pipe(
  Table.primaryKey({ columns: ["id"] as const, name: "pk_workspaces", deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["airtable_id"] as const, name: "uq_workspaces_airtable_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["crm_airtable_id"] as const, name: "uq_workspaces_crm_airtable_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["name"] as const, name: "uq_workspaces_name", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.unique({ columns: ["primary_user_id"] as const, name: "uq_workspaces_primary_user_id", nullsNotDistinct: false, deferrable: false, initiallyDeferred: false }),
  Table.index({ keys: [{ column: "id", order: "asc", nulls: "last" }] as const, name: "idx_workspaces_with_specialists", unique: false, method: "btree", include: ["name", "onboarding_specialist_id"] as const }),
  Table.index({ keys: [{ column: "hubspot_contact_id", order: "asc", nulls: "last" }] as const, name: "ix_workspaces_hubspot_contact_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "onboarding_specialist_id", order: "asc", nulls: "last" }] as const, name: "ix_workspaces_onboarding_specialist_id", unique: false, method: "btree" }),
  Table.index({ keys: [{ column: "salesman_id", order: "asc", nulls: "last" }] as const, name: "ix_workspaces_salesman_id", unique: false, method: "btree" })
)

const accountingbasis = Pg.schema("public").enum("accountingbasis", ["cash", "accrual", "cash_modified"] as const)

const checkfrequency = Pg.schema("public").enum("checkfrequency", ["DAY", "WEEK", "MONTH"] as const)

const currency = Pg.schema("public").enum("currency", ["USD", "GBP", "EUR", "MXN"] as const)

const questfrequency = Pg.schema("public").enum("questfrequency", ["DAY", "WEEK", "BIWEEK", "MONTH", "QUARTER", "YEAR"] as const)

const rulestatus = Pg.schema("public").enum("rulestatus", ["DRAFT", "APPROVED", "DENIED", "DELETED", "NEEDS_REVIEW"] as const)

const type = Pg.schema("public").enum("type", ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const)

const uplinqjournalstatus = Pg.schema("public").enum("uplinqjournalstatus", ["DRAFT", "UNCLEAR", "READY", "DENIED", "APPROVED", "DELETED", "PENDING_REVIEW"] as const)

const uplinqjournaltype = Pg.schema("public").enum("uplinqjournaltype", ["GENERAL", "OPENING", "CLOSING", "ADJUSTING", "CORRECTING", "INVOICE", "INVOICE_PAYMENT", "BILL", "BILL_PAYMENT"] as const)

const worksystem = Pg.schema("public").enum("worksystem", ["uplinq", "qbo", "qbo2way"] as const)

account_connections = account_connections.pipe(
  Table.foreignKey({ columns: ["workspace_id"] as const, target: () => workspaces, referencedColumns: ["id"] as const, name: "fk_account_connections_workspace_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

account_refs_codat_account = account_refs_codat_account.pipe(
  Table.foreignKey({ columns: ["account_id"] as const, target: () => accounts, referencedColumns: ["id"] as const, name: "fk_account_refs_codat_account_account_id_accounts", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

account_refs_qbo_account = account_refs_qbo_account.pipe(
  Table.foreignKey({ columns: ["account_id"] as const, target: () => accounts, referencedColumns: ["id"] as const, name: "fk_account_refs_qbo_account_account_id_accounts", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["qbo_item_id"] as const, target: () => qbo_items, referencedColumns: ["id"] as const, name: "fk_account_refs_qbo_account_qbo_item_id_qbo_items", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

accounts = accounts.pipe(
  Table.foreignKey({ columns: ["category_id"] as const, target: () => categories, referencedColumns: ["id"] as const, name: "fk_accounts_category_id_categories", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["closing_balance_id"] as const, target: () => balances, referencedColumns: ["id"] as const, name: "fk_accounts_closing_balance_id_balances", onUpdate: "noAction", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["opening_balance_id"] as const, target: () => balances, referencedColumns: ["id"] as const, name: "fk_accounts_opening_balance_id_balances", onUpdate: "noAction", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["workspace_id", "company_id"] as const, target: () => companies, referencedColumns: ["workspace_id", "uuid"] as const, name: "fk_accounts_workspace_id_company_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["workspace_id", "connection_id"] as const, target: () => account_connections, referencedColumns: ["workspace_id", "id"] as const, name: "fk_accounts_workspace_id_connection_id", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

adjustment_history = adjustment_history.pipe(
  Table.foreignKey({ columns: ["adjusting_journal_id"] as const, target: () => uplinq_journals, referencedColumns: ["id"] as const, name: "fk_adjustment_history_adjusting_journal_id_uplinq_journals", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["bookkeeper_id"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_adjustment_history_bookkeeper_id_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["journal_id"] as const, target: () => uplinq_journals, referencedColumns: ["id"] as const, name: "fk_adjustment_history_journal_id_uplinq_journals", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

agent_conversations = agent_conversations.pipe(
  Table.foreignKey({ columns: ["agent_id"] as const, target: () => agents, referencedColumns: ["id"] as const, name: "fk_agent_conversations_agent_id_agents", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

airtable_proposals = airtable_proposals.pipe(
  Table.foreignKey({ columns: ["workspace_id"] as const, target: () => workspaces, referencedColumns: ["id"] as const, name: "fk_proposals_workspace_id_workspaces", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

balances = balances.pipe(
  Table.foreignKey({ columns: ["account_id"] as const, target: () => accounts, referencedColumns: ["id"] as const, name: "fk_balances_account_id_accounts", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["file_id"] as const, target: () => files, referencedColumns: ["id"] as const, name: "fk_balances_file_id_files", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["journal_line_id"] as const, target: () => uplinq_journal_lines, referencedColumns: ["id"] as const, name: "fk_balances_journal_line_id_uplinq_journal_lines", onUpdate: "noAction", onDelete: "setNull", deferrable: false, initiallyDeferred: false })
)

calendar_events = calendar_events.pipe(
  Table.foreignKey({ columns: ["workspace_id"] as const, target: () => workspaces, referencedColumns: ["id"] as const, name: "fk_calendar_events_workspace_id_workspaces", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

cancellation_events = cancellation_events.pipe(
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_cancellation_events_created_by_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["proposal_id"] as const, target: () => proposals, referencedColumns: ["id"] as const, name: "fk_cancellation_events_proposal_id_proposals", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["workspace_id"] as const, target: () => workspaces, referencedColumns: ["id"] as const, name: "fk_cancellation_events_workspace_id_workspaces", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

categories = categories.pipe(
  Table.foreignKey({ columns: ["child_id", "child_name"] as const, target: () => child_categories, referencedColumns: ["number", "name"] as const, name: "fk_categories_child_id_child_name_child_categories", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["cost_center_id"] as const, target: () => cost_centers, referencedColumns: ["number"] as const, name: "fk_categories_cost_center_id_cost_centers", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["department_id", "department_name"] as const, target: () => departments, referencedColumns: ["number", "name"] as const, name: "fk_categories_department_id_department_name_departments", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["parent_id"] as const, target: () => parent_categories, referencedColumns: ["number"] as const, name: "fk_categories_parent_id_parent_categories", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

categorization_rule_history = categorization_rule_history.pipe(
  Table.foreignKey({ columns: ["rule_id"] as const, target: () => categorization_rules, referencedColumns: ["id"] as const, name: "fk_categorization_rule_history_rule_id_categorization_rules", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

categorization_rules = categorization_rules.pipe(
  Table.foreignKey({ columns: ["payee_id"] as const, target: () => payees, referencedColumns: ["id"] as const, name: "fk_categorization_rules_payee_id_payees", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["account_id"] as const, target: () => accounts, referencedColumns: ["id"] as const, name: "fk_uplinq_rules_account_id_accounts", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

check_events = check_events.pipe(
  Table.foreignKey({ columns: ["check_name"] as const, target: () => checks, referencedColumns: ["name"] as const, name: "fk_check_events_check_name_checks", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

checkouts = checkouts.pipe(
  Table.foreignKey({ columns: ["workspace_id"] as const, target: () => workspaces, referencedColumns: ["id"] as const, name: "fk_checkouts_workspace_id_workspaces", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

companies = companies.pipe(
  Table.foreignKey({ columns: ["accounting_specialist_uuid"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_companies_accounting_specialist_uuid_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["bookkeeper_uuid"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_companies_bookkeeper_uuid_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["checkout_id", "workspace_id"] as const, target: () => checkouts, referencedColumns: ["id", "workspace_id"] as const, name: "fk_companies_checkout_id_workspace_id", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["initialization_specialist_uuid"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_companies_initialization_specialist_uuid_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["uuid", "primary_contact_id"] as const, target: () => users_companies, referencedColumns: ["company_uuid", "user_uuid"] as const, name: "fk_companies_primary_contact_id", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["stripe_customer_id"] as const, target: () => stripe_customers, referencedColumns: ["id"] as const, name: "fk_companies_stripe_customer_id_stripe_customers", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["tallyfor_client_id"] as const, target: () => tallyfor_clients, referencedColumns: ["id"] as const, name: "fk_companies_tallyfor_client_id", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["tax_admin_uuid"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_companies_tax_admin_uuid", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["tax_specialist_a_uuid"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_companies_tax_specialist_a_uuid_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["tax_specialist_b_uuid"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_companies_tax_specialist_b_uuid_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["workspace_id"] as const, target: () => workspaces, referencedColumns: ["id"] as const, name: "fk_companies_workspace_id_workspaces", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

companies_products = companies_products.pipe(
  Table.foreignKey({ columns: ["company_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_companies_products_company_uuid_companies", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["product_name"] as const, target: () => products, referencedColumns: ["name"] as const, name: "fk_companies_products_product_name_products", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

companies_stripe_subscription_schedules = companies_stripe_subscription_schedules.pipe(
  Table.foreignKey({ columns: ["company_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_companies_stripe_subscription_schedules_company_uuid_83bf", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["stripe_subscription_schedule_id"] as const, target: () => stripe_subscription_schedules, referencedColumns: ["id"] as const, name: "fk_companies_stripe_subscription_schedules_stripe_subsc_0dac", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

companies_stripe_subscriptions = companies_stripe_subscriptions.pipe(
  Table.foreignKey({ columns: ["company_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_companies_stripe_subscriptions_company_uuid_companies", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["stripe_subscription_id"] as const, target: () => stripe_subscriptions, referencedColumns: ["id"] as const, name: "fk_companies_stripe_subscriptions_stripe_subscription_i_58d5", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

company_addresses = company_addresses.pipe(
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_company_addresses_company_id_companies", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

company_bookkeeping_deliverables = company_bookkeeping_deliverables.pipe(
  Table.foreignKey({ columns: ["company_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_company_bookkeeping_deliverables_company_uuid_companies", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

company_checkouts = company_checkouts.pipe(
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_company_checkouts_company_id_companies", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

company_errors = company_errors.pipe(
  Table.foreignKey({ columns: ["company_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_company_errors_company_uuid_companies", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

company_events = company_events.pipe(
  Table.foreignKey({ columns: ["company_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_company_events_company_uuid_companies", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

company_grid_columns = company_grid_columns.pipe(
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_company_grid_columns_created_by_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

company_grid_view_columns = company_grid_view_columns.pipe(
  Table.foreignKey({ columns: ["column_id"] as const, target: () => company_grid_columns, referencedColumns: ["id"] as const, name: "fk_company_grid_view_columns_column_id_company_grid_columns", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["view_id"] as const, target: () => company_grid_views, referencedColumns: ["id"] as const, name: "fk_company_grid_view_columns_view_id_company_grid_views", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

company_grid_view_favorites = company_grid_view_favorites.pipe(
  Table.foreignKey({ columns: ["bookkeeper_id"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_company_grid_view_favorites_bookkeeper_id_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["view_id"] as const, target: () => company_grid_views, referencedColumns: ["id"] as const, name: "fk_company_grid_view_favorites_view_id_company_grid_views", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

company_grid_view_invites = company_grid_view_invites.pipe(
  Table.foreignKey({ columns: ["bookkeeper_id"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_company_grid_view_invites_bookkeeper_id_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_company_grid_view_invites_created_by_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["view_id"] as const, target: () => company_grid_views, referencedColumns: ["id"] as const, name: "fk_company_grid_view_invites_view_id_company_grid_views", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

company_grid_views = company_grid_views.pipe(
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_company_grid_views_created_by_bookkeepers", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["last_opened_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_company_grid_views_last_opened_by_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

company_statuses = company_statuses.pipe(
  Table.foreignKey({ columns: ["company_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_company_statuses_company_uuid_companies", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

company_taxes = company_taxes.pipe(
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_company_taxes_company_id_companies", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

credentials = credentials.pipe(
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_credentials_company_id_companies", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

customer_refs_qbo_customer = customer_refs_qbo_customer.pipe(
  Table.foreignKey({ columns: ["customer_id"] as const, target: () => customers, referencedColumns: ["id"] as const, name: "fk_customer_refs_qbo_customer_customer_id_customers", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["qbo_item_id"] as const, target: () => qbo_items, referencedColumns: ["id"] as const, name: "fk_customer_refs_qbo_customer_qbo_item_id_qbo_items", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

customers = customers.pipe(
  Table.foreignKey({ columns: ["parent_id", "company_id"] as const, target: () => customers, referencedColumns: ["id", "company_id"] as const, name: "fk_customers_parent_id_customers", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

dashboards = dashboards.pipe(
  Table.foreignKey({ columns: ["company_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_dashboards_company_uuid_companies", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

deprecated_products = deprecated_products.pipe(
  Table.foreignKey({ columns: ["new_product_name"] as const, target: () => products, referencedColumns: ["name"] as const, name: "fk_deprecated_products_new_product_name_products", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["old_product_name"] as const, target: () => products, referencedColumns: ["name"] as const, name: "fk_deprecated_products_old_product_name_products", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

email_conversation_companies = email_conversation_companies.pipe(
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_email_conversation_companies_company_id_companies", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["conversation_id"] as const, target: () => email_conversations, referencedColumns: ["id"] as const, name: "fk_email_conversation_companies_conversation_id_email_c_a9c5", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

email_conversations = email_conversations.pipe(
  Table.foreignKey({ columns: ["workspace_id"] as const, target: () => workspaces, referencedColumns: ["id"] as const, name: "fk_email_conversations_workspace_id_workspaces", onUpdate: "noAction", onDelete: "setNull", deferrable: false, initiallyDeferred: false })
)

email_message_recipients = email_message_recipients.pipe(
  Table.foreignKey({ columns: ["email_message_id"] as const, target: () => email_messages, referencedColumns: ["id"] as const, name: "fk_email_message_recipients_email_message_id_email_messages", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

email_messages = email_messages.pipe(
  Table.foreignKey({ columns: ["conversation_id"] as const, target: () => email_conversations, referencedColumns: ["id"] as const, name: "fk_email_messages_conversation_id_email_conversations", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

file_upload_request_templates = file_upload_request_templates.pipe(
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["email"] as const, name: "fk_file_upload_request_templates_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

file_upload_requests = file_upload_requests.pipe(
  Table.foreignKey({ columns: ["account_id"] as const, target: () => accounts, referencedColumns: ["id"] as const, name: "fk_file_upload_requests_accounts", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["email"] as const, name: "fk_file_upload_requests_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["questionnaire_assignment_id"] as const, target: () => questionnaire_assignments, referencedColumns: ["id"] as const, name: "fk_file_upload_requests_questionnaire_assignment_id", onUpdate: "cascade", onDelete: "restrict", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["questionnaire_item_id"] as const, target: () => questionnaire_template_items, referencedColumns: ["id"] as const, name: "fk_file_upload_requests_questionnaire_item_id", onUpdate: "cascade", onDelete: "restrict", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["questionnaire_item_rule_id"] as const, target: () => questionnaire_item_file_request_rules, referencedColumns: ["id"] as const, name: "fk_file_upload_requests_questionnaire_item_rule_id", onUpdate: "cascade", onDelete: "restrict", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["template_id"] as const, target: () => file_upload_request_templates, referencedColumns: ["id"] as const, name: "fk_file_upload_requests_template_id", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false })
)

files = files.pipe(
  Table.foreignKey({ columns: ["account_id"] as const, target: () => accounts, referencedColumns: ["id"] as const, name: "fk_files_accounts_account_id", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["company_id", "account_id"] as const, target: () => accounts, referencedColumns: ["company_id", "id"] as const, name: "fk_files_accounts_company_id_account_id", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["book_pk"] as const, target: () => ocrolus_books, referencedColumns: ["pk"] as const, name: "fk_files_book_pk", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["document_pk"] as const, target: () => ocrolus_uploads, referencedColumns: ["pk"] as const, name: "fk_files_document_pk", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["company_id", "file_upload_request_id"] as const, target: () => file_upload_requests, referencedColumns: ["company_id", "id"] as const, name: "fk_files_file_upload_request_id_company_id", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["payee_id"] as const, target: () => payees, referencedColumns: ["id"] as const, name: "fk_files_payee_id", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["company_id", "project_id"] as const, target: () => projects, referencedColumns: ["company_id", "id"] as const, name: "fk_files_project_id", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["company_id", "bank_account_id"] as const, target: () => uplinq_bank_accounts, referencedColumns: ["company_id", "id"] as const, name: "fk_statements_bank_account_id_company_id", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

fixed_assets = fixed_assets.pipe(
  Table.foreignKey({ columns: ["accumulated_account_id"] as const, target: () => accounts, referencedColumns: ["id"] as const, name: "fk_fixed_assets_accumulated_account_id_accounts", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["asset_account_id"] as const, target: () => accounts, referencedColumns: ["id"] as const, name: "fk_fixed_assets_asset_account_id_accounts", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["expense_account_id"] as const, target: () => accounts, referencedColumns: ["id"] as const, name: "fk_fixed_assets_expense_account_id_accounts", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

gmail_message_refs = gmail_message_refs.pipe(
  Table.foreignKey({ columns: ["email_message_id"] as const, target: () => email_messages, referencedColumns: ["id"] as const, name: "fk_gmail_message_refs_email_message_id_email_messages", onUpdate: "noAction", onDelete: "setNull", deferrable: false, initiallyDeferred: false })
)

hand_off_projects = hand_off_projects.pipe(
  Table.foreignKey({ columns: ["hand_off_id"] as const, target: () => hand_offs, referencedColumns: ["id"] as const, name: "fk_hand_off_projects_hand_off_id_hand_offs", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["project_id"] as const, target: () => projects, referencedColumns: ["id"] as const, name: "fk_hand_off_projects_project_id_projects", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

hand_off_statuses = hand_off_statuses.pipe(
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_hand_off_statuses_created_by_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["hand_off_id"] as const, target: () => hand_offs, referencedColumns: ["id"] as const, name: "fk_hand_off_statuses_hand_off_id_hand_offs", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

hand_offs = hand_offs.pipe(
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_hand_offs_company_id_companies", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_hand_offs_created_by_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["reviewer_id"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_hand_offs_reviewer_id_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

ignored_transactions = ignored_transactions.pipe(
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_ignored_transactions_created_by_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["statement_id"] as const, target: () => files, referencedColumns: ["id"] as const, name: "fk_ignored_transactions_statement_id_files", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["transaction_id"] as const, target: () => uplinq_bank_transactions, referencedColumns: ["id"] as const, name: "fk_ignored_transactions_transaction_id_uplinq_bank_transactions", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

issues = issues.pipe(
  Table.foreignKey({ columns: ["check_name"] as const, target: () => checks, referencedColumns: ["name"] as const, name: "fk_issues_check_name_checks", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

journal_connection_events = journal_connection_events.pipe(
  Table.foreignKey({ columns: ["journal_id"] as const, target: () => uplinq_journals, referencedColumns: ["id"] as const, name: "journal_connection_events_journal_id_fkey", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

linqs = linqs.pipe(
  Table.foreignKey({ columns: ["source_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_linqs_source_uuid_companies", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["target_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_linqs_target_uuid_companies", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

linqs_versions = linqs_versions.pipe(
  Table.foreignKey({ columns: ["linq_uuid"] as const, target: () => linqs, referencedColumns: ["uuid"] as const, name: "fk_linqs_versions_linq_uuid_linqs", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

meeting_turns = meeting_turns.pipe(
  Table.foreignKey({ columns: ["meeting_id"] as const, target: () => meetings, referencedColumns: ["id"] as const, name: "fk_meeting_turns_meeting_id_meetings", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

meetings = meetings.pipe(
  Table.foreignKey({ columns: ["workspace_id"] as const, target: () => workspaces, referencedColumns: ["id"] as const, name: "fk_meetings_workspace_id_workspaces", onUpdate: "noAction", onDelete: "setNull", deferrable: false, initiallyDeferred: false })
)

merchant_payees = merchant_payees.pipe(
  Table.foreignKey({ columns: ["payee_id"] as const, target: () => payees, referencedColumns: ["id"] as const, name: "fk_merchant_payees_payee_id_payees", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

notification_views = notification_views.pipe(
  Table.foreignKey({ columns: ["bookkeeper_id"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_notification_views_bookkeeper_id_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["notification_id"] as const, target: () => notifications, referencedColumns: ["id"] as const, name: "fk_notification_views_notification_id_notifications", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["user_id"] as const, target: () => users, referencedColumns: ["uuid"] as const, name: "fk_notification_views_user_id_users", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

notifications = notifications.pipe(
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_notifications_company_id_companies", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

ocrolus_uploads = ocrolus_uploads.pipe(
  Table.foreignKey({ columns: ["book_id"] as const, target: () => ocrolus_books, referencedColumns: ["pk"] as const, name: "fk_ocrolus_uploads_book_id_ocrolus_books", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

payee_balance_reviews = payee_balance_reviews.pipe(
  Table.foreignKey({ columns: ["payee_id"] as const, target: () => payees, referencedColumns: ["id"] as const, name: "fk_payee_balance_reviews_payee_id_payees", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["reviewed_by_user_id"] as const, target: () => users, referencedColumns: ["uuid"] as const, name: "fk_payee_balance_reviews_reviewed_by_user_id_users", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

payees = payees.pipe(
  Table.foreignKey({ columns: ["canonical_id"] as const, target: () => payees, referencedColumns: ["id"] as const, name: "fk_payees_canonical_id_payees", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false })
)

payees_refs_qbo_vendor = payees_refs_qbo_vendor.pipe(
  Table.foreignKey({ columns: ["payee_id"] as const, target: () => payees, referencedColumns: ["id"] as const, name: "fk_payees_refs_qbo_vendor_payee_id_payees", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["qbo_item_id"] as const, target: () => qbo_items, referencedColumns: ["id"] as const, name: "fk_payees_refs_qbo_vendor_qbo_item_id_qbo_items", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

plaid_enrich_meta = plaid_enrich_meta.pipe(
  Table.foreignKey({ columns: ["bank_transaction_id"] as const, target: () => uplinq_bank_transactions, referencedColumns: ["id"] as const, name: "fk_plaid_enrich_meta_bank_transaction_id_uplinq_bank_tr_eec0", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

product_children = product_children.pipe(
  Table.foreignKey({ columns: ["child_product_name"] as const, target: () => products, referencedColumns: ["name"] as const, name: "fk_product_children_child_product_name_products", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["parent_product_name"] as const, target: () => products, referencedColumns: ["name"] as const, name: "fk_product_children_parent_product_name_products", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

project_custom_column_events = project_custom_column_events.pipe(
  Table.foreignKey({ columns: ["column_id"] as const, target: () => project_grid_columns, referencedColumns: ["id"] as const, name: "fk_project_custom_column_events_column_id_project_grid_columns", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_project_custom_column_events_created_by_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["project_id"] as const, target: () => projects, referencedColumns: ["id"] as const, name: "fk_project_custom_column_events_project_id_projects", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

project_events = project_events.pipe(
  Table.foreignKey({ columns: ["bookkeeper_created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_project_events_bookkeeper_created_by_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["project_id"] as const, target: () => projects, referencedColumns: ["id"] as const, name: "fk_project_events_project_id_projects", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["user_created_by"] as const, target: () => users, referencedColumns: ["uuid"] as const, name: "fk_project_events_user_created_by_users", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

project_grid_columns = project_grid_columns.pipe(
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_project_grid_columns_created_by_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

project_grid_view_columns = project_grid_view_columns.pipe(
  Table.foreignKey({ columns: ["column_id"] as const, target: () => project_grid_columns, referencedColumns: ["id"] as const, name: "fk_project_grid_view_columns_column_id_project_grid_columns", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["company_grid_column_id"] as const, target: () => company_grid_columns, referencedColumns: ["id"] as const, name: "fk_project_grid_view_columns_company_grid_column_id_com_00f3", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["view_id"] as const, target: () => project_grid_views, referencedColumns: ["id"] as const, name: "fk_project_grid_view_columns_view_id_project_grid_views", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

project_grid_view_favorites = project_grid_view_favorites.pipe(
  Table.foreignKey({ columns: ["bookkeeper_id"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_project_grid_view_favorites_bookkeeper_id_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["view_id"] as const, target: () => project_grid_views, referencedColumns: ["id"] as const, name: "fk_project_grid_view_favorites_view_id_project_grid_views", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

project_grid_view_managers = project_grid_view_managers.pipe(
  Table.foreignKey({ columns: ["bookkeeper_id"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_project_grid_view_managers_bookkeeper_id_bookkeepers", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_project_grid_view_managers_created_by_bookkeepers", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["view_id"] as const, target: () => project_grid_views, referencedColumns: ["id"] as const, name: "fk_project_grid_view_managers_view_id_project_grid_views", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

project_grid_views = project_grid_views.pipe(
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_project_grid_views_created_by_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["last_opened_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_project_grid_views_last_opened_by_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["manager_id"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_project_grid_views_manager_id_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["owner_id"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_project_grid_views_owner_id_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

project_statuses = project_statuses.pipe(
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_project_statuses_created_by_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["project_id", "project_type"] as const, target: () => projects, referencedColumns: ["id", "type"] as const, name: "fk_project_statuses_project_id_projects", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

projects = projects.pipe(
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_projects_company_id_companies", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["product_name"] as const, target: () => products, referencedColumns: ["name"] as const, name: "fk_projects_product_name_products", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["proposal_product_id"] as const, target: () => proposal_products, referencedColumns: ["id"] as const, name: "fk_projects_proposal_product_id_proposal_products", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["reviewer_id"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_projects_reviewer_id_bookkeepers", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["tallyfor_binder_id"] as const, target: () => tallyfor_binders, referencedColumns: ["id"] as const, name: "fk_projects_tallyfor_binder_id", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false })
)

proposal_companies = proposal_companies.pipe(
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_proposal_companies_company_id_companies", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["proposal_id"] as const, target: () => proposals, referencedColumns: ["id"] as const, name: "fk_proposal_companies_proposal_id_proposals", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["workspace_id"] as const, target: () => workspaces, referencedColumns: ["id"] as const, name: "fk_proposal_companies_workspace_id", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

proposal_contacts = proposal_contacts.pipe(
  Table.foreignKey({ columns: ["workspace_id"] as const, target: () => workspaces, referencedColumns: ["id"] as const, name: "fk_proposal_contacts_workspace_id_workspaces", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

proposal_products = proposal_products.pipe(
  Table.foreignKey({ columns: ["canceled_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_proposal_products_canceled_by", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_proposal_products_company_id_companies", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["parent_id"] as const, target: () => proposal_products, referencedColumns: ["id"] as const, name: "fk_proposal_products_parent_id_proposal_products", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["product_name"] as const, target: () => products, referencedColumns: ["name"] as const, name: "fk_proposal_products_product_name_products", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["proposal_id"] as const, target: () => proposals, referencedColumns: ["id"] as const, name: "fk_proposal_products_proposal_id_proposals", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

proposal_sent_events = proposal_sent_events.pipe(
  Table.foreignKey({ columns: ["contact_id"] as const, target: () => proposal_contacts, referencedColumns: ["id"] as const, name: "fk_proposal_sent_events_contact_id_proposal_contacts", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_proposal_sent_events_created_by_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["proposal_id"] as const, target: () => proposals, referencedColumns: ["id"] as const, name: "fk_proposal_sent_events_proposal_id_proposals", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

proposal_signed_events = proposal_signed_events.pipe(
  Table.foreignKey({ columns: ["proposal_id"] as const, target: () => proposals, referencedColumns: ["id"] as const, name: "fk_proposal_signed_events_proposal_id_proposals", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

proposals = proposals.pipe(
  Table.foreignKey({ columns: ["canceled_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_proposals_canceled_by_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_proposals_created_by_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["deleted_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_proposals_deleted_by_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["workspace_id"] as const, target: () => workspaces, referencedColumns: ["id"] as const, name: "fk_proposals_workspace_id_workspaces", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

qbo_bank_feed_accounts = qbo_bank_feed_accounts.pipe(
  Table.foreignKey({ columns: ["bank_feed_connection_id"] as const, target: () => qbo_bank_feed_connections, referencedColumns: ["id"] as const, name: "fk_qbo_bank_feed_accounts_bank_feed_connection_id_qbo_b_8d13", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["qbo_item_id"] as const, target: () => qbo_items, referencedColumns: ["id"] as const, name: "fk_qbo_bank_feed_accounts_qbo_item_id_qbo_items", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

qbo_bank_feed_connections = qbo_bank_feed_connections.pipe(
  Table.foreignKey({ columns: ["qbo_item_id"] as const, target: () => qbo_items, referencedColumns: ["id"] as const, name: "fk_qbo_bank_feed_connections_qbo_item_id_qbo_items", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

qbo_bridge_item_access_tokens = qbo_bridge_item_access_tokens.pipe(
  Table.foreignKey({ columns: ["item_id"] as const, target: () => qbo_bridge_items, referencedColumns: ["id"] as const, name: "fk_qbo_bridge_item_access_tokens_item_id_qbo_bridge_items", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

qbo_event_logs = qbo_event_logs.pipe(
  Table.foreignKey({ columns: ["qbo_item_id"] as const, target: () => qbo_items, referencedColumns: ["id"] as const, name: "fk_qbo_event_logs_qbo_item_id_qbo_items", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

qbo_linked_txns = qbo_linked_txns.pipe(
  Table.foreignKey({ columns: ["qbo_item_id"] as const, target: () => qbo_items, referencedColumns: ["id"] as const, name: "fk_qbo_linked_txns_qbo_item_id_qbo_items", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

questionnaire_answers = questionnaire_answers.pipe(
  Table.foreignKey({ columns: ["assignment_id"] as const, target: () => questionnaire_assignments, referencedColumns: ["id"] as const, name: "fk_questionnaire_answers_assignment_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["bookkeeper_id"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_questionnaire_answers_bookkeeper_id", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["item_id"] as const, target: () => questionnaire_template_items, referencedColumns: ["id"] as const, name: "fk_questionnaire_answers_item_id", onUpdate: "cascade", onDelete: "restrict", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["user_id"] as const, target: () => users, referencedColumns: ["uuid"] as const, name: "fk_questionnaire_answers_user_id", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false })
)

questionnaire_assignments = questionnaire_assignments.pipe(
  Table.foreignKey({ columns: ["assigned_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_questionnaire_assignments_assigned_by", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_questionnaire_assignments_company_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["version_id"] as const, target: () => questionnaire_template_versions, referencedColumns: ["id"] as const, name: "fk_questionnaire_assignments_version_id", onUpdate: "cascade", onDelete: "restrict", deferrable: false, initiallyDeferred: false })
)

questionnaire_item_file_request_rules = questionnaire_item_file_request_rules.pipe(
  Table.foreignKey({ columns: ["item_id"] as const, target: () => questionnaire_template_items, referencedColumns: ["id"] as const, name: "fk_questionnaire_item_fr_rules_item_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["file_request_template_id"] as const, target: () => file_upload_request_templates, referencedColumns: ["id"] as const, name: "fk_questionnaire_item_fr_rules_template_id", onUpdate: "cascade", onDelete: "restrict", deferrable: false, initiallyDeferred: false })
)

questionnaire_template_items = questionnaire_template_items.pipe(
  Table.foreignKey({ columns: ["file_request_template_id"] as const, target: () => file_upload_request_templates, referencedColumns: ["id"] as const, name: "fk_questionnaire_template_items_fr_template_id", onUpdate: "cascade", onDelete: "restrict", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["parent_id"] as const, target: () => questionnaire_template_items, referencedColumns: ["id"] as const, name: "fk_questionnaire_template_items_parent_id_questionnaire_e82e", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["version_id"] as const, target: () => questionnaire_template_versions, referencedColumns: ["id"] as const, name: "fk_questionnaire_template_items_version_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

questionnaire_template_versions = questionnaire_template_versions.pipe(
  Table.foreignKey({ columns: ["archived_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_questionnaire_template_versions_archived_by", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_questionnaire_template_versions_created_by", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["published_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_questionnaire_template_versions_published_by", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["template_id"] as const, target: () => questionnaire_templates, referencedColumns: ["id"] as const, name: "fk_questionnaire_template_versions_template_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

questionnaire_templates = questionnaire_templates.pipe(
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_questionnaire_templates_created_by", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

quests = quests.pipe(
  Table.foreignKey({ columns: ["schedule_id"] as const, target: () => quests, referencedColumns: ["id"] as const, name: "fk_quests_schedule_id_quests", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

quests_credentials = quests_credentials.pipe(
  Table.foreignKey({ columns: ["credential_id"] as const, target: () => credentials, referencedColumns: ["id"] as const, name: "fk_quests_credentials_credential_id_credentials", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["quest_id"] as const, target: () => quests, referencedColumns: ["id"] as const, name: "fk_quests_credentials_quest_id_quests", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

quests_file_upload_requests = quests_file_upload_requests.pipe(
  Table.foreignKey({ columns: ["file_upload_request_id"] as const, target: () => file_upload_requests, referencedColumns: ["id"] as const, name: "fk_quests_file_upload_requests_file_upload_request_id_f_38e2", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["quest_id"] as const, target: () => quests, referencedColumns: ["id"] as const, name: "fk_quests_file_upload_requests_quest_id_quests", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

quests_third_party_apps = quests_third_party_apps.pipe(
  Table.foreignKey({ columns: ["quest_id"] as const, target: () => quests, referencedColumns: ["id"] as const, name: "fk_quests_third_party_apps_quest_id_quests", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["third_party_app_id"] as const, target: () => third_party_apps, referencedColumns: ["id"] as const, name: "fk_quests_third_party_apps_third_party_app_id_third_party_apps", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

reconciliations = reconciliations.pipe(
  Table.foreignKey({ columns: ["bank_account_id"] as const, target: () => uplinq_bank_accounts, referencedColumns: ["id"] as const, name: "fk_reconciliations_bank_account_id_uplinq_bank_accounts", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["created_by"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_reconciliations_created_by_bookkeepers", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["end_balance_id"] as const, target: () => uplinq_bank_account_balances, referencedColumns: ["id"] as const, name: "fk_reconciliations_end_balance_id_uplinq_bank_account_balances", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["start_balance_id"] as const, target: () => uplinq_bank_account_balances, referencedColumns: ["id"] as const, name: "fk_reconciliations_start_balance_id_uplinq_bank_account_e5b2", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

sent_email_attachments = sent_email_attachments.pipe(
  Table.foreignKey({ columns: ["sent_email_id"] as const, target: () => sent_emails, referencedColumns: ["id"] as const, name: "email_event_attachments_email_event_id_fkey", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

sent_email_deliveries = sent_email_deliveries.pipe(
  Table.foreignKey({ columns: ["sent_email_id"] as const, target: () => sent_emails, referencedColumns: ["id"] as const, name: "fk_email_events_event_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

sent_email_opens = sent_email_opens.pipe(
  Table.foreignKey({ columns: ["sent_email_id"] as const, target: () => sent_emails, referencedColumns: ["id"] as const, name: "fk_email_events_event_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

stripe_invoice_line_items = stripe_invoice_line_items.pipe(
  Table.foreignKey({ columns: ["stripe_invoice_id"] as const, target: () => stripe_invoices, referencedColumns: ["id"] as const, name: "fk_stripe_invoice_line_items_stripe_invoice_id_stripe_invoices", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["stripe_product_id"] as const, target: () => products, referencedColumns: ["stripe_product_id"] as const, name: "fk_stripe_invoice_line_items_stripe_product_id_products", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["stripe_subscription_id"] as const, target: () => stripe_subscriptions, referencedColumns: ["id"] as const, name: "fk_stripe_invoice_line_items_stripe_subscription_id_str_1c21", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false })
)

stripe_invoices = stripe_invoices.pipe(
  Table.foreignKey({ columns: ["stripe_customer_id"] as const, target: () => stripe_customers, referencedColumns: ["id"] as const, name: "fk_stripe_invoices_stripe_customer_id_stripe_customers", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["stripe_subscription_id"] as const, target: () => stripe_subscriptions, referencedColumns: ["id"] as const, name: "fk_stripe_invoices_stripe_subscription_id_stripe_subscriptions", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false })
)

stripe_subscription_line_items = stripe_subscription_line_items.pipe(
  Table.foreignKey({ columns: ["stripe_product_id"] as const, target: () => products, referencedColumns: ["stripe_product_id"] as const, name: "fk_stripe_subscription_line_items_stripe_product_id_products", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["stripe_subscription_id"] as const, target: () => stripe_subscriptions, referencedColumns: ["id"] as const, name: "fk_stripe_subscription_line_items_stripe_subscription_i_20ca", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

stripe_subscription_schedule_phase_line_items = stripe_subscription_schedule_phase_line_items.pipe(
  Table.foreignKey({ columns: ["stripe_subscription_schedule_id", "stripe_subscription_schedule_phase_id"] as const, target: () => stripe_subscription_schedule_phases, referencedColumns: ["stripe_subscription_schedule_id", "id"] as const, name: "fk_stripe_subscription_schedule_phase_line_items_phase__d775", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["stripe_product_id"] as const, target: () => products, referencedColumns: ["stripe_product_id"] as const, name: "fk_stripe_subscription_schedule_phase_line_items_stripe_b7c5", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

stripe_subscription_schedule_phases = stripe_subscription_schedule_phases.pipe(
  Table.foreignKey({ columns: ["stripe_subscription_schedule_id"] as const, target: () => stripe_subscription_schedules, referencedColumns: ["id"] as const, name: "fk_stripe_subscription_schedule_phases_stripe_subscript_8530", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

stripe_subscription_schedules = stripe_subscription_schedules.pipe(
  Table.foreignKey({ columns: ["stripe_customer_id"] as const, target: () => stripe_customers, referencedColumns: ["id"] as const, name: "fk_stripe_subscription_schedules_stripe_customer_id_str_0795", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["stripe_subscription_id"] as const, target: () => stripe_subscriptions, referencedColumns: ["id"] as const, name: "fk_stripe_subscription_schedules_stripe_subscription_id_c8f0", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

stripe_subscriptions = stripe_subscriptions.pipe(
  Table.foreignKey({ columns: ["stripe_customer_id"] as const, target: () => stripe_customers, referencedColumns: ["id"] as const, name: "fk_stripe_subscriptions_stripe_customer_id_stripe_customers", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

tallyfor_binders = tallyfor_binders.pipe(
  Table.foreignKey({ columns: ["client_id"] as const, target: () => tallyfor_clients, referencedColumns: ["id"] as const, name: "fk_tallyfor_binders_client_id_tallyfor_clients", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

task_assigned_to_events = task_assigned_to_events.pipe(
  Table.foreignKey({ columns: ["task_id"] as const, target: () => tasks, referencedColumns: ["id"] as const, name: "fk_task_assigned_to_events_task_id_tasks", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

task_status_events = task_status_events.pipe(
  Table.foreignKey({ columns: ["task_id"] as const, target: () => tasks, referencedColumns: ["id"] as const, name: "fk_task_status_events_task_id_tasks", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

tasks = tasks.pipe(
  Table.foreignKey({ columns: ["assigned_to"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_tasks_assigned_to_bookkeepers", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["related_task"] as const, target: () => tasks, referencedColumns: ["id"] as const, name: "fk_tasks_related_task_tasks", onUpdate: "noAction", onDelete: "setNull", deferrable: false, initiallyDeferred: false })
)

tax_statuses = tax_statuses.pipe(
  Table.foreignKey({ columns: ["company_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_tax_statuses_company_uuid_companies", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

third_party_apps = third_party_apps.pipe(
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_third_party_apps_company_id_companies", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

thread_messages = thread_messages.pipe(
  Table.foreignKey({ columns: ["company_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_thread_messages_companies", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["thread_name", "company_uuid"] as const, target: () => threads, referencedColumns: ["name", "company_uuid"] as const, name: "fk_thread_messages_threads", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

threads = threads.pipe(
  Table.foreignKey({ columns: ["company_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_threads_companies", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

unprocessed_transactions = unprocessed_transactions.pipe(
  Table.foreignKey({ columns: ["bank_account_id"] as const, target: () => uplinq_bank_accounts, referencedColumns: ["id"] as const, name: "fk_unprocessed_transactions_bank_account_id_uplinq_bank_ed42", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

uplinq_bank_account_balances = uplinq_bank_account_balances.pipe(
  Table.foreignKey({ columns: ["bank_account_id", "statement_id"] as const, target: () => files, referencedColumns: ["bank_account_id", "id"] as const, name: "fk_uplinq_bank_account_balances_bank_account_id_statement_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["bank_account_id"] as const, target: () => uplinq_bank_accounts, referencedColumns: ["id"] as const, name: "fk_uplinq_bank_account_balances_bank_account_id_uplinq__b46a", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

uplinq_bank_account_company_history = uplinq_bank_account_company_history.pipe(
  Table.foreignKey({ columns: ["bank_account_id"] as const, target: () => uplinq_bank_accounts, referencedColumns: ["id"] as const, name: "fk_uplinq_bank_account_company_history_bank_account_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

uplinq_bank_account_plaid_refs = uplinq_bank_account_plaid_refs.pipe(
  Table.foreignKey({ columns: ["bank_account_id"] as const, target: () => uplinq_bank_accounts, referencedColumns: ["id"] as const, name: "fk_uplinq_bank_account_refs_bank_account_id_uplinq_bank_d61b", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

uplinq_bank_accounts = uplinq_bank_accounts.pipe(
  Table.foreignKey({ columns: ["account_id"] as const, target: () => accounts, referencedColumns: ["id"] as const, name: "fk_uplinq_bank_accounts_account_id_accounts", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["credentials_id"] as const, target: () => credentials, referencedColumns: ["id"] as const, name: "fk_uplinq_bank_accounts_credentials_id", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["closing_statement_id"] as const, target: () => files, referencedColumns: ["id"] as const, name: "uplinq_bank_accounts_closing_statement_id_fkey", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["opening_statement_id"] as const, target: () => files, referencedColumns: ["id"] as const, name: "uplinq_bank_accounts_opening_statement_id_fkey", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false })
)

uplinq_bank_transaction_csv_refs = uplinq_bank_transaction_csv_refs.pipe(
  Table.foreignKey({ columns: ["bank_transaction_id"] as const, target: () => uplinq_bank_transactions, referencedColumns: ["id"] as const, name: "fk_uplinq_bank_transaction_csv_refs_bank_transaction_id_3e52", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["statement_id"] as const, target: () => files, referencedColumns: ["id"] as const, name: "fk_uplinq_bank_transaction_csv_refs_statement_id_files", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

uplinq_bank_transaction_ocrolus_refs = uplinq_bank_transaction_ocrolus_refs.pipe(
  Table.foreignKey({ columns: ["bank_transaction_id"] as const, target: () => uplinq_bank_transactions, referencedColumns: ["id"] as const, name: "fk_uplinq_bank_transaction_ocrolus_refs_bank_transactio_b047", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["statement_id"] as const, target: () => files, referencedColumns: ["id"] as const, name: "fk_uplinq_bank_transaction_ocrolus_refs_statement_id_files", onUpdate: "noAction", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)

uplinq_bank_transaction_plaid_refs = uplinq_bank_transaction_plaid_refs.pipe(
  Table.foreignKey({ columns: ["bank_transaction_id"] as const, target: () => uplinq_bank_transactions, referencedColumns: ["id"] as const, name: "fk_uplinq_bank_transaction_refs_bank_transaction_id_upl_7e49", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

uplinq_bank_transactions = uplinq_bank_transactions.pipe(
  Table.foreignKey({ columns: ["bank_account_id", "statement_id"] as const, target: () => files, referencedColumns: ["bank_account_id", "id"] as const, name: "fk_uplinq_bank_transactions_bank_account_id_statement_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["company_id", "bank_account_id"] as const, target: () => uplinq_bank_accounts, referencedColumns: ["company_id", "id"] as const, name: "fk_uplinq_bank_transactions_company_id_id", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["journal_line_id"] as const, target: () => uplinq_journal_lines, referencedColumns: ["id"] as const, name: "fk_uplinq_bank_transactions_journal_line_id_uplinq_jour_8dae", onUpdate: "cascade", onDelete: "noAction", deferrable: true, initiallyDeferred: false })
)

uplinq_journal_adjustments = uplinq_journal_adjustments.pipe(
  Table.foreignKey({ columns: ["adjusted_parent_id"] as const, target: () => uplinq_journals, referencedColumns: ["id"] as const, name: "fk_uplinq_journal_adjustments_adjusted_parent_id_uplinq_0ea3", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["adjusting_child_id"] as const, target: () => uplinq_journals, referencedColumns: ["id"] as const, name: "fk_uplinq_journal_adjustments_adjusting_child_id_uplinq_104a", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

uplinq_journal_comments = uplinq_journal_comments.pipe(
  Table.foreignKey({ columns: ["journal_id", "company_id"] as const, target: () => uplinq_journals, referencedColumns: ["id", "company_id"] as const, name: "fk_uplinq_journal_comments_journal_id_company_id_uplinq_2a80", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

uplinq_journal_line_reconciliations = uplinq_journal_line_reconciliations.pipe(
  Table.foreignKey({ columns: ["line_id"] as const, target: () => uplinq_journal_lines, referencedColumns: ["id"] as const, name: "fk_uplinq_journal_line_reconciliations_line_id_uplinq_j_7897", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["reconciliation_id"] as const, target: () => reconciliations, referencedColumns: ["id"] as const, name: "fk_uplinq_journal_line_reconciliations_reconciliation_i_6096", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

uplinq_journal_lines = uplinq_journal_lines.pipe(
  Table.foreignKey({ columns: ["account_id"] as const, target: () => accounts, referencedColumns: ["id"] as const, name: "fk_uplinq_journal_lines_account_id_accounts", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["customer_id"] as const, target: () => customers, referencedColumns: ["id"] as const, name: "fk_uplinq_journal_lines_customer_id_customers", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["journal_id", "company_id"] as const, target: () => uplinq_journals, referencedColumns: ["id", "company_id"] as const, name: "fk_uplinq_journal_lines_journal_id_company_id_uplinq_journals", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["payee_id"] as const, target: () => payees, referencedColumns: ["id"] as const, name: "fk_uplinq_journal_lines_payee_id_payees", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["reconciliation_id"] as const, target: () => reconciliations, referencedColumns: ["id"] as const, name: "fk_uplinq_journal_lines_reconciliation_id_reconciliations", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false })
)

uplinq_journal_refs_codat_journals = uplinq_journal_refs_codat_journals.pipe(
  Table.foreignKey({ columns: ["journal_id", "company_id"] as const, target: () => uplinq_journals, referencedColumns: ["id", "company_id"] as const, name: "fk_uplinq_journal_refs_codat_journals_journal_id_compan_31d9", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

uplinq_journal_refs_qbo_journal = uplinq_journal_refs_qbo_journal.pipe(
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_uplinq_journal_refs_qbo_journal_company_id_companies", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["qbo_item_id"] as const, target: () => qbo_items, referencedColumns: ["id"] as const, name: "fk_uplinq_journal_refs_qbo_journal_qbo_item_id_qbo_items", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["journal_id"] as const, target: () => uplinq_journals, referencedColumns: ["id"] as const, name: "fk_uplinq_journal_refs_qbo_journal_uplinq_journal_id_up_5016", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

uplinq_journal_warning = uplinq_journal_warning.pipe(
  Table.foreignKey({ columns: ["account_id"] as const, target: () => accounts, referencedColumns: ["id"] as const, name: "fk_uplinq_journal_warning_account_id_accounts", onUpdate: "cascade", onDelete: "setNull", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["journal_id"] as const, target: () => uplinq_journals, referencedColumns: ["id"] as const, name: "fk_uplinq_journal_warning_journal_id_uplinq_journals", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

uplinq_plaid_account_exclusions = uplinq_plaid_account_exclusions.pipe(
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_uplinq_plaid_account_exclusions_company_id_companies", onUpdate: "cascade", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

users_companies = users_companies.pipe(
  Table.foreignKey({ columns: ["company_uuid"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_users_companies_company_uuid_companies", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["user_uuid"] as const, target: () => users, referencedColumns: ["uuid"] as const, name: "fk_users_companies_user_uuid_users", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

users_companies_activities = users_companies_activities.pipe(
  Table.foreignKey({ columns: ["company_id"] as const, target: () => companies, referencedColumns: ["uuid"] as const, name: "fk_users_companies_activities_company_id_companies", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["user_id"] as const, target: () => users, referencedColumns: ["uuid"] as const, name: "fk_users_companies_activities_user_id_users", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

users_linqs = users_linqs.pipe(
  Table.foreignKey({ columns: ["linq_uuid"] as const, target: () => linqs, referencedColumns: ["uuid"] as const, name: "fk_users_linqs_linq_uuid_linqs", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["user_uuid"] as const, target: () => users, referencedColumns: ["uuid"] as const, name: "fk_users_linqs_user_uuid_users", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

users_preferences = users_preferences.pipe(
  Table.foreignKey({ columns: ["user_uuid"] as const, target: () => users, referencedColumns: ["uuid"] as const, name: "fk_users_preferences_user_uuid_users", onUpdate: "noAction", onDelete: "cascade", deferrable: false, initiallyDeferred: false })
)

workspaces = workspaces.pipe(
  Table.foreignKey({ columns: ["onboarding_specialist_id"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_workspaces_onboarding_specialist_id_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["primary_user_id"] as const, target: () => users, referencedColumns: ["uuid"] as const, name: "fk_workspaces_primary_user_id_users", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false }),
  Table.foreignKey({ columns: ["salesman_id"] as const, target: () => bookkeepers, referencedColumns: ["uuid"] as const, name: "fk_workspaces_salesman_id_bookkeepers", onUpdate: "cascade", onDelete: "noAction", deferrable: false, initiallyDeferred: false })
)
export { account_connections, account_refs_codat_account, account_refs_qbo_account, accounts, adjustment_history, administrators, agent_conversations, agents, airtable_proposals, alembic_version, analysis_snapshots, awsdms_ddl_audit, balances, bookkeepers, calendar_events, cancellation_events, categories, categorization_rule_history, categorization_rules, chat_messages, check_events, checkouts, checks, child_categories, companies, companies_products, companies_stripe_subscription_schedules, companies_stripe_subscriptions, company_addresses, company_audit_logs, company_bookkeeping_deliverables, company_checkout_audit_logs, company_checkouts, company_errors, company_events, company_grid_columns, company_grid_view_columns, company_grid_view_favorites, company_grid_view_invites, company_grid_views, company_product_audit_logs, company_statuses, company_taxes, cost_centers, credentials, customer_refs_qbo_customer, customer_satisfaction_ratings, customers, dashboards, departments, deprecated_products, email_conversation_companies, email_conversations, email_message_recipients, email_messages, file_upload_request_templates, file_upload_requests, files, fixed_assets, gmail_cursors, gmail_message_refs, hand_off_projects, hand_off_statuses, hand_offs, ignored_transactions, issues, jobs, journal_connection_events, linqs, linqs_versions, meeting_turns, meetings, merchant_payees, notification_views, notifications, ocrolus_books, ocrolus_uploads, parent_categories, payee_balance_reviews, payees, payees_refs_qbo_vendor, plaid_enrich_meta, product_children, products, project_custom_column_events, project_events, project_grid_columns, project_grid_view_columns, project_grid_view_favorites, project_grid_view_managers, project_grid_views, project_statuses, projects, proposal_companies, proposal_contacts, proposal_products, proposal_sent_events, proposal_signed_events, proposals, qbo_bank_feed_accounts, qbo_bank_feed_connections, qbo_bridge_item_access_tokens, qbo_bridge_items, qbo_event_logs, qbo_items, qbo_linked_txns, questionnaire_answers, questionnaire_assignments, questionnaire_item_file_request_rules, questionnaire_template_items, questionnaire_template_versions, questionnaire_templates, quests, quests_credentials, quests_file_upload_requests, quests_third_party_apps, reconciliations, sent_email_attachments, sent_email_deliveries, sent_email_opens, sent_emails, stripe_customers, stripe_invoice_line_items, stripe_invoices, stripe_subscription_line_items, stripe_subscription_schedule_phase_line_items, stripe_subscription_schedule_phases, stripe_subscription_schedules, stripe_subscriptions, summary_email_targets, tallyfor_binders, tallyfor_clients, task_assigned_to_events, task_status_events, tasks, tax_forms, tax_statuses, third_party_apps, thread_messages, threads, unprocessed_transactions, uplinq_bank_account_balances, uplinq_bank_account_company_history, uplinq_bank_account_plaid_refs, uplinq_bank_accounts, uplinq_bank_transaction_csv_refs, uplinq_bank_transaction_ocrolus_refs, uplinq_bank_transaction_plaid_refs, uplinq_bank_transactions, uplinq_journal_adjustments, uplinq_journal_audit_logs, uplinq_journal_comments, uplinq_journal_history, uplinq_journal_line_audit_logs, uplinq_journal_line_reconciliations, uplinq_journal_lines, uplinq_journal_refs_codat_journals, uplinq_journal_refs_qbo_journal, uplinq_journal_warning, uplinq_journals, uplinq_plaid_account_exclusions, users, users_companies, users_companies_activities, users_linqs, users_preferences, whitelisted_emails, workspaces, accountingbasis, checkfrequency, currency, questfrequency, rulestatus, type, uplinqjournalstatus, uplinqjournaltype, worksystem }