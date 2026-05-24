import { expect, test } from "bun:test"
import * as SqlClient from "@effect/sql/SqlClient"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import * as Chunk from "effect/Chunk"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import { Column as C, Table } from "#standard"
import { Executor, Function as F, Json as J, Query as Q } from "#sqlite"

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

test("sqlite composed reads execute CTEs, derived aggregates, subqueries, windows, and pagination", async () => {
  const users = Table.make("composed_users", {
    id: C.text().pipe(C.primaryKey),
    email: C.text(),
    visits: C.int()
  })
  const posts = Table.make("composed_posts", {
    id: C.text().pipe(C.primaryKey),
    userId: C.text(),
    title: C.text().pipe(C.nullable)
  })

  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()

    yield* executor.execute(Q.createTable(users))
    yield* executor.execute(Q.createTable(posts))
    yield* executor.execute(Q.insert(users, {
      id: "user-1",
      email: "ALICE@example.com",
      visits: 5
    }))
    yield* executor.execute(Q.insert(users, {
      id: "user-2",
      email: "bob@example.com",
      visits: 2
    }))
    yield* executor.execute(Q.insert(users, {
      id: "user-3",
      email: "carol@example.net",
      visits: 0
    }))
    yield* executor.execute(Q.insert(posts, {
      id: "post-1",
      userId: "user-1",
      title: "Alpha"
    }))
    yield* executor.execute(Q.insert(posts, {
      id: "post-2",
      userId: "user-1",
      title: "Beta"
    }))
    yield* executor.execute(Q.insert(posts, {
      id: "post-3",
      userId: "user-2",
      title: null
    }))
    yield* executor.execute(Q.insert(posts, {
      id: "post-4",
      userId: "user-2",
      title: "Gamma"
    }))

    const activePosts = Q.select({
      userId: posts.userId,
      title: posts.title
    }).pipe(
      Q.from(posts),
      Q.where(Q.isNotNull(posts.title)),
      Q.with("active_posts")
    )

    const counts = Q.select({
      userId: activePosts.userId,
      postCount: F.count(activePosts.title),
      firstTitle: F.min(activePosts.title)
    }).pipe(
      Q.from(activePosts),
      Q.groupBy(activePosts.userId),
      Q.having(Q.gt(F.count(activePosts.title), 0)),
      Q.as("post_counts")
    )

    const latestTitle = Q.select({
      value: F.max(posts.title)
    }).pipe(
      Q.from(posts),
      Q.where(Q.eq(posts.userId, users.id))
    )

    const correlatedPosts = Q.select({
      value: posts.id
    }).pipe(
      Q.from(posts),
      Q.where(Q.eq(posts.userId, users.id)),
      Q.limit(1)
    )

    const usersWithPosts = Q.select({
      value: posts.userId
    }).pipe(
      Q.from(posts),
      Q.where(Q.isNotNull(posts.title))
    )

    return yield* executor.execute(Q.select({
      userId: users.id,
      emailLower: F.lower(users.email),
      label: Q.case()
        .when(Q.gt(users.visits, 3), "busy")
        .else("quiet"),
      postCount: counts.postCount,
      firstTitle: counts.firstTitle,
      activeTitle: activePosts.title,
      latestTitle: Q.scalar(latestTitle),
      hasPosts: Q.exists(correlatedPosts),
      inPublishedUsers: Q.inSubquery(users.id, usersWithPosts),
      titleRow: F.rowNumber({
        partitionBy: [users.id],
        orderBy: [{ value: activePosts.title, direction: "asc" }]
      }),
      titleRank: F.rank({
        partitionBy: [users.id],
        orderBy: [{ value: activePosts.title, direction: "asc" }]
      }),
      windowPostCount: F.over(F.count(activePosts.title), {
        partitionBy: [users.id]
      })
    }).pipe(
      Q.from(users),
      Q.innerJoin(counts, Q.eq(users.id, counts.userId)),
      Q.innerJoin(activePosts, Q.eq(users.id, activePosts.userId)),
      Q.where(Q.like(users.email, "%@example.com")),
      Q.orderBy(users.id),
      Q.orderBy(activePosts.title),
      Q.limit(3),
      Q.offset(0)
    ))
  }))

  expect(result).toEqual([
    {
      userId: "user-1",
      emailLower: "alice@example.com",
      label: "busy",
      postCount: 2,
      firstTitle: "Alpha",
      activeTitle: "Alpha",
      latestTitle: "Beta",
      hasPosts: true,
      inPublishedUsers: true,
      titleRow: 1,
      titleRank: 1,
      windowPostCount: 2
    },
    {
      userId: "user-1",
      emailLower: "alice@example.com",
      label: "busy",
      postCount: 2,
      firstTitle: "Alpha",
      activeTitle: "Beta",
      latestTitle: "Beta",
      hasPosts: true,
      inPublishedUsers: true,
      titleRow: 2,
      titleRank: 2,
      windowPostCount: 2
    },
    {
      userId: "user-2",
      emailLower: "bob@example.com",
      label: "quiet",
      postCount: 1,
      firstTitle: "Gamma",
      activeTitle: "Gamma",
      latestTitle: "Gamma",
      hasPosts: true,
      inPublishedUsers: true,
      titleRow: 1,
      titleRank: 1,
      windowPostCount: 1
    }
  ])
})

