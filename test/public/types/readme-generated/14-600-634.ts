// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 600-634

// README.md:600-634
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const payloadSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("created"),
    actorId: Schema.String
  }),
  Schema.Struct({
    kind: Schema.Literal("deleted"),
    reason: Schema.String
  })
)

const events = Table.make("events", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(payloadSchema),
  createdAt: Column.datetime()
}).pipe(
  Pg.Table.index({
    name: "events_created_at_idx",
    columns: "createdAt",
    method: "btree"
  })
)

const eventKinds = Query.select({
  id: events.id,
  kind: Pg.Json.jsonb.text(events.payload, Pg.Json.jsonb.key("kind"))
}).pipe(Query.from(events))

Pg.Renderer.make().render(eventKinds)

export {};
