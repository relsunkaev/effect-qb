import { describe, expect, test } from "bun:test"

import * as Mysql from "#mysql"

const userId = "11111111-1111-1111-1111-111111111111"
const secondUserId = "22222222-2222-2222-2222-222222222222"

describe("mysql insert behavior", () => {
  test("renders mysql multi-row and source-backed inserts", () => {
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })
    const archivedUsers = Mysql.Table.make("archived_users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })

    const valuesSource = Mysql.Query.as(Mysql.Query.values([
      { id: Mysql.Query.literal(userId), email: "alice@example.com", bio: null },
      { id: Mysql.Query.literal(secondUserId), email: "bob@example.com", bio: "writer" }
    ] as const), "seed")

    const multiRowPlan = Mysql.Query.insert(users).pipe(
      Mysql.Query.from(valuesSource)
    )

    const insertSelectPlan = Mysql.Query.insert(archivedUsers).pipe(
      Mysql.Query.from(Mysql.Query.select({
      id: users.id,
      email: users.email,
      bio: users.bio
    }).pipe(
      Mysql.Query.from(users)
    )))

    const insertUnnestPlan = Mysql.Query.insert(users).pipe(
      Mysql.Query.from(Mysql.Query.unnest({
      id: [userId, secondUserId],
      email: ["alice@example.com", "bob@example.com"],
      bio: [null, "writer"]
      }, "seed"))
    )

    expect(Mysql.Renderer.make().render(multiRowPlan).sql).toBe(
      "insert into `users` (`id`, `email`, `bio`) values (?, ?, null), (?, ?, ?)"
    )
    expect(Mysql.Renderer.make().render(multiRowPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])

    expect(Mysql.Renderer.make().render(insertSelectPlan).sql).toBe(
      "insert into `archived_users` (`id`, `email`, `bio`) select `users`.`id` as `id`, `users`.`email` as `email`, `users`.`bio` as `bio` from `users`"
    )
    expect(Mysql.Renderer.make().render(insertSelectPlan).params).toEqual([])

    expect(Mysql.Renderer.make().render(insertUnnestPlan).sql).toBe(
      "insert into `users` (`id`, `email`, `bio`) values (?, ?, null), (?, ?, ?)"
    )
    expect(Mysql.Renderer.make().render(insertUnnestPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])

    const updateFromValuesPlan = Mysql.Query.update(users, {
      email: valuesSource.email
    }).pipe(
      Mysql.Query.from(valuesSource),
      Mysql.Query.where(Mysql.Query.eq(users.id, valuesSource.id))
    )

    expect(Mysql.Renderer.make().render(updateFromValuesPlan).sql).toBe(
      "update `users`, (select ? as `id`, ? as `email`, null as `bio` union all select ? as `id`, ? as `email`, ? as `bio`) as `seed`(`id`, `email`, `bio`) set `email` = `seed`.`email` where (`users`.`id` = `seed`.`id`)"
    )
    expect(Mysql.Renderer.make().render(updateFromValuesPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])
  })

  test("renders mysql default-only inserts and duplicate-key conflict clauses", () => {
    const auditLogs = Mysql.Table.make("audit_logs", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey, Mysql.Column.default),
      note: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })
    const users = Mysql.Table.make("users", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      email: Mysql.Column.text(),
      bio: Mysql.Column.text().pipe(Mysql.Column.nullable)
    })

    const defaultInsertPlan = Mysql.Query.insert(auditLogs)
    const conflictPlan = Mysql.Query.onConflict(["email"] as const, {
      update: {
        bio: Mysql.Query.excluded(users.bio)
      }
    })(Mysql.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: "writer"
    }))

    expect(Mysql.Renderer.make().render(defaultInsertPlan).sql).toBe(
      "insert into `audit_logs` default values"
    )

    expect(Mysql.Renderer.make().render(conflictPlan).sql).toBe(
      "insert into `users` (`id`, `email`, `bio`) values (?, ?, ?) on duplicate key update `bio` = values(`bio`)"
    )
    expect(Mysql.Renderer.make().render(conflictPlan).params).toEqual([
      userId,
      "alice@example.com",
      "writer"
    ])
  })
})
