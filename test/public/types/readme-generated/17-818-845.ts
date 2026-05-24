// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 818-845

// README.md:818-845
import { Column as C, Function as F, Query as Q, Table } from "effect-qb"
import * as Schema from "effect/Schema"
import { Json as J } from "effect-qb/postgres"

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

const cityPath = J.json.path(
  J.json.key("profile"),
  J.json.key("address"),
  J.json.key("city")
)

const docCity = Q.select({
  city: J.json.text(docs.payload, cityPath)
}).pipe(
  Q.from(docs)
)

export {};
