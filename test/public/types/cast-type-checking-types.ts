import * as Schema from "effect/Schema"
import { Cast, Column, Query, Scalar, Table, Type } from "effect-qb"
import * as Pg from "effect-qb/postgres"

// `Cast.to` checks a source expression against a target type witness and reports
// the cast's result type. It is dual: `Cast.to(value, target)` data-first, and
// `Cast.to(target)` returning a function applied to the value. These checks
// exercise both forms across source/target families and confirm that resolving
// the result type — including forcing it through `Scalar.RuntimeOf` — stays
// within the type-instantiation budget.

const ids = Table.make("ids", {
  id: Column.uuid().pipe(Column.primaryKey),
  sequence: Column.int(),
  amount: Column.real(),
  externalRef: Column.text()
})

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(Schema.Struct({
    metrics: Schema.Struct({ count: Schema.Number }),
    address: Schema.Struct({ city: Schema.String })
  }))
})

// Data-first across portable source/target families.
{
  const idText = Cast.to(ids.id, Type.text())
  const seqText = Cast.to(ids.sequence, Type.text())
  const amountInt = Cast.to(ids.amount, Type.int())
  const refInt = Cast.to(ids.externalRef, Type.int())

  const a: Scalar.RuntimeOf<typeof idText> = "x"
  const b: Scalar.RuntimeOf<typeof seqText> = "x"
  const c: Scalar.RuntimeOf<typeof amountInt> = 1
  const d: Scalar.RuntimeOf<typeof refInt> = 1
  void a
  void b
  void c
  void d
}

// Data-first to a dialect-specific target, from a schema-known JSONB numeric path.
{
  const count = Cast.to(docs.payload.metrics.count, Pg.Type.float8())
  const value: Scalar.RuntimeOf<typeof count> = 1
  void value
}

// Curried form applied directly to the value.
{
  const toText = Cast.to(Type.text())
  const idText = toText(ids.id)
  const value: Scalar.RuntimeOf<typeof idText> = "x"
  void value
}

// A cast bridges two different comparison families.
{
  const idText = Cast.to(ids.id, Type.text())
  void Query.eq(idText, ids.externalRef)

  // @ts-expect-error uuid and text are different comparison families
  Query.eq(ids.id, ids.externalRef)
}

// Incompatible casts are rejected, not silently accepted.
{
  // @ts-expect-error a JSONB object cannot be cast to a numeric type
  Cast.to(docs.payload.metrics, Pg.Type.float8())

  // @ts-expect-error a JSONB string cannot be cast to a numeric type
  Cast.to(docs.payload.address.city, Pg.Type.float8())

  // @ts-expect-error float8 is dialect-specific and is not on Type
  Type.float8()
}

export {}

// Pipe form must stay usable on mixed-field tables, not only direct currying.
{
  const idText = ids.id.pipe(Cast.to(Type.text()))
  const seqText = ids.sequence.pipe(Cast.to(Type.text()))
  const amountInt = ids.amount.pipe(Cast.to(Type.int()))
  const numericJson = docs.payload.metrics.count.pipe(Cast.to(Pg.Type.float8()))
  const a: Scalar.RuntimeOf<typeof idText> = "x"
  const b: Scalar.RuntimeOf<typeof seqText> = "x"
  const c: Scalar.RuntimeOf<typeof amountInt> = 1
  const d: Scalar.RuntimeOf<typeof numericJson> = 1
  void [a, b, c, d]
  // @ts-expect-error pipe form must not weaken incompatible JSON object casts
  docs.payload.metrics.pipe(Cast.to(Pg.Type.float8()))
}

// Pipe results retain exact types and cannot bypass grouping validation.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<T extends true> = T
const pipedId = ids.id.pipe(Cast.to(Type.text()))
const pipedSequence = ids.sequence.pipe(Cast.to(Type.text()))
type PipedIdIsString = Expect<Equal<Scalar.RuntimeOf<typeof pipedId>, string>>
type PipedSequenceIsString = Expect<Equal<Scalar.RuntimeOf<typeof pipedSequence>, string>>
const groupedId = Query.select({ id: pipedId }).pipe(Query.from(ids), Query.groupBy(pipedId))
Pg.Renderer.make().render(groupedId)
const wrongGrouping = Query.select({ id: pipedId }).pipe(Query.from(ids), Query.groupBy(pipedSequence))
// @ts-expect-error grouping a different cast does not authorize this projection
Pg.Renderer.make().render(wrongGrouping)
