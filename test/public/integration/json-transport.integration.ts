import { expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { Column, Json, Query, Table, Type } from "#standard"
import * as Pg from "#postgres"
import * as My from "#mysql"
import * as Sq from "#sqlite"
import { runMysql, runPostgres } from "./helpers.ts"

const docs = Table.make("json_transport_docs", {
  payload: Column.json(Schema.Struct({ value: Schema.Unknown, spare: Schema.String }))
})
const values = ["42", '"42"', "true", "null", "", true, false, 1, null, { nested: true }, ["42", true]]

for (const dialect of ["postgres", "mysql", "sqlite"] as const) {
  test(`${dialect} converts SQL scalar expressions to JSON without changing their types`, async () => {
    const scalars = Table.make("json_input_scalars", {
      text: Column.text(), enabled: Column.boolean(), disabled: Column.boolean(),
      absent: Column.boolean().pipe(Column.nullable), count: Column.int()
    })
    const program = Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const executor = dialect === "postgres" ? Pg.Executor.make()
        : dialect === "mysql" ? My.Executor.make() : Sq.Executor.make()
      return yield* sql.withTransaction(Effect.gen(function*() {
        yield* sql.unsafe("create temporary table json_input_scalars (text text, enabled boolean, disabled boolean, absent boolean, count integer)")
        yield* executor.execute(Query.insert(scalars, { text: '"42"', enabled: true, disabled: false, absent: null, count: 42 }))
        const rows = yield* executor.execute(Query.select({
          text: Json.toJson(scalars.text), enabled: Json.toJson(scalars.enabled),
          disabled: Json.toJson(scalars.disabled), absent: Json.toJson(scalars.absent),
          count: Json.toJson(scalars.count), predicate: Json.toJson(Query.eq(scalars.count, 42)),
          object: Json.buildObject({ text: scalars.text, enabled: scalars.enabled, absent: scalars.absent }),
          array: Json.buildArray(scalars.text, scalars.enabled, scalars.disabled, scalars.absent)
        }).pipe(Query.from(scalars)))
        yield* sql.unsafe("drop table json_input_scalars")
        return rows
      }))
    })
    const rows = dialect === "postgres" ? await runPostgres(program)
      : dialect === "mysql" ? await runMysql(program)
        : await Effect.runPromise(program.pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true }))))
    expect(rows).toEqual([{
      text: '"42"', enabled: true, disabled: false, absent: null, count: 42, predicate: true,
      object: { text: '"42"', enabled: true, absent: null }, array: ['"42"', true, false, null]
    }])
  })
  for (const value of values) {
    test(`${dialect} round-trips native JSON column ${JSON.stringify(value)}`, async () => {
      const scalarDocs = Table.make("json_scalar_docs", {
        payload: dialect === "postgres" ? Pg.Column.jsonb(Schema.Unknown)
          : dialect === "mysql" ? My.Column.custom(Schema.Unknown, { ...Type.json(), variant: "json" as const })
            : Sq.Column.custom(Schema.Unknown, { ...Type.json(), variant: "json" as const })
      })
      const program = Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const executor = dialect === "postgres" ? Pg.Executor.make()
          : dialect === "mysql" ? My.Executor.make() : Sq.Executor.make()
        return yield* sql.withTransaction(Effect.gen(function*() {
          yield* sql.unsafe(`create temporary table json_scalar_docs (payload ${dialect === "postgres" ? "jsonb" : "json"})`)
          yield* executor.execute(Query.insert(scalarDocs, { payload: value }))
          const rows = yield* executor.execute(Query.select({ value: scalarDocs.payload }).pipe(Query.from(scalarDocs)))
          yield* sql.unsafe("drop table json_scalar_docs")
          return rows
        }))
      })
      const rows = dialect === "postgres" ? await runPostgres(program)
        : dialect === "mysql" ? await runMysql(program)
          : await Effect.runPromise(program.pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true }))))
      expect(rows).toEqual([{ value }])
    })
    test(`${dialect} preserves JSON literal ${JSON.stringify(value)}`, async () => {
      const executor = dialect === "postgres" ? Pg.Executor.make()
        : dialect === "mysql" ? My.Executor.make() : Sq.Executor.make()
      const program = executor.execute(Query.select({
        value: Json.toJson(value), expression: Json.toJson(Query.literal(value))
      }))
      const rows = dialect === "postgres" ? await runPostgres(program)
        : dialect === "mysql" ? await runMysql(program)
          : await Effect.runPromise(program.pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true }))))
      expect(rows).toEqual([{ value, expression: value }])
    })
    test(`${dialect} preserves JSON ${JSON.stringify(value)} across roots, paths and constructors`, async () => {
      const program = Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const executor = dialect === "postgres" ? Pg.Executor.make()
          : dialect === "mysql" ? My.Executor.make() : Sq.Executor.make()
        return yield* sql.withTransaction(Effect.gen(function*() {
          yield* sql.unsafe("create temporary table json_transport_docs (payload json)")
          yield* executor.execute(Query.insert(docs, { payload: { value, spare: "remove" } }))
          const [row] = yield* executor.execute(Query.select({
            root: docs.payload,
            path: docs.payload.value,
            object: Json.buildObject({ value: docs.payload.value }),
            array: Json.buildArray(docs.payload.value),
            afterDelete: Json.get(Json.delete_(docs.payload.spare), Json.key("value")),
            afterInsert: Json.get(Json.insert(Json.toJson({}), Json.key("value"), value), Json.key("value")),
            afterMerge: Json.get(Json.merge(docs.payload, { added: 1 }), Json.key("value")),
            afterReplace: Json.get(docs.payload.pipe(Json.replace(Json.focus().key("value"), value)), Json.key("value"))
          }).pipe(Query.from(docs)))
          const derived = Query.select({ payload: docs.payload }).pipe(Query.from(docs), Query.as("derived_docs"))
          const [derivedRow] = yield* executor.execute(Query.select({
            value: Json.get(derived.payload, Json.key("value"))
          }).pipe(Query.from(derived)))
          yield* sql.unsafe("drop table json_transport_docs")
          return { row, derivedRow }
        }))
      })
      const result = dialect === "postgres" ? await runPostgres(program)
        : dialect === "mysql" ? await runMysql(program)
          : await Effect.runPromise(program.pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true }))))
      expect(result).toEqual({
        row: {
          root: { value, spare: "remove" }, path: value, object: { value }, array: [value],
          afterDelete: value, afterInsert: value, afterMerge: value, afterReplace: value
        },
        derivedRow: { value }
      })
    })
  }
}
