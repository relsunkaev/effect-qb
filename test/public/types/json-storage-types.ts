import * as Schema from "effect/Schema"
import { Cast, Column, Json, Query, Scalar, Table, Type } from "effect-qb"
import * as Pg from "effect-qb/postgres"
import * as My from "effect-qb/mysql"
import * as Sq from "effect-qb/sqlite"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<A extends true> = A
const codec = Schema.Struct({ count: Schema.NumberFromString }).pipe(Schema.encodeKeys({ count: "stored_count" }))
const docs = Table.make("stored_docs", {
  pg: Pg.Column.jsonb(codec), std: Column.json(codec),
  my: My.Column.custom(codec, { ...Type.json(), variant: "json" as const }), sq: Sq.Column.custom(codec, { ...Type.json(), variant: "json" as const }),
  custom: Pg.Column.custom(codec, Pg.Type.jsonb())
})
const pgLeaf = docs.pg.stored_count
const stdLeaf = docs.std.stored_count
const myLeaf = docs.my.stored_count
const sqLeaf = docs.sq.stored_count
const customLeaf = docs.custom.stored_count
type RootDecoded = Expect<Equal<Scalar.RuntimeOf<typeof docs.pg>, { readonly count: number }>>
type PgLeafStored = Expect<Equal<Scalar.RuntimeOf<typeof pgLeaf>, string>>
type StdLeafStored = Expect<Equal<Scalar.RuntimeOf<typeof stdLeaf>, string>>
type MyLeafStored = Expect<Equal<Scalar.RuntimeOf<typeof myLeaf>, string>>
type SqLeafStored = Expect<Equal<Scalar.RuntimeOf<typeof sqLeaf>, string>>
type CustomLeafStored = Expect<Equal<Scalar.RuntimeOf<typeof customLeaf>, string>>
// @ts-expect-error decoded key is not a stored JSON key
docs.pg.count
// @ts-expect-error a stored string is not a JSON numeric scalar
Cast.to(pgLeaf, Type.int())
const changed = docs.pg.pipe(Pg.Jsonb.replace(Pg.Jsonb.focus().key("stored_count"), "43"))
Query.update(docs, { pg: changed })
Query.insert(docs, { pg: docs.pg, std: docs.std, my: docs.my, sq: docs.sq, custom: docs.custom })
Query.update(docs, { pg: { count: 43 } })
const reshaped = docs.pg.pipe(Pg.Jsonb.replace(Pg.Jsonb.focus().key("stored_count"), 43))
type ChangedStored = Expect<Equal<Scalar.RuntimeOf<typeof reshaped>["stored_count"], 43>>
Query.select({ reshaped }).pipe(Query.from(docs))
Query.update(docs, {
  // @ts-expect-error SQL expression assigns encoded shape, not decoded root shape
  pg: reshaped
})
const nested = Json.buildObject({ payload: docs.std })
type NestedStored = Expect<Equal<Scalar.RuntimeOf<typeof nested>["payload"], { readonly stored_count: string }>>

const remapped = Table.make("remapped_docs", {
  payload: Column.json(Schema.Struct({ stored_count: Schema.String })).pipe(Column.schema(codec)),
  scalar: Pg.Column.jsonb(Schema.NumberFromString)
})
const remappedLeaf = remapped.payload.stored_count
type RemappedLeaf = Expect<Equal<Scalar.RuntimeOf<typeof remappedLeaf>, string>>
// @ts-expect-error whole JSON scalar is stored as a string, despite decoding to number
Cast.to(remapped.scalar, Type.int())
const derived = Query.as(Query.select({ payload: docs.pg }).pipe(Query.from(docs)), "derived_docs")
const derivedLeaf = Pg.Jsonb.get(derived.payload, Pg.Jsonb.key("stored_count"))
type DerivedLeaf = Expect<Equal<Scalar.RuntimeOf<typeof derivedLeaf>, string>>
const withExpression = docs.pg.pipe(Pg.Jsonb.replace(Pg.Jsonb.focus().key("stored_count"), pgLeaf))
type ExpressionReplacement = Expect<Equal<Scalar.RuntimeOf<typeof withExpression>["stored_count"], string>>
Query.update(docs, { pg: withExpression })
