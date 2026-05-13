import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test"
import * as Chunk from "effect/Chunk"
import * as Effect from "effect/Effect"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import { Column as C, Executor, Function as F, Query as Q, Table, Type } from "#postgres"
import { createDeferred, execPostgres, runPostgres } from "./helpers.ts"

const eventsTableName = "integration_pg_events"
const usersTableName = "integration_pg_users"
const postsTableName = "integration_pg_posts"
const auditLogsTableName = "integration_pg_audit_logs"
const lockRowsTableName = "integration_pg_lock_rows"

const events = Table.make(eventsTableName, {
  id: C.text().pipe(C.primaryKey),
  happenedOn: C.date().pipe(C.schema(Schema.DateFromString)),
  happenedAt: C.custom(Schema.String, Type.timestamptz()),
  amount: C.number({ precision: 10, scale: 4 }),
  payload: C.custom(Schema.Struct({
    visits: Schema.NumberFromString
  }), Type.jsonb())
})

const users = Table.make(usersTableName, {
  id: C.text().pipe(C.primaryKey),
  email: C.text(),
  displayName: C.text()
})

const posts = Table.make(postsTableName, {
  id: C.text().pipe(C.primaryKey),
  userId: C.text(),
  title: C.text(),
  publishedAt: C.text()
})

const auditLogs = Table.make(auditLogsTableName, {
  id: C.text().pipe(C.primaryKey),
  note: C.text()
})

const lockRows = Table.make(lockRowsTableName, {
  id: C.text().pipe(C.primaryKey),
  note: C.text()
})

const resetAuditLogs = async () => {
  await execPostgres(`delete from "${auditLogsTableName}"`)
}

const makeLatestPostPlan = () => {
  const publishedPosts = Q.select({
    userId: posts.userId,
    title: posts.title,
    publishedAt: posts.publishedAt
  }).pipe(
    Q.from(posts),
    Q.where(Q.isNotNull(posts.publishedAt)),
    Q.with("published_posts")
  )

  return Q.select({
    userId: users.id,
    email: users.email,
    title: publishedPosts.title
  }).pipe(
    Q.from(users),
    Q.innerJoin(publishedPosts, Q.eq(users.id, publishedPosts.userId)),
    Q.distinctOn(users.id),
    Q.orderBy(users.id),
    Q.orderBy(publishedPosts.publishedAt, "desc")
  )
}

beforeAll(async () => {
  await execPostgres(`drop table if exists "${eventsTableName}"`)
  await execPostgres(`drop table if exists "${postsTableName}"`)
  await execPostgres(`drop table if exists "${usersTableName}"`)
  await execPostgres(`drop table if exists "${auditLogsTableName}"`)
  await execPostgres(`drop table if exists "${lockRowsTableName}"`)

  await execPostgres(`
    create table "${eventsTableName}" (
      "id" text primary key,
      "happenedOn" date not null,
      "happenedAt" timestamptz not null,
      "amount" numeric(10, 4) not null,
      "payload" jsonb not null
    )
  `)
  await execPostgres(`
    create table "${usersTableName}" (
      "id" text primary key,
      "email" text not null,
      "displayName" text not null
    )
  `)
  await execPostgres(`
    create table "${postsTableName}" (
      "id" text primary key,
      "userId" text not null,
      "title" text not null,
      "publishedAt" text not null
    )
  `)
  await execPostgres(`
    create table "${auditLogsTableName}" (
      "id" text primary key,
      "note" text not null
    )
  `)
  await execPostgres(`
    create table "${lockRowsTableName}" (
      "id" text primary key,
      "note" text not null
    )
  `)

  await execPostgres(`
    insert into "${eventsTableName}" ("id", "happenedOn", "happenedAt", "amount", "payload")
    values (
      'pg-1',
      '2026-03-18',
      '2026-03-18T10:00:00+03:00',
      '0012.3400',
      '{"visits":"42"}'::jsonb
    )
  `)
  await execPostgres(`
    insert into "${usersTableName}" ("id", "email", "displayName")
    values
      ('pg-user-1', 'alice@example.com', 'Alice'),
      ('pg-user-2', 'bob@example.com', 'Bob')
  `)
  await execPostgres(`
    insert into "${postsTableName}" ("id", "userId", "title", "publishedAt")
    values
      ('pg-post-1', 'pg-user-1', 'alice draft', '2026-03-18T09:00:00Z'),
      ('pg-post-2', 'pg-user-1', 'alice latest', '2026-03-18T12:00:00Z'),
      ('pg-post-3', 'pg-user-2', 'bob note', '2026-03-18T11:00:00Z')
  `)
  await execPostgres(`
    insert into "${lockRowsTableName}" ("id", "note")
    values ('pg-lock-1', 'locked')
  `)
  await resetAuditLogs()
})

beforeEach(async () => {
  await resetAuditLogs()
})

afterAll(async () => {
  await execPostgres(`drop table if exists "${lockRowsTableName}"`)
  await execPostgres(`drop table if exists "${auditLogsTableName}"`)
  await execPostgres(`drop table if exists "${postsTableName}"`)
  await execPostgres(`drop table if exists "${usersTableName}"`)
  await execPostgres(`drop table if exists "${eventsTableName}"`)
})

