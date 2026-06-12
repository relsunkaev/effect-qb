import * as Schema from "effect/Schema"
import { Column, Function, Index, Query, Scalar, Table } from "effect-qb"
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
  Index.make((table) => table.id).pipe(Pg.Index.using("btree"))
)

Pg.Schema.make("analytics").table("events", { id: Column.uuid() })

Pg.Function.nextVal(Pg.sequence("events_id_seq"))

// @ts-expect-error standard scalar APIs are exported from effect-qb
type PgScalar = Pg.Scalar.Any

// @ts-expect-error standard row-set APIs are exported from effect-qb
type PgRowSet = Pg.RowSet.Any

// @ts-expect-error standard function APIs are exported from effect-qb
Pg.Function.lower(events.id)

Function.lower(events.id)

// @ts-expect-error MySQL has no dialect-specific function namespace
My.Function.call("lower", events.id)

// @ts-expect-error SQLite has no dialect-specific function namespace
Sq.Function.call("lower", events.id)

// @ts-expect-error standard query APIs are exported from effect-qb
Pg.Query.select({ id: events.id })

Query.select({ id: events.id })

// @ts-expect-error casts are exported from effect-qb
Pg.Cast.to(events.id, Pg.Type.text())

// @ts-expect-error MySQL query helpers are exported from effect-qb
My.Query.select({ id: events.id })

// @ts-expect-error SQLite query helpers are exported from effect-qb
Sq.Query.select({ id: events.id })

type ScalarAny = Scalar.Any
void (null as unknown as ScalarAny)

// @ts-expect-error portable tables are created from effect-qb/Table, not effect-qb/postgres
Pg.Table.make("events", { id: Column.uuid() })

// @ts-expect-error postgres schemas are created from effect-qb/postgres Schema.make
Pg.schema("analytics")

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