test("sqlite DDL constraints, generated columns, indexes, and drops execute", async () => {
  const orgs = Table.make("ddl_orgs", {
    id: C.text().pipe(C.primaryKey),
    slug: C.text().pipe(C.unique)
  })
  const memberships = Table.make("ddl_memberships", {
    id: C.text().pipe(C.primaryKey),
    orgId: C.text(),
    role: C.text(),
    normalizedRole: C.text().pipe(C.generated(F.lower(Q.column("role", Q.type.text()))))
  }).pipe(
    Table.foreignKey("orgId", () => orgs, "id"),
    Table.unique(["orgId", "role"] as const),
    Table.check("ddl_memberships_role_not_empty", Q.neq(Q.column("role", Q.type.text()), "")),
    Table.index(["role", "orgId"] as const)
  )

  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()
    const sql = yield* SqlClient.SqlClient

    yield* sql.unsafe("pragma foreign_keys = on", [])
    yield* executor.execute(Q.createTable(orgs))
    yield* executor.execute(Q.createTable(memberships))
    yield* executor.execute(Q.createIndex(memberships, ["role", "orgId"] as const, {
      ifNotExists: true
    }))
    yield* executor.execute(Q.insert(orgs, {
      id: "org-1",
      slug: "acme"
    }))
    yield* executor.execute(Q.insert(memberships, {
      id: "membership-1",
      orgId: "org-1",
      role: "Admin"
    }))

    const rows = yield* executor.execute(Q.select({
      id: memberships.id,
      orgId: memberships.orgId,
      role: memberships.role,
      normalizedRole: memberships.normalizedRole
    }).pipe(Q.from(memberships)))

    const createdIndexes = yield* sql.unsafe<{ readonly name: string }>(
      "select name from sqlite_master where type = 'index' and tbl_name = 'ddl_memberships' and name not like 'sqlite_autoindex%' order by name",
      []
    )

    yield* executor.execute(Q.dropIndex(memberships, ["role", "orgId"] as const, {
      ifExists: true
    }))
    yield* executor.execute(Q.dropTable(memberships, {
      ifExists: true
    }))
    yield* executor.execute(Q.dropTable(orgs, {
      ifExists: true
    }))

    const remaining = yield* sql.unsafe<{ readonly name: string }>(
      "select name from sqlite_master where type in ('table', 'index') and name in ('ddl_orgs', 'ddl_memberships', 'ddl_memberships_role_orgId_idx') order by name",
      []
    )

    return { rows, createdIndexes, remaining }
  }))

  expect(result.rows).toEqual([
    {
      id: "membership-1",
      orgId: "org-1",
      role: "Admin",
      normalizedRole: "admin"
    }
  ])
  expect(result.createdIndexes).toEqual([
    {
      name: "ddl_memberships_role_orgId_idx"
    }
  ])
  expect(result.remaining).toEqual([])
})

