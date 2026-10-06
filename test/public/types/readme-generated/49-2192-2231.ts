// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 2192-2231

// README.md:2192-2231
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { Column, Json, Query, Table } from "effect-qb"
import { Executor } from "effect-qb/sqlite"

const documents = Table.make("documents", {
  id: Column.text().pipe(Column.primaryKey),
  payload: Column.json(Schema.Struct({
    profile: Schema.Struct({ city: Schema.String, count: Schema.NumberFromString })
  }))
})
const profile = Json.focus().key("profile")
const updated = documents.payload.pipe(
  Json.replace(profile.key("city"), "Paris"),
  Json.replace(profile.key("count"), "42") // encoded value, not the decoded number
)
const updateDocument = Query.update(documents, { payload: updated }).pipe(
  Query.where(Query.eq(documents.id, "guide"))
)
const readDocument = Query.select({
  document: documents.payload,
  storedCount: documents.payload.profile.count
}).pipe(Query.from(documents), Query.where(Query.eq(documents.id, "guide")))

// Plans above are values. This Effect creates, seeds, updates, then reads.
const executor = Executor.make()
const program = executor.execute(Query.createTable(documents)).pipe(
  Effect.andThen(executor.execute(Query.insert(documents, {
    id: "guide", payload: { profile: { city: "Rome", count: 7 } }
  }))),
  Effect.andThen(executor.execute(updateDocument)),
  Effect.andThen(executor.execute(readDocument)),
  Effect.provide(SqliteClient.layer({ filename: ":memory:" }))
)
const rows = await Effect.runPromise(program)
console.log(rows)
// [{ document: { profile: { city: "Paris", count: 42 } }, storedCount: "42" }]

export {};
