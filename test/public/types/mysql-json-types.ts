import * as Schema from "effect/Schema"

import { Column as C, Json as J, Scalar as E, Table } from "effect-qb/mysql"

const payloadSchema = Schema.Struct({
  profile: Schema.Struct({
    address: Schema.Struct({
      city: Schema.String
    })
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
const scalarLengthExpr = J.json.length(scalarDocs.payload)

type SetWithoutCreate = E.RuntimeOf<typeof setWithoutCreateExpr>
type ScalarLength = E.RuntimeOf<typeof scalarLengthExpr>

const scalarLength: ScalarLength = 1
declare const setWithoutCreate: SetWithoutCreate

void scalarLength

// @ts-expect-error createMissing: false should not add a missing object key
setWithoutCreate.profile.address.suite

// @ts-expect-error json mutation helpers only accept exact key/index paths
J.json.set(docs.payload, tagWildcardPath, "featured")

// @ts-expect-error json mutation helpers only accept exact key/index paths
J.json.insert(docs.payload, tagWildcardPath, "featured")

// @ts-expect-error json mutation helpers only accept exact key/index paths
J.json.delete(docs.payload, tagWildcardPath)

void setWithoutCreateExpr
void scalarLengthExpr