test("sqlite transaction statements commit and roll back through the executor", async () => {
  const auditLogs = Table.make("transaction_audit_logs", {
    id: C.text().pipe(C.primaryKey),
    note: C.text()
  })

  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()

    yield* executor.execute(Q.createTable(auditLogs))

    yield* executor.execute(Q.transaction())
    yield* executor.execute(Q.insert(auditLogs, {
      id: "committed",
      note: "kept"
    }))
    yield* executor.execute(Q.commit())

    yield* executor.execute(Q.transaction())
    yield* executor.execute(Q.insert(auditLogs, {
      id: "rolled-back",
      note: "removed"
    }))
    yield* executor.execute(Q.rollback())

    return yield* executor.execute(Q.select({
      id: auditLogs.id,
      note: auditLogs.note
    }).pipe(
      Q.from(auditLogs),
      Q.orderBy(auditLogs.id)
    ))
  }))

  expect(result).toEqual([
    {
      id: "committed",
      note: "kept"
    }
  ])
})

test("sqlite JSON1 mutation and construction helpers execute against stored JSON", async () => {
  const docs = Table.make("json_helper_docs", {
    id: C.text().pipe(C.primaryKey),
    payload: C.json(Schema.Unknown)
  })

  const result = await runSqlite(Effect.gen(function*() {
    const executor = Executor.make()
    const cityPath = J.json.path(J.json.key("profile"), J.json.key("address"), J.json.key("city"))
    const postcodePath = J.json.path(J.json.key("profile"), J.json.key("address"), J.json.key("postcode"))
    const metadataPath = J.json.path(J.json.key("metadata"))

    yield* executor.execute(Q.createTable(docs))
    yield* executor.execute(Q.insert(docs, {
      id: "json-helper-1",
      payload: {
        profile: {
          address: {
            city: "Paris"
          },
          tags: ["sqlite"]
        },
        note: null
      }
    }))

    return yield* executor.execute(Q.select({
      builtObject: J.json.buildObject({
        source: "sqlite",
        ok: true
      }),
      builtArray: J.json.buildArray("sqlite", 1, true),
      typeName: J.json.typeOf(docs.payload),
      keys: J.json.keys(docs.payload),
      hasProfile: J.json.hasKey(docs.payload, "profile"),
      hasAll: J.json.hasAllKeys(docs.payload, "profile", "note"),
      pathExists: J.json.pathExists(docs.payload, cityPath),
      city: J.json.text(docs.payload, cityPath),
      setPostcode: J.json.set(docs.payload, postcodePath, "1000"),
      insertMetadata: J.json.insert(docs.payload, metadataPath, { imported: true }),
      deleteNote: J.json.delete(docs.payload, J.json.key("note")),
      removeNote: J.json.remove(docs.payload, J.json.key("note")),
      merged: J.json.merge(docs.payload, {
        profile: {
          active: true
        }
      })
    }).pipe(Q.from(docs)))
  }))

  expect(result).toEqual([
    {
      builtObject: {
        source: "sqlite",
        ok: true
      },
      builtArray: ["sqlite", 1, true],
      typeName: "object",
      keys: ["profile", "note"],
      hasProfile: true,
      hasAll: true,
      pathExists: true,
      city: "Paris",
      setPostcode: {
        profile: {
          address: {
            city: "Paris",
            postcode: "1000"
          },
          tags: ["sqlite"]
        },
        note: null
      },
      insertMetadata: {
        profile: {
          address: {
            city: "Paris"
          },
          tags: ["sqlite"]
        },
        note: null,
        metadata: {
          imported: true
        }
      },
      deleteNote: {
        profile: {
          address: {
            city: "Paris"
          },
          tags: ["sqlite"]
        }
      },
      removeNote: {
        profile: {
          address: {
            city: "Paris"
          },
          tags: ["sqlite"]
        }
      },
      merged: {
        profile: {
          address: {
            city: "Paris"
          },
          tags: ["sqlite"],
          active: true
        },
        note: null
      }
    }
  ])
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
