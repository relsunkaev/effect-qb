// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1621-1663, 1667-1672

// README.md:1621-1663
import * as Schema from "effect/Schema"
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const docs = Table.make("docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(Schema.Struct({
    profile: Schema.Struct({
      address: Schema.Struct({
        city: Schema.String,
        postcode: Schema.NullOr(Schema.String)
      }),
      tags: Schema.Array(Schema.String)
    }),
    note: Schema.NullOr(Schema.String)
  }))
})

const cityPath = F.json.path(
  F.json.key("profile"),
  F.json.key("address"),
  F.json.key("city")
)

const compatibleObject = F.json.buildObject({
  profile: {
    address: {
      city: "Macon",
      postcode: "1000"
    },
    tags: ["travel"]
  },
  note: null
})

const deletedRequiredField = F.json.delete(compatibleObject, cityPath)

Q.insert(docs, {
  id: "doc-1",
  // @ts-expect-error nested json output must still satisfy the column schema
  payload: deletedRequiredField
})

{
  // README.md:1667-1672
  Q.update(docs, {
    // @ts-expect-error deleting a required field makes the json output incompatible
    payload: deletedRequiredField
  })
}

export {};
