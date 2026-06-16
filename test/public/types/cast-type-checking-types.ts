import * as Schema from "effect/Schema"
import { Cast, Column, Query, Scalar, Table } from "effect-qb"
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
  const idText = Cast.to(ids.id, Query.type.text())
  const seqText = Cast.to(ids.sequence, Query.type.text())
  const amountInt = Cast.to(ids.amount, Query.type.int())
  const refInt = Cast.to(ids.externalRef, Query.type.int())

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
  const toText = Cast.to(Query.type.text())
  const idText = toText(ids.id)
  const value: Scalar.RuntimeOf<typeof idText> = "x"
  void value
}

// A cast bridges two different comparison families.
{
  const idText = Cast.to(ids.id, Query.type.text())
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

  // @ts-expect-error float8 is dialect-specific and is not on Query.type
  Query.type.float8()
}

export {}
