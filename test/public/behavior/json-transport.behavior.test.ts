import { expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "#standard"
import * as Pg from "#postgres"
import * as My from "#mysql"
import * as Sq from "#sqlite"

const docs = Table.make("json_transport_docs", { payload: Column.json(Schema.Unknown) })
const plan = Query.select({ payload: docs.payload }).pipe(Query.from(docs))
const values = ["42", '"42"', "true", "null", "", true, false, 1, null, { nested: "42" }, [true, "42"]]

for (const value of values) {
  test(`native JSON decoding preserves ${JSON.stringify(value)}`, () => {
    const pg = Pg.Executor.make({ driver: Pg.Executor.driver(() => Effect.succeed([{ payload: value }])) })
    const my = My.Executor.make({ driver: My.Executor.driver(() => Effect.succeed([{ payload: value }])) })
    const sq = Sq.Executor.make({ driver: Sq.Executor.driver(() => Effect.succeed([{ payload: JSON.stringify(value) }])) })
    for (const executor of [pg, my, sq]) {
      expect(Effect.runSync(executor.execute(plan))).toEqual([{ payload: value }])
    }
  })
}

test("explicit mappings support serialized PostgreSQL and MySQL custom drivers", () => {
  const value = '"42"'
  const valueMappings = { json: { fromDriver: (raw: unknown) => JSON.parse(raw as string) } }
  const pg = Pg.Executor.make({ valueMappings, driver: Pg.Executor.driver(() => Effect.succeed([{ payload: JSON.stringify(value) }])) })
  const my = My.Executor.make({ valueMappings, driver: My.Executor.driver(() => Effect.succeed([{ payload: JSON.stringify(value) }])) })
  for (const executor of [pg, my]) {
    expect(Effect.runSync(executor.execute(plan))).toEqual([{ payload: value }])
  }
})

test("explicit mappings support a decoded SQLite custom driver", () => {
  const value = '"42"'
  const executor = Sq.Executor.make({
    valueMappings: { json: { fromDriver: (raw) => raw } },
    driver: Sq.Executor.driver(() => Effect.succeed([{ payload: value }]))
  })
  expect(Effect.runSync(executor.execute(plan))).toEqual([{ payload: value }])
})

test("SQLite reports malformed serialized JSON at the transport boundary", () => {
  const executor = Sq.Executor.make({ driver: Sq.Executor.driver(() => Effect.succeed([{ payload: "not JSON" }])) })
  expect(Effect.runSync(Effect.flip(executor.execute(plan)))).toMatchObject({
    _tag: "RowDecodeError", stage: "normalize", projection: { alias: "payload" }
  })
})
