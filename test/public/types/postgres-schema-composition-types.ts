import * as Schema from "effect/Schema"
import { Casing, Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const Analytics = Pg.Schema.make("analytics").pipe(
  Casing.withCasing({
    tables: "snake_case",
    columns: "snake_case",
    types: "snake_case",
    sequences: "snake_case"
  })
)

const metrics = Analytics.table("Metrics", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime(),
  meta: Pg.Column.jsonb(Schema.Struct({
    count: Schema.Number
  }))
})

const events = Table.make("Events", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime(),
  meta: Pg.Column.jsonb(Schema.Struct({
    kind: Schema.String
  }))
}).pipe(
  Casing.withCasing({ columns: "snake_case" }),
  Analytics.withSchema
)

const plan = Query.select({
  id: metrics.id,
  meta: metrics.meta
}).pipe(Query.from(metrics))

Pg.Renderer.make().render(plan)
Pg.Renderer.make().render(Query.select({ id: events.id }).pipe(Query.from(events)))

const status = Analytics.enum("EventStatus", ["pending", "processed"])
const sequence = Analytics.sequence("EventIdSeq")
const statusMetadata = status.column().metadata.enum!
const statusValue: typeof statusMetadata.schemaName = "analytics"
const sequenceSchemaName: typeof sequence.schemaName = "analytics"

void statusMetadata
void statusValue
void sequenceSchemaName
