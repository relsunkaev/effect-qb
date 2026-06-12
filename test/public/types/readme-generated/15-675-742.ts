// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 675-728, 737-742

// README.md:675-728
import * as Schema from "effect/Schema"
import { Cast, Column, Json, Query, Scalar, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as Pg from "effect-qb/postgres"

const payloadSchema = Schema.Struct({
  profile: Schema.Struct({
    address: Schema.Struct({
      city: Schema.String,
      postcode: Schema.NullOr(Schema.String)
    }),
    tags: Schema.Array(Schema.String),
    metrics: Schema.Struct({
      count: Schema.Number
    }),
    legacyName: Schema.optional(Schema.String),
    legacySlug: Schema.optional(Schema.String)
  }),
  note: Schema.NullOr(Schema.String)
})

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(payloadSchema)
})

const portableDocs = Table.make("portable_docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Column.json(payloadSchema)
})

const city = docs.payload.profile.address.city.pipe(Jsonb.text)
const portableCity = portableDocs.payload.profile.address.city.pipe(Json.text)
const count = Cast.to(docs.payload.profile.metrics.count, Pg.Type.float8())

const legacyNameExists = docs.payload.profile.pipe(Jsonb.hasKey("legacyName"))
const legacySlugExists = Jsonb.hasKey(docs.payload.profile, "legacySlug")
const countPathExists = docs.payload.profile.metrics.count.pipe(Jsonb.pathExists)
const countIsPositive = Jsonb.pathMatch(docs.payload, "$.profile.metrics.count > 0")

type City = Scalar.RuntimeOf<typeof city>
// string

type Count = Scalar.RuntimeOf<typeof count>
// number

const missingRequiredCity = docs.payload.profile.address.city.pipe(Jsonb.delete)

Query.update(docs, {
  // @ts-expect-error payload no longer satisfies payloadSchema
  payload: missingRequiredCity
})

{
  // README.md:737-742
  const withoutLegacyFields = docs.payload.pipe(
    (payload) => payload.profile.legacyName.pipe(Jsonb.delete),
    (payload) => payload.profile.legacySlug.pipe(Jsonb.delete)
  )
}

export {};
