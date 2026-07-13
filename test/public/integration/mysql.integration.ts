import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import { Column as C, Table } from "#standard"
import { Query as Q } from "#standard"
import { Executor } from "#mysql"
import { createDeferred, execMysql, runMysql } from "./helpers.ts"

const eventsTableName = "integration_mysql_events"
const usersTableName = "integration_mysql_users"
const postsTableName = "integration_mysql_posts"
const auditLogsTableName = "integration_mysql_audit_logs"
const queueItemsTableName = "integration_mysql_queue_items"
const lockRowsTableName = "integration_mysql_lock_rows"

const events = Table.make(eventsTableName, {
  id: C.text().pipe(C.primaryKey),
  happenedOn: C.date().pipe(C.schema(Schema.DateFromString)),
  happenedAt: C.datetime(),
  amount: C.number({ precision: 10, scale: 4 }),
  payload: C.json(Schema.Struct({
    visits: Schema.NumberFromString
  }))
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

const queueItems = Table.make(queueItemsTableName, {
  id: C.text().pipe(C.primaryKey),
  priority: C.text(),
  status: C.text()
})

const lockRows = Table.make(lockRowsTableName, {
  id: C.text().pipe(C.primaryKey),
  note: C.text()
})

const resetMutableTables = async () => {
  await execMysql(`delete from \`${auditLogsTableName}\``)
  await execMysql(`delete from \`${queueItemsTableName}\``)
  await execMysql(`
    insert into \`${queueItemsTableName}\` (\`id\`, \`priority\`, \`status\`)
    values
      ('job-1', '1', 'pending'),
      ('job-2', '2', 'pending')
  `)
}

const makeJoinedPostsPlan = () => {
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
    Q.orderBy(users.id),
    Q.orderBy(publishedPosts.publishedAt, "desc")
  )
}

beforeAll(async () => {
  await execMysql(`drop table if exists \`${eventsTableName}\``)
  await execMysql(`drop table if exists \`${postsTableName}\``)
  await execMysql(`drop table if exists \`${usersTableName}\``)
  await execMysql(`drop table if exists \`${auditLogsTableName}\``)
  await execMysql(`drop table if exists \`${queueItemsTableName}\``)
  await execMysql(`drop table if exists \`${lockRowsTableName}\``)

  await execMysql(`
    create table \`${eventsTableName}\` (
      \`id\` varchar(64) primary key,
      \`happenedOn\` date not null,
      \`happenedAt\` datetime not null,
      \`amount\` decimal(10, 4) not null,
      \`payload\` json not null
    )
  `)
  await execMysql(`
    create table \`${usersTableName}\` (
      \`id\` varchar(64) primary key,
      \`email\` varchar(255) not null,
      \`displayName\` varchar(255) not null
    )
  `)
  await execMysql(`
    create table \`${postsTableName}\` (
      \`id\` varchar(64) primary key,
      \`userId\` varchar(64) not null,
      \`title\` varchar(255) not null,
      \`publishedAt\` varchar(32) not null
    )
  `)
  await execMysql(`
    create table \`${auditLogsTableName}\` (
      \`id\` varchar(64) primary key,
      \`note\` varchar(255) not null
    )
  `)
  await execMysql(`
    create table \`${queueItemsTableName}\` (
      \`id\` varchar(64) primary key,
      \`priority\` varchar(32) not null,
      \`status\` varchar(32) not null
    )
  `)
  await execMysql(`
    create table \`${lockRowsTableName}\` (
      \`id\` varchar(64) primary key,
      \`note\` varchar(255) not null
    )
  `)

  await execMysql(`
    insert into \`${eventsTableName}\` (\`id\`, \`happenedOn\`, \`happenedAt\`, \`amount\`, \`payload\`)
    values (
      'mysql-1',
      '2026-03-18',
      '2026-03-18 10:00:00',
      '0012.3400',
      '{"visits":"42"}'
    )
  `)
  await execMysql(`
    insert into \`${usersTableName}\` (\`id\`, \`email\`, \`displayName\`)
    values
      ('mysql-user-1', 'alice@example.com', 'Alice'),
      ('mysql-user-2', 'bob@example.com', 'Bob')
  `)
  await execMysql(`
    insert into \`${postsTableName}\` (\`id\`, \`userId\`, \`title\`, \`publishedAt\`)
    values
      ('mysql-post-1', 'mysql-user-1', 'alice draft', '2026-03-18T09:00:00Z'),
      ('mysql-post-2', 'mysql-user-1', 'alice latest', '2026-03-18T12:00:00Z'),
      ('mysql-post-3', 'mysql-user-2', 'bob note', '2026-03-18T11:00:00Z')
  `)
  await execMysql(`
    insert into \`${lockRowsTableName}\` (\`id\`, \`note\`)
    values ('mysql-lock-1', 'locked')
  `)
  await resetMutableTables()
})

beforeEach(async () => {
  await resetMutableTables()
})

afterAll(async () => {
  await execMysql(`drop table if exists \`${lockRowsTableName}\``)
  await execMysql(`drop table if exists \`${queueItemsTableName}\``)
  await execMysql(`drop table if exists \`${auditLogsTableName}\``)
  await execMysql(`drop table if exists \`${postsTableName}\``)
  await execMysql(`drop table if exists \`${usersTableName}\``)
  await execMysql(`drop table if exists \`${eventsTableName}\``)
})

test("mysql executor decodes live temporal, numeric, and json values", async () => {
  const plan = Q.select({
    id: events.id,
    happenedOn: events.happenedOn,
    happenedAt: events.happenedAt,
    amount: events.amount,
    payload: events.payload
  }).pipe(
    Q.from(events)
  )

  const rows = await runMysql(Executor.make().execute(plan))

  expect(rows).toHaveLength(1)
  const row = rows[0]!
  expect(row.id).toBe("mysql-1")
  expect(row.happenedOn).toEqual(new Date("2026-03-18T00:00:00.000Z"))
  expect(row.happenedOn).toBeInstanceOf(Date)
  expect(row.happenedAt).toBe("2026-03-18T10:00:00" as typeof row.happenedAt)
  expect(row.amount).toBe("12.34" as typeof row.amount)
  expect(row.payload).toEqual({
    visits: 42
  })
})

test("mysql executor streams live temporal, numeric, and json values", async () => {
  const plan = Q.select({
    id: events.id,
    happenedOn: events.happenedOn,
    happenedAt: events.happenedAt,
    amount: events.amount,
    payload: events.payload
  }).pipe(
    Q.from(events)
  )

  const rows = await runMysql(Stream.runCollect(Executor.make().stream(plan)))

  expect(rows).toHaveLength(1)
  const row = rows[0]!
  expect(row.id).toBe("mysql-1")
  expect(row.happenedOn).toEqual(new Date("2026-03-18T00:00:00.000Z"))
  expect(row.happenedOn).toBeInstanceOf(Date)
  expect(row.happenedAt).toBe("2026-03-18T10:00:00" as typeof row.happenedAt)
  expect(row.amount).toBe("12.34" as typeof row.amount)
  expect(row.payload).toEqual({
    visits: 42
  })
})

test("mysql executor reads joined rows through a live cte", async () => {
  const rows = await runMysql(Executor.make().execute(makeJoinedPostsPlan()))

  expect(rows).toEqual([
    {
      userId: "mysql-user-1",
      email: "alice@example.com",
      title: "alice latest"
    },
    {
      userId: "mysql-user-1",
      email: "alice@example.com",
      title: "alice draft"
    },
    {
      userId: "mysql-user-2",
      email: "bob@example.com",
      title: "bob note"
    }
  ])
})

test("mysql executor keeps outer mutations after a nested transaction rollback and updates one queued row", async () => {
  const executor = Executor.make()
  const auditId = "mysql-audit-1"

  const insertAudit = Q.insert(auditLogs, {
    id: auditId,
    note: "outer"
  })
  const updateAudit = Q.update(auditLogs, {
    note: "inner"
  }).pipe(
    Q.where(Q.eq(auditLogs.id, auditId))
  )
  const promoteOnePending = Q.update(queueItems, {
    status: "running"
  }).pipe(
    Q.where(Q.eq(queueItems.status, "pending")),
    Q.orderBy(queueItems.priority),
    Q.limit(1)
  )
  const readAudit = Q.select({
    note: auditLogs.note
  }).pipe(
    Q.from(auditLogs),
    Q.where(Q.eq(auditLogs.id, auditId))
  )
  const readQueue = Q.select({
    id: queueItems.id,
    priority: queueItems.priority,
    status: queueItems.status
  }).pipe(
    Q.from(queueItems),
    Q.orderBy(queueItems.priority)
  )

  await runMysql(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql.withTransaction(
      Effect.gen(function*() {
        yield* executor.execute(insertAudit)
        yield* executor.execute(promoteOnePending)
        yield* Effect.catch(
          sql.withTransaction(
            Effect.gen(function*() {
              yield* executor.execute(updateAudit)
              return yield* Effect.fail(new Error("rollback savepoint"))
            })
          ),
          () => Effect.void
        )

        const auditRows = yield* executor.execute(readAudit)
        expect(auditRows).toEqual([
          {
            note: "outer"
          }
        ])

        const queueRows = yield* executor.execute(readQueue)
        expect(queueRows).toEqual([
          {
            id: "job-1",
            priority: "1",
            status: "running"
          },
          {
            id: "job-2",
            priority: "2",
            status: "pending"
          }
        ])
      })
    )
  }))

  const persistedAudit = await runMysql(executor.execute(readAudit))
  expect(persistedAudit).toEqual([
    {
      note: "outer"
    }
  ])
})

