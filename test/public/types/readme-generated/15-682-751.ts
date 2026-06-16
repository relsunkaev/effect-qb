// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 682-717, 723-728, 734-751

// README.md:682-717
import * as Schema from "effect/Schema"
import { Cast, Column, Json, Query, Scalar, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as Pg from "effect-qb/postgres"

const payloadSchema = Schema.Struct({
  profile: Schema.Struct({
    address: Schema.Struct({
      city: Schema.String
    }),
    metrics: Schema.Struct({
      count: Schema.Number
    }),
    legacyName: Schema.optional(Schema.String),
    legacySlug: Schema.optional(Schema.String)
  })
})

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(payloadSchema)
})

const portableDocs = Table.make("portable_docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Column.json(payloadSchema)
})

// Postgres jsonb and portable json share the same property-path API.
const city = docs.payload.profile.address.city.pipe(Jsonb.text)
const portableCity = portableDocs.payload.profile.address.city.pipe(Json.text)

type City = Scalar.RuntimeOf<typeof city>
// string

{
  // README.md:723-728
  const count = Cast.to(docs.payload.profile.metrics.count, Pg.Type.float8())

  type Count = Scalar.RuntimeOf<typeof count>
  // number
}

{
  // README.md:734-751
  const legacyNameExists = docs.payload.profile.pipe(Jsonb.hasKey("legacyName"))
  const countPathExists = docs.payload.profile.metrics.count.pipe(Jsonb.pathExists)

  const missingRequiredCity = docs.payload.profile.address.city.pipe(Jsonb.delete)

  Query.update(docs, {
    // @ts-expect-error payload no longer satisfies payloadSchema
    payload: missingRequiredCity
  })

  // Deleting several paths is a sequence of terminal deletes. Each step operates
  // on the value returned by the previous delete, not on the original payload.
  const withoutLegacyFields = docs.payload.pipe(
    (payload) => payload.profile.legacyName.pipe(Jsonb.delete),
    (afterNameDelete) => afterNameDelete.profile.legacySlug.pipe(Jsonb.delete)
  )
}

export {};
