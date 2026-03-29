import * as Schema from "effect/Schema"

import { Column as C, Scalar as E, Function as F, Json as J, Query as Q, Table } from "effect-qb/postgres"

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

const cityPath = J.json.path(
  J.json.key("profile"),
  J.json.key("address"),
  J.json.key("city")
)
const postcodePath = J.json.path(
  J.json.key("profile"),
  J.json.key("address"),
  J.json.key("postcode")
)
const suitePath = J.jsonb.path(
  J.jsonb.key("profile"),
  J.jsonb.key("address"),
  J.jsonb.key("suite")
)
const wildcardPath = J.jsonb.path(
  J.jsonb.key("profile"),
  J.jsonb.key("tags"),
  J.jsonb.wildcard()
)

const cityExpr = J.json.get(docs.payload, cityPath)
const cityTextExpr = J.json.text(docs.payload, cityPath)
const typeNameExpr = J.json.typeOf(docs.payload)
const lengthExpr = J.json.length(docs.payload)
const keysExpr = J.json.keys(docs.payload)
const strippedExpr = J.json.stripNulls(docs.payload)

const sharedJsonbProfileExpr = J.json.get(docs.payloadJsonb, J.json.key("profile"))
const sharedJsonbCityExpr = J.json.get(docs.payloadJsonb, cityPath)
const sharedJsonbTypeNameExpr = J.json.typeOf(docs.payloadJsonb)
const sharedJsonbStrippedExpr = J.json.stripNulls(docs.payloadJsonb)

const jsonbHasAddressExpr = J.jsonb.hasKey(sharedJsonbProfileExpr, "address")
const jsonbHasProfileExpr = J.jsonb.hasKey(docs.payloadJsonb, "profile")
const jsonbHasAnyExpr = J.jsonb.hasAnyKeys(docs.payloadJsonb, "profile", "note")
const jsonbHasAllExpr = J.jsonb.hasAllKeys(docs.payloadJsonb, "profile", "note")
const jsonbSetExpr = J.jsonb.set(docs.payloadJsonb, postcodePath, "1000")
const jsonbInsertExpr = J.jsonb.insert(docs.payloadJsonb, suitePath, "12A")
const jsonbDeleteExpr = J.jsonb.delete(docs.payloadJsonb, J.jsonb.key("note"))
const jsonbFirstTagExpr = J.jsonb.get(docs.payloadJsonb, wildcardPath)
const jsonbConcatExpr = J.jsonb.concat({ a: 1 }, { b: "x" })
const jsonbMergeExpr = J.jsonb.merge({ a: 1 }, { b: "x" })
const builtObjectExpr = J.json.buildObject({ a: 1, b: "x" })
const builtArrayExpr = J.json.buildArray(1, "x", true)
const builtJsonbObjectExpr = J.jsonb.buildObject({ a: 1, b: "x" })
const builtJsonbArrayExpr = J.jsonb.buildArray(1, "x", true)
const toJsonExpr = J.json.toJson(1)
const toJsonbExpr = J.jsonb.toJsonb("x")
const jsonbTypeNameExpr = J.jsonb.typeOf(docs.payloadJsonb)
const jsonbLengthExpr = J.jsonb.length(docs.payloadJsonb)
const jsonbKeysExpr = J.jsonb.keys(docs.payloadJsonb)
const jsonbPathExistsExpr = J.jsonb.pathExists(docs.payloadJsonb, wildcardPath)
const jsonbPathMatchExpr = J.jsonb.pathMatch(docs.payloadJsonb, '$.profile.tags[*] ? (@ == "x")')
const jsonbStrippedExpr = J.jsonb.stripNulls(docs.payloadJsonb)
const jsonbStrippedSetExpr = J.jsonb.set(sharedJsonbStrippedExpr, postcodePath, "1000")

type City = E.RuntimeOf<typeof cityExpr>
type CityText = E.RuntimeOf<typeof cityTextExpr>
type JsonTypeName = E.RuntimeOf<typeof typeNameExpr>
type JsonLength = E.RuntimeOf<typeof lengthExpr>
type JsonKeys = E.RuntimeOf<typeof keysExpr>
type JsonStripped = Exclude<E.RuntimeOf<typeof strippedExpr>, null>
type SharedJsonbCity = E.RuntimeOf<typeof sharedJsonbCityExpr>
type SharedJsonbTypeName = E.RuntimeOf<typeof sharedJsonbTypeNameExpr>
type JsonbHasAddress = E.RuntimeOf<typeof jsonbHasAddressExpr>
type JsonbHasProfile = E.RuntimeOf<typeof jsonbHasProfileExpr>
type JsonbHasAny = E.RuntimeOf<typeof jsonbHasAnyExpr>
type JsonbHasAll = E.RuntimeOf<typeof jsonbHasAllExpr>
type JsonbConcat = Exclude<E.RuntimeOf<typeof jsonbConcatExpr>, null>
type JsonbMerge = Exclude<E.RuntimeOf<typeof jsonbMergeExpr>, null>
type BuiltObject = E.RuntimeOf<typeof builtObjectExpr>
type BuiltArray = E.RuntimeOf<typeof builtArrayExpr>
type BuiltJsonbObject = E.RuntimeOf<typeof builtJsonbObjectExpr>
type BuiltJsonbArray = E.RuntimeOf<typeof builtJsonbArrayExpr>
type ToJson = E.RuntimeOf<typeof toJsonExpr>
type ToJsonb = E.RuntimeOf<typeof toJsonbExpr>
type JsonbTypeName = E.RuntimeOf<typeof jsonbTypeNameExpr>
type JsonbLength = E.RuntimeOf<typeof jsonbLengthExpr>
type JsonbKeys = E.RuntimeOf<typeof jsonbKeysExpr>
type JsonbPathExists = E.RuntimeOf<typeof jsonbPathExistsExpr>
type JsonbPathMatch = E.RuntimeOf<typeof jsonbPathMatchExpr>
type JsonbStripped = Exclude<E.RuntimeOf<typeof jsonbStrippedExpr>, null>

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
void jsonbFirstTagExpr
void jsonbStrippedSetExpr

// @ts-expect-error wildcard paths require the jsonb helper surface
J.json.path(J.json.key("profile"), J.jsonb.wildcard())

// @ts-expect-error shared json helpers only accept exact key/index paths
J.json.get(docs.payloadJsonb, wildcardPath)

// @ts-expect-error jsonb helpers require a jsonb expression
J.jsonb.set(docs.payload, postcodePath, "1000")

// @ts-expect-error shared json helpers preserve plain json and should not become jsonb-compatible
J.jsonb.set(strippedExpr, postcodePath, "1000")
