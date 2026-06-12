// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1200-1224

// README.md:1200-1224
import { Casing, Column } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const Analytics = Pg.Schema.make("analytics").pipe(
  Casing.withCasing({
    tables: "snake_case",
    columns: "snake_case",
    types: "snake_case",
    sequences: "snake_case"
  })
)

const status = Analytics.enum("EventStatus", ["pending", "processed"] as const)
const sequence = Analytics.sequence("EventIdSeq")

const metrics = Analytics.table("Metrics", {
  id: Column.uuid().pipe(Column.primaryKey),
  status: status.column(),
  sequenceValue: Pg.Column.int8().pipe(
    Column.default(Pg.Function.nextVal(sequence))
  )
})


export {};
