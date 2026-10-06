// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 2150-2173

// README.md:2150-2173
import * as Schema from "effect/Schema"
import { Column, Json, Query, Table } from "effect-qb"

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
// After the update: document.profile.count is 42; storedCount is "42".

export {};
