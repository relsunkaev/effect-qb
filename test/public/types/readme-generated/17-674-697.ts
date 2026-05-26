// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 674-697

// README.md:674-697
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
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
  city: Sq.Json.json.text(
    docs.payload,
    Sq.Json.json.path(Sq.Json.json.key("profile"), Sq.Json.json.key("city"))
  )
}).pipe(Query.from(docs))

Sq.Renderer.make().render(readDocs)

export {};
