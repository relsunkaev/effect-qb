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

const docs = Table.make("docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(payloadSchema),
  payloadJsonb: C.jsonb(payloadSchema)
})

type DocsAvailable = {
  readonly docs: {
    readonly name: "docs"
    readonly mode: "required"
  }
}

const cityPath = F.json.path(
  F.json.key("profile"),
  F.json.key("address"),
  F.json.key("city")
)
const postcodePath = F.json.path(
  F.json.key("profile"),
  F.json.key("address"),
  F.json.key("postcode")
)
const suitePath = F.jsonb.path(
  F.jsonb.key("profile"),
  F.jsonb.key("address"),
  F.jsonb.key("suite")
)
const wildcardPath = F.jsonb.path(
  F.jsonb.key("profile"),
  F.jsonb.key("tags"),
  F.jsonb.wildcard()
)

const cityExpr = F.json.get(docs.payload, cityPath)
const cityTextExpr = F.json.text(docs.payload, cityPath)
const typeNameExpr = F.json.typeOf(docs.payload)
const lengthExpr = F.json.length(docs.payload)
const keysExpr = F.json.keys(docs.payload)
const strippedExpr = F.json.stripNulls(docs.payload)

const sharedJsonbProfileExpr = F.json.get(docs.payloadJsonb, F.json.key("profile"))
const sharedJsonbCityExpr = F.json.get(docs.payloadJsonb, cityPath)
const sharedJsonbTypeNameExpr = F.json.typeOf(docs.payloadJsonb)
const sharedJsonbStrippedExpr = F.json.stripNulls(docs.payloadJsonb)

const jsonbHasAddressExpr = F.jsonb.hasKey(sharedJsonbProfileExpr, "address")
const jsonbHasProfileExpr = F.jsonb.hasKey(docs.payloadJsonb, "profile")
const jsonbHasAnyExpr = F.jsonb.hasAnyKeys(docs.payloadJsonb, "profile", "note")
const jsonbHasAllExpr = F.jsonb.hasAllKeys(docs.payloadJsonb, "profile", "note")
const jsonbSetExpr = F.jsonb.set(docs.payloadJsonb, postcodePath, "1000")
const jsonbInsertExpr = F.jsonb.insert(docs.payloadJsonb, suitePath, "12A")
const jsonbDeleteExpr = F.jsonb.delete(docs.payloadJsonb, F.jsonb.key("note"))
const jsonbFirstTagExpr = F.jsonb.get(docs.payloadJsonb, wildcardPath)
const jsonbConcatExpr = F.jsonb.concat({ a: 1 }, { b: "x" })
const jsonbMergeExpr = F.jsonb.merge({ a: 1 }, { b: "x" })
const builtObjectExpr = F.json.buildObject({ a: 1, b: "x" })
const builtArrayExpr = F.json.buildArray(1, "x", true)
const builtJsonbObjectExpr = F.jsonb.buildObject({ a: 1, b: "x" })
const builtJsonbArrayExpr = F.jsonb.buildArray(1, "x", true)
const toJsonExpr = F.json.toJson(1)
const toJsonbExpr = F.jsonb.toJsonb("x")
const jsonbTypeNameExpr = F.jsonb.typeOf(docs.payloadJsonb)
const jsonbLengthExpr = F.jsonb.length(docs.payloadJsonb)
const jsonbKeysExpr = F.jsonb.keys(docs.payloadJsonb)
const jsonbPathExistsExpr = F.jsonb.pathExists(docs.payloadJsonb, wildcardPath)
const jsonbPathMatchExpr = F.jsonb.pathMatch(docs.payloadJsonb, '$.profile.tags[*] ? (@ == "x")')
const jsonbStrippedExpr = F.jsonb.stripNulls(docs.payloadJsonb)
const jsonbStrippedSetExpr = F.jsonb.set(sharedJsonbStrippedExpr, postcodePath, "1000")

type City = Q.ExpressionOutput<typeof cityExpr, DocsAvailable>
type CityText = Q.ExpressionOutput<typeof cityTextExpr, DocsAvailable>
type JsonTypeName = Q.ExpressionOutput<typeof typeNameExpr, DocsAvailable>
type JsonLength = Q.ExpressionOutput<typeof lengthExpr, DocsAvailable>
type JsonKeys = Q.ExpressionOutput<typeof keysExpr, DocsAvailable>
type JsonStripped = Exclude<Q.ExpressionOutput<typeof strippedExpr, DocsAvailable>, null>
type SharedJsonbCity = Q.ExpressionOutput<typeof sharedJsonbCityExpr, DocsAvailable>
type SharedJsonbTypeName = Q.ExpressionOutput<typeof sharedJsonbTypeNameExpr, DocsAvailable>
type JsonbHasAddress = Q.ExpressionOutput<typeof jsonbHasAddressExpr, DocsAvailable>
type JsonbHasProfile = Q.ExpressionOutput<typeof jsonbHasProfileExpr, DocsAvailable>
type JsonbHasAny = Q.ExpressionOutput<typeof jsonbHasAnyExpr, DocsAvailable>
type JsonbHasAll = Q.ExpressionOutput<typeof jsonbHasAllExpr, DocsAvailable>
type JsonbConcat = Exclude<Q.ExpressionOutput<typeof jsonbConcatExpr, DocsAvailable>, null>
type JsonbMerge = Exclude<Q.ExpressionOutput<typeof jsonbMergeExpr, DocsAvailable>, null>
type BuiltObject = Q.ExpressionOutput<typeof builtObjectExpr, DocsAvailable>
type BuiltArray = Q.ExpressionOutput<typeof builtArrayExpr, DocsAvailable>
type BuiltJsonbObject = Q.ExpressionOutput<typeof builtJsonbObjectExpr, DocsAvailable>
type BuiltJsonbArray = Q.ExpressionOutput<typeof builtJsonbArrayExpr, DocsAvailable>
type ToJson = Q.ExpressionOutput<typeof toJsonExpr, DocsAvailable>
type ToJsonb = Q.ExpressionOutput<typeof toJsonbExpr, DocsAvailable>
type JsonbTypeName = Q.ExpressionOutput<typeof jsonbTypeNameExpr, DocsAvailable>
type JsonbLength = Q.ExpressionOutput<typeof jsonbLengthExpr, DocsAvailable>
type JsonbKeys = Q.ExpressionOutput<typeof jsonbKeysExpr, DocsAvailable>
type JsonbPathExists = Q.ExpressionOutput<typeof jsonbPathExistsExpr, DocsAvailable>
type JsonbPathMatch = Q.ExpressionOutput<typeof jsonbPathMatchExpr, DocsAvailable>
type JsonbStripped = Exclude<Q.ExpressionOutput<typeof jsonbStrippedExpr, DocsAvailable>, null>

