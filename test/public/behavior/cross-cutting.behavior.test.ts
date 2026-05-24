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

  test("statement builders trust typed identifiers without renderer-time identifier validation", () => {
    const queryAst = Symbol.for("effect-qb/QueryAst")
    const users = StdRoot.Table.make("users", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey)
    })

    const emptySavepointPlan = Postgres.Query.savepoint("" as any)
    expect(Postgres.Renderer.make().render(emptySavepointPlan).sql).toBe('savepoint ""')

    const emptyRollbackToPlan = Postgres.Query.rollbackTo("" as any)
    expect(Postgres.Renderer.make().render(emptyRollbackToPlan).sql).toBe('rollback to savepoint ""')

    const emptyCreateIndexPlan = Postgres.Query.createIndex(users, "id", { name: "" } as any)
    expect(Postgres.Renderer.make().render(emptyCreateIndexPlan).sql).toBe('create index "" on "users" ("id")')

    const emptyDropIndexPlan = Postgres.Query.dropIndex(users, "id", { name: "" } as any)
    expect(Postgres.Renderer.make().render(emptyDropIndexPlan).sql).toBe('drop index ""')

    const savepointPlan = Postgres.Query.savepoint("before_merge")
    ;(savepointPlan as any)[queryAst].transaction.name = ""

    expect(Postgres.Renderer.make().render(savepointPlan).sql).toBe('savepoint ""')

    const createIndexPlan = Postgres.Query.createIndex(users, "id")
    ;(createIndexPlan as any)[queryAst].ddl.name = ""

    expect(Postgres.Renderer.make().render(createIndexPlan).sql).toBe('create index "" on "users" ("id")')
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

})
