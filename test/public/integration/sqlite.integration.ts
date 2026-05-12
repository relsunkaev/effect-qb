import { expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import * as Chunk from "effect/Chunk"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import { Column as C, Executor, Json as J, Query as Q, Table } from "#sqlite"

const runSqlite = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromise(Effect.provide(effect, SqliteClient.layer({
    filename: ":memory:",
    disableWAL: true
  })))

test("sqlite executor runs DDL, mutations, reads, and streams through the ambient Effect SQL client", async () => {
  const events = Table.make("events", {
    id: C.text().pipe(C.primaryKey),
    happenedOn: C.date().pipe(C.schema(Schema.DateFromString)),
    happenedAt: C.datetime(),
    active: C.boolean(),
    amount: C.number({ precision: 10, scale: 4 }),
    payload: C.json(Schema.Struct({
      visits: Schema.Number
    }))
  })

  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()

    yield* executor.execute(Q.createTable(events))
    yield* executor.execute(Q.insert(events, {
      id: "sqlite-1",
      happenedOn: new Date("2026-03-18T00:00:00.000Z"),
      happenedAt: "2026-03-18T10:00:00",
      active: true,
      amount: "0012.3400",
      payload: {
        visits: 42
      }
    }))

    const read = Q.select({
      id: events.id,
      happenedOn: events.happenedOn,
      happenedAt: events.happenedAt,
      active: events.active,
      amount: events.amount,
      payload: events.payload
    }).pipe(Q.from(events))

    const rows = yield* executor.execute(read)
    const streamed = Chunk.toReadonlyArray(yield* Stream.runCollect(executor.stream(read)))
    return { rows, streamed }
  }))

  expect(result.rows).toEqual([
    {
      id: "sqlite-1",
      happenedOn: new Date("2026-03-18T00:00:00.000Z"),
      happenedAt: "2026-03-18T10:00:00",
      active: true,
      amount: "12.34",
      payload: {
        visits: 42
      }
    }
  ])
  expect(result.streamed).toEqual(result.rows)
})

test("sqlite executor supports returning upserts, JSON1 queries, and savepoint rollback", async () => {
  const docs = Table.make("docs", {
    id: C.text().pipe(C.primaryKey),
    payload: C.json(Schema.Unknown),
    note: C.text()
  })

  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()

    yield* executor.execute(Q.createTable(docs))

    const upsert = Q.insert(docs, {
      id: "doc-1",
      payload: {
        profile: {
          address: {
            city: "Paris"
          },
          tags: ["a", "b"]
        }
      },
      note: "first"
    }).pipe(
      Q.onConflict(["id"] as const, {
        update: {
          payload: Q.excluded(docs.payload),
          note: "updated"
        }
      }),
      Q.returning({
        id: docs.id,
        note: docs.note
      })
    )

    const inserted = yield* executor.execute(upsert)
    const updated = yield* executor.execute(upsert)

    const tags = J.json.get(docs.payload, J.json.path(J.json.key("profile"), J.json.key("tags")))
    const jsonRead = Q.select({
      city: J.json.text(
        docs.payload,
        J.json.path(J.json.key("profile"), J.json.key("address"), J.json.key("city"))
      ),
      tags: J.json.length(tags)
    }).pipe(Q.from(docs))

    const jsonRows = yield* executor.execute(jsonRead)

    yield* executor.execute(Q.savepoint("rollback_doc"))
    yield* executor.execute(Q.update(docs, {
      note: "rolled back"
    }).pipe(Q.where(Q.eq(docs.id, "doc-1"))))
    yield* executor.execute(Q.rollbackTo("rollback_doc"))
    yield* executor.execute(Q.releaseSavepoint("rollback_doc"))

    const afterRollback = yield* executor.execute(Q.select({
      note: docs.note
    }).pipe(Q.from(docs)))

    return {
      inserted,
      updated,
      jsonRows,
      afterRollback
    }
  }))

  expect(result.inserted).toEqual([
    {
      id: "doc-1",
      note: "first"
    }
  ])
  expect(result.updated).toEqual([
    {
      id: "doc-1",
      note: "updated"
    }
  ])
  expect(result.jsonRows).toEqual([
    {
      city: "Paris",
      tags: 2
    }
  ])
  expect(result.afterRollback).toEqual([
    {
      note: "updated"
    }
  ])
})
