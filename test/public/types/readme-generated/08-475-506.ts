// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 475-506

// README.md:475-506
import * as Schema from "effect/Schema"
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const docs = Table.make("docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(Schema.Struct({
    profile: Schema.Struct({
      address: Schema.Struct({
        city: Schema.String,
        postcode: Schema.NullOr(Schema.String)
      })
    })
  }))
})

const cityPath = F.json.path(
  F.json.key("profile"),
  F.json.key("address"),
  F.json.key("city")
)

const city = F.json.get(docs.payload, cityPath)

type City = Q.ExpressionOutput<typeof city, {
  readonly docs: {
    readonly name: "docs"
    readonly mode: "required"
  }
}>
// string

export {};
