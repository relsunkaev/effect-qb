import { expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import { Json, Query } from "#standard"
import * as Pg from "#postgres"
import { runPostgres } from "./helpers.ts"

test("postgres types JSON constructor parameters without changing JSON values", async () => {
  const row = await runPostgres(Effect.gen(function*() {
    return yield* Pg.Executor.make().execute(Query.select({
      object: Json.buildObject({ name: "42", count: 7, active: true, empty: null }),
      binaryObject: Pg.Jsonb.buildObject({ name: "42", count: 7 }),
      array: Json.buildArray("42", 7, true, null),
      scalar: Json.toJson("42")
    })).pipe(Pg.Executor.exactlyOne)
  }))
  expect(row).toEqual({
    object: { name: "42", count: 7, active: true, empty: null },
    binaryObject: { name: "42", count: 7 },
    array: ["42", 7, true, null], scalar: "42"
  })
})
