import * as Std from "effect-qb"
import * as Effect from "effect/Effect"

import * as Pg from "effect-qb/postgres"
import { Executor, Query as Q, Renderer } from "effect-qb/postgres"

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
  Std.Table.foreignKey("orgId", () => orgs, "id"),
  Std.Table.unique(["orgId", "role"]),
  Std.Table.index(["role", "orgId"])
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
const richColumnsOnlyIndexTable = memberships.pipe(Pg.Table.index({
  columns: ["role"] as const
}))

// @ts-expect-error check constraint names must be non-empty
Std.Table.check("", Q.eq(memberships.role, "admin"))
// @ts-expect-error postgres primary key option names must be non-empty
Pg.Table.primaryKey({ columns: ["id"] as const, name: "" })
// @ts-expect-error postgres unique option names must be non-empty
Pg.Table.unique({ columns: ["role"] as const, name: "" })
// @ts-expect-error postgres index option names must be non-empty
Pg.Table.index({ columns: ["role"] as const, name: "" })
// @ts-expect-error postgres index methods must be non-empty
Pg.Table.index({ columns: ["role"] as const, method: "" })
// @ts-expect-error postgres index included columns must be non-empty
Pg.Table.index({ columns: ["role"] as const, include: [""] as const })
// @ts-expect-error postgres index key columns must be non-empty
Pg.Table.index({ keys: [{ column: "" }] as const })
// @ts-expect-error postgres index operator classes must be non-empty
Pg.Table.index({ keys: [{ column: "role", operatorClass: "" }] as const })
// @ts-expect-error postgres index collations must be non-empty
Pg.Table.index({ keys: [{ column: "role", collation: "" }] as const })
// @ts-expect-error postgres foreign key option names must be non-empty
Pg.Table.foreignKey({ columns: "orgId", target: () => orgs, referencedColumns: "id", name: "" })
// @ts-expect-error postgres check constraint names must be non-empty
Pg.Table.check("", Q.eq(memberships.role, "admin"))
// @ts-expect-error postgres rich check constraint names must be non-empty
Pg.Table.check({ name: "", predicate: Q.eq(memberships.role, "admin") })
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

// @ts-expect-error ddl plans cannot be filtered
Q.where(Q.eq(memberships.id, "membership-id"))(createTablePlan)

// @ts-expect-error ddl plans cannot be sourced
Q.from(memberships)(dropTablePlan)

// @ts-expect-error ddl plans cannot return rows
Q.returning({ id: memberships.id })(createIndexPlan)

// @ts-expect-error createIndex only accepts known table columns
Q.createIndex(memberships, ["missing"])

// @ts-expect-error dropIndex only accepts known table columns
Q.dropIndex(memberships, ["missing"])

// @ts-expect-error rich index columns cannot be empty
Pg.Table.index({ columns: [] as const })

const renderer = Renderer.make()
const executor = Executor.custom(<PlanValue extends Q.QueryPlan<any, any, any, any, any, any, any, any, any, any>>(
  plan: Q.DialectCompatiblePlan<PlanValue, "postgres">
): Effect.Effect<any, never, never> => {
  void plan
  return null as never
})
void renderer
void executor
