// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 626-668

// README.md:626-668
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
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
  payload: Pg.Column.jsonb(payloadSchema)
})

const kind = events.payload.kind.pipe(Jsonb.text)

const createdEvents = Query.select({
  payload: events.payload,
  kind
}).pipe(
  Query.from(events),
  Query.where(Query.eq(kind, "created"))
)

type CreatedEventRow = Query.ResultRow<typeof createdEvents>
// {
//   readonly payload: {
//     readonly kind: "created"
//     readonly actorId: string
//   }
//   readonly kind: "created"
// }
// The discriminator equality removes the deleted payload branch.


export {};
