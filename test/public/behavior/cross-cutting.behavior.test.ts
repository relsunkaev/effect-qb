// @ts-nocheck
import { describe, expect, test } from "bun:test"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import * as Sqlite from "#sqlite"

describe("cross-cutting statement behavior", () => {
  test("renders postgres truncate, merge, and transaction-control statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })
    const incomingUsers = Postgres.Table.make("incoming_users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })

    const truncatePlan = Postgres.Query.truncate(users, {
      restartIdentity: true,
      cascade: true
    })
    const mergePlan = Postgres.Query.merge(users, incomingUsers, Postgres.Query.eq(users.id, incomingUsers.id), {
      whenMatched: {
        update: {
          email: incomingUsers.email,
          bio: incomingUsers.bio
        }
      },
      whenNotMatched: {
        values: {
          id: incomingUsers.id,
          email: incomingUsers.email,
          bio: incomingUsers.bio
        }
      }
    })

    expect(Postgres.Renderer.make().render(truncatePlan).sql).toBe(
      'truncate table "public"."users" restart identity cascade'
    )
    expect(Postgres.Renderer.make().render(mergePlan).sql).toBe(
      'merge into "public"."users" using "public"."incoming_users" on ("users"."id" = "incoming_users"."id") when matched then update set "email" = "incoming_users"."email", "bio" = "incoming_users"."bio" when not matched then insert ("id", "email", "bio") values ("incoming_users"."id", "incoming_users"."email", "incoming_users"."bio")'
    )
    expect(Postgres.Renderer.make().render(Postgres.Query.transaction({
      isolationLevel: "serializable",
      readOnly: true
    })).sql).toBe("start transaction isolation level serializable, read only")
    expect(Postgres.Renderer.make().render(Postgres.Query.commit()).sql).toBe("commit")
    expect(Postgres.Renderer.make().render(Postgres.Query.rollback()).sql).toBe("rollback")
    expect(Postgres.Renderer.make().render(Postgres.Query.savepoint("before_merge")).sql).toBe('savepoint "before_merge"')
    expect(Postgres.Renderer.make().render(Postgres.Query.rollbackTo("before_merge")).sql).toBe('rollback to savepoint "before_merge"')
    expect(Postgres.Renderer.make().render(Postgres.Query.releaseSavepoint("before_merge")).sql).toBe('release savepoint "before_merge"')
  })

  test("renders mysql truncate and transaction-control statements and rejects merge", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })
    const incomingUsers = Mysql.Table.make("incoming_users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })

    const truncatePlan = Mysql.Query.truncate(users)
    const unsupportedTruncatePlan = Mysql.Query.truncate(users, {
      restartIdentity: true,
      cascade: true
    })
    const mergePlan = Mysql.Query.merge(users, incomingUsers, Mysql.Query.eq(users.id, incomingUsers.id), {
      whenMatched: {
        update: {
          email: incomingUsers.email
        }
      }
    })

    expect(Mysql.Renderer.make().render(truncatePlan).sql).toBe(
      "truncate table `users`"
    )
    expect(() => Mysql.Renderer.make().render(unsupportedTruncatePlan)).toThrow(
      "Unsupported mysql truncate options"
    )
    expect(Mysql.Renderer.make().render(Mysql.Query.transaction({
      isolationLevel: "serializable",
      readOnly: true
    })).sql).toBe("start transaction isolation level serializable, read only")
    expect(Mysql.Renderer.make().render(Mysql.Query.commit()).sql).toBe("commit")
    expect(Mysql.Renderer.make().render(Mysql.Query.rollback()).sql).toBe("rollback")
    expect(Mysql.Renderer.make().render(Mysql.Query.savepoint("before_merge")).sql).toBe("savepoint `before_merge`")
    expect(Mysql.Renderer.make().render(Mysql.Query.rollbackTo("before_merge")).sql).toBe("rollback to savepoint `before_merge`")
    expect(Mysql.Renderer.make().render(Mysql.Query.releaseSavepoint("before_merge")).sql).toBe("release savepoint `before_merge`")
    expect(() => Mysql.Renderer.make().render(mergePlan)).toThrow("Unsupported merge statement for mysql")
  })

  test("rejects invalid postgres transaction isolation levels at runtime", () => {
    expect(() =>
      Postgres.Renderer.make().render(Postgres.Query.transaction({
        isolationLevel: "chaos"
      }))
    ).toThrow()
  })

  test("rejects invalid mysql transaction isolation levels at runtime", () => {
    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.transaction({
        isolationLevel: "chaos"
      }))
    ).toThrow()
  })

  test("rejects invalid rendered transaction isolation levels", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")

    const postgresPlan = Postgres.Query.transaction({
      isolationLevel: "serializable"
    })
    ;(postgresPlan as any)[queryAst].transaction.isolationLevel = "serializable; drop table users"
    expect(() =>
      Postgres.Renderer.make().render(postgresPlan)
    ).toThrow("Unsupported transaction isolation level")

    const mysqlPlan = Mysql.Query.transaction({
      isolationLevel: "serializable"
    })
    ;(mysqlPlan as any)[queryAst].transaction.isolationLevel = "serializable; drop table users"
    expect(() =>
      Mysql.Renderer.make().render(mysqlPlan)
    ).toThrow("Unsupported transaction isolation level")
  })

  test("rejects postgres merge statements without actions", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })
    const incomingUsers = Postgres.Table.make("incoming_users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const plan = Postgres.Query.merge(
      users,
      incomingUsers,
      Postgres.Query.eq(users.id, incomingUsers.id)
    )

    expect(() => Postgres.Renderer.make().render(plan)).toThrow()
  })

  test("rejects postgres merge updates without assignments", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })
    const incomingUsers = Postgres.Table.make("incoming_users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const plan = Postgres.Query.merge(
      users,
      incomingUsers,
      Postgres.Query.eq(users.id, incomingUsers.id),
      {
        whenMatched: {
          update: {}
        }
      }
    )

    expect(() => Postgres.Renderer.make().render(plan)).toThrow()
  })

  test("rejects postgres merge inserts without values", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })
    const incomingUsers = Postgres.Table.make("incoming_users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const plan = Postgres.Query.merge(
      users,
      incomingUsers,
      Postgres.Query.eq(users.id, incomingUsers.id),
      {
        whenNotMatched: {
          values: {}
        }
      }
    )

    expect(() => Postgres.Renderer.make().render(plan)).toThrow()
  })

  test("rejects runtime filters on statements that cannot be filtered", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const filteredTruncate = Postgres.Query.truncate(users).pipe(
      Postgres.Query.where(true)
    )
    const filteredCreateTable = Postgres.Query.createTable(users).pipe(
      Postgres.Query.where(true)
    )
    const filteredTransaction = Postgres.Query.transaction().pipe(
      Postgres.Query.where(true)
    )

    expect(() => Postgres.Renderer.make().render(filteredTruncate)).toThrow(
      "where(...) is not supported for truncate statements"
    )
    expect(() => Postgres.Renderer.make().render(filteredCreateTable)).toThrow(
      "where(...) is not supported for createTable statements"
    )
    expect(() => Postgres.Renderer.make().render(filteredTransaction)).toThrow(
      "where(...) is not supported for transaction statements"
    )
  })

  test("rejects runtime returning projections on merge statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })
    const incomingUsers = Postgres.Table.make("incoming_users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const mergePlan = Postgres.Query.merge(users, incomingUsers, Postgres.Query.eq(users.id, incomingUsers.id), {
      whenMatched: {
        update: {
          email: incomingUsers.email
        }
      }
    }).pipe(
      Postgres.Query.returning({
        merged: Postgres.Query.literal(true)
      })
    )

    expect(() => Postgres.Renderer.make().render(mergePlan)).toThrow(
      "returning(...) is not supported for merge statements"
    )
  })

  test("rejects runtime distinct modifiers on mutation statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const distinctDelete = Postgres.Query.delete(users).pipe(
      Postgres.Query.distinct()
    )

    expect(() => Postgres.Renderer.make().render(distinctDelete)).toThrow(
      "distinct(...) is not supported for delete statements"
    )
  })

  test("rejects runtime query clauses on insert statements", () => {
    const postgresUsers = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })
    const mysqlUsers = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })
    const sqliteUsers = Sqlite.Table.make("users", {
      id: Sqlite.Column.text().pipe(Sqlite.Column.primaryKey),
      email: Sqlite.Column.text()
    })
    const dialects = [
      {
        Query: Postgres.Query,
        render: (plan: unknown) => Postgres.Renderer.make().render(plan),
        users: postgresUsers,
        insert: Postgres.Query.insert(postgresUsers, {
          id: "00000000-0000-0000-0000-000000000001",
          email: "alice@example.com"
        })
      },
      {
        Query: Mysql.Query,
        render: (plan: unknown) => Mysql.Renderer.make().render(plan),
        users: mysqlUsers,
        insert: Mysql.Query.insert(mysqlUsers, {
          id: "00000000-0000-0000-0000-000000000001",
          email: "alice@example.com"
        })
      },
      {
        Query: Sqlite.Query,
        render: (plan: unknown) => Sqlite.Renderer.make().render(plan),
        users: sqliteUsers,
        insert: Sqlite.Query.insert(sqliteUsers, {
          id: "user-1",
          email: "alice@example.com"
        })
      }
    ]

    for (const { Query, render, users, insert } of dialects) {
      expect(() =>
        render(insert.pipe(Query.where(Query.eq(users.email, "alice@example.com"))))
      ).toThrow("where(...) is not supported for insert statements")

      expect(() =>
        render(insert.pipe(Query.innerJoin(users, Query.eq(users.id, users.id))))
      ).toThrow("join(...) is not supported for insert statements")

      expect(() =>
        render(insert.pipe(Query.orderBy(users.email)))
      ).toThrow("orderBy(...) is not supported for insert statements")

      expect(() =>
        render(insert.pipe(Query.limit(5)))
      ).toThrow("limit(...) is not supported for insert statements")

      expect(() =>
        render(insert.pipe(Query.offset(10)))
      ).toThrow("offset(...) is not supported for insert statements")

      expect(() =>
        render(insert.pipe(Query.lock("update")))
      ).toThrow("lock(...) is not supported for insert statements")
    }
  })

  test("rejects runtime limit modifiers on unsupported mutation statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const limitedUpdate = Postgres.Query.update(users, {
      email: "updated@example.com"
    }).pipe(
      Postgres.Query.limit(5)
    )

    expect(() => Postgres.Renderer.make().render(limitedUpdate)).toThrow(
      "limit(...) is not supported for update statements"
    )
  })

  test("rejects runtime orderBy modifiers on unsupported mutation statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const orderedUpdate = Postgres.Query.update(users, {
      email: "updated@example.com"
    }).pipe(
      Postgres.Query.orderBy(users.id)
    )

    expect(() => Postgres.Renderer.make().render(orderedUpdate)).toThrow(
      "orderBy(...) is not supported for update statements"
    )
  })

  test("rejects runtime lock modifiers on unsupported mutation statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const lockedUpdate = Postgres.Query.update(users, {
      email: "updated@example.com"
    }).pipe(
      Postgres.Query.lock("update")
    )

    expect(() => Postgres.Renderer.make().render(lockedUpdate)).toThrow(
      "lock(...) is not supported for update statements"
    )

    const lockedDelete = Postgres.Query.delete(users).pipe(
      Postgres.Query.lock("update")
    )

    expect(() => Postgres.Renderer.make().render(lockedDelete)).toThrow(
      "lock(...) is not supported for delete statements"
    )
  })

  test("rejects runtime row locks that specify both nowait and skipLocked", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const lockedSelect = Postgres.Query.select({
      id: users.id
    }).pipe(
      Postgres.Query.from(users),
      Postgres.Query.lock("update", { nowait: true, skipLocked: true })
    )

    expect(() => Postgres.Renderer.make().render(lockedSelect)).toThrow(
      "lock(...) cannot specify both nowait and skipLocked"
    )
  })

  test("rejects invalid rendered row lock modes", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")
    const postgresUsers = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey)
    })
    const mysqlUsers = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text()
    })

    const postgresSelect = Postgres.Query.select({
      id: postgresUsers.id
    }).pipe(
      Postgres.Query.from(postgresUsers),
      Postgres.Query.lock("update")
    )
    ;(postgresSelect as any)[queryAst].lock.mode = "exclusive"
    expect(() =>
      Postgres.Renderer.make().render(postgresSelect)
    ).toThrow("lock(...) mode must be update or share for select statements")

    const mysqlSelect = Mysql.Query.select({
      id: mysqlUsers.id
    }).pipe(
      Mysql.Query.from(mysqlUsers),
      Mysql.Query.lock("update")
    )
    ;(mysqlSelect as any)[queryAst].lock.mode = "exclusive"
    expect(() =>
      Mysql.Renderer.make().render(mysqlSelect)
    ).toThrow("lock(...) mode must be update or share for select statements")

    const mysqlUpdate = Mysql.Query.update(mysqlUsers, {
      email: "next@example.com"
    }).pipe(Mysql.Query.lock("lowPriority"))
    ;(mysqlUpdate as any)[queryAst].lock.mode = "quick"
    expect(() =>
      Mysql.Renderer.make().render(mysqlUpdate)
    ).toThrow("lock(...) mode must be lowPriority or ignore for update statements")

    const mysqlDelete = Mysql.Query.delete(mysqlUsers).pipe(Mysql.Query.lock("lowPriority"))
    ;(mysqlDelete as any)[queryAst].lock.mode = "exclusive"
    expect(() =>
      Mysql.Renderer.make().render(mysqlDelete)
    ).toThrow("lock(...) mode must be lowPriority, quick, or ignore for delete statements")
  })

  test("rejects runtime returning projections on ddl statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const createTablePlan = Postgres.Query.createTable(users).pipe(
      Postgres.Query.returning({
        created: Postgres.Query.literal(true)
      })
    )

    expect(() => Postgres.Renderer.make().render(createTablePlan)).toThrow(
      "returning(...) is not supported for createTable statements"
    )
  })

  test("rejects runtime returning projections on ddl index statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const createIndexPlan = Postgres.Query.createIndex(users, ["email"]).pipe(
      Postgres.Query.returning({
        created: Postgres.Query.literal(true)
      })
    )

    expect(() => Postgres.Renderer.make().render(createIndexPlan)).toThrow(
      "returning(...) is not supported for createIndex statements"
    )
  })

  test("rejects runtime filters on ddl drop statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const dropTablePlan = Postgres.Query.dropTable(users).pipe(
      Postgres.Query.where(true)
    )

    expect(() => Postgres.Renderer.make().render(dropTablePlan)).toThrow(
      "where(...) is not supported for dropTable statements"
    )
  })

  test("rejects runtime filters on ddl index statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const createIndexPlan = Postgres.Query.createIndex(users, ["email"]).pipe(
      Postgres.Query.where(true)
    )

    expect(() => Postgres.Renderer.make().render(createIndexPlan)).toThrow(
      "where(...) is not supported for createIndex statements"
    )
  })

  test("rejects runtime sources on transaction statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    expect(() =>
      Postgres.Query.transaction().pipe(
        Postgres.Query.from(users)
      )
    ).toThrow(
      "from(...) is not supported for transaction statements"
    )
  })

  test("rejects runtime having predicates on mutation statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const havingUpdate = Postgres.Query.update(users, {
      email: "updated@example.com"
    }).pipe(
      Postgres.Query.having(true)
    )

    expect(() => Postgres.Renderer.make().render(havingUpdate)).toThrow(
      "having(...) is not supported for update statements"
    )
  })

  test("rejects runtime groupBy clauses on mutation statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const groupedUpdate = Postgres.Query.update(users, {
      email: "updated@example.com"
    }).pipe(
      Postgres.Query.groupBy(users.id)
    )

    expect(() => Postgres.Renderer.make().render(groupedUpdate)).toThrow(
      "groupBy(...) is not supported for update statements"
    )
  })

  test("rejects runtime joins on transaction statements", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text()
    })

    const joinedTransaction = Postgres.Query.transaction().pipe(
      Postgres.Query.crossJoin(users)
    )

    expect(() => Postgres.Renderer.make().render(joinedTransaction)).toThrow(
      "join(...) is not supported for transaction statements"
    )
  })
})
