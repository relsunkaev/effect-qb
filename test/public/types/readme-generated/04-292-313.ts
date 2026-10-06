// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 292-313

// README.md:292-313
import * as Schema from "effect/Schema"
import { Column, Table } from "effect-qb"

const events = Table.make("events", {
  id: Column.uuid().pipe(Column.primaryKey),
  happenedOn: Column.date().pipe(Column.schema(Schema.DateFromString)),
  payload: Column.json(Schema.Struct({
    visits: Schema.Number
  }))
})

type EventRow = Table.SelectOf<typeof events>
// {
//   readonly id: string
//   readonly happenedOn: Date          // decoded by Schema.DateFromString
//   readonly payload: { readonly visits: number }
// }

type EventInsert = Table.InsertOf<typeof events>


export {};
