import { afterAll, beforeAll, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import { Column as C, Executor, Query as Q, Table, Type } from "#postgres"
import { execPostgres, runPostgres } from "./helpers.ts"

const tableName = "integration_pg_events"

const events = Table.make(tableName, {
  id: C.text().pipe(C.primaryKey),
  happenedOn: C.date().pipe(C.schema(Schema.DateFromString)),
  happenedAt: C.custom(Schema.String, Type.timestamptz()),
  amount: C.number({ precision: 10, scale: 4 }),
  payload: C.custom(Schema.Struct({
    visits: Schema.NumberFromString
  }), Type.jsonb())
})

beforeAll(async () => {
  await execPostgres(`drop table if exists "${tableName}"`)
  await execPostgres(`
    create table "${tableName}" (
      "id" text primary key,
      "happenedOn" date not null,
      "happenedAt" timestamptz not null,
      "amount" numeric(10, 4) not null,
      "payload" jsonb not null
    )
  `)
  await execPostgres(`
    insert into "${tableName}" ("id", "happenedOn", "happenedAt", "amount", "payload")
    values (
      'pg-1',
      '2026-03-18',
      '2026-03-18T10:00:00+03:00',
      '0012.3400',
      '{"visits":"42"}'::jsonb
    )
  `)
})

afterAll(async () => {
  await execPostgres(`drop table if exists "${tableName}"`)
})

test("postgres executor decodes live temporal, numeric, and json values", async () => {
  const plan = Q.select({
    id: events.id,
    happenedOn: events.happenedOn,
    happenedAt: events.happenedAt,
    amount: events.amount,
    payload: events.payload
  }).pipe(
    Q.from(events)
  )

  const rows = await runPostgres(Executor.make().execute(plan))

  expect(rows).toHaveLength(1)
  const row = rows[0]!
  expect(row.id).toBe("pg-1")
  expect(row.happenedOn).toEqual(new Date("2026-03-18T00:00:00.000Z"))
  expect(row.happenedOn).toBeInstanceOf(Date)
  expect(row.happenedAt).toBe("2026-03-18T07:00:00.000Z")
  expect(row.amount).toBe("12.34" as typeof row.amount)
  expect(row.payload).toEqual({
    visits: 42
  })
})
