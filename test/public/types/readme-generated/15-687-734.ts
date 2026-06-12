// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 687-734

// README.md:687-734
import * as Schema from "effect/Schema"
import { Cast, Column, Query, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(Schema.Struct({
    profile: Schema.Struct({
      metrics: Schema.Struct({
        count: Schema.Number
      }),
      address: Schema.Struct({
        city: Schema.String
      })
    })
  }))
})

const idAsText = Cast.to(users.id, Query.type.text())
const countAsFloat = Cast.to(docs.payload.profile.metrics.count, Pg.Type.float8())

const sameEmail = Query.eq(users.email, "ada@example.com")
const cityText = docs.payload.profile.address.city.pipe(Jsonb.text)
const sameCity = Query.eq(cityText, "Istanbul")

// @ts-expect-error float8 is Postgres-specific, not portable standard SQL
Query.type.float8()

// @ts-expect-error text is portable, so it comes from Query.type
Pg.Type.text()

// @ts-expect-error uuid and text are different comparison families
Query.eq(users.id, users.email)

// @ts-expect-error schema-known JSONB objects cannot be cast to numeric types
Cast.to(docs.payload.profile.metrics, Pg.Type.float8())

// @ts-expect-error schema-known JSONB strings cannot be cast to numeric types
Cast.to(docs.payload.profile.address.city, Pg.Type.float8())


export {};
