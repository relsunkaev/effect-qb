// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 764-817

// README.md:764-817
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

// Portable target types come from Query.type; dialect types come from the
// dialect module. Each rejects the other's witnesses.
const idAsText = Cast.to(users.id, Query.type.text())
const countAsFloat = Cast.to(docs.payload.profile.metrics.count, Pg.Type.float8())

// @ts-expect-error float8 is Postgres-specific; use Pg.Type.float8()
Query.type.float8()

// @ts-expect-error text is portable; use Query.type.text()
Pg.Type.text()

// Comparisons compare directly when the operands share a type family...
const sameEmail = Query.eq(users.email, "ada@example.com")
const cityText = docs.payload.profile.address.city.pipe(Jsonb.text)
const sameCity = Query.eq(cityText, "Istanbul")

// @ts-expect-error ...and reject operands from different families (uuid vs text)
Query.eq(users.id, users.email)

// A schema-known numeric path casts to a numeric type (countAsFloat above),
// but non-numeric JSONB values do not.

// @ts-expect-error schema-known JSONB objects cannot be cast to numeric types
Cast.to(docs.payload.profile.metrics, Pg.Type.float8())

// @ts-expect-error schema-known JSONB strings cannot be cast to numeric types
Cast.to(docs.payload.profile.address.city, Pg.Type.float8())


export {};
