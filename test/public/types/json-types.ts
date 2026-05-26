import { Column as PgColumn } from "effect-qb/postgres"
import * as Std from "effect-qb"
import * as Schema from "effect/Schema"

import { Scalar as E, Function as F, Json as J, Jsonb as Jb, Query as Q } from "effect-qb/postgres"
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

const docs = Std.Table.make("docs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  payload: Std.Column.json(payloadSchema),
  payloadJsonb: PgColumn.jsonb(payloadSchema)
})

const metricsSchema = Schema.Struct({
  count: Schema.Number,
  active: Schema.Boolean
})

const metricDocs = Std.Table.make("metric_docs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  payload: Std.Column.json(metricsSchema)
})

const nullableObjectDocs = Std.Table.make("nullable_object_docs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  payload: Std.Column.json(Schema.NullOr(Schema.Struct({
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

const variantDocs = Std.Table.make("variant_docs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  payload: PgColumn.jsonb(variantPayloadSchema)
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

const nestedVariantDocs = Std.Table.make("nested_variant_docs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  payload: PgColumn.jsonb(nestedVariantPayloadSchema)
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

const dottedPathDocs = Std.Table.make("dotted_path_docs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  payload: PgColumn.jsonb(dottedPathPayloadSchema)
})

const jsonPathCollisionDocs = Std.Table.make("json_path_collision_docs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  payload: PgColumn.jsonb(collisionPayloadSchema)
})

const cityPath = J.path(
  J.key("profile"),
  J.key("address"),
  J.key("city")
)
const postcodePath = J.path(
  J.key("profile"),
  J.key("address"),
  J.key("postcode")
)
const suitePath = Jb.path(
  Jb.key("profile"),
  Jb.key("address"),
  Jb.key("suite")
)
const wildcardPath = Jb.path(
  Jb.key("profile"),
  Jb.key("tags"),
  Jb.wildcard()
)

const cityExpr = J.get(docs.payload, cityPath)
const cityTextExpr = J.text(docs.payload, cityPath)
const metricCountTextExpr = J.text(metricDocs.payload, J.key("count"))
const metricActiveTextExpr = J.text(metricDocs.payload, J.key("active"))
const curriedCityExpr = docs.payload.pipe(J.get(cityPath))
const curriedMetricCountTextExpr = metricDocs.payload.pipe(J.text(J.key("count")))
const typeNameExpr = J.typeOf(docs.payload)
const lengthExpr = J.length(docs.payload)
const keysExpr = J.keys(docs.payload)
const strippedExpr = J.stripNulls(docs.payload)
const nullableObjectTypeNameExpr = J.typeOf(nullableObjectDocs.payload)
const nullableObjectLengthExpr = J.length(nullableObjectDocs.payload)
const nullableObjectKeysExpr = J.keys(nullableObjectDocs.payload)
const tagsExpr = J.get(
  docs.payload,
  J.path(J.key("profile"), J.key("tags"))
)
const tagsKeysExpr = J.keys(tagsExpr)

const sharedJsonbProfileExpr = J.get(docs.payloadJsonb, J.key("profile"))
const sharedJsonbCityExpr = J.get(docs.payloadJsonb, cityPath)
const sharedJsonbTypeNameExpr = J.typeOf(docs.payloadJsonb)
const sharedJsonbStrippedExpr = J.stripNulls(docs.payloadJsonb)

const jsonbHasAddressExpr = Jb.hasKey(sharedJsonbProfileExpr, "address")
const jsonbHasProfileExpr = Jb.hasKey(docs.payloadJsonb, "profile")
const jsonbHasAnyExpr = Jb.hasAnyKeys(docs.payloadJsonb, "profile", "note")
const jsonbHasAllExpr = Jb.hasAllKeys(docs.payloadJsonb, "profile", "note")
const jsonbSetExpr = Jb.set(docs.payloadJsonb, postcodePath, "1000")
const jsonbInsertExpr = Jb.insert(docs.payloadJsonb, suitePath, "12A")
const jsonbSetWithoutCreateExpr = Jb.set(docs.payloadJsonb, suitePath, "12A", {
  createMissing: false
})
const jsonbDeleteExpr = Jb.delete(docs.payloadJsonb, Jb.key("note"))
const jsonbFirstTagExpr = Jb.get(docs.payloadJsonb, wildcardPath)
const jsonbConcatExpr = Jb.concat({ a: 1 }, { b: "x" })
const jsonbMergeExpr = Jb.merge({ a: 1 }, { b: "x" })
const builtObjectExpr = J.buildObject({ a: 1, b: "x" })
const builtArrayExpr = J.buildArray(1, "x", true)
const builtJsonbObjectExpr = Jb.buildObject({ a: 1, b: "x" })
const builtJsonbArrayExpr = Jb.buildArray(1, "x", true)
const toJsonExpr = J.toJson(1)
const toJsonbExpr = Jb.toJsonb("x")
const jsonbTypeNameExpr = Jb.typeOf(docs.payloadJsonb)
const jsonbLengthExpr = Jb.length(docs.payloadJsonb)
const jsonbKeysExpr = Jb.keys(docs.payloadJsonb)
const jsonbPathExistsExpr = Jb.pathExists(docs.payloadJsonb, wildcardPath)
const jsonbPathMatchExpr = Jb.pathMatch(docs.payloadJsonb, '$.profile.tags[*] ? (@ == "x")')
// @ts-expect-error SQL/JSON path predicates require non-empty string paths
Jb.pathExists(docs.payloadJsonb, "")
// @ts-expect-error SQL/JSON path predicates require non-empty string paths
Jb.pathMatch(docs.payloadJsonb, "")
const jsonbStrippedExpr = Jb.stripNulls(docs.payloadJsonb)
const jsonbStrippedSetExpr = Jb.set(sharedJsonbStrippedExpr, postcodePath, "1000")
const variantKindExpr = Jb.text(variantDocs.payload, Jb.key("kind"))
const nestedVariantKindExpr = Jb.text(
  nestedVariantDocs.payload,
  Jb.path(Jb.key("details"), Jb.key("kind"))
)
const dottedFlatKindExpr = Jb.text(
  dottedPathDocs.payload,
  Jb.path(Jb.key("a.b"), Jb.key("kind"))
)
const flatSegmentCollisionExpr = Jb.text(
  jsonPathCollisionDocs.payload,
  Jb.path(Jb.key("a,key:b"))
)
const nestedSegmentCollisionExpr = Jb.text(
  jsonPathCollisionDocs.payload,
  Jb.path(Jb.key("a"), Jb.key("b"))
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

const nullableObjectPayload = Q.select({
  payload: nullableObjectDocs.payload
}).pipe(
  Q.from(nullableObjectDocs)
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
type NullableObjectPayloadRow = Q.ResultRow<typeof nullableObjectPayload>
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
declare const nullableObjectPayloadRow: NullableObjectPayloadRow
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
const nullableObjectPayloadNull: NullableObjectPayloadRow["payload"] = null
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
void nullableObjectPayloadNull
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
J.path(J.key("profile"), Jb.wildcard())

// @ts-expect-error shared json helpers only accept exact key/index paths
J.get(docs.payloadJsonb, wildcardPath)

// @ts-expect-error jsonb mutation helpers only accept exact key/index paths
Jb.set(docs.payloadJsonb, wildcardPath, "featured")

// @ts-expect-error jsonb mutation helpers only accept exact key/index paths
Jb.insert(docs.payloadJsonb, wildcardPath, "featured")

// @ts-expect-error jsonb mutation helpers only accept exact key/index paths
Jb.delete(docs.payloadJsonb, wildcardPath)

// @ts-expect-error jsonb helpers require a jsonb expression
Jb.set(docs.payload, postcodePath, "1000")

// @ts-expect-error shared json helpers preserve plain json and should not become jsonb-compatible
Jb.set(strippedExpr, postcodePath, "1000")
