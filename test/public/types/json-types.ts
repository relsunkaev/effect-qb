import * as Schema from "effect/Schema"

import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const docs = Table.make("docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(Schema.Struct({
    profile: Schema.Struct({
      address: Schema.Struct({
        city: Schema.String,
        postcode: Schema.NullOr(Schema.String)
      }),
      tags: Schema.Array(Schema.String)
    }),
    note: Schema.NullOr(Schema.String)
  }))
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
const tagPath = F.json.path(
  F.json.key("profile"),
  F.json.key("tags"),
  F.json.index(0)
)
const postcodePath = F.json.path(
  F.json.key("profile"),
  F.json.key("address"),
  F.json.key("postcode")
)
const suitePath = F.json.path(
  F.json.key("profile"),
  F.json.key("address"),
  F.json.key("suite")
)

const cityExpr = F.json.get(docs.payload, cityPath)
const cityTextExpr = F.json.text(docs.payload, cityPath)
const citySetExpr = F.json.set(docs.payload, cityPath, "Paris")
const cityDeleteExpr = F.json.delete(docs.payload, cityPath)
const firstTagExpr = F.json.get(docs.payload, tagPath)
const hasProfileExpr = F.json.hasKey(docs.payload, "profile")
const hasAnyExpr = F.json.hasAnyKeys(docs.payload, "profile", "note")
const hasAllExpr = F.json.hasAllKeys(docs.payload, "profile", "note")
const setValueExpr = F.json.set(docs.payload, postcodePath, "1000")
const insertValueExpr = F.json.insert(docs.payload, suitePath, "12A")
const deleteValueExpr = F.json.delete(docs.payload, F.json.key("note"))
const concatValueExpr = F.json.concat({ a: 1 }, { b: "x" })
const mergeValueExpr = F.json.merge({ a: 1 }, { b: "x" })
const builtObjectExpr = F.json.buildObject({ a: 1, b: "x" })
const builtArrayExpr = F.json.buildArray(1, "x", true)
const toJsonExpr = F.json.toJson(1)
const toJsonbExpr = F.json.toJsonb("x")
const typeNameExpr = F.json.typeOf(docs.payload)
const lengthExpr = F.json.length(docs.payload)
const keysExpr = F.json.keys(docs.payload)
const pathExistsExpr = F.json.pathExists(docs.payload, F.json.path(F.json.key("profile"), F.json.key("tags"), F.json.wildcard()))
const pathMatchExpr = F.json.pathMatch(docs.payload, '$.profile.tags[*] ? (@ == "x")')
const strippedExpr = F.json.stripNulls(docs.payload)

type City = Q.ExpressionOutput<typeof cityExpr, DocsAvailable>
type CityText = Q.ExpressionOutput<typeof cityTextExpr, DocsAvailable>
type CitySet = Q.ExpressionOutput<typeof citySetExpr, DocsAvailable>
type CityDelete = Q.ExpressionOutput<typeof cityDeleteExpr, DocsAvailable>
type FirstTag = Q.ExpressionOutput<typeof firstTagExpr, DocsAvailable>
type HasProfile = Q.ExpressionOutput<typeof hasProfileExpr, DocsAvailable>
type HasAny = Q.ExpressionOutput<typeof hasAnyExpr, DocsAvailable>
type HasAll = Q.ExpressionOutput<typeof hasAllExpr, DocsAvailable>
type SetValue = Q.ExpressionOutput<typeof setValueExpr, DocsAvailable>
type InsertValue = Q.ExpressionOutput<typeof insertValueExpr, DocsAvailable>
type DeleteValue = Q.ExpressionOutput<typeof deleteValueExpr, DocsAvailable>
type ConcatValue = Exclude<Q.ExpressionOutput<typeof concatValueExpr, DocsAvailable>, null>
type MergeValue = Exclude<Q.ExpressionOutput<typeof mergeValueExpr, DocsAvailable>, null>
type BuiltObject = Q.ExpressionOutput<typeof builtObjectExpr, DocsAvailable>
type BuiltArray = Q.ExpressionOutput<typeof builtArrayExpr, DocsAvailable>
type ToJson = Q.ExpressionOutput<typeof toJsonExpr, DocsAvailable>
type ToJsonb = Q.ExpressionOutput<typeof toJsonbExpr, DocsAvailable>
type TypeName = Q.ExpressionOutput<typeof typeNameExpr, DocsAvailable>
type Length = Q.ExpressionOutput<typeof lengthExpr, DocsAvailable>
type Keys = Q.ExpressionOutput<typeof keysExpr, DocsAvailable>
type PathExists = Q.ExpressionOutput<typeof pathExistsExpr, DocsAvailable>
type PathMatch = Q.ExpressionOutput<typeof pathMatchExpr, DocsAvailable>
type Stripped = Exclude<Q.ExpressionOutput<typeof strippedExpr, DocsAvailable>, null>

const jsonSelectPlan = Q.select({
  city: cityExpr,
  cityText: cityTextExpr,
  firstTag: firstTagExpr,
  hasProfile: hasProfileExpr,
  typeName: typeNameExpr
}).pipe(Q.from(docs))

type JsonSelectRow = Q.ResultRow<typeof jsonSelectPlan>

const city: City = "Paris"
const cityText: CityText = "Paris"
const citySet: CitySet["profile"]["address"]["city"] = "Paris"
// @ts-expect-error delete removes the field from the result type
const cityDelete: CityDelete["profile"]["address"]["city"] = "Paris"
const firstTag: FirstTag = null
const hasProfile: HasProfile = true
const hasAny: HasAny = true
const hasAll: HasAll = true
const setValuePostcode: SetValue["profile"]["address"]["postcode"] = "1000"
const insertValueSuite: InsertValue["profile"]["address"]["suite"] = "12A"
// @ts-expect-error delete removes the field from the result type
const deletedNote: DeleteValue["note"] = "x"
const concatValueA: ConcatValue["a"] = 1
const concatValueB: ConcatValue["b"] = "x"
const mergeValueA: MergeValue["a"] = 1
const mergeValueB: MergeValue["b"] = "x"
const builtObjectA: BuiltObject["a"] = 1
const builtObjectB: BuiltObject["b"] = "x"
const builtArray0: BuiltArray[0] = 1
const builtArray1: BuiltArray[1] = "x"
const builtArray2: BuiltArray[2] = true
const toJson: ToJson = 1
const toJsonb: ToJsonb = "x"
const typeName: TypeName = "object"
const length: Length = 2
const keys: Keys = ["profile", "note"]
const pathExists: PathExists = true
const pathMatch: PathMatch = true
const strippedNote: Stripped["note"] = undefined
const strippedPostcode: Stripped["profile"]["address"]["postcode"] = undefined

const selectCity: JsonSelectRow["city"] = "Paris"
const selectCityText: JsonSelectRow["cityText"] = "Paris"
const selectFirstTag: JsonSelectRow["firstTag"] = null
const selectHasProfile: JsonSelectRow["hasProfile"] = true
const selectTypeName: JsonSelectRow["typeName"] = "object"

void city
void cityText
void citySet
void cityDelete
void firstTag
void hasProfile
void hasAny
void hasAll
void setValuePostcode
void insertValueSuite
void deletedNote
void concatValueA
void concatValueB
void mergeValueA
void mergeValueB
void builtObjectA
void builtObjectB
void builtArray0
void builtArray1
void builtArray2
void toJson
void toJsonb
void typeName
void length
void keys
void pathExists
void pathMatch
void strippedNote
void strippedPostcode
void selectCity
void selectCityText
void selectFirstTag
void selectHasProfile
void selectTypeName
