import * as Schema from "effect/Schema"

import { Column as C, Function as F, Json as J, Query as Q, Table } from "effect-qb/postgres"

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

const cityPath = J.json.path(
  J.json.key("profile"),
  J.json.key("address"),
  J.json.key("city")
)

const compatibleJsonObject = J.json.buildObject({
  profile: {
    address: {
      city: "Paris",
      postcode: "1000"
    },
    tags: ["travel"]
  },
  note: null
})

const compatibleJsonbMerged = J.jsonb.merge(
  docsJsonb.payload,
  J.jsonb.buildObject({
    profile: {
      address: {
        city: "Paris",
        postcode: "1000"
      },
      tags: ["travel"]
    }
  })
)
const compatibleJsonbObject = J.jsonb.buildObject({
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

const incompatibleNestedObject = J.json.buildObject({
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

const tupleDocs = Table.make("tuple_docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(Schema.Struct({
    pair: Schema.Tuple(Schema.Number, Schema.String)
  }))
})

const invalidTuplePayload = J.json.buildObject({
  pair: J.json.buildArray("north", 1)
})

type InvalidTupleInsertValues = Parameters<typeof Q.insert<typeof tupleDocs, {
  readonly id: "tuple-doc-1"
  readonly payload: typeof invalidTuplePayload
}>>[1]

type InvalidTuplePayloadError = InvalidTupleInsertValues["payload"]

type HasPreciseSecondSlotIssue =
  "__effect_qb_json_issue__pair[1]__type_mismatch" extends keyof InvalidTuplePayloadError ? true : false

// @ts-expect-error tuple-slot diagnostics currently collapse array positions and miss the precise [1] issue sentinel
const preciseSecondSlotIssue: HasPreciseSecondSlotIssue = true

void preciseSecondSlotIssue

const rootTupleDocs = Table.make("root_tuple_docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(Schema.Tuple(Schema.Number, Schema.String))
})

const invalidRootTuplePayload = J.json.buildArray("north", 1)

type InvalidRootTupleInsertValues = Parameters<typeof Q.insert<typeof rootTupleDocs, {
  readonly id: "root-doc-1"
  readonly payload: typeof invalidRootTuplePayload
}>>[1]

type InvalidRootTuplePayloadError = InvalidRootTupleInsertValues["payload"]

type HasPreciseRootSecondSlotIssue =
  "__effect_qb_json_issue__[1]__type_mismatch" extends keyof InvalidRootTuplePayloadError ? true : false

const preciseRootSecondSlotIssue: HasPreciseRootSecondSlotIssue = true

void preciseRootSecondSlotIssue
