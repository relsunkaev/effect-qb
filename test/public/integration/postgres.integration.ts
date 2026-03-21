import { afterAll, beforeAll, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import { Column as C, Executor, Query as Q, Table } from "#postgres"
import { execPostgres, runPostgres } from "./helpers.ts"

const tableName = "integration_pg_events"

const events = Table.make(tableName, {
  id: C.text().pipe(C.primaryKey),
  happenedOn: C.date().pipe(C.schema(Schema.DateFromString)),
  happenedAt: C.custom(Schema.String, Q.type.timestamptz()),
  amount: C.number(),
  payload: C.custom(Schema.Struct({
    visits: Schema.NumberFromString
  }), Q.type.jsonb())
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

  expect(rows).toEqual([
    {
      id: "pg-1",
      happenedOn: new Date("2026-03-18T00:00:00.000Z"),
      happenedAt: "2026-03-18T07:00:00.000Z",
      amount: "12.34",
      payload: {
        visits: 42
      }
    }
  ])
  expect(rows[0]?.happenedOn).toBeInstanceOf(Date)
})
