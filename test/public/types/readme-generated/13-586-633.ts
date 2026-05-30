// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 586-619, 624-633

// README.md:586-619
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
    tags: Schema.Array(Schema.String)
  }),
  note: Schema.NullOr(Schema.String)
})

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(payloadSchema)
})

const missingRequiredCity = docs.payload.pipe(
  Jsonb.key("profile"),
  Jsonb.key("address"),
  Jsonb.key("city"),
  Jsonb.delete
)

Query.update(docs, {
  // @ts-expect-error payload no longer satisfies payloadSchema
  payload: missingRequiredCity
})

{
  // README.md:624-633
  const withoutLegacyFields = docs.payload.pipe(
    Jsonb.key("profile"),
    Jsonb.key("legacyName"),
    Jsonb.delete,
    Jsonb.key("profile"),
    Jsonb.key("legacySlug"),
    Jsonb.delete
  )
}

export {};
