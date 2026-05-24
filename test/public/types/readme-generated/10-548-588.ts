// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 548-588

// README.md:548-588
import { Column as C, Query as Q, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"
import * as Schema from "effect/Schema"
import { Json as J } from "effect-qb/postgres"

const events = Table.make("events", {
  id: C.uuid().pipe(C.primaryKey),
  payload: Pg.Column.jsonb(Schema.Union(
    Schema.Struct({
      kind: Schema.Literal("signup"),
      email: Schema.String
    }),
    Schema.Struct({
      kind: Schema.Literal("purchase"),
      amount: Schema.Number
    })
  ))
})

const payloadKind = J.jsonb.text(events.payload, J.jsonb.key("kind"))

const purchaseEvents = Q.select({
  payload: events.payload
}).pipe(
  Q.from(events),
  Q.where(Q.eq(payloadKind, "purchase"))
)

type PurchaseEventRow = Q.ResultRow<typeof purchaseEvents>
// {
//   payload: {
//     kind: "purchase"
//     amount: number
//   }
// }

declare const purchaseEvent: PurchaseEventRow
const purchaseKind: "purchase" = purchaseEvent.payload.kind
const purchaseAmount: number = purchaseEvent.payload.amount

export {};
