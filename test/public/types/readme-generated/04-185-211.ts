// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 185-211

// README.md:185-211
import { Column, Table } from "effect-qb"

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
  Table.primaryKey(["orgId", "userId"] as const),
  Table.index("userId")
)

type Organization = Table.SelectOf<typeof organizations>
type NewOrganization = Table.InsertOf<typeof organizations>
type OrganizationPatch = Table.UpdateOf<typeof organizations>

void memberships
type _Organization = Organization
type _NewOrganization = NewOrganization
type _OrganizationPatch = OrganizationPatch

export {};
