// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 788-816

// README.md:788-816
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
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

const city = Pg.Json.jsonb.text(
  docs.payload,
  Pg.Json.jsonb.path(
    Pg.Json.jsonb.key("profile"),
    Pg.Json.jsonb.key("address"),
    Pg.Json.jsonb.key("city")
  )
)

const plan = Query.select({ city }).pipe(Query.from(docs))

void plan

export {};
