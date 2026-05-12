import * as Schema from "effect/Schema"

import { Column as C, Scalar as E, Function as F, Json as J, Query as Q, Table } from "effect-qb/postgres"
import type { BrandedErrorOf } from "../../helpers/branded-error.ts"

type IsAny<Value> = 0 extends (1 & Value) ? true : false
type IsEqual<Left, Right> = (
  <Value>() => Value extends Left ? 1 : 2
) extends (
  <Value>() => Value extends Right ? 1 : 2
) ? true : false
type Expect<T extends true> = T
type IsExact<Actual, Expected> = IsAny<Actual> extends true ? false : IsEqual<Actual, Expected>

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

const metricsSchema = Schema.Struct({
  count: Schema.Number,
  active: Schema.Boolean
})

const metricDocs = Table.make("metric_docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(metricsSchema)
})

const nullableObjectDocs = Table.make("nullable_object_docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(Schema.NullOr(Schema.Struct({
    a: Schema.String
  })))
})

const variantPayloadSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("option1"),
    option1Value: Schema.String
  }),
  Schema.Struct({
    kind: Schema.Literal("option2"),
    option2Value: Schema.String
  }),
  Schema.Struct({
    kind: Schema.Literal("option3"),
    option3Value: Schema.String
  })
)

const variantDocs = Table.make("variant_docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.jsonb(variantPayloadSchema)
})

const nestedVariantPayloadSchema = Schema.Struct({
  details: Schema.Union(
    Schema.Struct({
      kind: Schema.Literal("child1"),
      child1Value: Schema.String
    }),
    Schema.Struct({
      kind: Schema.Literal("child2"),
      child2Value: Schema.String
    })
  )
})

const nestedVariantDocs = Table.make("nested_variant_docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.jsonb(nestedVariantPayloadSchema)
})

const dottedPathPayloadSchema = Schema.Struct({
  "a.b": Schema.Struct({
    kind: Schema.Literal("flat", "other")
  }),
  a: Schema.Struct({
    b: Schema.Struct({
      kind: Schema.Literal("nested", "other")
    })
  })
})

const collisionPayloadSchema = Schema.Struct({
  "a,key:b": Schema.String,
  a: Schema.Struct({
    b: Schema.String
  })
})

const dottedPathDocs = Table.make("dotted_path_docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.jsonb(dottedPathPayloadSchema)
})