const jsonSelectPlan = Q.select({
  city: cityExpr,
  jsonbCity: sharedJsonbCityExpr,
  hasAddress: jsonbHasAddressExpr,
  jsonTypeName: typeNameExpr,
  jsonbTypeName: jsonbTypeNameExpr
}).pipe(Q.from(docs))

type JsonSelectRow = Q.ResultRow<typeof jsonSelectPlan>

const city: City = "Paris"
const cityText: CityText = "Paris"
const jsonTypeName: JsonTypeName = "object"
const jsonLength: JsonLength = 2
const jsonKeys: JsonKeys = ["profile", "note"]
const strippedNote: JsonStripped["note"] = undefined
const strippedPostcode: JsonStripped["profile"]["address"]["postcode"] = undefined
const sharedJsonbCity: SharedJsonbCity = "Paris"
const sharedJsonbTypeName: SharedJsonbTypeName = "object"
const jsonbHasAddress: JsonbHasAddress = true
const jsonbHasProfile: JsonbHasProfile = true
const jsonbHasAny: JsonbHasAny = true
const jsonbHasAll: JsonbHasAll = true
const jsonbConcatA: JsonbConcat["a"] = 1
const jsonbConcatB: JsonbConcat["b"] = "x"
const jsonbMergeA: JsonbMerge["a"] = 1
const jsonbMergeB: JsonbMerge["b"] = "x"
const builtObjectA: BuiltObject["a"] = 1
const builtObjectB: BuiltObject["b"] = "x"
const builtArray0: BuiltArray[0] = 1
const builtArray1: BuiltArray[1] = "x"
const builtArray2: BuiltArray[2] = true
const builtJsonbObjectA: BuiltJsonbObject["a"] = 1
const builtJsonbObjectB: BuiltJsonbObject["b"] = "x"
const builtJsonbArray0: BuiltJsonbArray[0] = 1
const builtJsonbArray1: BuiltJsonbArray[1] = "x"
const builtJsonbArray2: BuiltJsonbArray[2] = true
const toJson: ToJson = 1
const toJsonb: ToJsonb = "x"
const jsonbTypeName: JsonbTypeName = "object"
const jsonbLength: JsonbLength = 2
const jsonbKeys: JsonbKeys = ["profile", "note"]
const jsonbPathExists: JsonbPathExists = true
const jsonbPathMatch: JsonbPathMatch = true
const jsonbStrippedNote: JsonbStripped["note"] = undefined
const jsonbStrippedPostcode: JsonbStripped["profile"]["address"]["postcode"] = undefined
const selectCity: JsonSelectRow["city"] = "Paris"
const selectJsonbCity: JsonSelectRow["jsonbCity"] = "Paris"
const selectHasAddress: JsonSelectRow["hasAddress"] = true
const selectJsonTypeName: JsonSelectRow["jsonTypeName"] = "object"
const selectJsonbTypeName: JsonSelectRow["jsonbTypeName"] = "object"

void city
void cityText
void jsonTypeName
void jsonLength
void jsonKeys
void strippedNote
void strippedPostcode
void sharedJsonbCity
void sharedJsonbTypeName
void jsonbHasAddress
void jsonbHasProfile
void jsonbHasAny
void jsonbHasAll
void jsonbConcatA
void jsonbConcatB
void jsonbMergeA
void jsonbMergeB
void builtObjectA
void builtObjectB
void builtArray0
void builtArray1
void builtArray2
void builtJsonbObjectA
void builtJsonbObjectB
void builtJsonbArray0
void builtJsonbArray1
void builtJsonbArray2
void toJson
void toJsonb
void jsonbTypeName
void jsonbLength
void jsonbKeys
void jsonbPathExists
void jsonbPathMatch
void jsonbStrippedNote
void jsonbStrippedPostcode
void jsonbSetExpr
void jsonbInsertExpr
void jsonbDeleteExpr
void selectCity
void selectJsonbCity
void selectHasAddress
void selectJsonTypeName
void selectJsonbTypeName
void jsonbFirstTagExpr
void jsonbStrippedSetExpr

// @ts-expect-error wildcard paths require the jsonb helper surface
F.json.path(F.json.key("profile"), F.jsonb.wildcard())

// @ts-expect-error shared json helpers only accept exact key/index paths
F.json.get(docs.payloadJsonb, wildcardPath)

// @ts-expect-error jsonb helpers require a jsonb expression
F.jsonb.set(docs.payload, postcodePath, "1000")

// @ts-expect-error shared json helpers preserve plain json and should not become jsonb-compatible
F.jsonb.set(strippedExpr, postcodePath, "1000")
