import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Column as C, Executor, Json as J, Query as Q, Renderer, Table, Type } from "#postgres"
import * as StdRoot from "#standard"

describe("postgres driver value mappings", () => {
  const events = StdRoot.Table.make("driver_value_events", {
    id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
    happenedOn: StdRoot.Column.date().pipe(StdRoot.Column.schema(Schema.DateFromString)),
    amount: StdRoot.Column.number({ precision: 10, scale: 4 }),
    note: StdRoot.Column.text()
  })

  test("encodes mutation literals through the target column schema and db type", () => {
    const happenedOn = new Date("2026-03-18T12:34:56.000Z")
    const rendered = Renderer.make().render(Q.insert(events, {
      id: "event-1",
      happenedOn,
      amount: "12.3400",
      note: "created"
    }))

    expect(rendered.params).toEqual(["event-1", "2026-03-18", "12.34", "created"])
  })

  test("preserves JSON string scalars that look like JSON while encoding mutations", () => {
    const docs = StdRoot.Table.make("driver_value_json_string_docs", {
      payload: StdRoot.Column.json(Schema.String)
    })

    const rendered = Renderer.make().render(Q.insert(docs, {
      payload: "42"
    }))

    expect(rendered.params).toEqual(["\"42\""])
  })

  test("preserves JSONB string scalars that look like JSON while encoding mutations", () => {
    const docs = StdRoot.Table.make("driver_value_jsonb_string_docs", {
      payload: C.jsonb(Schema.String)
    })

    const rendered = Renderer.make().render(Q.insert(docs, {
      payload: "42"
    }))

    expect(rendered.params).toEqual(["42"])
  })

  test("preserves JSONB string scalars that look like JSON while decoding rows", async () => {
    const docs = StdRoot.Table.make("driver_value_jsonb_string_docs", {
      payload: C.jsonb(Schema.String)
    })

    const executor = Executor.make({
      driver: Executor.driver(() => Effect.succeed([{ payload: "42" }]))
    })

    const rows = await Effect.runPromise(executor.execute(Q.select({
      payload: docs.payload
    }).pipe(
      Q.from(docs)
    )))

    expect(rows).toEqual([{ payload: "42" }])
  })

  test("encodes comparison literals through the compared column schema and db type", () => {
    const happenedOn = new Date("2026-03-18T12:34:56.000Z")
    const rendered = Renderer.make().render(Q.select({
      id: events.id
    }).pipe(
      Q.from(events),
      Q.where(Q.eq(events.happenedOn, happenedOn))
    ))

    expect(rendered.params).toEqual(["2026-03-18"])
  })

  test("casts precision-sensitive values before postgres JSON construction", () => {
    const rendered = Renderer.make().render(Q.select({
      payload: J.jsonb.buildObject({
        amount: events.amount,
        happenedOn: events.happenedOn
      })
    }).pipe(
      Q.from(events)
    ))

    expect(rendered.sql).toContain('("driver_value_events"."amount")::text')
    expect(rendered.sql).toContain('("driver_value_events"."happenedOn")::text')
  })

  test("allows db type driver value mapping overrides", () => {
    const mappedText = Type.driverValueMapping(Type.text(), {
      toDriver: (value) => `db:${String(value)}`
    })
    const mapped = StdRoot.Table.make("driver_value_type_mapped", {
      id: C.custom(Schema.String, mappedText).pipe(StdRoot.Column.primaryKey)
    })

    const rendered = Renderer.make().render(Q.insert(mapped, {
      id: "one"
    }))

    expect(rendered.params).toEqual(["db:one"])
  })

  test("allows column driver value mapping overrides for rendering and decoding", async () => {
    const mapped = StdRoot.Table.make("driver_value_column_mapped", {
      id: StdRoot.Column.text().pipe(
        StdRoot.Column.primaryKey,
        StdRoot.Column.driverValueMapping({
          fromDriver: (value) => `app:${String(value)}`,
          toDriver: (value) => String(value).replace(/^app:/, "db:")
        })
      )
    })

    const rendered = Renderer.make().render(Q.insert(mapped, {
      id: "app:one"
    }))
    expect(rendered.params).toEqual(["db:one"])

    const executor = Executor.make({
      driver: Executor.driver(() => Effect.succeed([{ id: "db:one" }]))
    })
    const rows = await Effect.runPromise(executor.execute(Q.select({
      id: mapped.id
    }).pipe(
      Q.from(mapped)
    )))

    expect(rows).toEqual([{ id: "app:db:one" }])
  })

  test("allows renderer and executor-level driver value mappings", async () => {
    const rendered = Renderer.make({
      valueMappings: {
        text: {
          toDriver: (value) => `mapped:${String(value)}`
        }
      }
    }).render(Q.select({
      value: Q.literal("one")
    }))

    expect(rendered.params).toEqual(["mapped:one"])

    const executor = Executor.make({
      valueMappings: {
        text: {
          fromDriver: (value) => `mapped:${String(value)}`
        }
      },
      driver: Executor.driver(() => Effect.succeed([{ value: "one" }]))
    })

    const rows = await Effect.runPromise(executor.execute(Q.select({
      value: events.note
    }).pipe(
      Q.from(events)
    )))

    expect(rows).toEqual([{ value: "mapped:one" }])
  })

  test("applies executor-level driver value mappings before driver execution", async () => {
    const executor = Executor.make({
      valueMappings: {
        text: {
          toDriver: (value) => `driver:${String(value)}`
        }
      },
      driver: Executor.driver((query) => {
        expect(query.params).toEqual(["driver:one"])
        return Effect.succeed([{ id: "one" }])
      })
    })

    const rows = await Effect.runPromise(executor.execute(Q.select({
      id: events.id
    }).pipe(
      Q.from(events),
      Q.where(Q.eq(events.id, "one"))
    )))

    expect(rows).toEqual([{ id: "one" }])
  })
})
