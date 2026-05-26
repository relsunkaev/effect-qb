// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 286-329

// README.md:286-329
import * as Schema from "effect/Schema"
import { Casing, Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const Snake = Casing.casing({
  tables: "snake_case",
  columns: "snake_case"
})

const users = Snake.table("Users", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime()
})

const Analytics = Pg.Schema.make("analytics").pipe(
  Casing.withCasing({
    tables: "snake_case",
    columns: "snake_case",
    types: "snake_case",
    sequences: "snake_case"
  })
)

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

const readEvents = Query.select({
  id: events.id,
  kind: Pg.Json.jsonb.text(events.meta, Pg.Json.jsonb.key("kind"))
}).pipe(Query.from(events))

Pg.Renderer.make().render(readEvents)

void users

export {};
