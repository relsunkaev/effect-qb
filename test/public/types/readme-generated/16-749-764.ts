// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 749-764

// README.md:749-764
import { Cast, Column, Query, Table } from "effect-qb"

const events = Table.make("events", {
  id: Column.uuid().pipe(Column.primaryKey),
  externalRef: Column.text()
})

// id (uuid) and externalRef (text) are different comparison families, so cast
// one side to compare them.
const idAsText = Cast.to(events.id, Query.type.text())
const sameRef = Query.eq(idAsText, events.externalRef)

// @ts-expect-error uuid and text are different comparison families
Query.eq(events.id, events.externalRef)

export {};
