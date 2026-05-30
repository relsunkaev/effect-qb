// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1093-1113

// README.md:1093-1113
import * as Schema from "effect/Schema"
import { Column, Json, Query, Table } from "effect-qb"
import * as Sq from "effect-qb/sqlite"

const docs = Table.make("docs", {
  id: Column.text().pipe(Column.primaryKey),
  payload: Column.json(Schema.Struct({
    profile: Schema.Struct({
      city: Schema.String
    })
  }))
})

const readDocs = Query.select({
  id: docs.id,
  city: docs.payload.pipe(Json.key("profile"), Json.key("city"), Json.text)
}).pipe(Query.from(docs))

Sq.Renderer.make().render(readDocs)

export {};
