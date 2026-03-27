import * as Schema from "effect/Schema"

import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const payloadSchema = Schema.Struct({
  profile: Schema.Struct({
    address: Schema.Struct({
      city: Schema.String,
      postcode: Schema.NullOr(Schema.String)
    }),
    tags: Schema.Array(Schema.String)
  }),
  note: Schema.NullOr(Schema.String)
})

const docsJson = Table.make("docs_json", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(payloadSchema)
})

const docsJsonb = Table.make("docs_jsonb", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.jsonb(payloadSchema)
})

const cityPath = F.json.path(
  F.json.key("profile"),
  F.json.key("address"),
  F.json.key("city")
)

const compatibleJsonObject = F.json.buildObject({
  profile: {
    address: {
      city: "Paris",
      postcode: "1000"
    },
    tags: ["travel"]
  },
  note: null
})

const compatibleJsonbMerged = F.jsonb.merge(
  docsJsonb.payload,
  F.jsonb.buildObject({
    profile: {
      address: {
        city: "Paris",
        postcode: "1000"
      },
      tags: ["travel"]
    }
  })
)
const compatibleJsonbObject = F.jsonb.buildObject({
  profile: {
    address: {
      city: "Paris",
      postcode: "1000"
    },
    tags: ["travel"]
  },
  note: null
})

const insertPlan = Q.insert(docsJson, {
  id: "doc-1",
  payload: compatibleJsonObject
})

const insertJsonbPlan = Q.insert(docsJsonb, {
  id: "doc-b",
  payload: compatibleJsonbObject
})

void insertPlan
void insertJsonbPlan
void compatibleJsonbMerged

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

Q.insert(docsJson, {
  id: "doc-2",
  payload: incompatibleNestedObject as never
})

Q.update(docsJson, {
  payload: incompatibleNestedObject as never
})

Q.insert(docsJson, {
  id: "doc-3",
  payload: compatibleJsonbObject as never
})
