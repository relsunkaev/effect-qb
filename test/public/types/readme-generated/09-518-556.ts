// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 518-556

// README.md:518-556
import * as Schema from "effect/Schema"
import { Column as C, Json as J, Query as Q, Table } from "effect-qb/postgres"

const events = Table.make("events", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.jsonb(Schema.Union([
    Schema.Struct({
      kind: Schema.Literal("signup"),
      email: Schema.String
    }),
    Schema.Struct({
      kind: Schema.Literal("purchase"),
      amount: Schema.Number
    })
  ]))
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
