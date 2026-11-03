import { Check, Column, ForeignKey, Index, PrimaryKey, Query, Table, Unique } from "effect-qb"
import * as Pg from "effect-qb/postgres"

type Assert<T extends true> = T
type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2)
      ? true
      : false
    : false

const organizations = Table.make("organizations", {
  id: Column.uuid().pipe(Column.primaryKey)
})

const fields = {
  orgId: Column.uuid(),
  userId: Column.uuid(),
  role: Column.text(),
  note: Column.text().pipe(Column.nullable)
}

// Several options in one pipe call, as the README declares tables.
const memberships = Table.make("memberships", fields).pipe(
  ForeignKey.make((table) => table.orgId, () => organizations.id),
  PrimaryKey.make((table) => [table.orgId, table.userId]),
  Unique.make((table) => [table.orgId, table.role]),
  Check.make("memberships_role_check", (table) => Query.neq(table.role, "")),
  Index.make((table) => table.userId)
)

// The same options, one per pipe call.
const chainedMemberships = Table.make("memberships", fields)
  .pipe(ForeignKey.make((table) => table.orgId, () => organizations.id))
  .pipe(PrimaryKey.make((table) => [table.orgId, table.userId]))
  .pipe(Unique.make((table) => [table.orgId, table.role]))
  .pipe(Check.make("memberships_role_check", (table) => Query.neq(table.role, "")))
  .pipe(Index.make((table) => table.userId))

// One pipe call with several options types the same as one call per option.
type _MultiOptionPipeMatchesChainedPipe = Assert<IsExact<typeof memberships, typeof chainedMemberships>>

// Columns stay bound to the table instead of widening to `BoundColumn<any, ...> | undefined`.
const roleColumn: typeof chainedMemberships.role = memberships.role
type _RowKeepsColumns = Assert<IsExact<
  Query.ResultRow<typeof readMemberships>,
  { readonly orgId: string; readonly role: string }
>>
const readMemberships = Query.select({ orgId: memberships.orgId, role: memberships.role }).pipe(
  Query.from(memberships)
)

// Dialect modifiers keep working in any position.
const postgresMemberships = Table.make("memberships", fields).pipe(
  PrimaryKey.make((table) => [table.orgId, table.userId]),
  Index.make((table) => table.role).pipe(Index.named("memberships_role_idx"), Pg.Index.using("btree"))
)
const postgresRole: typeof chainedMemberships.role = postgresMemberships.role

// Every arity up to nine options types the same as chaining them.
const nine = Table.make("memberships", fields).pipe(
  Index.make((table) => table.orgId).pipe(Index.named("i1")),
  Index.make((table) => table.userId).pipe(Index.named("i2")),
  Index.make((table) => table.role).pipe(Index.named("i3")),
  Index.make((table) => table.note).pipe(Index.named("i4")),
  Index.make((table) => table.orgId).pipe(Index.named("i5")),
  Index.make((table) => table.userId).pipe(Index.named("i6")),
  Index.make((table) => table.role).pipe(Index.named("i7")),
  Index.make((table) => table.note).pipe(Index.named("i8")),
  PrimaryKey.make((table) => table.userId)
)
const chainedNine = Table.make("memberships", fields)
  .pipe(Index.make((table) => table.orgId).pipe(Index.named("i1")))
  .pipe(Index.make((table) => table.userId).pipe(Index.named("i2")))
  .pipe(Index.make((table) => table.role).pipe(Index.named("i3")))
  .pipe(Index.make((table) => table.note).pipe(Index.named("i4")))
  .pipe(Index.make((table) => table.orgId).pipe(Index.named("i5")))
  .pipe(Index.make((table) => table.userId).pipe(Index.named("i6")))
  .pipe(Index.make((table) => table.role).pipe(Index.named("i7")))
  .pipe(Index.make((table) => table.note).pipe(Index.named("i8")))
  .pipe(PrimaryKey.make((table) => table.userId))
type _NineOptionsMatchChained = Assert<IsExact<typeof nine, typeof chainedNine>>

