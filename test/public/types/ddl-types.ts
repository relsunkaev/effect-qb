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
const dropTablePlan = Q.dropTable(memberships, {
  ifExists: true
})
const createIndexPlan = Q.createIndex(memberships, ["role", "orgId"])
const dropIndexPlan = Q.dropIndex(memberships, ["role", "orgId"], {
  ifExists: true
})
const createSingleColumnIndexPlan = Q.createIndex(memberships, "role")
const dropSingleColumnIndexPlan = Q.dropIndex(memberships, "role")
const richColumnsOnlyIndexTable = memberships.pipe(Pg.Table.index({
  columns: ["role"] as const
}))

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
