// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1185-1210

// README.md:1185-1210
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

const plan = Query.select({ city, count }).pipe(Query.from(docs))


export {};
