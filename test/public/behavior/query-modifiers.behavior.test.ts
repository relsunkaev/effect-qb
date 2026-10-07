import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import * as Standard from "#standard"
import * as Postgres from "#postgres"

const users = Standard.Table.make("users", {
  id: Standard.Column.text().pipe(Standard.Column.primaryKey),
  name: Standard.Column.text().pipe(Standard.Column.nullable)
})
const Q = Standard.Query
const render = Postgres.Renderer.make().render

describe("query modifier preservation", () => {
  test("groupBy merges unresolved requirements in first-seen order without mutating its input", () => {
    const later = Standard.Table.make("20", { value: Standard.Column.text() })
    const earlier = Standard.Table.make("10", { value: Standard.Column.text() })
    const base = Q.select({ id: users.id }).pipe(Q.from(users))
    const grouped = base.pipe(Q.groupBy(later.value, earlier.value, later.value, users.id))

    expect<unknown>(grouped[Standard.RowSet.TypeId].required).toEqual(["20", "10"])
    expect<unknown>(base[Standard.RowSet.TypeId].required).toEqual([])
    expect(render(base).sql).toBe('select "users"."id" as "id" from "users"')
  })

  test("repeated groupBy calls retain previous groups and deduplicate expressions", () => {
    const base = Q.select({ id: users.id }).pipe(Q.from(users), Q.groupBy(users.id))
    const grouped = base.pipe(Q.groupBy(users.name, users.id))

    expect(render(base).sql).toBe('select "users"."id" as "id" from "users" group by "users"."id"')
    expect(render(grouped).sql).toBe('select "users"."id" as "id" from "users" group by "users"."id", "users"."name"')
  })

  test("groupBy retains predicate assumptions used by result decoding", () => {
    const plan = Q.select({ name: users.name }).pipe(
      Q.from(users),
      Q.where(Q.isNotNull(users.name)),
      Q.groupBy(users.name)
    )
    const executor = Postgres.Executor.make({
      driver: Postgres.Executor.driver("postgres", () => Effect.succeed([{ name: null }]))
    })
    const result = Effect.runSync(executor.execute(plan).pipe(Effect.flip))

    expect(result).toMatchObject({ _tag: "RowDecodeError", stage: "schema" })
    expect(render(plan).sql).toContain('where ("users"."name" is not null) group by "users"."name"')
  })

  test("returning retains an unfinished insert target for subsequent source attachment", () => {
    const pending = Q.insert(users)
    const projected = pending.pipe(Q.returning({ id: users.id }))
    const source = Q.values([{ id: "u1", name: "Alice" }] as const)
    const complete = projected.pipe(Q.from(source))
    const afterSource = pending.pipe(Q.from(source), Q.returning({ id: users.id }))

    expect(render(complete).sql).toBe('insert into "users" ("id", "name") values ($1, $2) returning "users"."id" as "id"')
    expect(render(complete).params).toEqual(["u1", "Alice"])
    expect(render(afterSource)).toEqual(render(complete))
    expect(pending[Standard.RowSet.TypeId].selection).toEqual({})
  })

  test("returning replaces only the output selection and retains mutation predicates and parameters", () => {
    const base = Q.update(users, { name: "Bob" }).pipe(Q.where(Q.eq(users.id, "u1")))
    const first = base.pipe(Q.returning({ name: users.name }))
    const second = first.pipe(Q.returning({ id: users.id }))

    expect(render(base).sql).toBe('update "users" set "name" = $1 where ("users"."id" = $2)')
    expect(render(first).sql).toBe('update "users" set "name" = $1 where ("users"."id" = $2) returning "users"."name" as "name"')
    expect(render(second).sql).toBe('update "users" set "name" = $1 where ("users"."id" = $2) returning "users"."id" as "id"')
    expect(render(second).params).toEqual(["Bob", "u1"])
    expect<unknown>(second[Standard.RowSet.TypeId].required).toEqual([])
  })
})
