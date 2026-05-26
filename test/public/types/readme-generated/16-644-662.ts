// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 644-662

// README.md:644-662
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
import * as My from "effect-qb/mysql"

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Column.json(Schema.Struct({
    title: Schema.String
  }))
})

const readDocs = Query.select({
  id: docs.id,
  title: My.Json.json.text(docs.payload, My.Json.json.key("title"))
}).pipe(Query.from(docs))

My.Renderer.make().render(readDocs)

export {};
