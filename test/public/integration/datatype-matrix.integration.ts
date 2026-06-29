import { afterAll, expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { rm } from "node:fs/promises"
import { join } from "node:path"

import { Column, Query, Renderer, Table } from "#standard"
import * as My from "#mysql"
import * as Pg from "#postgres"
import * as Sq from "#sqlite"
import {
  portableDatatypeCastTypeByDialect,
  portableDatatypeDdlTypeByDialect,
  portableDatatypeKeys,
  type MatrixDialect,
  type PortableDatatypeKind
} from "#internal/datatypes/matrix.ts"
import { execMysql, execPostgres } from "./helpers.ts"

type LiveDialect = Exclude<MatrixDialect, "standard">

const sqliteFilename = join(process.cwd(), "test", ".tmp-datatype-matrix.sqlite")

afterAll(async () => {
  await rm(sqliteFilename, { force: true })
})

const liveDialects = {
  postgres: {
    renderer: Pg.Renderer.make(),
    exec: execPostgres,
    quote: "\""
  },
  mysql: {
    renderer: My.Renderer.make(),
    exec: execMysql,
    quote: "`"
  },
  sqlite: {
    renderer: Sq.Renderer.make(),
    exec: <Row extends Record<string, unknown> = Record<string, unknown>>(
      statement: string,
      params?: ReadonlyArray<unknown>
    ) =>
      runSqlite(Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        return yield* sql.unsafe<Row>(statement, params)
      })),
    quote: "\""
  }
} satisfies Record<LiveDialect, {
  readonly renderer: ReturnType<typeof Renderer.make>
  readonly exec: <Row extends Record<string, unknown> = Record<string, unknown>>(
    statement: string,
    params?: ReadonlyArray<unknown>
  ) => Promise<ReadonlyArray<Row>>
  readonly quote: string
}>

const runSqlite = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(Effect.provide(effect, SqliteClient.layer({
    filename: sqliteFilename,
    disableWAL: true
  })))

const quote = (dialect: LiveDialect, value: string) => {
  const marker = liveDialects[dialect].quote
  return `${marker}${value}${marker}`
}

const column = (kind: PortableDatatypeKind) =>
  Column.custom(Schema.Unknown, Query.type[kind]())

test("portable datatype DDL renders executable SQL for every live dialect", async () => {
  expect.assertions(portableDatatypeKeys.length * 3)
  await rm(sqliteFilename, { force: true })

  for (const dialect of Object.keys(liveDialects) as ReadonlyArray<LiveDialect>) {
    for (const kind of portableDatatypeKeys) {
      const tableName = `live_matrix_${dialect}_${kind}`
      const table = Table.make(tableName, {
        value: column(kind)
      })
      const rendered = liveDialects[dialect].renderer.render(Query.createTable(table))

      await liveDialects[dialect].exec(`drop table if exists ${quote(dialect, tableName)}`)
      await liveDialects[dialect].exec(rendered.sql, rendered.params)
      await liveDialects[dialect].exec(`drop table ${quote(dialect, tableName)}`)

      expect(rendered.sql).toContain(portableDatatypeDdlTypeByDialect[dialect][kind])
    }
  }

  await rm(sqliteFilename, { force: true })
})

test("portable datatype casts render executable SQL for every live dialect", async () => {
  expect.assertions(portableDatatypeKeys.length * 3)

  for (const dialect of Object.keys(liveDialects) as ReadonlyArray<LiveDialect>) {
    for (const kind of portableDatatypeKeys) {
      const rendered = liveDialects[dialect].renderer.render(
        Query.select({
          value: Query.cast(null, Query.type[kind]())
        })
      )

      await liveDialects[dialect].exec(rendered.sql, rendered.params)

      expect(rendered.sql).toContain(portableDatatypeCastTypeByDialect[dialect][kind])
    }
  }
})
