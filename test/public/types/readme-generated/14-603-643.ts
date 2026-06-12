// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 603-633, 638-643

// README.md:603-633
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as Pg from "effect-qb/postgres"

const payloadSchema = Schema.Struct({
  profile: Schema.Struct({
    address: Schema.Struct({
      city: Schema.String,
      postcode: Schema.NullOr(Schema.String)
    }),
    tags: Schema.Array(Schema.String),
    legacyName: Schema.optional(Schema.String),
    legacySlug: Schema.optional(Schema.String)
  }),
  note: Schema.NullOr(Schema.String)
})

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(payloadSchema)
})

const missingRequiredCity = docs.payload.profile.address.city.pipe(Jsonb.delete)

Query.update(docs, {
  // @ts-expect-error payload no longer satisfies payloadSchema
  payload: missingRequiredCity
})

{
  // README.md:638-643
  const withoutLegacyFields = docs.payload.pipe(
    (payload) => payload.profile.legacyName.pipe(Jsonb.delete),
    (payload) => payload.profile.legacySlug.pipe(Jsonb.delete)
  )
}

export {};