const jsonPathCollisionDocs = Table.make("json_path_collision_docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.jsonb(collisionPayloadSchema)
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
const metricCountTextExpr = J.json.text(metricDocs.payload, J.json.key("count"))
const metricActiveTextExpr = J.json.text(metricDocs.payload, J.json.key("active"))
const curriedCityExpr = docs.payload.pipe(J.json.get(cityPath))
const curriedMetricCountTextExpr = metricDocs.payload.pipe(J.json.text(J.json.key("count")))
const typeNameExpr = J.json.typeOf(docs.payload)
const lengthExpr = J.json.length(docs.payload)
const keysExpr = J.json.keys(docs.payload)
const strippedExpr = J.json.stripNulls(docs.payload)
const nullableObjectTypeNameExpr = J.json.typeOf(nullableObjectDocs.payload)
const nullableObjectLengthExpr = J.json.length(nullableObjectDocs.payload)
const nullableObjectKeysExpr = J.json.keys(nullableObjectDocs.payload)
const tagsExpr = J.json.get(
  docs.payload,
  J.json.path(J.json.key("profile"), J.json.key("tags"))
)
const tagsKeysExpr = J.json.keys(tagsExpr)

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
const jsonbSetWithoutCreateExpr = J.jsonb.set(docs.payloadJsonb, suitePath, "12A", {
  createMissing: false
})
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
const variantKindExpr = J.jsonb.text(variantDocs.payload, J.jsonb.key("kind"))
const nestedVariantKindExpr = J.jsonb.text(
  nestedVariantDocs.payload,
  J.jsonb.path(J.jsonb.key("details"), J.jsonb.key("kind"))
)
const dottedFlatKindExpr = J.jsonb.text(
  dottedPathDocs.payload,
  J.jsonb.path(J.jsonb.key("a.b"), J.jsonb.key("kind"))
)
const flatSegmentCollisionExpr = J.jsonb.text(
  jsonPathCollisionDocs.payload,
  J.jsonb.path(J.jsonb.key("a,key:b"))
)
const nestedSegmentCollisionExpr = J.jsonb.text(
  jsonPathCollisionDocs.payload,
  J.jsonb.path(J.jsonb.key("a"), J.jsonb.key("b"))
)

const option3Payload = Q.select({
  payload: variantDocs.payload
}).pipe(
  Q.from(variantDocs),
  Q.where(Q.eq(variantKindExpr, "option3"))
)

const option2Or3Payload = Q.select({
  payload: variantDocs.payload
}).pipe(
  Q.from(variantDocs),
  Q.where(Q.in(variantKindExpr, "option2", "option3"))
)

const option2Or3PayloadViaOr = Q.select({
  payload: variantDocs.payload
}).pipe(
  Q.from(variantDocs),
  Q.where(Q.or(
    Q.eq(variantKindExpr, "option2"),
    Q.eq(variantKindExpr, "option3")
  ))
)

const option3KindSelected = Q.select({
  kind: variantKindExpr
}).pipe(
  Q.from(variantDocs),
  Q.where(Q.eq(variantKindExpr, "option3"))
)

const option2Or3KindSelectedViaOr = Q.select({
  kind: variantKindExpr
}).pipe(
  Q.from(variantDocs),
  Q.where(Q.or(
    Q.eq(variantKindExpr, "option2"),
    Q.eq(variantKindExpr, "option3")
  ))
)

const nestedChild2Payload = Q.select({
  payload: nestedVariantDocs.payload,
  kind: nestedVariantKindExpr
}).pipe(
  Q.from(nestedVariantDocs),
  Q.where(Q.eq(nestedVariantKindExpr, "child2"))
)

const dottedFlatPayload = Q.select({
  payload: dottedPathDocs.payload
}).pipe(
  Q.from(dottedPathDocs),
  Q.where(Q.eq(dottedFlatKindExpr, "flat"))
)

const groupedCityText = Q.select({
  city: cityTextExpr,
  count: F.count(docs.id)
}).pipe(
  Q.from(docs),
  Q.groupBy(cityTextExpr)
)

const invalidGroupedCityText = Q.select({
  city: cityTextExpr,
  count: F.count(docs.id)
}).pipe(
  Q.from(docs),
  Q.groupBy(typeNameExpr)
)

const invalidGroupedJsonPathCollision = Q.select({
  flatKey: flatSegmentCollisionExpr,
  count: F.count(jsonPathCollisionDocs.id)
}).pipe(
  Q.from(jsonPathCollisionDocs),
  Q.groupBy(nestedSegmentCollisionExpr)
)

type City = E.RuntimeOf<typeof cityExpr>
type CityText = E.RuntimeOf<typeof cityTextExpr>
type MetricCountText = E.RuntimeOf<typeof metricCountTextExpr>
type MetricActiveText = E.RuntimeOf<typeof metricActiveTextExpr>
type CurriedCity = E.RuntimeOf<typeof curriedCityExpr>
type CurriedMetricCountText = E.RuntimeOf<typeof curriedMetricCountTextExpr>
type JsonTypeName = E.RuntimeOf<typeof typeNameExpr>
type JsonLength = E.RuntimeOf<typeof lengthExpr>
type JsonKeys = E.RuntimeOf<typeof keysExpr>
type NullableObjectTypeName = E.RuntimeOf<typeof nullableObjectTypeNameExpr>
type NullableObjectLength = E.RuntimeOf<typeof nullableObjectLengthExpr>
type NullableObjectKeys = E.RuntimeOf<typeof nullableObjectKeysExpr>
type TagsKeys = E.RuntimeOf<typeof tagsKeysExpr>
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
type JsonbSetWithoutCreate = E.RuntimeOf<typeof jsonbSetWithoutCreateExpr>
type Option3PayloadRow = Q.ResultRow<typeof option3Payload>
type Option3PayloadRuntimeRow = Q.RuntimeResultRow<typeof option3Payload>
type Option2Or3PayloadRow = Q.ResultRow<typeof option2Or3Payload>
type Option2Or3PayloadViaOrRow = Q.ResultRow<typeof option2Or3PayloadViaOr>
type Option3KindSelectedRow = Q.ResultRow<typeof option3KindSelected>
type Option2Or3KindSelectedViaOrRow = Q.ResultRow<typeof option2Or3KindSelectedViaOr>
type NestedChild2PayloadRow = Q.ResultRow<typeof nestedChild2Payload>
type DottedFlatPayloadRow = Q.ResultRow<typeof dottedFlatPayload>
type GroupedCityTextRow = Q.ResultRow<typeof groupedCityText>
type CurriedCityIsExact = Expect<IsExact<CurriedCity, string>>
type CurriedMetricCountTextIsExact = Expect<IsExact<CurriedMetricCountText, `${number}`>>
type NullableObjectTypeNameIsExact = Expect<IsExact<NullableObjectTypeName, "object" | "null">>
type NullableObjectLengthIsExact = Expect<IsExact<NullableObjectLength, number | null>>
type NullableObjectKeysIsExact = Expect<IsExact<NullableObjectKeys, readonly "a"[] | null>>

const city: City = "Paris"
const cityText: CityText = "Paris"
const metricCountText: MetricCountText = "1"
const metricActiveText: MetricActiveText = "true"
const jsonTypeName: JsonTypeName = "object"
const jsonLength: JsonLength = 2
const jsonKeys: JsonKeys = ["profile", "note"]
const nullableObjectTypeNameObject: NullableObjectTypeName = "object"
const nullableObjectTypeNameNull: NullableObjectTypeName = "null"
const nullableObjectLengthNumber: NullableObjectLength = 1
const nullableObjectLengthNull: NullableObjectLength = null
const nullableObjectKeysArray: NullableObjectKeys = ["a"]
const nullableObjectKeysNull: NullableObjectKeys = null
const tagsKeys: TagsKeys = null
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
declare const jsonbSetWithoutCreate: JsonbSetWithoutCreate
declare const option3PayloadRow: Option3PayloadRow
declare const option3PayloadRuntimeRow: Option3PayloadRuntimeRow
declare const option2Or3PayloadRow: Option2Or3PayloadRow
declare const option2Or3PayloadViaOrRow: Option2Or3PayloadViaOrRow
declare const option3KindSelectedRow: Option3KindSelectedRow
declare const option2Or3KindSelectedViaOrRow: Option2Or3KindSelectedViaOrRow
declare const nestedChild2PayloadRow: NestedChild2PayloadRow
declare const groupedCityTextRow: GroupedCityTextRow
const option3PayloadKind: "option3" = option3PayloadRow.payload.kind
const option3PayloadValue: string = option3PayloadRow.payload.option3Value
const conservativeOption3RuntimeKind: "option1" | "option2" | "option3" = option3PayloadRuntimeRow.payload.kind
const option2Or3PayloadKind: "option2" | "option3" = option2Or3PayloadRow.payload.kind
const option2Or3PayloadViaOrKind: "option2" | "option3" = option2Or3PayloadViaOrRow.payload.kind
const option3SelectedKind: "option3" = option3KindSelectedRow.kind
const option2Or3SelectedViaOrKind: "option2" | "option3" = option2Or3KindSelectedViaOrRow.kind
const nestedChild2PayloadKind: "child2" = nestedChild2PayloadRow.payload.details.kind
const nestedChild2SelectedKind: "child2" = nestedChild2PayloadRow.kind
// @ts-expect-error createMissing: false should not add a missing object key
jsonbSetWithoutCreate.profile.address.suite
declare const dottedFlatPayloadRow: DottedFlatPayloadRow
const dottedFlatKeyKind: "flat" = dottedFlatPayloadRow.payload["a.b"].kind
const dottedNestedKeyKind: "nested" | "other" = dottedFlatPayloadRow.payload.a.b.kind
const groupedCityTextCity: CityText = groupedCityTextRow.city
const groupedCityTextCount: number = groupedCityTextRow.count
const completeGroupedCityText: Q.CompletePlan<typeof groupedCityText> = groupedCityText
type InvalidGroupedCityText = Q.CompletePlan<typeof invalidGroupedCityText>
const invalidGroupedCityTextError: BrandedErrorOf<InvalidGroupedCityText> =
  "effect-qb: invalid grouped selection"
type InvalidGroupedJsonPathCollision = Q.CompletePlan<typeof invalidGroupedJsonPathCollision>
const invalidGroupedJsonPathCollisionError: BrandedErrorOf<InvalidGroupedJsonPathCollision> =
  "effect-qb: invalid grouped selection"
// @ts-expect-error discriminator equality should remove unrelated jsonb union members
option3PayloadRow.payload.option1Value
// @ts-expect-error discriminator IN should remove excluded jsonb union members
option2Or3PayloadRow.payload.option1Value
// @ts-expect-error discriminator OR should remove excluded jsonb union members
option2Or3PayloadViaOrRow.payload.option1Value
// @ts-expect-error selected json path equality should narrow the selected expression
const badOption3SelectedKind: Option3KindSelectedRow["kind"] = "option2"
// @ts-expect-error selected json path OR should narrow the selected expression
const badOption2Or3SelectedViaOrKind: Option2Or3KindSelectedViaOrRow["kind"] = "option1"
// @ts-expect-error nested json path equality should remove unrelated nested union members
nestedChild2PayloadRow.payload.details.child1Value
// @ts-expect-error nested selected json path should narrow the selected expression
const badNestedChild2SelectedKind: NestedChild2PayloadRow["kind"] = "child1"
void city
void cityText
void metricCountText
void metricActiveText
void jsonTypeName
void jsonLength
void jsonKeys
void nullableObjectTypeNameObject
void nullableObjectTypeNameNull
void nullableObjectLengthNumber
void nullableObjectLengthNull
void nullableObjectKeysArray
void nullableObjectKeysNull
void tagsKeys
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
void option3PayloadKind
void option3PayloadValue
void conservativeOption3RuntimeKind
void option2Or3PayloadKind
void option2Or3PayloadViaOrKind
void option3SelectedKind
void option2Or3SelectedViaOrKind
void nestedChild2PayloadKind
void nestedChild2SelectedKind
void groupedCityTextCity
void groupedCityTextCount
void completeGroupedCityText
void invalidGroupedCityTextError
void invalidGroupedJsonPathCollisionError
void badOption3SelectedKind
void badOption2Or3SelectedViaOrKind
void badNestedChild2SelectedKind
void jsonbSetExpr
void jsonbSetWithoutCreateExpr
void jsonbInsertExpr
void jsonbDeleteExpr
void jsonbFirstTagExpr
void jsonbStrippedSetExpr
void (undefined as unknown as CurriedCityIsExact)
void (undefined as unknown as CurriedMetricCountTextIsExact)
void (undefined as unknown as NullableObjectTypeNameIsExact)
void (undefined as unknown as NullableObjectLengthIsExact)
void (undefined as unknown as NullableObjectKeysIsExact)

// @ts-expect-error wildcard paths require the jsonb helper surface
J.json.path(J.json.key("profile"), J.jsonb.wildcard())

// @ts-expect-error shared json helpers only accept exact key/index paths
J.json.get(docs.payloadJsonb, wildcardPath)

// @ts-expect-error jsonb mutation helpers only accept exact key/index paths
J.jsonb.set(docs.payloadJsonb, wildcardPath, "featured")

// @ts-expect-error jsonb mutation helpers only accept exact key/index paths
J.jsonb.insert(docs.payloadJsonb, wildcardPath, "featured")

// @ts-expect-error jsonb mutation helpers only accept exact key/index paths
J.jsonb.delete(docs.payloadJsonb, wildcardPath)

// @ts-expect-error jsonb helpers require a jsonb expression
J.jsonb.set(docs.payload, postcodePath, "1000")

// @ts-expect-error shared json helpers preserve plain json and should not become jsonb-compatible
J.jsonb.set(strippedExpr, postcodePath, "1000")