test("postgres executor decodes live temporal, numeric, and json values", async () => {
  const plan = Q.select({
    id: events.id,
    happenedOn: events.happenedOn,
    happenedAt: events.happenedAt,
    amount: events.amount,
    payload: events.payload
  }).pipe(
    Q.from(events)
  )

  const rows = await runPostgres(Executor.make().execute(plan))

  expect(rows).toHaveLength(1)
  const row = rows[0]!
  expect(row.id).toBe("pg-1")
  expect(row.happenedOn).toEqual(new Date("2026-03-18T00:00:00.000Z"))
  expect(row.happenedOn).toBeInstanceOf(Date)
  expect(row.happenedAt).toBe("2026-03-18T07:00:00.000Z")
  expect(row.amount).toBe("12.34" as typeof row.amount)
  expect(row.payload).toEqual({
    visits: 42
  })
})

test("postgres executor streams live temporal, numeric, and json values", async () => {
  const plan = Q.select({
    id: events.id,
    happenedOn: events.happenedOn,
    happenedAt: events.happenedAt,
    amount: events.amount,
    payload: events.payload
  }).pipe(
    Q.from(events)
  )

  const rows = Chunk.toReadonlyArray(
    await runPostgres(Stream.runCollect(Executor.make().stream(plan)))
  )

  expect(rows).toHaveLength(1)
  const row = rows[0]!
  expect(row.id).toBe("pg-1")
  expect(row.happenedOn).toEqual(new Date("2026-03-18T00:00:00.000Z"))
  expect(row.happenedOn).toBeInstanceOf(Date)
  expect(row.happenedAt).toBe("2026-03-18T07:00:00.000Z")
  expect(row.amount).toBe("12.34" as typeof row.amount)
  expect(row.payload).toEqual({
    visits: 42
  })
})

test("postgres executor reads latest rows through a live cte join", async () => {
  const rows = await runPostgres(Executor.make().execute(makeLatestPostPlan()))

  expect(rows).toEqual([
    {
      userId: "pg-user-1",
      email: "alice@example.com",
      title: "alice latest"
    },
    {
      userId: "pg-user-2",
      email: "bob@example.com",
      title: "bob note"
    }
  ])
})

test("postgres executor keeps outer mutations after a nested transaction rollback", async () => {
  const executor = Executor.make()
  const auditId = "pg-audit-1"

  const insertAudit = Q.insert(auditLogs, {
    id: auditId,
    note: "outer"
  })
  const updateAudit = Q.update(auditLogs, {
    note: "inner"
  }).pipe(
    Q.where(Q.eq(auditLogs.id, auditId))
  )
  const readAudit = Q.select({
    note: auditLogs.note
  }).pipe(
    Q.from(auditLogs),
    Q.where(Q.eq(auditLogs.id, auditId))
  )

  await runPostgres(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql.withTransaction(
      Effect.gen(function*() {
        yield* executor.execute(insertAudit)
        yield* Effect.catchAll(
          sql.withTransaction(
            Effect.gen(function*() {
              yield* executor.execute(updateAudit)
              return yield* Effect.fail(new Error("rollback savepoint"))
            })
          ),
          () => Effect.void
        )

        const rows = yield* executor.execute(readAudit)
        expect(rows).toEqual([
          {
            note: "outer"
          }
        ])
      })
    )
  }))

  const persisted = await runPostgres(executor.execute(readAudit))
  expect(persisted).toEqual([
    {
      note: "outer"
    }
  ])
})

test("postgres executor streams uncommitted rows inside a transaction and rolls them back", async () => {
  const executor = Executor.make()
  const auditId = "pg-audit-stream-1"

  const insertAudit = Q.insert(auditLogs, {
    id: auditId,
    note: "streamed"
  })
  const readAudit = Q.select({
    note: auditLogs.note
  }).pipe(
    Q.from(auditLogs),
    Q.where(Q.eq(auditLogs.id, auditId))
  )

  await runPostgres(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* Effect.catchAll(
      sql.withTransaction(
        Effect.gen(function*() {
          yield* executor.execute(insertAudit)

          const rows = Chunk.toReadonlyArray(
            yield* Stream.runCollect(executor.stream(readAudit))
          )

          expect(rows).toEqual([
            {
              note: "streamed"
            }
          ])

          return yield* Effect.fail(new Error("rollback streamed transaction"))
        })
      ),
      () => Effect.void
    )
  }))

  const persisted = await runPostgres(executor.execute(readAudit))
  expect(persisted).toEqual([])
})

test("postgres lock nowait failures are normalized from live row locks", async () => {
  const executor = Executor.make()
  const lockPlan = Q.select({
    id: lockRows.id,
    note: lockRows.note
  }).pipe(
    Q.from(lockRows),
    Q.where(Q.eq(lockRows.id, "pg-lock-1")),
    Q.lock("update")
  )
  const nowaitPlan = Q.select({
    id: lockRows.id
  }).pipe(
    Q.from(lockRows),
    Q.where(Q.eq(lockRows.id, "pg-lock-1")),
    Q.lock("update", { nowait: true })
  )

  const locked = createDeferred<void>()
  const release = createDeferred<void>()

  const holder = runPostgres(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(
      Effect.gen(function*() {
        const rows = yield* executor.execute(lockPlan)
        expect(rows).toHaveLength(1)
        locked.resolve()
        yield* Effect.promise(() => release.promise)
      })
    )
  }))

  await locked.promise

  const contender = await runPostgres(Effect.either(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(executor.execute(nowaitPlan))
  })))

  release.resolve()
  await holder

  expect(contender._tag).toBe("Left")
  if (contender._tag !== "Left") {
    throw new Error("Expected Postgres lock failure")
  }

  expect(contender.left._tag).toBe("@postgres/object-not-in-prerequisite-state/lock-not-available")
  expect("query" in contender.left).toBe(true)
  if (!("query" in contender.left) || !contender.left.query) {
    throw new Error("Expected rendered query details on Postgres lock failure")
  }
  expect(contender.left.query.sql).toContain('for update nowait')
})
