// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 872-909

// README.md:872-909
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const portable = Query.select({
  id: users.id,
  email: users.email
}).pipe(Query.from(users))

Pg.Renderer.make().render(portable)
My.Renderer.make().render(portable)
Sq.Renderer.make().render(portable)

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(Schema.Struct({
    kind: Schema.String
  }))
})

const postgresOnly = Query.select({
  kind: docs.payload.kind.pipe(Jsonb.text)
}).pipe(Query.from(docs))

Pg.Renderer.make().render(postgresOnly)

// @ts-expect-error Postgres jsonb plans are not MySQL-compatible
My.Renderer.make().render(postgresOnly)

export {};
