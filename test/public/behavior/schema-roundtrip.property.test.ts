import { expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Arbitrary from "effect/Arbitrary"
import { Column, Query as Q, Table } from "#standard"
import * as Pg from "#postgres"
import * as My from "#mysql"
import * as Sq from "#sqlite"

const payload = Schema.Struct({
  tags: Schema.Array(Schema.String),
  count: Schema.Int.check(Schema.isBetween({ minimum: -1000, maximum: 1000 })),
  note: Schema.NullOr(Schema.String)
})
// SQL text uses UTF-8; lone UTF-16 surrogates cannot round-trip through the driver.
const utf8Text = Schema.String.check(Schema.makeFilter((value) => value.isWellFormed()))
const records = Table.make("property_records", {
  id: Column.int().pipe(Column.primaryKey, Column.brand),
  name: Column.text().pipe(Column.schema(utf8Text)),
  bio: Column.text().pipe(Column.schema(utf8Text), Column.nullable),
  active: Column.boolean().pipe(Column.default(Q.literal(false))),
  payload: Column.json(payload)
})
const select = Q.select({
  id: records.id, name: records.name, bio: records.bio, active: records.active, payload: records.payload
}).pipe(Q.from(records))
const selectedRows = Arbitrary.schema(Table.selectSchema(records))

const check = async <A>(arbitrary: Arbitrary.Arbitrary<A>, property: (value: A) => void | Promise<void>) => {
  const result = await Effect.runPromise(Arbitrary.checkEffect(arbitrary, (value) =>
    Effect.tryPromise(async () => {
      await property(value)
      return true
    }), { seed: 98112, runs: 100 }))
  expect(result._tag, Arbitrary.formatCheckFailure(result)).toBe("Passed")
}

test("schema-derived rows round-trip through SQLite inserts, defaults, and decoding", async () => {
  await check(Arbitrary.all([selectedRows, Arbitrary.schema(Schema.Boolean)]), async ([row, omitDefaults]) => {
    const { bio, active, ...required } = row
    const input = omitDefaults ? required : row
    expect(Schema.is(Table.insertSchema(records))(input)).toBe(true)
    const result = await Effect.runPromise(Effect.gen(function*() {
      const executor = Sq.Executor.make()
      yield* executor.execute(Q.createTable(records))
      yield* executor.execute(Q.insert(records, input))
      return yield* executor.execute(select).pipe(Sq.Executor.exactlyOne)
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true }))))
    // SQL integers and JSON numbers do not preserve negative zero.
    const expected = omitDefaults ? { ...required, bio: null, active: false } : row
    expect(result).toEqual({ ...expected, id: expected.id + 0, payload: { ...expected.payload, count: expected.payload.count + 0 } })
    expect(Schema.is(Table.selectSchema(records))(result)).toBe(true)
  })
})

for (const [name, renderer] of [
  ["postgres", Pg.Renderer.make()], ["mysql", My.Renderer.make()], ["sqlite", Sq.Renderer.make()]
] as const) {
  test(`${name}: generated JSON and text remain bound parameters`, async () => {
    await check(selectedRows, (row) => {
      const rendered = renderer.render(Q.insert(records, row))
      expect(rendered.params).toContain(row.name)
      if (row.bio !== null) expect(rendered.params).toContain(row.bio)
      const json = rendered.params.at(-1)
      expect(typeof json === "string" ? JSON.parse(json) : json).toEqual(row.payload)
      // SQL depends on the column set, not the generated values.
      const other = renderer.render(Q.insert(records, { ...row, name: "fixed", payload: { tags: [], count: 0, note: null } }))
      expect(rendered.sql).toBe(other.sql)
    })
  })
}

test("generated update payloads exclude primary keys and permit nullable fields", async () => {
  const schema = Table.updateSchema(records)
  await check(Arbitrary.schema(schema), (row) => {
    expect(Object.hasOwn(row, "id")).toBe(false)
    expect(Schema.is(schema)(row)).toBe(true)
    expect(Schema.is(schema)({ ...row, bio: null })).toBe(true)
  })
})

test("mutation schemas distinguish omitted fields from explicit undefined", () => {
  const insert = Table.insertSchema(records)
  const update = Table.updateSchema(records)
  const required = { id: 1, name: "one", payload: { tags: [], count: 0, note: null } }
  expect(Schema.is(insert)(required)).toBe(true)
  expect(Schema.is(insert)({ ...required, bio: null })).toBe(true)
  expect(Schema.is(insert)({ ...required, active: undefined })).toBe(false)
  expect(Schema.is(insert)({ ...required, bio: undefined })).toBe(false)
  expect(Schema.is(update)({})).toBe(true)
  expect(Schema.is(update)({ bio: null })).toBe(true)
  expect(Schema.is(update)({ bio: undefined })).toBe(false)
  expect(Schema.is(update)({ active: undefined })).toBe(false)
})


test("generated insert-schema values execute without mutation coercion", async () => {
  const inputs = Arbitrary.schema(Table.insertSchema(records))
  await check(inputs, async (input) => {
    const row = await Effect.runPromise(Effect.gen(function*() {
      const executor = Sq.Executor.make()
      yield* executor.execute(Q.createTable(records))
      yield* executor.execute(Q.insert(records, input))
      const updated = { name: "updated", bio: null }
      expect(Schema.is(Table.updateSchema(records))(updated)).toBe(true)
      yield* executor.execute(Q.update(records, updated))
      return yield* executor.execute(select).pipe(Sq.Executor.exactlyOne)
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true }))))
    expect(row).toEqual({ ...input, id: input.id + 0, payload: { ...input.payload, count: input.payload.count + 0 }, active: input.active ?? false, bio: null, name: "updated" })
  })
})
