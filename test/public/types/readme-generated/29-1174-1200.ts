// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1174-1200

// README.md:1174-1200
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as Pg from "effect-qb/postgres"

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(Schema.Struct({
    profile: Schema.Struct({
      address: Schema.Struct({
        city: Schema.String
      })
    })
  }))
})

const city = docs.payload.pipe(
  Jsonb.key("profile"),
  Jsonb.key("address"),
  Jsonb.key("city"),
  Jsonb.text
)

const plan = Query.select({ city }).pipe(Query.from(docs))


export {};
