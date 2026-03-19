import { describe, expect, test } from "bun:test"

import * as Postgres from "../src/postgres.ts"

const userId = "11111111-1111-1111-1111-111111111111"
const secondUserId = "22222222-2222-2222-2222-222222222222"

describe("postgres insert behavior", () => {
  test("renders postgres multi-row and source-backed inserts", () => {
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })
    const archivedUsers = Postgres.Table.make("archived_users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })

    const valuesSource = Postgres.Query.values([
      { id: Postgres.Query.literal(userId), email: "alice@example.com", bio: null },
      { id: Postgres.Query.literal(secondUserId), email: "bob@example.com", bio: "writer" }
    ] as const, "seed")

    const multiRowPlan = Postgres.Query.insertFrom(users, valuesSource)

    const insertSelectPlan = Postgres.Query.insertFrom(archivedUsers, Postgres.Query.select({
      id: users.id,
      email: users.email,
      bio: users.bio
    }).pipe(
      Postgres.Query.from(users)
    ))

    const insertUnnestPlan = Postgres.Query.insertFrom(users, Postgres.Query.unnest({
      id: [userId, secondUserId],
      email: ["alice@example.com", "bob@example.com"],
      bio: [null, "writer"]
    }, "seed"))

    expect(Postgres.Renderer.make().render(multiRowPlan).sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") values ($1, $2, null), ($3, $4, $5)'
    )
    expect(Postgres.Renderer.make().render(multiRowPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])

    expect(Postgres.Renderer.make().render(insertSelectPlan).sql).toBe(
      'insert into "public"."archived_users" ("id", "email", "bio") select "users"."id" as "id", "users"."email" as "email", "users"."bio" as "bio" from "public"."users"'
    )
    expect(Postgres.Renderer.make().render(insertSelectPlan).params).toEqual([])

    expect(Postgres.Renderer.make().render(insertUnnestPlan).sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") select * from unnest(cast($1 as uuid[]), cast($2 as text[]), cast($3 as text[]))'
    )
    expect(Postgres.Renderer.make().render(insertUnnestPlan).params).toEqual([
      [userId, secondUserId],
      ["alice@example.com", "bob@example.com"],
      [null, "writer"]
    ])

    const updateFromValuesPlan = Postgres.Query.update(users, {
      email: valuesSource.email
    }).pipe(
      Postgres.Query.innerJoin(valuesSource, Postgres.Query.eq(users.id, valuesSource.id))
    )

    expect(Postgres.Renderer.make().render(updateFromValuesPlan).sql).toBe(
      'update "public"."users" set "email" = "seed"."email" from (select $1 as "id", $2 as "email", null as "bio" union all select $3 as "id", $4 as "email", $5 as "bio") as "seed"("id", "email", "bio") where ("users"."id" = "seed"."id")'
    )
    expect(Postgres.Renderer.make().render(updateFromValuesPlan).params).toEqual([
      userId,
      "alice@example.com",
      secondUserId,
      "bob@example.com",
      "writer"
    ])
  })

  test("renders postgres default-values and rich conflict clauses", () => {
    const auditLogs = Postgres.Table.make("audit_logs", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey, Postgres.Column.hasDefault),
      note: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })
    const users = Postgres.Table.make("users", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      email: Postgres.Column.text(),
      bio: Postgres.Column.text().pipe(Postgres.Column.nullable)
    })

    const defaultValuesPlan = Postgres.Query.defaultValues(auditLogs)
    const partialIndexConflictPlan = Postgres.Query.onConflict({
      columns: ["email"] as const,
      where: Postgres.Query.isNotNull(users.bio)
    }, {
      update: {
        bio: Postgres.Query.excluded(users.bio)
      },
      where: Postgres.Query.isNotNull(Postgres.Query.excluded(users.bio))
    })(Postgres.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: "writer"
    }))
    const namedConstraintPlan = Postgres.Query.onConflict({
      constraint: "users_email_key"
    }, {
      update: {
        email: Postgres.Query.excluded(users.email)
      }
    })(Postgres.Query.insert(users, {
      id: userId,
      email: "alice@example.com",
      bio: null
    }))

    expect(Postgres.Renderer.make().render(defaultValuesPlan).sql).toBe(
      'insert into "public"."audit_logs" default values'
    )

    expect(Postgres.Renderer.make().render(partialIndexConflictPlan).sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") values ($1, $2, $3) on conflict ("email") where ("users"."bio" is not null) do update set "bio" = excluded."bio" where (excluded."bio" is not null)'
    )
    expect(Postgres.Renderer.make().render(partialIndexConflictPlan).params).toEqual([
      userId,
      "alice@example.com",
      "writer"
    ])

    expect(Postgres.Renderer.make().render(namedConstraintPlan).sql).toBe(
      'insert into "public"."users" ("id", "email", "bio") values ($1, $2, null) on conflict on constraint "users_email_key" do update set "email" = excluded."email"'
    )
    expect(Postgres.Renderer.make().render(namedConstraintPlan).params).toEqual([
      userId,
      "alice@example.com"
    ])
  })
})