test("mysql executor streams uncommitted rows inside a transaction and rolls them back", async () => {
  const executor = Executor.make()
  const auditId = "mysql-audit-stream-1"

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

  await runMysql(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* Effect.catch(
      sql.withTransaction(
        Effect.gen(function*() {
          yield* executor.execute(insertAudit)

          const rows = yield* Stream.runCollect(executor.stream(readAudit))

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

  const persisted = await runMysql(executor.execute(readAudit))
  expect(persisted).toEqual([])
})

test("mysql lock nowait failures are normalized from live row locks", async () => {
  const executor = Executor.make()
  const lockPlan = Q.select({
    id: lockRows.id,
    note: lockRows.note
  }).pipe(
    Q.from(lockRows),
    Q.where(Q.eq(lockRows.id, "mysql-lock-1")),
    Q.lock("update")
  )
  const nowaitPlan = Q.select({
    id: lockRows.id
  }).pipe(
    Q.from(lockRows),
    Q.where(Q.eq(lockRows.id, "mysql-lock-1")),
    Q.lock("update", { nowait: true })
  )

  const locked = createDeferred<void>()
  const release = createDeferred<void>()

  const holder = runMysql(Effect.gen(function*() {
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

  const contender = await runMysql(Effect.result(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(executor.execute(nowaitPlan))
  })))

  release.resolve()
  await holder

  expect(contender._tag).toBe("Failure")
  if (contender._tag !== "Failure") {
    throw new Error("Expected MySQL lock failure")
  }

  expect(contender.failure._tag).toBe("@mysql/server/lock-nowait")
  expect("query" in contender.failure).toBe(true)
  if (!("query" in contender.failure) || !contender.failure.query) {
    throw new Error("Expected rendered query details on MySQL lock failure")
  }
  expect(contender.failure.query.sql).toContain("for update nowait")
})
