import * as StdRoot from "effect-qb"
import * as Std from "effect-qb"
import * as Effect from "effect/Effect"

import * as Pg from "effect-qb/postgres"
import { Check, ForeignKey, Index, PrimaryKey, Unique } from "effect-qb"
import { Query as Q } from "effect-qb"
import { Executor, Renderer } from "effect-qb/postgres"

const orgs = Std.Table.make("orgs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  slug: Std.Column.text().pipe(Std.Column.unique)
})

const memberships = Std.Table.make("memberships", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  orgId: Std.Column.uuid(),
  role: Std.Column.text(),
  note: Std.Column.text().pipe(Std.Column.nullable)
}).pipe(
  ForeignKey.make((table) => table.orgId, () => orgs.id),
  Unique.make((table) => [table.orgId, table.role]),
  Index.make((table) => [table.role, table.orgId])
)

const createTablePlan = Q.createTable(memberships, {
  ifNotExists: true
})
Q.createTable(memberships, {
  // @ts-expect-error createTable ifNotExists must be boolean
  ifNotExists: "yes"
})
const dropTablePlan = Q.dropTable(memberships, {
  ifExists: true
})
const createIndexPlan = Q.createIndex(memberships, ["role", "orgId"])
Q.createIndex(memberships, ["role", "orgId"], {
  // @ts-expect-error createIndex unique must be boolean
  unique: "yes"
})
const dropIndexPlan = Q.dropIndex(memberships, ["role", "orgId"], {
  ifExists: true
})
const createSingleColumnIndexPlan = Q.createIndex(memberships, "role")
const dropSingleColumnIndexPlan = Q.dropIndex(memberships, "role")
const richColumnsOnlyIndexTable = memberships.pipe(Index.make((table) => table.role))
const richPostgresIndexTable = memberships.pipe(
  Index.make((table) => table.role).pipe(
    Pg.Index.include((table) => table.note),
    Pg.Index.key((table) => table.role, { order: "desc", nulls: "last" })
  )
)
const richPostgresExpressionIndexTable = memberships.pipe(
  Index.make((table) => table.role).pipe(
    Pg.Index.keys((table) => [
      { column: table.role, order: "asc" },
      { expression: Q.literal("role"), nulls: "first" }
    ])
  )
)
const tableCallbackCheck = Std.Table.make("table_callback_memberships", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  role: Std.Column.text()
}).pipe(
  Check.make("role_not_empty", (table) => Q.neq(table.role, ""))
)
ForeignKey.make((table) => table.orgId, () => orgs.id).pipe(ForeignKey.onUpdate("cascade"))

