// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 760-787

// README.md:760-787
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
import { Column as PgColumn, Jsonb } from "effect-qb/postgres"

const documents = Table.make("documents", {
  id: Column.int().pipe(Column.primaryKey),
  payload: PgColumn.jsonb(Schema.Struct({
    profile: Schema.Struct({ city: Schema.String, postcode: Schema.String })
  }))
})
const profile = Jsonb.focus().key("profile")
const city = profile.key("city")
const postcode = profile.key("postcode")

const updated = documents.payload.pipe(
  Jsonb.replace(city, "Paris"),
  Jsonb.replace(postcode, "75001")
)
Query.update(documents, { payload: updated })

const reshaped = documents.payload.pipe(Jsonb.replace(city, 123))
Query.select({ payload: reshaped }).pipe(Query.from(documents))
Query.update(documents, {
  // @ts-expect-error SELECT may change shape; this column still requires a string city
  payload: reshaped
})

export {};
