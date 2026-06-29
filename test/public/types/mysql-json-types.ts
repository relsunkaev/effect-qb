import * as Std from "effect-qb"
import * as Schema from "effect/Schema"

import { Json as J, Scalar as E } from "effect-qb"
import { Json as MyJson } from "effect-qb/mysql"

const payloadSchema = Schema.Struct({
  profile: Schema.Struct({
    address: Schema.Struct({
      city: Schema.String
    }),
    tags: Schema.Array(Schema.String),
    pair: Schema.Tuple([Schema.String, Schema.Number])
  })
})

const docs = Std.Table.make("docs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  payload: Std.Column.json(payloadSchema)
})
const scalarDocs = Std.Table.make("scalar_docs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  payload: Std.Column.json(Schema.String)
})

const suiteExpr = docs.payload.pipe(
  J.key("profile"),
  J.key("address"),
  J.key("suite")
)
const tagWildcardExpr = docs.payload.pipe(
  J.key("profile"),
  J.key("tags"),
  J.wildcard()
)
const tagWildcardExistsExpr = tagWildcardExpr.pipe(J.pathExists)
// @ts-expect-error MySQL SQL/JSON path predicates require non-empty string paths
J.pathExists(docs.payload, "")

const setWithoutCreateExpr = suiteExpr.pipe(J.set("12A", {
  createMissing: false
}))
const tagsExpr = docs.payload.pipe(J.key("profile"), J.key("tags"))
const tagsKeysExpr = J.keys(tagsExpr)
const lastPairValueExpr = docs.payload.pipe(J.key("profile"), J.key("pair"), J.index(-1))
const setLastPairValueExpr = docs.payload.pipe(
  J.key("profile"),
  J.key("pair"),
  J.index(-1),
  J.set(true)
)
const deleteLastPairValueExpr = docs.payload.pipe(
  J.key("profile"),
  J.key("pair"),
  J.index(-1),
  J.delete
)
const insertBeforeLastPairValueExpr = docs.payload.pipe(
  J.key("profile"),
  J.key("pair"),
  J.index(-1),
  J.insert(true)
)
const insertAfterLastPairValueExpr = docs.payload.pipe(
  J.key("profile"),
  J.key("pair"),
  J.index(-1),
  J.insert(true, { insertAfter: true })
)
const scalarLengthExpr = MyJson.length(scalarDocs.payload)
const objectTypeExpr = MyJson.typeOf(docs.payload)
const scalarTypeExpr = MyJson.typeOf(scalarDocs.payload)

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
type TagWildcardExists = E.RuntimeOf<typeof tagWildcardExistsExpr>

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
tagWildcardExpr.pipe(J.set("featured"))

// @ts-expect-error json mutation helpers only accept exact key/index paths
tagWildcardExpr.pipe(J.insert("featured"))

// @ts-expect-error json mutation helpers only accept exact key/index paths
tagWildcardExpr.pipe(J.delete)

// @ts-expect-error MySQL does not support json path match predicates.
MyJson.pathMatch(docs.payload, "$.profile.tags[*]")

// @ts-expect-error MySQL does not support json_strip_nulls-style helpers.
MyJson.stripNulls(docs.payload)

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
