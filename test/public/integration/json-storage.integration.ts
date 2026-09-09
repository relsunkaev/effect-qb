import { expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { Column, Json, Query, Table } from "#standard"
import * as Pg from "#postgres"
import * as My from "#mysql"
import * as Sq from "#sqlite"
import { runMysql, runPostgres } from "./helpers.ts"

const codec = Schema.Struct({
  count: Schema.NumberFromString,
  tags: Schema.Array(Schema.NumberFromString)
}).pipe(Schema.encodeKeys({ count: "stored_count" }))
const docs = Table.make("stored_json_docs", { payload: Column.json(codec) })

for (const dialect of ["postgres", "mysql", "sqlite"] as const) {
  test(`${dialect} JSON paths and mutations return stored values while roots decode`, async () => {
    const program = Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const executor = dialect === "postgres" ? Pg.Executor.make()
        : dialect === "mysql" ? My.Executor.make() : Sq.Executor.make()
      return yield* sql.withTransaction(Effect.gen(function*() {
        yield* sql.unsafe("create temporary table stored_json_docs (payload json)")
        yield* executor.execute(Query.insert(docs, { payload: { count: 42, tags: [7] } }))
        const changed = docs.payload.pipe(Json.replace(Json.focus().key("stored_count"), "43"))
        const reshaped = docs.payload.pipe(Json.replace(Json.focus().key("stored_count"), true))
        const [selected] = yield* executor.execute(Query.select({
          root: docs.payload,
          leaf: docs.payload.stored_count,
          arrayLeaf: docs.payload.tags[0]!,
          changed, reshaped,
          nested: Json.buildObject({ payload: docs.payload })
        }).pipe(Query.from(docs)))
        yield* executor.execute(Query.update(docs, { payload: changed }))
        const [updated] = yield* executor.execute(Query.select({ root: docs.payload }).pipe(Query.from(docs)))
        yield* sql.unsafe("drop table stored_json_docs")
        return { selected, updated }
      }))
    })
    const result = dialect === "postgres" ? await runPostgres(program)
      : dialect === "mysql" ? await runMysql(program)
        : await Effect.runPromise(program.pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true }))))
    expect(result).toEqual({
      selected: {
        root: { count: 42, tags: [7] },
        leaf: "42", arrayLeaf: "7",
        changed: { stored_count: "43", tags: ["7"] },
        reshaped: { stored_count: true, tags: ["7"] },
        nested: { payload: { stored_count: "42", tags: ["7"] } }
      },
      updated: { root: { count: 43, tags: [7] } }
    })
  })
}
