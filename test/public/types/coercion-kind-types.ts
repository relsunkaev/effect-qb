import * as My from "effect-qb/mysql"
import * as Schema from "effect/Schema"
import { Cast, Column, Query, Table, Type } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const values = Table.make("cast_values", {
  flag: Column.boolean(), integer: Column.int(), real: Column.real(),
  numeric: Column.number(), date: Column.date(), time: Column.time(), text: Column.text()
})
Cast.to(values.flag, Type.int())
Cast.to(values.integer, Type.boolean())
Cast.to(values.integer, Pg.Type.int8())
Cast.to(values.real, Type.numeric())
Cast.to(values.text, Type.date())
Cast.to(values.date, Type.timestamp())
Cast.to(values.time, Pg.Type.interval())
Cast.to(values.time, Pg.Type.timetz())
// @ts-expect-error PostgreSQL only casts boolean to int4, not numeric
Cast.to(values.flag, Type.numeric())
// @ts-expect-error boolean to int8 has no PostgreSQL native cast
Cast.to(values.flag, Pg.Type.int8())
// @ts-expect-error numeric to boolean is not the integer cast
Cast.to(values.numeric, Type.boolean())
// @ts-expect-error floating-point to boolean is unsupported
Cast.to(values.real, Type.boolean())
// @ts-expect-error numeric families do not imply a date conversion
Cast.to(values.integer, Type.date())
// @ts-expect-error date cannot cast to time without choosing a timestamp
Cast.to(values.date, Type.time())
// @ts-expect-error time has no date to make a timestamp
Cast.to(values.time, Type.timestamp())
// @ts-expect-error curried validation uses the same native pair rules
values.flag.pipe(Cast.to(Type.numeric()))
Query.select({ explicit: Cast.to(values.text, Type.int()) }).pipe(Query.from(values))

const arrays = Table.make("cast_arrays", {
  ints: Column.int().pipe(Pg.Column.array()),
  bools: Column.boolean().pipe(Pg.Column.array())
})
Cast.to(arrays.ints, Pg.Type.array(Pg.Type.int8()))
Cast.to(arrays.ints, Type.text())
Cast.to(values.text, Pg.Type.array(Pg.Type.int4()))
// @ts-expect-error scalar values cannot be cast directly to an array
Cast.to(values.integer, Pg.Type.array(Pg.Type.int4()))
// @ts-expect-error array element casts must exist
Cast.to(arrays.bools, Pg.Type.array(Type.numeric()))
// @ts-expect-error array-to-json needs a JSON constructor, not a cast
Cast.to(arrays.ints, Pg.Type.jsonb())
const mood = Pg.Type.enum("mood")
const otherMood = Pg.Type.enum("other_mood")
const enumSource = Cast.to(values.text, mood)
Cast.to(enumSource, Type.text())
// @ts-expect-error enum-to-integer is not a native cast
Cast.to(enumSource, Type.int())
// @ts-expect-error different enum types are not interchangeable
Cast.to(enumSource, otherMood)

const identifiers = Table.make("cast_identifiers", {
  tid: Pg.Column.custom(Schema.String, Pg.Type.tid()),
  regclass: Pg.Column.regclass(),
  oid: Pg.Column.oid(),
  xid: Pg.Column.custom(Schema.Number, Pg.Type.xid())
})
Query.eq(identifiers.tid, identifiers.tid)
// @ts-expect-error matching identifier families do not establish a native equality operator
Query.eq(identifiers.tid, identifiers.regclass)
// @ts-expect-error oid and xid do not share an equality operator
Query.eq(identifiers.oid, identifiers.xid)

const mysqlDouble = My.Type.double()
Cast.to(values.integer, mysqlDouble)
// @ts-expect-error tinyint is a column type, not a MySQL CAST target
Cast.to(values.integer, My.Type.tinyint())
// @ts-expect-error binary is supported, varbinary is not a CAST target
Cast.to(values.text, My.Type.varbinary())
// @ts-expect-error bool is not MySQL CAST syntax; use portable Type.boolean
Cast.to(values.integer, My.Type.bool())
// @ts-expect-error geometry is not a supported CAST target
Cast.to(values.text, My.Type.geometry())
