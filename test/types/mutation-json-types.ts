import * as Schema from "effect/Schema"

import { Column as C, Query as Q, Table } from "../../src/postgres.ts"

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

const cityPath = Q.json.path(
  Q.json.key("profile"),
  Q.json.key("address"),
  Q.json.key("city")
)

const compatibleObject = Q.json.buildObject({
  profile: {
    address: {
      city: "Paris",
      postcode: "1000"
    },
    tags: ["travel"]
  },
  note: null
})
const compatibleMerged = Q.json.merge(
  docs.payload,
  Q.json.buildObject({
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

const deletedRequiredField = Q.json.delete(docs.payload, cityPath)
const incompatibleNestedObject = Q.json.buildObject({
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
