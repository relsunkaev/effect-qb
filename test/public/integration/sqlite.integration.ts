import { expect, test } from "bun:test"
import * as SqlClient from "@effect/sql/SqlClient"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import * as Chunk from "effect/Chunk"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import { Column as C, Executor, Function as F, Json as J, Query as Q, Table } from "#sqlite"

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

test("sqlite upserts execute against partial conflict targets", async () => {
  const users = Table.make("partial_conflict_users", {
    id: C.text().pipe(C.primaryKey),
    email: C.text().pipe(C.nullable),
    visits: C.int()
  })

  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()
    const sql = yield* SqlClient.SqlClient

    yield* executor.execute(Q.createTable(users))
    yield* sql.unsafe(
      "create unique index partial_conflict_users_email_idx on partial_conflict_users (email) where email is not null",
      []
    )
    yield* executor.execute(Q.insert(users, {
      id: "user-1",
      email: "alice@example.com",
      visits: 1
    }))
    yield* executor.execute(Q.insert(users, {
      id: "user-2",
      email: "alice@example.com",
      visits: 2
    }).pipe(
      Q.onConflict({
        columns: ["email"] as const,
        where: Q.isNotNull(users.email)
      }, {
        update: {
          visits: Q.excluded(users.visits)
        }
      })
    ))

    return yield* executor.execute(Q.select({
      id: users.id,
      email: users.email,
      visits: users.visits
    }).pipe(Q.from(users)))
  }))

  expect(result).toEqual([
    {
      id: "user-1",
      email: "alice@example.com",
      visits: 2
    }
  ])
})

test("sqlite createTable renders literal defaults executable by SQLite", async () => {
  const users = Table.make("default_users", {
    id: C.text().pipe(C.primaryKey),
    name: C.text().pipe(C.default(Q.literal("guest"))),
    active: C.boolean().pipe(C.default(Q.literal(true)))
  })

  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()

    yield* executor.execute(Q.createTable(users))
    yield* executor.execute(Q.insert(users, {
      id: "user-1"
    }))

    return yield* executor.execute(Q.select({
      id: users.id,
      name: users.name,
      active: users.active
    }).pipe(Q.from(users)))
  }))

  expect(result).toEqual([
    {
      id: "user-1",
      name: "guest",
      active: true
    }
  ])
})

test("sqlite values and unnest sources execute as derived rows", async () => {
  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()
    const valuesSource = Q.values([
      { id: Q.cast(Q.literal(1), Q.type.int()), label: Q.cast(Q.literal("one"), Q.type.text()) },
      { id: Q.cast(Q.literal(2), Q.type.int()), label: Q.cast(Q.literal("two"), Q.type.text()) }
    ] as const).pipe(Q.as("seed"))
    const unnestSource = Q.unnest({
      id: [Q.cast(Q.literal(3), Q.type.int()), Q.cast(Q.literal(4), Q.type.int())] as const,
      label: [Q.cast(Q.literal("three"), Q.type.text()), Q.cast(Q.literal("four"), Q.type.text())] as const
    }, "seed_rows")

    const valuesRows = yield* executor.execute(Q.select({
      id: valuesSource.id,
      label: valuesSource.label
    }).pipe(Q.from(valuesSource)))
    const unnestRows = yield* executor.execute(Q.select({
      id: unnestSource.id,
      label: unnestSource.label
    }).pipe(Q.from(unnestSource)))

    return {
      valuesRows,
      unnestRows
    }
  }))

  expect(result.valuesRows).toEqual([
    { id: 1, label: "one" },
    { id: 2, label: "two" }
  ])
  expect(result.unnestRows).toEqual([
    { id: 3, label: "three" },
    { id: 4, label: "four" }
  ])
})

test("sqlite set operations execute as compound selects", async () => {
  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()
    const left = Q.select({
      id: Q.cast(Q.literal(1), Q.type.int())
    })
    const right = Q.select({
      id: Q.cast(Q.literal(2), Q.type.int())
    })

    return yield* executor.execute(Q.unionAll(left, right))
  }))

  expect(result).toEqual([
    { id: 1 },
    { id: 2 }
  ])
})

