import * as Schema from "effect/Schema"

import { Column as C, Json as J, Scalar as E, Table } from "effect-qb/mysql"

const payloadSchema = Schema.Struct({
  profile: Schema.Struct({
    address: Schema.Struct({
      city: Schema.String
    }),
    tags: Schema.Array(Schema.String)
  })
})

const docs = Table.make("docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(payloadSchema)
})
const scalarDocs = Table.make("scalar_docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(Schema.String)
})

const suitePath = J.json.path(
  J.json.key("profile"),
  J.json.key("address"),
  J.json.key("suite")
)
const tagWildcardPath = J.json.path(
  J.json.key("profile"),
  J.json.key("tags"),
  J.json.wildcard()
)

const setWithoutCreateExpr = J.json.set(docs.payload, suitePath, "12A", {
  createMissing: false
})
const tagsExpr = J.json.get(docs.payload, J.json.path(J.json.key("profile"), J.json.key("tags")))
const tagsKeysExpr = J.json.keys(tagsExpr)
const scalarLengthExpr = J.json.length(scalarDocs.payload)
const objectTypeExpr = J.json.typeOf(docs.payload)
const scalarTypeExpr = J.json.typeOf(scalarDocs.payload)

type SetWithoutCreate = E.RuntimeOf<typeof setWithoutCreateExpr>
type TagsKeys = E.RuntimeOf<typeof tagsKeysExpr>
type ScalarLength = E.RuntimeOf<typeof scalarLengthExpr>
type ObjectType = E.RuntimeOf<typeof objectTypeExpr>
type ScalarType = E.RuntimeOf<typeof scalarTypeExpr>

const tagsKeys: TagsKeys = null
const scalarLength: ScalarLength = 1
const objectType: ObjectType = "OBJECT"
const scalarType: ScalarType = "STRING"
declare const setWithoutCreate: SetWithoutCreate

void tagsKeys
void scalarLength
void objectType
void scalarType

// @ts-expect-error createMissing: false should not add a missing object key
setWithoutCreate.profile.address.suite

// @ts-expect-error json mutation helpers only accept exact key/index paths
J.json.set(docs.payload, tagWildcardPath, "featured")

// @ts-expect-error json mutation helpers only accept exact key/index paths
J.json.insert(docs.payload, tagWildcardPath, "featured")

// @ts-expect-error json mutation helpers only accept exact key/index paths
J.json.delete(docs.payload, tagWildcardPath)

void setWithoutCreateExpr
void tagsKeysExpr
void scalarLengthExpr
void objectTypeExpr
void scalarTypeExpr
