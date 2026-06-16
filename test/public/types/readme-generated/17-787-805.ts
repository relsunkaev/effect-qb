// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 787-805

// README.md:787-805
import * as Schema from "effect/Schema"
import { Cast, Column, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(Schema.Struct({
    metrics: Schema.Struct({ count: Schema.Number }),
    address: Schema.Struct({ city: Schema.String })
  }))
})

// @ts-expect-error a JSONB object cannot be cast to a numeric type
Cast.to(docs.payload.metrics, Pg.Type.float8())

// @ts-expect-error a JSONB string cannot be cast to a numeric type
Cast.to(docs.payload.address.city, Pg.Type.float8())

export {};