test("sqlite right and full joins execute against joined sources", async () => {
  const users = Table.make("join_users", {
    id: C.text().pipe(C.primaryKey),
    email: C.text()
  })
  const posts = Table.make("join_posts", {
    id: C.text().pipe(C.primaryKey),
    userId: C.text(),
    title: C.text()
  })

  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()

    yield* executor.execute(Q.createTable(users))
    yield* executor.execute(Q.createTable(posts))
    yield* executor.execute(Q.insert(users, {
      id: "user-1",
      email: "alice@example.com"
    }))
    yield* executor.execute(Q.insert(posts, {
      id: "post-1",
      userId: "missing-user",
      title: "orphan"
    }))

    const selectJoined = Q.select({
      userId: users.id,
      postId: posts.id
    }).pipe(Q.from(users))

    const rightRows = yield* executor.execute(selectJoined.pipe(
      Q.rightJoin(posts, Q.eq(users.id, posts.userId))
    ))
    const fullRows = yield* executor.execute(selectJoined.pipe(
      Q.fullJoin(posts, Q.eq(users.id, posts.userId))
    ))

    return {
      rightRows,
      fullRows: [...fullRows].sort((left, right) =>
        String(left.userId ?? "").localeCompare(String(right.userId ?? "")))
    }
  }))

  expect(result.rightRows).toEqual([
    {
      userId: null,
      postId: "post-1"
    }
  ])
  expect(result.fullRows).toEqual([
    {
      userId: null,
      postId: "post-1"
    },
    {
      userId: "user-1",
      postId: null
    }
  ])
})

test("sqlite update returning and update-from execute against joined sources", async () => {
  const users = Table.make("update_users", {
    id: C.text().pipe(C.primaryKey),
    email: C.text(),
    visits: C.int()
  })
  const increments = Table.make("visit_increments", {
    userId: C.text(),
    amount: C.int()
  })

  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()

    yield* executor.execute(Q.createTable(users))
    yield* executor.execute(Q.createTable(increments))
    yield* executor.execute(Q.insert(users, {
      id: "user-1",
      email: "alice@example.com",
      visits: 1
    }))
    yield* executor.execute(Q.insert(increments, {
      userId: "user-1",
      amount: 4
    }))

    return yield* executor.execute(Q.update(users, {
      visits: increments.amount
    }).pipe(
      Q.from(increments),
      Q.where(Q.eq(users.id, increments.userId)),
      Q.returning({
        id: users.id,
        visits: users.visits
      })
    ))
  }))

  expect(result).toEqual([
    {
      id: "user-1",
      visits: 4
    }
  ])
})

test("sqlite delete returning executes against deleted rows", async () => {
  const users = Table.make("delete_users", {
    id: C.text().pipe(C.primaryKey),
    email: C.text()
  })

  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()

    yield* executor.execute(Q.createTable(users))
    yield* executor.execute(Q.insert(users, {
      id: "user-1",
      email: "alice@example.com"
    }))

    return yield* executor.execute(Q.delete(users).pipe(
      Q.where(Q.eq(users.id, "user-1")),
      Q.returning({
        id: users.id,
        email: users.email
      })
    ))
  }))

  expect(result).toEqual([
    {
      id: "user-1",
      email: "alice@example.com"
    }
  ])
})

test("sqlite temporal helpers execute against SQLite built-ins", async () => {
  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()

    return yield* executor.execute(Q.select({
      currentDate: F.currentDate(),
      currentTime: F.currentTime(),
      currentTimestamp: F.currentTimestamp(),
      localTime: F.localTime(),
      localTimestamp: F.localTimestamp(),
      now: F.now()
    }))
  }))

  expect(result).toHaveLength(1)
  const row = result[0]!
  expect(row.currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(row.currentTime).toMatch(/^\d{2}:\d{2}:\d{2}(?:\.\d{3})?$/)
  expect(row.currentTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?$/)
  expect(row.localTime).toMatch(/^\d{2}:\d{2}:\d{2}(?:\.\d{3})?$/)
  expect(row.localTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?$/)
  expect(row.now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?$/)
})

test("sqlite JSON string scalars are stored as valid JSON text scalars", async () => {
  const docs = Table.make("json_string_docs", {
    id: C.text().pipe(C.primaryKey),
    payload: C.json(Schema.String)
  })

  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()

    yield* executor.execute(Q.createTable(docs))
    yield* executor.execute(Q.insert(docs, {
      id: "json-string-1",
      payload: "42"
    }))

    const rows = yield* executor.execute(Q.select({
      payload: docs.payload
    }).pipe(Q.from(docs)))

    const sql = yield* SqlClient.SqlClient
    const raw = yield* sql.unsafe<{
      readonly raw: string
      readonly valid: number
      readonly typeName: string
    }>(
      "select payload as raw, json_valid(payload) as valid, json_type(payload) as typeName from json_string_docs",
      []
    )

    return {
      rows,
      raw
    }
  }))

  expect(result.rows).toEqual([
    {
      payload: "42"
    }
  ])
  expect(result.raw).toEqual([
    {
      raw: "\"42\"",
      valid: 1,
      typeName: "text"
    }
  ])
})
