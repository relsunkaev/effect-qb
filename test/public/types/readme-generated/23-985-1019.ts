// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 985-1019

// README.md:985-1019
import * as Schema from "effect/Schema"
import { Column, Index, Query, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
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
  Index.make("createdAt").pipe(
    Index.named("events_created_at_idx"),
    Pg.Index.using("btree")
  )
)

const eventKinds = Query.select({
  id: events.id,
  kind: events.payload.pipe(Jsonb.key("kind"), Jsonb.text)
}).pipe(Query.from(events))

Pg.Renderer.make().render(eventKinds)

export {};
