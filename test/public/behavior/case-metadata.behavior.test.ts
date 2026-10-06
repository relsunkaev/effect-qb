import { expect, test } from "bun:test"
import { Cast, Column, Function, Query, Scalar, Table, Type } from "#standard"
import { Renderer } from "#sqlite"

test("MATCH retains aggregate runtime metadata across comparison branches", () => {
  const users = Table.make("match_users", { id: Column.text() })
  const label = Query.match(Function.count(users.id))
    .when(Cast.to(1, Type.bigint()), "solo")
    .when(Cast.to(2, Type.bigint()), "pair")
    .else("many")

  expect(label[Scalar.TypeId].kind).toBe("aggregate")
  const rendered = Renderer.make("sqlite").render(
    Query.select({ label }).pipe(Query.from(users))
  )
  expect(rendered.sql).toBe('select case when (count("match_users"."id") = cast(? as bigint)) then ? when (count("match_users"."id") = cast(? as bigint)) then ? else ? end as "label" from "match_users"')
  expect(rendered.params).toEqual([1, "solo", 2, "pair", "many"])
})