// @ts-expect-error check constraint names must be non-empty
Check.make("", Q.eq(memberships.role, "admin"))
// @ts-expect-error postgres primary key option names must be non-empty
PrimaryKey.make((table) => table.id).pipe(PrimaryKey.named(""))
// @ts-expect-error postgres unique option names must be non-empty
Unique.make((table) => table.role).pipe(Unique.named(""))
// @ts-expect-error postgres index option names must be non-empty
Index.make((table) => table.role).pipe(Index.named(""))
// @ts-expect-error postgres index methods must be non-empty
Index.make((table) => table.role).pipe(Pg.Index.using(""))
memberships.pipe(Index.make((table) => table.role).pipe(
  // @ts-expect-error postgres index included columns must exist on the table
  Pg.Index.include((table: typeof memberships) => table.missing)
))
memberships.pipe(Index.make((table) => table.role).pipe(
  // @ts-expect-error postgres index key columns must exist on the table
  Pg.Index.key((table: typeof memberships) => table.missing)
))
// @ts-expect-error postgres index operator classes must be non-empty
Index.make((table) => table.role).pipe(Pg.Index.key((table) => table.role, { operatorClass: "" }))
// @ts-expect-error postgres index collations must be non-empty
Index.make((table) => table.role).pipe(Pg.Index.key((table) => table.role, { collation: "" }))
// @ts-expect-error postgres foreign key option names must be non-empty
ForeignKey.make((table) => table.orgId, () => orgs.id).pipe(ForeignKey.named(""))
// @ts-expect-error postgres check constraint names must be non-empty
Check.make("", Q.eq(memberships.role, "admin"))
// @ts-expect-error postgres index modifiers only apply to index options
Unique.make((table) => table.role).pipe(Pg.Index.using("btree"))
// @ts-expect-error postgres unique modifiers only apply to unique options
Index.make((table) => table.role).pipe(Pg.Unique.nullsNotDistinct)
// @ts-expect-error postgres primary-key modifiers only apply to primary-key options
ForeignKey.make((table) => table.orgId, () => orgs.id).pipe(Pg.PrimaryKey.deferrable)
// @ts-expect-error postgres foreign-key modifiers only apply to foreign-key options
PrimaryKey.make((table) => table.id).pipe(ForeignKey.onDelete("cascade"))
// @ts-expect-error inline unique constraint names must be non-empty
Std.Column.text().pipe(Std.Column.unique.options({ name: "" }))
// @ts-expect-error postgres inline unique constraint names must be non-empty
Std.Column.text().pipe(Pg.Column.unique.options({ name: "" }))
// @ts-expect-error postgres inline ddl type names must be non-empty
Std.Column.text().pipe(Pg.Column.ddlType(""))
// @ts-expect-error postgres inline index names must be non-empty
Std.Column.text().pipe(Pg.Column.index({ name: "" }))
// @ts-expect-error postgres inline index methods must be non-empty
Std.Column.text().pipe(Pg.Column.index({ method: "" }))
// @ts-expect-error postgres inline index included columns must be non-empty
Std.Column.text().pipe(Pg.Column.index({ include: [""] as const }))
// @ts-expect-error postgres inline index operator classes must be non-empty
Std.Column.text().pipe(Pg.Column.index({ operatorClass: "" }))
// @ts-expect-error postgres inline index collations must be non-empty
Std.Column.text().pipe(Pg.Column.index({ collation: "" }))
// @ts-expect-error postgres inline foreign key names must be non-empty
Std.Column.uuid().pipe(Pg.Column.foreignKey({ target: () => orgs.id, name: "" }))

type CreateTableStatement = Q.StatementOfPlan<typeof createTablePlan>
type DropTableStatement = Q.StatementOfPlan<typeof dropTablePlan>
type CreateIndexStatement = Q.StatementOfPlan<typeof createIndexPlan>
type DropIndexStatement = Q.StatementOfPlan<typeof dropIndexPlan>

const createTableStatement: CreateTableStatement = "createTable"
const dropTableStatement: DropTableStatement = "dropTable"
const createIndexStatement: CreateIndexStatement = "createIndex"
const dropIndexStatement: DropIndexStatement = "dropIndex"
void createTableStatement
void dropTableStatement
void createIndexStatement
void dropIndexStatement

type CreateTableCapability = Q.CapabilitiesOfPlan<typeof createTablePlan>
type DropTableCapability = Q.CapabilitiesOfPlan<typeof dropTablePlan>
type CreateIndexCapability = Q.CapabilitiesOfPlan<typeof createIndexPlan>
type DropIndexCapability = Q.CapabilitiesOfPlan<typeof dropIndexPlan>

const createTableCapability: CreateTableCapability = "ddl"
const dropTableCapability: DropTableCapability = "ddl"
const createIndexCapability: CreateIndexCapability = "ddl"
const dropIndexCapability: DropIndexCapability = "ddl"
void createTableCapability
void dropTableCapability
void createIndexCapability
void dropIndexCapability
void createSingleColumnIndexPlan
void dropSingleColumnIndexPlan
void richColumnsOnlyIndexTable
void richPostgresIndexTable
void richPostgresExpressionIndexTable
void tableCallbackCheck

// @ts-expect-error ddl plans cannot be filtered
Q.where(Q.eq(memberships.id, "membership-id"))(createTablePlan)

// @ts-expect-error ddl plans cannot be sourced
Q.from(memberships)(dropTablePlan)

// @ts-expect-error ddl plans cannot return rows
Q.returning({ id: memberships.id })(createIndexPlan)

// @ts-expect-error createIndex columns must exist on the table
Q.createIndex(memberships, ["missing"])

// @ts-expect-error dropIndex columns must exist on the table
Q.dropIndex(memberships, ["missing"])

// @ts-expect-error rich index columns cannot be empty
Index.make((table) => [])

const renderer = Renderer.make()
const executor = Executor.custom(<PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
  plan: Q.DialectCompatiblePlan<PlanValue, "postgres">
): Effect.Effect<any, never, never> => {
  void plan
  return null as never
})
void renderer
void executor
