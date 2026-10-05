import { test } from "bun:test"
import * as Schema from "effect/Schema"
import { TestSchema } from "effect/testing"

import { Column, Query, Table } from "#standard"

test("derived table codecs decode and encode transformed JSON fields", async () => {
  const records = Table.make("codec_records", {
    id: Column.int(),
    payload: Column.json(Schema.Struct({
      count: Schema.NumberFromString.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 10000 })),
      label: Schema.String
    }))
  })
  const asserts = new TestSchema.Asserts(Table.selectSchema(records))
  const encoded = { id: 1, payload: { count: "42", label: "stored" } }
  const decoded = { id: 1, payload: { count: 42, label: "stored" } }
  await asserts.decoding().succeed(encoded, decoded)
  await asserts.encoding().succeed(decoded, encoded)
  await asserts.verifyRoundTrip({ seed: 98112, runs: 100 })
})

test("insert and update codecs retain generated and optional field contracts", async () => {
  const records = Table.make("codec_generated_records", {
    id: Column.int().pipe(Column.generated(Query.literal(1))),
    label: Column.text(),
    note: Column.text().pipe(Column.nullable)
  })
  const insert = new TestSchema.Asserts(Table.insertSchema(records))
  const update = new TestSchema.Asserts(Table.updateSchema(records))
  await insert.decoding().succeed({ label: "new", note: null })
  await insert.encoding().succeed({ label: "new", note: null })
  await update.decoding().succeed({})
  await update.decoding().succeed({ note: null })
  await update.verifyRoundTrip({ seed: 98112, runs: 100 })
})
