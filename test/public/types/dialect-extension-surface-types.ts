import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

const events = Table.make("Events", {
  id: Column.uuid().pipe(Column.primaryKey),
  meta: Pg.Column.jsonb(Schema.Struct({
    kind: Schema.String
  }))
})

Pg.Renderer.make().render(Query.select({ id: events.id }).pipe(Query.from(events)))

events.pipe(
  Pg.Table.index({
    columns: "id",
    method: "btree"
  })
)

// @ts-expect-error portable tables are created from effect-qb/Table, not effect-qb/postgres
Pg.Table.make("events", { id: Column.uuid() })

// @ts-expect-error portable table APIs are not exported from effect-qb/mysql
My.Table.make("events", { id: Column.uuid() })

// @ts-expect-error portable table APIs are not exported from effect-qb/sqlite
Sq.Table.make("events", { id: Column.uuid() })

// @ts-expect-error portable columns are created from effect-qb/Column, not effect-qb/postgres
Pg.Column.uuid()

// @ts-expect-error portable columns are created from effect-qb/Column, not effect-qb/mysql
My.Column.text()

// @ts-expect-error portable columns are created from effect-qb/Column, not effect-qb/sqlite
Sq.Column.int()
