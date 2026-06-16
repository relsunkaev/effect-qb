// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 198-232

// README.md:198-232
import { Check, Column, ForeignKey, Index, PrimaryKey, Query, Table, Unique } from "effect-qb"

const organizations = Table.make("organizations", {
  id: Column.uuid().pipe(Column.primaryKey),
  name: Column.text(),
  archivedAt: Column.datetime().pipe(Column.nullable)
})

const memberships = Table.make("memberships", {
  orgId: Column.uuid(),
  userId: Column.uuid(),
  role: Column.text()
}).pipe(
  // (local columns on this table, referenced columns on the other table)
  ForeignKey.make((table) => table.orgId, () => organizations.id),
  PrimaryKey.make((table) => [table.orgId, table.userId]),
  Unique.make((table) => [table.orgId, table.role]),
  Check.make(
    "memberships_role_check",
    (table) => Query.neq(table.role, "")
  ),
  Index.make((table) => table.userId)
)

type Membership = Table.SelectOf<typeof memberships>
// { readonly orgId: string; readonly userId: string; readonly role: string }

type NewMembership = Table.InsertOf<typeof memberships>
// { readonly orgId: string; readonly userId: string; readonly role: string }

type MembershipPatch = Table.UpdateOf<typeof memberships>
// { readonly role?: string } — the composite primary key is omitted from updates


export {};
