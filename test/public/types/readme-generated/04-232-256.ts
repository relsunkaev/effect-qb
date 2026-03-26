// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 232-256

// README.md:232-256
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const orgs = Table.make("orgs", {
  id: C.uuid().pipe(C.primaryKey),
  slug: C.text().pipe(C.unique)
})

const membershipsBase = Table.make("memberships", {
  id: C.uuid().pipe(C.primaryKey),
  orgId: C.uuid(),
  role: C.text(),
  note: C.text().pipe(C.nullable)
})

const membershipsWithKeys = membershipsBase.pipe(
  Table.foreignKey("orgId", () => orgs, "id"),
  Table.unique(["orgId", "role"]),
  Table.index(["role", "orgId"])
)

const memberships = membershipsWithKeys.pipe(
  Table.check("role_not_empty", Q.neq(membershipsBase.role, ""))
)

export {};
