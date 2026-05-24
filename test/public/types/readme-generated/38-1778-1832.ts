// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1778-1821, 1825-1832

// README.md:1778-1821
import { Column as C, Function as F, Query as Q, Table } from "effect-qb"
import * as Schema from "effect/Schema"
import { Json as J } from "effect-qb/postgres"

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
  // README.md:1825-1832
  const invalidUpdate = {
    payload: deletedRequiredField
  }

  // @ts-expect-error deleting a required field makes the json output incompatible
  Q.update(docs, invalidUpdate)
}

export {};
