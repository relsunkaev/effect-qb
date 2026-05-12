import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Column as C, Executor, Json as J, Query as Q, Renderer, Table, Type } from "#postgres"

describe("postgres driver value mappings", () => {
  const events = Table.make("driver_value_events", {
    id: C.text().pipe(C.primaryKey),
    happenedOn: C.date().pipe(C.schema(Schema.DateFromString)),
    amount: C.number({ precision: 10, scale: 4 }),
    note: C.text()
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
    const mapped = Table.make("driver_value_type_mapped", {
      id: C.custom(Schema.String, mappedText).pipe(C.primaryKey)
    })

    const rendered = Renderer.make().render(Q.insert(mapped, {
      id: "one"
    }))

    expect(rendered.params).toEqual(["db:one"])
  })

  test("allows column driver value mapping overrides for rendering and decoding", async () => {
    const mapped = Table.make("driver_value_column_mapped", {
      id: C.text().pipe(
        C.primaryKey,
        C.driverValueMapping({
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
})
