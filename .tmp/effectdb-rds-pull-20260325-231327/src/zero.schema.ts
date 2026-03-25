import * as Pg from "effect-qb/postgres"
import { Table, Column } from "effect-qb/postgres"
import * as Schema from "effect/Schema"
const permissions = Table.make("permissions", {
  permissions: Column.jsonb(Schema.Unknown).pipe(Column.nullable),
  hash: Column.text().pipe(Column.nullable),
  lock: Column.boolean().pipe(Column.default(Pg.Query.literal(true)))
}, "zero").pipe(
  Table.check("permissions_lock_check", Pg.Query.column("lock", Pg.Query.type.bool())),
  Table.primaryKey({ columns: ["lock"] as const, name: "permissions_pkey", deferrable: false, initiallyDeferred: false })
)

const schemaVersions = Table.make("schemaVersions", {
  minSupportedVersion: Column.int().pipe(Column.nullable),
  maxSupportedVersion: Column.int().pipe(Column.nullable),
  lock: Column.boolean().pipe(Column.default(Pg.Query.literal(true)))
}, "zero").pipe(
  Table.check("schemaVersions_lock_check", Pg.Query.column("lock", Pg.Query.type.bool())),
  Table.primaryKey({ columns: ["lock"] as const, name: "schemaVersions_pkey", deferrable: false, initiallyDeferred: false })
)
export { permissions, schemaVersions }