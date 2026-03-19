import * as Schema from "effect/Schema"

import { Column as C, Query as Q, Table } from "../../src/postgres.ts"

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

const cityPath = Q.json.path(
  Q.json.key("profile"),
  Q.json.key("address"),
  Q.json.key("city")
)
const tagPath = Q.json.path(
  Q.json.key("profile"),
  Q.json.key("tags"),
  Q.json.index(0)
)
const postcodePath = Q.json.path(
  Q.json.key("profile"),
  Q.json.key("address"),
  Q.json.key("postcode")
)
const suitePath = Q.json.path(
  Q.json.key("profile"),
  Q.json.key("address"),
  Q.json.key("suite")
)

const cityExpr = Q.json.get(docs.payload, cityPath)
const cityTextExpr = Q.json.text(docs.payload, cityPath)
const citySetExpr = Q.json.set(docs.payload, cityPath, "Paris")
const cityDeleteExpr = Q.json.delete(docs.payload, cityPath)
const firstTagExpr = Q.json.get(docs.payload, tagPath)
const hasProfileExpr = Q.json.hasKey(docs.payload, "profile")
const hasAnyExpr = Q.json.hasAnyKeys(docs.payload, "profile", "note")
const hasAllExpr = Q.json.hasAllKeys(docs.payload, "profile", "note")
const setValueExpr = Q.json.set(docs.payload, postcodePath, "1000")
const insertValueExpr = Q.json.insert(docs.payload, suitePath, "12A")
const deleteValueExpr = Q.json.delete(docs.payload, Q.json.key("note"))
const concatValueExpr = Q.json.concat({ a: 1 }, { b: "x" })
const mergeValueExpr = Q.json.merge({ a: 1 }, { b: "x" })
const builtObjectExpr = Q.json.buildObject({ a: 1, b: "x" })
const builtArrayExpr = Q.json.buildArray(1, "x", true)
const toJsonExpr = Q.json.toJson(1)
const toJsonbExpr = Q.json.toJsonb("x")
const typeNameExpr = Q.json.typeOf(docs.payload)
const lengthExpr = Q.json.length(docs.payload)
const keysExpr = Q.json.keys(docs.payload)
const pathExistsExpr = Q.json.pathExists(docs.payload, Q.json.path(Q.json.key("profile"), Q.json.key("tags"), Q.json.wildcard()))
const pathMatchExpr = Q.json.pathMatch(docs.payload, '$.profile.tags[*] ? (@ == "x")')
const strippedExpr = Q.json.stripNulls(docs.payload)

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
