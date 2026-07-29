// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1289-1310

// README.md:1289-1310
import { Column, Query, Table } from "effect-qb"

const events = Table.make("events", {
  id: Column.int().pipe(Column.primaryKey),
  createdAt: Column.text()
})

const page = Query.select({
  id: events.id,
  createdAt: events.createdAt
}).pipe(
  Query.from(events),
  Query.keyset({
    by: [
      { expression: events.createdAt, cursor: "2026-07-29T12:00:00", direction: "desc" },
      { expression: events.id, cursor: 481, direction: "desc" }
    ],
    pageSize: 50
  })
)

export {};
