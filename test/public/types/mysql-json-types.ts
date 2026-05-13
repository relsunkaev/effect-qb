import * as Schema from "effect/Schema"

import { Column as C, Json as J, Scalar as E, Table } from "effect-qb/mysql"

const payloadSchema = Schema.Struct({
  profile: Schema.Struct({
    address: Schema.Struct({
      city: Schema.String
    }),
    tags: Schema.Array(Schema.String),
    pair: Schema.Tuple([Schema.String, Schema.Number])
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
const lastPairValueExpr = J.json.get(
  docs.payload,
  J.json.path(J.json.key("profile"), J.json.key("pair"), J.json.index(-1))
)
const setLastPairValueExpr = J.json.set(
  docs.payload,
  J.json.path(J.json.key("profile"), J.json.key("pair"), J.json.index(-1)),
  true
)
const deleteLastPairValueExpr = J.json.delete(
  docs.payload,
  J.json.path(J.json.key("profile"), J.json.key("pair"), J.json.index(-1))
)
const insertBeforeLastPairValueExpr = J.json.insert(
  docs.payload,
  J.json.path(J.json.key("profile"), J.json.key("pair"), J.json.index(-1)),
  true
)
const insertAfterLastPairValueExpr = J.json.insert(
  docs.payload,
  J.json.path(J.json.key("profile"), J.json.key("pair"), J.json.index(-1)),
  true,
  { insertAfter: true }
)
const scalarLengthExpr = J.json.length(scalarDocs.payload)
const objectTypeExpr = J.json.typeOf(docs.payload)
const scalarTypeExpr = J.json.typeOf(scalarDocs.payload)
const wildcardPath = J.json.path(J.json.key("profile"), J.json.key("tags"), J.json.wildcard())

type SetWithoutCreate = E.RuntimeOf<typeof setWithoutCreateExpr>
type TagsKeys = E.RuntimeOf<typeof tagsKeysExpr>
type LastPairValue = E.RuntimeOf<typeof lastPairValueExpr>
type SetLastPairValue = E.RuntimeOf<typeof setLastPairValueExpr>
type DeleteLastPairValue = E.RuntimeOf<typeof deleteLastPairValueExpr>
type InsertBeforeLastPairValue = E.RuntimeOf<typeof insertBeforeLastPairValueExpr>
type InsertAfterLastPairValue = E.RuntimeOf<typeof insertAfterLastPairValueExpr>
type ScalarLength = E.RuntimeOf<typeof scalarLengthExpr>
type ObjectType = E.RuntimeOf<typeof objectTypeExpr>
type ScalarType = E.RuntimeOf<typeof scalarTypeExpr>

const tagsKeys: TagsKeys = null
const lastPairValue: LastPairValue = 1
declare const setLastPairValue: SetLastPairValue
declare const deleteLastPairValue: DeleteLastPairValue
declare const insertBeforeLastPairValue: InsertBeforeLastPairValue
declare const insertAfterLastPairValue: InsertAfterLastPairValue
const scalarLength: ScalarLength = 1
const objectType: ObjectType = "OBJECT"
const scalarType: ScalarType = "STRING"
declare const setWithoutCreate: SetWithoutCreate

void tagsKeys
void lastPairValue
const setLastPairTail: boolean = setLastPairValue.profile.pair[1]
const deleteLastPairLength: 1 = deleteLastPairValue.profile.pair.length
const insertBeforeLastPairMiddle: boolean = insertBeforeLastPairValue.profile.pair[1]
const insertBeforeLastPairTail: number = insertBeforeLastPairValue.profile.pair[2]
const insertAfterLastPairPreviousTail: number = insertAfterLastPairValue.profile.pair[1]
const insertAfterLastPairTail: boolean = insertAfterLastPairValue.profile.pair[2]
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

// @ts-expect-error MySQL does not support json path match predicates.
J.json.pathMatch(docs.payload, wildcardPath)

// @ts-expect-error MySQL does not support json_strip_nulls-style helpers.
J.json.stripNulls(docs.payload)

void setWithoutCreateExpr
void tagsKeysExpr
void lastPairValueExpr
void setLastPairValueExpr
void deleteLastPairValueExpr
void insertBeforeLastPairValueExpr
void insertAfterLastPairValueExpr
void setLastPairTail
void deleteLastPairLength
void insertBeforeLastPairMiddle
void insertBeforeLastPairTail
void insertAfterLastPairPreviousTail
void insertAfterLastPairTail
void scalarLengthExpr
void objectTypeExpr
void scalarTypeExpr
