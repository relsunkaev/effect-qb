import { identity, pipe } from "effect/Function"
import { Casing, Column, Index, PrimaryKey, Query, Table, Unique } from "effect-qb"

type Assert<T extends true> = T
type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false
    : false

const users = Table.make("users", {
  id: Column.text(),
  email: Column.text(),
  role: Column.text()
})
type User = { id: string; email: string; role: string }
type UserPatch = { email?: string; role?: string }

// Capture selector context from each incoming table. Implicit selector
// inference in mixed pipes remains a separate limitation.
const mixed = users.pipe(
  (table) => PrimaryKey.make(() => table.id)(table),
  Casing.withCasing("snake_case"),
  (table) => Unique.make(() => table.email)(table)
)
type _MixedRow = Assert<IsExact<Table.SelectOf<typeof mixed>, User>>
type _MixedPatch = Assert<IsExact<Table.UpdateOf<typeof mixed>, UserPatch>>
// @ts-expect-error text columns cannot accept numbers
const invalidMixedRow: Table.SelectOf<typeof mixed> = { id: "ada", email: 123, role: "reader" }
// @ts-expect-error primary keys cannot be updated
const invalidMixedPatch: Table.UpdateOf<typeof mixed> = { id: "other" }

const casingFirst = users.pipe(
  Casing.withCasing("snake_case"),
  (table) => PrimaryKey.make(() => table.id)(table)
)
type _CasingFirst = Assert<IsExact<Table.UpdateOf<typeof casingFirst>, UserPatch>>

const identityBetween = users.pipe(
  (table) => PrimaryKey.make(() => table.id)(table),
  identity,
  (table) => Unique.make(() => table.email)(table)
)
type _IdentityBetween = Assert<IsExact<Table.UpdateOf<typeof identityBetween>, UserPatch>>

const standalone = pipe(
  users,
  (table) => PrimaryKey.make(() => table.id)(table),
  Casing.withCasing("snake_case"),
  (table) => Unique.make(() => table.email)(table)
)
type _StandaloneRow = Assert<IsExact<Table.SelectOf<typeof standalone>, User>>
type _StandalonePatch = Assert<IsExact<Table.UpdateOf<typeof standalone>, UserPatch>>

const name = users.pipe(
  (table) => PrimaryKey.make(() => table.id)(table),
  (table) => table.name
)
type _Name = Assert<IsExact<typeof name, "users">>
const length = users.pipe((table) => table.name, (name) => name.length)
type _Length = Assert<IsExact<typeof length, number>>

const ten = users.pipe(
  (table) => Index.make(() => table.id)(table),
  (table) => Index.make(() => table.email)(table),
  (table) => Index.make(() => table.role)(table),
  (table) => Index.make(() => table.id)(table),
  (table) => Index.make(() => table.email)(table),
  (table) => Index.make(() => table.role)(table),
  (table) => Index.make(() => table.id)(table),
  (table) => Index.make(() => table.email)(table),
  (table) => Index.make(() => table.role)(table),
  (table) => PrimaryKey.make(() => table.id)(table)
)
type _TenRow = Assert<IsExact<Table.SelectOf<typeof ten>, User>>
type _TenPatch = Assert<IsExact<Table.UpdateOf<typeof ten>, UserPatch>>

const read = Query.select({ id: mixed.id, email: mixed.email }).pipe(Query.from(mixed))
type _QueryRow = Assert<IsExact<Query.ResultRow<typeof read>, { readonly id: string; readonly email: string }>>
Query.insert(mixed, { id: "ada", email: "ada@example.com", role: "reader" }).pipe(
  Query.onConflict("email", { update: { role: "editor" } })
)
// @ts-expect-error a non-unique column is not a conflict target
Query.insert(mixed, { id: "ada", email: "ada@example.com", role: "reader" }).pipe(Query.onConflict("role", { update: { role: "editor" } }))
