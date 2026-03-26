import { afterAll, beforeAll, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import { Column as C, Executor, Query as Q, Table } from "#mysql"
import { DateFromStringSchema } from "../../helpers/date-from-string.ts"
import { execMysql, runMysql } from "./helpers.ts"

const tableName = "integration_mysql_events"

const events = Table.make(tableName, {
  id: C.text().pipe(C.primaryKey),
  happenedOn: C.date().pipe(C.schema(DateFromStringSchema)),
  happenedAt: C.datetime(),
  amount: C.number({ precision: 10, scale: 4 }),
  payload: C.json(Schema.Struct({
    visits: Schema.NumberFromString
  }))
})

beforeAll(async () => {
  await execMysql(`drop table if exists \`${tableName}\``)
  await execMysql(`
    create table \`${tableName}\` (
      \`id\` varchar(64) primary key,
      \`happenedOn\` date not null,
      \`happenedAt\` datetime not null,
      \`amount\` decimal(10, 4) not null,
      \`payload\` json not null
    )
  `)
  await execMysql(`
    insert into \`${tableName}\` (\`id\`, \`happenedOn\`, \`happenedAt\`, \`amount\`, \`payload\`)
    values (
      'mysql-1',
      '2026-03-18',
      '2026-03-18 10:00:00',
      '0012.3400',
      '{"visits":"42"}'
    )
  `)
})

afterAll(async () => {
  await execMysql(`drop table if exists \`${tableName}\``)
})

test("mysql executor decodes live temporal, numeric, and json values", async () => {
  const plan = Q.select({
    id: events.id,
    happenedOn: events.happenedOn,
    happenedAt: events.happenedAt,
    amount: events.amount,
    payload: events.payload
  }).pipe(
    Q.from(events)
  )

  const rows = await runMysql(Executor.make().execute(plan))

  expect(rows).toHaveLength(1)
  const row = rows[0]!
  expect(row.id).toBe("mysql-1")
  expect(row.happenedOn).toEqual(new Date("2026-03-18T00:00:00.000Z"))
  expect(row.happenedOn).toBeInstanceOf(Date)
  expect(row.happenedAt).toBe("2026-03-18T10:00:00" as typeof row.happenedAt)
  expect(row.amount).toBe("12.34" as typeof row.amount)
  expect(row.payload).toEqual({
    visits: 42
  })
})
