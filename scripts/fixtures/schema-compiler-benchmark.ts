import * as assert from "node:assert/strict"
import * as Schema from "effect/Schema"
import * as SchemaJITCompiler from "effect/schema/SchemaJITCompiler"
import { Column, Query, Table } from "../../packages/querybuilder/src/standard.js"
import { Renderer } from "../../packages/querybuilder/src/postgres.js"
import { makeRowDecoder } from "../../packages/querybuilder/src/internal/executor.js"
import { expressionRuntimeSchema } from "../../packages/querybuilder/src/internal/runtime/schema.js"

const mode = process.argv[2]
const start = performance.now()
const payload = Schema.Struct({
  count: Schema.NumberFromString,
  label: Schema.String.check(Schema.isMaxLength(100)),
  items: Schema.Array(Schema.Struct({ code: Schema.String, amount: Schema.NumberFromString }))
})
const records = Table.make("compiler_records", {
  id: Column.int(),
  label: Column.text().pipe(Column.schema(Schema.String.check(Schema.isMaxLength(100)))),
  active: Column.boolean(),
  payload: Column.json(payload)
})
const plan = Query.select({ id: records.id, label: records.label, active: records.active,
  payload: records.payload }).pipe(Query.from(records))
if (mode === "jit") {
  for (const expression of [records.id, records.label, records.active, records.payload]) {
    const schema = expressionRuntimeSchema(expression)!
    SchemaJITCompiler.enable(schema.ast)
    SchemaJITCompiler.enable(Schema.toType(schema).ast)
  }
}
const rendered = Renderer.make().render(plan)
const decoder = makeRowDecoder(rendered, plan)
const input = { id: 1, label: "schema benchmark", active: true,
  payload: { count: "42", label: "nested", items: Array.from({ length: 10 }, (_, i) => ({ code: `item-${i}`, amount: "7" })) } }
const expected = { ...input, payload: { ...input.payload, count: 42,
  items: input.payload.items.map((item) => ({ ...item, amount: 7 })) } }
assert.deepEqual(decoder(input), expected)
const coldMs = performance.now() - start
for (let i = 0; i < 1000; i++) decoder(input)
const samples: number[] = []
let checksum = 0
for (let run = 0; run < 7; run++) {
  const start = performance.now()
  for (let i = 0; i < 10000; i++) checksum += decoder(input).payload.count
  samples.push(performance.now() - start)
}
assert.equal(checksum, 7 * 10000 * 42)
assert.deepEqual(decoder(input), expected)
console.log(JSON.stringify({ mode, coldMs, rowsPerSample: 10000, samplesMs: samples }))
