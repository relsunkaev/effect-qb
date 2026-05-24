// @ts-nocheck
import { describe, expect, test } from "bun:test"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import * as Sqlite from "#sqlite"
import * as StdRoot from "#standard"

describe("cross-cutting statement behavior", () => {
  test("renders postgres truncate, merge, and transaction-control statements", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })
    const incomingUsers = StdRoot.Table.make("incoming_users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
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
      'truncate table "users" restart identity cascade'
    )
    expect(Postgres.Renderer.make().render(mergePlan).sql).toBe(
      'merge into "users" using "incoming_users" on ("users"."id" = "incoming_users"."id") when matched then update set "email" = "incoming_users"."email", "bio" = "incoming_users"."bio" when not matched then insert ("id", "email", "bio") values ("incoming_users"."id", "incoming_users"."email", "incoming_users"."bio")'
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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
    })
    const incomingUsers = StdRoot.Table.make("incoming_users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text(),
      bio: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
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

  test("rejects malformed statement identifiers before rendering SQL", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })

    expect(() =>
      Postgres.Query.savepoint(123 as any)
    ).toThrow("savepoint(...) name must be a non-empty string")

    expect(() =>
      Postgres.Query.rollbackTo("" as any)
    ).toThrow("rollbackTo(...) name must be a non-empty string")

    expect(() =>
      Postgres.Query.createIndex(users, "id", { name: 123 } as any)
    ).toThrow("createIndex(...) option 'name' must be a non-empty string")

    expect(() =>
      Postgres.Query.dropIndex(users, "id", { name: "" } as any)
    ).toThrow("dropIndex(...) option 'name' must be a non-empty string")

    const savepointPlan = Postgres.Query.savepoint("before_merge")
    ;(savepointPlan as any)[queryAst].transaction.name = 123

    expect(() =>
      Postgres.Renderer.make().render(savepointPlan)
    ).toThrow("savepoint(...) name must be a non-empty string")

    const createIndexPlan = Postgres.Query.createIndex(users, "id")
    ;(createIndexPlan as any)[queryAst].ddl.name = 123

    expect(() =>
      Postgres.Renderer.make().render(createIndexPlan)
    ).toThrow("createIndex(...) option 'name' must be a non-empty string")
  })

  test("rejects invalid rendered transaction kinds", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")

    const postgresPlan = Postgres.Query.transaction()
    ;(postgresPlan as any)[queryAst].transaction.kind = "begin"
    expect(() =>
      Postgres.Renderer.make().render(postgresPlan)
    ).toThrow("Unsupported transaction statement kind")

    const mysqlPlan = Mysql.Query.transaction()
    ;(mysqlPlan as any)[queryAst].transaction.kind = "begin"
    expect(() =>
      Mysql.Renderer.make().render(mysqlPlan)
    ).toThrow("Unsupported transaction statement kind")
  })

  test("rejects invalid rendered query statement kinds", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")

    const postgresPlan = Postgres.Query.transaction()
    ;(postgresPlan as any)[queryAst].kind = "vacuum"
    expect(() =>
      Postgres.Renderer.make().render(postgresPlan)
    ).toThrow("Unsupported query statement kind")

    const mysqlPlan = Mysql.Query.transaction()
    ;(mysqlPlan as any)[queryAst].kind = "vacuum"
    expect(() =>
      Mysql.Renderer.make().render(mysqlPlan)
    ).toThrow("Unsupported query statement kind")
  })

  test("rejects mismatched rendered truncate payload kinds", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")

    const postgresUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    const postgresPlan = Postgres.Query.truncate(postgresUsers)
    ;(postgresPlan as any)[queryAst].truncate.kind = "dropTable"
    expect(() =>
      Postgres.Renderer.make().render(postgresPlan)
    ).toThrow("Unsupported truncate statement kind")

    const mysqlUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })
    const mysqlPlan = Mysql.Query.truncate(mysqlUsers)
    ;(mysqlPlan as any)[queryAst].truncate.kind = "dropTable"
    expect(() =>
      Mysql.Renderer.make().render(mysqlPlan)
    ).toThrow("Unsupported truncate statement kind")
  })

  test("rejects postgres merge statements without actions", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const incomingUsers = StdRoot.Table.make("incoming_users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const plan = Postgres.Query.merge(
      users,
      incomingUsers,
      Postgres.Query.eq(users.id, incomingUsers.id)
    )

    expect(() => Postgres.Renderer.make().render(plan)).toThrow()
  })

  test("rejects postgres merge updates without assignments", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const incomingUsers = StdRoot.Table.make("incoming_users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const incomingUsers = StdRoot.Table.make("incoming_users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
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

  test("rejects postgres merge sources that reuse the target source name", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    expect(() =>
      Postgres.Query.merge(
        users,
        users,
        Postgres.Query.eq(users.id, users.id),
        {
          whenMatched: {
            delete: true
          }
        }
      )
    ).toThrow("merge(...) source name must differ from target source name: users")
  })

  test("rejects structurally incomplete merge sources at runtime", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const fakeSource = {
      name: "incoming_users",
      baseName: "incoming_users"
    }

    expect(() =>
      Postgres.Query.merge(users, fakeSource, true, {
        whenMatched: {
          delete: true
        }
      })
    ).toThrow("merge(...) requires an aliased source")
  })

  test("rejects non-mysql tuple mutation targets at runtime", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const posts = StdRoot.Table.make("posts", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      userId: StdRoot.Column.uuid(),
      title: StdRoot.Column.text()
    })

    expect(() =>
      Postgres.Query.update([users, posts], {
        users: {
          email: "alice@example.com"
        },
        posts: {
          title: "hello"
        }
      })
    ).toThrow("update(...) only supports multiple mutation targets for mysql")

    expect(() => Postgres.Query.delete([users, posts])).toThrow(
      "delete(...) only supports multiple mutation targets for mysql"
    )
  })

  test("rejects single-element mutation target tuples at runtime", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    expect(() =>
      Postgres.Query.insert([users], {
        id: "user-id",
        email: "alice@example.com"
      })
    ).toThrow("insert(...) requires a table target, not a single-element target tuple")

    expect(() =>
      Postgres.Query.update([users], {
        users: {
          email: "alice@example.com"
        }
      })
    ).toThrow("update(...) requires a table target, not a single-element target tuple")

    expect(() => Postgres.Query.delete([users])).toThrow(
      "delete(...) requires a table target, not a single-element target tuple"
    )

    expect(() => Postgres.Query.truncate([users])).toThrow(
      "truncate(...) requires a table target, not a single-element target tuple"
    )
  })

  test("rejects invalid rendered postgres merge payload kinds", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const incomingUsers = StdRoot.Table.make("incoming_users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const mergePayloadPlan = Postgres.Query.merge(
      users,
      incomingUsers,
      Postgres.Query.eq(users.id, incomingUsers.id),
      {
        whenMatched: {
          update: {
            email: incomingUsers.email
          }
        }
      }
    )
    ;(mergePayloadPlan as any)[queryAst].merge.kind = "upsert"
    expect(() =>
      Postgres.Renderer.make().render(mergePayloadPlan)
    ).toThrow("Unsupported merge statement kind")

    const matchedPlan = Postgres.Query.merge(
      users,
      incomingUsers,
      Postgres.Query.eq(users.id, incomingUsers.id),
      {
        whenMatched: {
          update: {
            email: incomingUsers.email
          }
        }
      }
    )
    ;(matchedPlan as any)[queryAst].merge.whenMatched.kind = "replace"
    expect(() =>
      Postgres.Renderer.make().render(matchedPlan)
    ).toThrow("Unsupported merge action kind")

    const notMatchedPlan = Postgres.Query.merge(
      users,
      incomingUsers,
      Postgres.Query.eq(users.id, incomingUsers.id),
      {
        whenNotMatched: {
          values: {
            id: incomingUsers.id,
            email: incomingUsers.email
          }
        }
      }
    )
    ;(notMatchedPlan as any)[queryAst].merge.whenNotMatched.kind = "replace"
    expect(() =>
      Postgres.Renderer.make().render(notMatchedPlan)
    ).toThrow("Unsupported merge action kind")
  })

  test("rejects runtime filters on statements that cannot be filtered", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const incomingUsers = StdRoot.Table.make("incoming_users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    expect(() =>
      Postgres.Query.merge(users, incomingUsers, Postgres.Query.eq(users.id, incomingUsers.id), {
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
    ).toThrow(
      "returning(...) is not supported for merge statements"
    )
  })

  test("rejects runtime returning projections on select statements", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    expect(() =>
      Postgres.Query.select({
        id: users.id
      }).pipe(
        Postgres.Query.from(users),
        Postgres.Query.returning({
          email: users.email
        })
      )
    ).toThrow("returning(...) is not supported for select statements")
  })

  test("rejects runtime distinct modifiers on mutation statements", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const distinctDelete = Postgres.Query.delete(users).pipe(
      Postgres.Query.distinct()
    )

    expect(() => Postgres.Renderer.make().render(distinctDelete)).toThrow(
      "distinct(...) is not supported for delete statements"
    )
  })

  test("rejects runtime query clauses on insert statements", () => {
    const postgresUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const mysqlUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })
    const sqliteUsers = StdRoot.Table.make("users", {
      id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
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

  test("rejects runtime returning projections on ddl statements", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    expect(() =>
      Postgres.Query.createTable(users).pipe(
        Postgres.Query.returning({
          created: Postgres.Query.literal(true)
        })
      )
    ).toThrow(
      "returning(...) is not supported for createTable statements"
    )
  })

  test("rejects runtime returning projections on ddl index statements", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    expect(() =>
      Postgres.Query.createIndex(users, ["email"]).pipe(
        Postgres.Query.returning({
          created: Postgres.Query.literal(true)
        })
      )
    ).toThrow(
      "returning(...) is not supported for createIndex statements"
    )
  })

  test("rejects runtime filters on ddl drop statements", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const dropTablePlan = Postgres.Query.dropTable(users).pipe(
      Postgres.Query.where(true)
    )

    expect(() => Postgres.Renderer.make().render(dropTablePlan)).toThrow(
      "where(...) is not supported for dropTable statements"
    )
  })

  test("rejects runtime filters on ddl index statements", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const createIndexPlan = Postgres.Query.createIndex(users, ["email"]).pipe(
      Postgres.Query.where(true)
    )

    expect(() => Postgres.Renderer.make().render(createIndexPlan)).toThrow(
      "where(...) is not supported for createIndex statements"
    )
  })

  test("rejects runtime sources on transaction statements", () => {
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
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
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      email: StdRoot.Column.text()
    })

    const joinedTransaction = Postgres.Query.transaction().pipe(
      Postgres.Query.crossJoin(users)
    )

    expect(() => Postgres.Renderer.make().render(joinedTransaction)).toThrow(
      "join(...) is not supported for transaction statements"
    )
  })
})
