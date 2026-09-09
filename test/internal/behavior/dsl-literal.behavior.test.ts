import { expect, test } from "bun:test"
import * as Schema from "effect/Schema"
import * as Expression from "#internal/scalar.ts"
import * as StdDsl from "#internal/standard-dsl.ts"
import * as PgDsl from "../../../packages/querybuilder/src/postgres/internal/dsl.ts"
import * as MyDsl from "../../../packages/querybuilder/src/mysql/internal/dsl.ts"
import * as SqDsl from "../../../packages/querybuilder/src/sqlite/internal/dsl.ts"
import { Query, Type } from "#standard"
import * as Pg from "#postgres"
import * as My from "#mysql"
import * as Sq from "#sqlite"

for (const [dialect, dsl] of [
  ["standard", StdDsl], ["postgres", PgDsl], ["mysql", MyDsl], ["sqlite", SqDsl]
] as const) {
  test(`${dialect} literal construction preserves schemas and deferred numeric validation`, () => {
    for (const value of ["value", 7, true]) {
      const state = dsl.literal(value)[Expression.TypeId]
      expect(state.dialect).toBe(dialect)
      expect(state.nullability).toBe("never")
      expect(Schema.decodeUnknownSync(state.runtimeSchema!)(value)).toBe(value)
    }
    const missing = dsl.literal(null)[Expression.TypeId]
    expect(missing.nullability).toBe("always")
    expect(missing.runtimeSchema).toBeUndefined()
    expect(dsl.literal(new Date("2024-01-02T03:04:05Z"))[Expression.TypeId].runtimeSchema).toBeUndefined()
    expect(dsl.literal(Number.NaN)[Expression.TypeId].runtimeSchema).toBeUndefined()
  })

  test(`${dialect} column construction keeps caller type and nullability metadata`, () => {
    const db = Type.int()
    const required = dsl.column("value", db)[Expression.TypeId]
    const optional = dsl.column("value", db, true)[Expression.TypeId]
    expect(required.dbType).toBe(db)
    expect(required.dialect).toBe(dialect)
    expect(required.nullability).toBe("never")
    expect(optional.nullability).toBe("maybe")
  })
}

for (const [name, api, sql] of [
  ["postgres", Pg, 'select lower($1) as "value"'],
  ["mysql", My, 'select lower(?) as `value`'],
  ["sqlite", Sq, 'select lower(?) as "value"']
] as const) {
  test(`${name} public string functions use the shared literal construction`, () => {
    const rendered = api.Renderer.make().render(Query.select({ value: api.Function.lower("MiXeD") }))
    expect(rendered.sql).toBe(sql)
    expect(rendered.params).toEqual(["MiXeD"])
  })
}
