import * as assert from "node:assert/strict"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Stream from "effect/Stream"

import { Column, Query, Table } from "effect-qb"
import { Executor, Function as SqliteFunction } from "effect-qb/sqlite"

const records = Table.make("node_records", {
  id: Column.int().pipe(Column.primaryKey),
  active: Column.boolean(),
  payload: Column.json(Schema.Struct({ count: Schema.NumberFromString }))
})

await Effect.runPromise(Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const executor = Executor.make()
  yield* executor.execute(Query.createTable(records))
  yield* executor.execute(Query.insert(records, { id: 1, active: true, payload: { count: 42 } }))
  const read = Query.select({ id: records.id, active: records.active, payload: records.payload,
    storedCount: records.payload.count }).pipe(Query.from(records))
  const prepared = executor.prepare(read)
  const expected = [{ id: 1, active: true, payload: { count: 42 }, storedCount: "42" }]
  assert.deepEqual(yield* prepared.execute, expected)
  assert.deepEqual(yield* prepared.execute, expected)
  assert.deepEqual(Array.from(yield* Stream.runCollect(executor.stream(read))), expected)
  const aborted = yield* Effect.result(sql.withTransaction(Effect.gen(function*() {
    yield* executor.execute(Query.insert(records, { id: 2, active: false, payload: { count: 7 } }))
    return yield* Effect.fail(new Error("rollback"))
  })))
  assert.equal(aborted._tag, "Failure")
  assert.deepEqual(yield* executor.execute(read), expected)
  assert.deepEqual(yield* executor.execute(Query.select({
    integral: SqliteFunction.divide(records.id, records.id),
    zero: SqliteFunction.divide(records.id, 0)
  }).pipe(Query.from(records))).pipe(Executor.exactlyOne), { integral: 1, zero: null })
  yield* executor.execute(Query.update(records, { active: false }).pipe(Query.where(Query.eq(records.id, 1))))
  assert.equal((yield* executor.execute(read).pipe(Executor.exactlyOne)).active, false)
  yield* executor.execute(Query.delete(records).pipe(Query.where(Query.eq(records.id, 1))))
  assert.deepEqual(yield* executor.execute(read), [])
}).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true }))))
console.log("Packed Node SQLite: DDL, codecs, stored JSON paths, prepared reads, transactions, division, mutations passed")
