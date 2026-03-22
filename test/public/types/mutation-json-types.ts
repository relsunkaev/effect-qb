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
      city: "Paris",
      postcode: "1000"
    },
    tags: ["travel"]
  },
  note: null
})
const compatibleMerged = F.json.merge(
  docs.payload,
  F.json.buildObject({
    profile: {
      address: {
        city: "Paris",
        postcode: "1000"
      },
      tags: ["travel"]
    }
  })
)

const insertPlan = Q.insert(docs, {
  id: "doc-1",
  payload: compatibleObject
})

const updatePlan = Q.update(docs, {
  payload: compatibleMerged
})

void insertPlan
void updatePlan

const deletedRequiredField = F.json.delete(docs.payload, cityPath)
const incompatibleNestedObject = F.json.buildObject({
  profile: {
    address: {
      city: 123,
      postcode: "1000"
    },
    tags: ["travel"]
  },
  note: null
})

Q.insert(docs, {
  id: "doc-2",
  // @ts-expect-error deleting a required field makes the json output incompatible with the column schema
  payload: deletedRequiredField
})

// @ts-expect-error deleting a required field makes the json output incompatible with the column schema
Q.update(docs, {
  payload: deletedRequiredField
})

Q.insert(docs, {
  id: "doc-3",
  // @ts-expect-error nested json output must match the column schema
  payload: incompatibleNestedObject
})

// @ts-expect-error nested json output must match the column schema
Q.update(docs, {
  payload: incompatibleNestedObject
})
