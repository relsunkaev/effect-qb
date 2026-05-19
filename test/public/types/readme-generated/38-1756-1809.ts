// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1756-1798, 1802-1809

// README.md:1756-1798
import * as Schema from "effect/Schema"
import { Column as C, Function as F, Json as J, Query as Q, Table } from "effect-qb/postgres"

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

const cityPath = J.json.path(
  J.json.key("profile"),
  J.json.key("address"),
  J.json.key("city")
)

const compatibleObject = J.json.buildObject({
  profile: {
    address: {
      city: "Macon",
      postcode: "1000"
    },
    tags: ["travel"]
  },
  note: null
})

const deletedRequiredField = J.json.delete(compatibleObject, cityPath)

Q.insert(docs, {
  id: "doc-1",
  // @ts-expect-error nested json output must still satisfy the column schema
  payload: deletedRequiredField
})

{
  // README.md:1802-1809
  const invalidUpdate = {
    payload: deletedRequiredField
  }

  // @ts-expect-error deleting a required field makes the json output incompatible
  Q.update(docs, invalidUpdate)
}

export {};
