import { expect, test } from "bun:test"
import { Query, RowSet } from "#standard"
import { getAst, makePlan } from "#internal/query/plan.ts"

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
