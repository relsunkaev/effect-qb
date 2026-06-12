// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import { Column, Query, Renderer, Table } from "#standard"
import * as My from "#mysql"
import * as Pg from "#postgres"
import * as Sq from "#sqlite"
import {
  portableDatatypeCastTypeByDialect,
  portableDatatypeDdlTypeByDialect,
  portableDatatypeKeys
} from "#internal/datatypes/matrix.ts"

const renderers = {
  standard: { renderer: Renderer.make(), quote: "\"" },
  postgres: { renderer: Pg.Renderer.make(), quote: "\"" },
  mysql: { renderer: My.Renderer.make(), quote: "`" },
  sqlite: { renderer: Sq.Renderer.make(), quote: "\"" }
}

const quote = (dialect: keyof typeof renderers, value: string) => {
  const marker = renderers[dialect].quote
  return `${marker}${value}${marker}`
}

describe("datatype matrix coverage", () => {
  test("every portable type renders DDL in every dialect", () => {
    for (const dialect of Object.keys(renderers) as Array<keyof typeof renderers>) {
      for (const kind of portableDatatypeKeys) {
        const tableName = `matrix_${kind}`
        const table = Table.make(tableName, {
          value: Column.custom(Schema.Unknown, Query.type[kind]())
        })
        const rendered = renderers[dialect].renderer.render(Query.createTable(table))
        const expectedType = portableDatatypeDdlTypeByDialect[dialect][kind]

        expect(rendered.sql).toBe(
          `create table ${quote(dialect, tableName)} (${quote(dialect, "value")} ${expectedType} not null)`
        )
      }
    }
  })

  test("every portable type renders casts in every dialect", () => {
    for (const dialect of Object.keys(renderers) as Array<keyof typeof renderers>) {
      for (const kind of portableDatatypeKeys) {
        const rendered = renderers[dialect].renderer.render(
          Query.select({
            value: Query.cast(null, Query.type[kind]())
          })
        )
        const expectedType = portableDatatypeCastTypeByDialect[dialect][kind]

        expect(rendered.sql).toBe(
          `select cast(null as ${expectedType}) as ${quote(dialect, "value")}`
        )
      }
    }
  })
})
