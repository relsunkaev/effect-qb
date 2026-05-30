// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1059-1077

// README.md:1059-1077
import * as Schema from "effect/Schema"
import { Column, Json, Query, Table } from "effect-qb"
import * as My from "effect-qb/mysql"

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Column.json(Schema.Struct({
    title: Schema.String
  }))
})

const readDocs = Query.select({
  id: docs.id,
  title: docs.payload.pipe(Json.key("title"), Json.text)
}).pipe(Query.from(docs))

My.Renderer.make().render(readDocs)

export {};
