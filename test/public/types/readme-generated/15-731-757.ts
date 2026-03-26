// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 731-757

// README.md:731-757
import * as Schema from "effect/Schema"
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const docs = Table.make("docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(Schema.Struct({
    profile: Schema.Struct({
      address: Schema.Struct({
        city: Schema.String
      })
    })
  }))
})

const cityPath = F.json.path(
  F.json.key("profile"),
  F.json.key("address"),
  F.json.key("city")
)

const docCity = Q.select({
  city: F.json.text(docs.payload, cityPath)
}).pipe(
  Q.from(docs)
)

export {};
