// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1438-1470

// README.md:1438-1470
import * as Schema from "effect/Schema"
import { Column, Index, Query, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as Pg from "effect-qb/postgres"

const payloadSchema = Schema.Struct({
  kind: Schema.String,
  actorId: Schema.String
})

const events = Table.make("events", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(payloadSchema),
  createdAt: Column.datetime()
}).pipe(
  Index.make((table) => table.createdAt).pipe(
    Index.named("events_created_at_idx"),
    Pg.Index.using("btree")
  )
)

const createdEvents = Query.select({
  id: events.id,
  kind: events.payload.kind.pipe(Jsonb.text)
}).pipe(
  Query.from(events),
  Query.where(Query.eq(events.payload.kind.pipe(Jsonb.text), "created"))
)

const rendered = Pg.Renderer.make().render(createdEvents)
// select "events"."id" as "id", ("events"."payload" ->> $1) as "kind" from "events" where (("events"."payload" ->> $2) = $3)

export {};
