// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1351-1377

// README.md:1351-1377
import * as Schema from "effect/Schema"
import { Cast, Column, Query, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as Pg from "effect-qb/postgres"

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(Schema.Struct({
    profile: Schema.Struct({
      address: Schema.Struct({
        city: Schema.String
      }),
      metrics: Schema.Struct({
        count: Schema.Number
      })
    })
  }))
})

const city = docs.payload.profile.address.city.pipe(Jsonb.text)
const count = Cast.to(docs.payload.profile.metrics.count, Pg.Type.float8())
const hasMetrics = docs.payload.profile.pipe(Jsonb.hasKey("metrics"))

const plan = Query.select({ city, count, hasMetrics }).pipe(Query.from(docs))


export {};
