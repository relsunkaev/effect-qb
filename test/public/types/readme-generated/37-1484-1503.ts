// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1484-1503

// README.md:1484-1503
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
  title: docs.payload.title.pipe(Json.text)
}).pipe(Query.from(docs))

const rendered = My.Renderer.make().render(readDocs)
// select `docs`.`id` as `id`, json_unquote(json_extract(`docs`.`payload`, ?)) as `title` from `docs`

export {};
