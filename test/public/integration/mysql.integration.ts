import { afterAll, beforeAll, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import { Column as C, Executor, Query as Q, Table } from "#mysql"
import { execMysql, runMysql } from "./helpers.ts"

const tableName = "integration_mysql_events"

const events = Table.make(tableName, {
  id: C.text().pipe(C.primaryKey),
  happenedOn: C.date().pipe(C.schema(Schema.DateFromString)),
  happenedAt: C.datetime(),
  amount: C.number(),
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

  expect(rows).toEqual([
    {
      id: "mysql-1",
      happenedOn: new Date("2026-03-18T00:00:00.000Z"),
      happenedAt: "2026-03-18T10:00:00",
      amount: "12.34",
      payload: {
        visits: 42
      }
    }
  ])
  expect(rows[0]?.happenedOn).toBeInstanceOf(Date)
})
