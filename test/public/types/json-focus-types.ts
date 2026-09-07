import * as Schema from "effect/Schema"
import { Column, Json, Query, Scalar, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const schema = Schema.Struct({
  profile: Schema.Struct({ city: Schema.String, postcode: Schema.String }),
  pair: Schema.Tuple([Schema.String, Schema.Number])
})
const docs = Table.make("focus_docs", {
  id: Column.int().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(schema),
  portable: Column.json(schema)
})
const profile = Pg.Jsonb.focus().key("profile")
const city = profile.key("city")
const postcode = profile.key("postcode")
const updated = docs.payload.pipe(
  Pg.Jsonb.replace(city, "Paris"),
  Pg.Jsonb.replace(postcode, "75001")
)
Query.update(docs, { payload: updated })
const reshaped = docs.payload.pipe(
  Pg.Jsonb.replace(city, 123),
  Pg.Jsonb.replace(postcode, "75001")
)
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<A extends true> = A
type CityIsNumber = Expect<Equal<Scalar.RuntimeOf<typeof reshaped>["profile"]["city"], 123>>
Pg.Renderer.make().render(Query.select({ payload: reshaped }).pipe(Query.from(docs)))
Query.update(docs, {
  // @ts-expect-error selected reshaping is allowed, incompatible destination assignment is not
  payload: reshaped
})
const portable = docs.portable.pipe(Json.replace(city, "Paris"), Json.replace(postcode, "75001"))
Query.update(docs, { portable })
Query.insert(docs, { id: 1, payload: updated, portable })
const head = Json.focus().key("pair").index(0)
const changedTuple = docs.portable.pipe(Json.replace(head, true))
type HeadIsBoolean = Expect<Equal<Scalar.RuntimeOf<typeof changedTuple>["pair"][0], true>>
// @ts-expect-error a location must contain at least one key or index
Json.replace(Json.focus(), "root")
// @ts-expect-error postgres jsonb replacement cannot be applied to a plain JSON column
docs.portable.pipe(Pg.Jsonb.replace(city, "Paris"))
// @ts-expect-error cannot descend through a primitive field
docs.portable.pipe(Json.replace(city.key("invalid"), "x"))
// @ts-expect-error direct application also rejects plain JSON
Pg.Jsonb.replace(city, "Paris")(docs.portable)
const optionalDocs = Table.make("optional_focus_docs", {
  payload: Pg.Column.jsonb(Schema.Struct({
    profile: Schema.optionalKey(Schema.NullOr(Schema.Struct({ city: Schema.String })))
  }))
})
const optionalUpdated = optionalDocs.payload.pipe(Pg.Jsonb.replace(city, 123))
type OptionalOutput = Scalar.RuntimeOf<typeof optionalUpdated>
const missingParent: OptionalOutput = {}
const nullParent: OptionalOutput = { profile: null }
const changedParent: OptionalOutput = { profile: { city: 123 } }
