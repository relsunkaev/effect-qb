// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 205-224

// README.md:205-224
import { Column, Query, Table } from "effect-qb"

const organizations = Table.make("organizations", {
  id: Column.uuid().pipe(Column.primaryKey),
  name: Column.text().pipe(Column.unique),
  archivedAt: Column.datetime().pipe(Column.nullable)
})

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  orgId: Column.uuid().pipe(Column.references(() => organizations.id)),
  email: Column.text().pipe(Column.unique),
  status: Column.text().pipe(Column.default(Query.literal("active")))
})

type NewUser = Table.InsertOf<typeof users>
// { readonly id: string; readonly orgId: string; readonly email: string;
//   readonly status?: string } — the database supplies the default when omitted

export {};
