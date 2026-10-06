import { expect, test } from "bun:test"
import { Column, Query, RowSet, Table } from "#standard"
import { getAst, makePlan } from "#internal/query/plan.ts"
import * as PgDsl from "../../../packages/querybuilder/src/postgres/internal/dsl.ts"
import * as MyDsl from "../../../packages/querybuilder/src/mysql/internal/dsl.ts"
import * as SqDsl from "../../../packages/querybuilder/src/sqlite/internal/dsl.ts"
import { Renderer } from "#postgres"

for (const [dialect, groupBy] of [
  ["standard", Query.groupBy],
  ["postgres", PgDsl.groupBy],
  ["mysql", MyDsl.groupBy],
  ["sqlite", SqDsl.groupBy]
] as const) {
  test(`${dialect} grouping binding preserves the input and deduplicates groups`, () => {
    const first = Query.literal(1)
    const second = Query.literal(2)
    const base = Query.select({ answer: Query.literal(42) }).pipe(groupBy(first))
    const extended = base.pipe(groupBy(first, second))
    const render = Renderer.make().render

    expect(render(base)).toMatchObject({
      sql: 'select $1 as "answer" group by $2', params: [42, 1]
    })
    expect(render(extended)).toMatchObject({
      sql: 'select $1 as "answer" group by $2, $3', params: [42, 1, 2]
    })
  })
}

for (const [dialect, returning] of [
  ["standard", Query.returning],
  ["postgres", PgDsl.returning],
  ["sqlite", SqDsl.returning]
] as const) {
  test(`${dialect} returning binding replaces output without changing the input mutation`, () => {
    const users = Table.make("users", { id: Column.text(), name: Column.text() })
    const base = Query.update(users, { name: "Bob" }).pipe(Query.where(Query.eq(users.id, "u1")))
    const first = base.pipe(returning({ name: users.name }))
    const second = first.pipe(returning({ id: users.id }))
    const render = Renderer.make().render
    const mutationSql = 'update "users" set "name" = $1 where ("users"."id" = $2)'

    expect(render(base)).toMatchObject({ sql: mutationSql, params: ["Bob", "u1"] })
    expect(render(first)).toMatchObject({
      sql: `${mutationSql} returning "users"."name" as "name"`, params: ["Bob", "u1"]
    })
    expect(render(second)).toMatchObject({
      sql: `${mutationSql} returning "users"."id" as "id"`, params: ["Bob", "u1"]
    })
  })
}

test("independent select plans receive separate empty clause lists", () => {
  const first = getAst(Query.select({ answer: Query.literal(42) }))
  const second = getAst(Query.select({ answer: Query.literal(43) }))

  for (const clause of ["where", "having", "joins", "groupBy", "orderBy"] as const) {
    expect(first[clause]).toEqual([])
    expect(second[clause]).toEqual([])
    expect(first[clause]).not.toBe(second[clause])
  }
})

test("construction preserves supplied clauses without filling in the caller's input", () => {
  const base = Query.select({ answer: Query.literal(42) })
  const value = Query.literal(1)
  const predicate = Query.eq(value, value)
  const input = {
    kind: "select",
    select: base[RowSet.TypeId].selection,
    where: [{ kind: "where", predicate }],
    having: [{ kind: "having", predicate }],
    groupBy: [value],
    orderBy: [{ kind: "orderBy", value, direction: "asc" }]
  } as const
  const result = getAst(makePlan(base[RowSet.TypeId], input))

  expect(result).toEqual({ ...input, joins: [] })
  expect(input).not.toHaveProperty("joins")
})
