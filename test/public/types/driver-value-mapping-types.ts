import * as StdRoot from "effect-qb"
import * as Std from "effect-qb"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import * as Mysql from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sqlite from "effect-qb/sqlite"

type Assert<T extends true> = T
type IsEqual<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false

const pgMapping: StdRoot.Scalar.DriverValueMapping = {
  fromDriver: (value) => value,
  toDriver: (value) => value,
  selectSql: (sql) => sql,
  jsonSelectSql: (sql) => sql
}

const invalidPgMapping: StdRoot.Scalar.DriverValueMapping = {
  // @ts-expect-error driver value mappings should expose only driver-boundary hooks
  encode: (value: unknown) => value
}

void invalidPgMapping

const mappedTextType = Pg.Type.driverValueMapping(Pg.Type.text(), pgMapping)
type _AssertMappedTextKind = Assert<IsEqual<typeof mappedTextType.kind, "text">>
type _AssertMappedTextDialect = Assert<IsEqual<typeof mappedTextType.dialect, "postgres">>

const mappedTextColumn = Pg.Column.custom(Schema.String, mappedTextType)
const mappedTextCast = StdRoot.Cast.to("mapped", mappedTextType)
const mappedTextRuntime: StdRoot.Scalar.RuntimeOf<typeof mappedTextCast> = "mapped"

void mappedTextColumn
void mappedTextRuntime

const pgEvents = Std.Table.make("driver_value_mapping_type_events", {
  id: Std.Column.text().pipe(
    Std.Column.primaryKey,
    Std.Column.driverValueMapping(pgMapping)
  ),
  happenedOn: Std.Column.date().pipe(
    Std.Column.schema(Schema.DateFromString),
    Std.Column.nullable,
    Std.Column.driverValueMapping(pgMapping)
  ),
  note: Std.Column.text().pipe(Std.Column.driverValueMapping(pgMapping))
})

const pgPlan = StdRoot.Query.select({
  id: pgEvents.id,
  happenedOn: pgEvents.happenedOn,
  note: pgEvents.note
}).pipe(StdRoot.Query.from(pgEvents))

type PgRow = StdRoot.Query.ResultRow<typeof pgPlan>
const pgId: PgRow["id"] = "event-id"
const pgHappenedOn: PgRow["happenedOn"] = new Date()
const pgHappenedOnNull: PgRow["happenedOn"] = null
const pgNote: PgRow["note"] = "note"

// @ts-expect-error driver mapping must not erase the DateFromString column schema
const pgHappenedOnEncoded: PgRow["happenedOn"] = "2026-03-18"

StdRoot.Query.insert(pgEvents, {
  id: "event-id",
  happenedOn: new Date(),
  note: "note"
})

StdRoot.Query.insert(pgEvents, {
  id: "event-id",
  // @ts-expect-error insert input must stay the schema type, not the encoded driver type
  happenedOn: "2026-03-18",
  note: "note"
})

Pg.Renderer.make({
  valueMappings: {
    text: pgMapping,
    timestamptz: pgMapping,
    timestamp: pgMapping,
    instant: pgMapping,
    string: pgMapping
  }
})

Pg.Renderer.make({
  valueMappings: {
    // @ts-expect-error value mapping keys must be known postgres type, family, or runtime keys
    timestamptzz: pgMapping
  }
})

Pg.Executor.make({
  valueMappings: {
    text: pgMapping,
    jsonb: pgMapping,
    json: pgMapping
  },
  driver: Pg.Executor.driver(() => Effect.succeed([]))
})

Pg.Executor.make({
  valueMappings: {
    // @ts-expect-error value mapping keys must be known postgres type, family, or runtime keys
    timestamptzz: pgMapping
  },
  driver: Pg.Executor.driver(() => Effect.succeed([]))
})

Std.Renderer.make({
  valueMappings: {
    uuid: pgMapping,
    string: pgMapping
  }
})

Std.Renderer.make({
  valueMappings: {
    // @ts-expect-error value mapping keys must be known standard type, family, or runtime keys
    jsonb: pgMapping
  }
})

Pg.Executor.driver({
  execute: () => Effect.succeed([]),
  stream: () => Stream.empty
})

Pg.Executor.driver("postgres", {
  execute: () => Effect.succeed([]),
  stream: () => Stream.empty
})

// @ts-expect-error postgres drivers must return an Effect from execute
Pg.Executor.driver(() => [])

Pg.Executor.driver({
  execute: () => Effect.succeed([]),
  // @ts-expect-error postgres driver stream handlers must return a Stream
  stream: () => Effect.succeed([])
})

Sqlite.Executor.driver({
  execute: () => Effect.succeed([]),
  stream: () => Stream.empty
})

Sqlite.Executor.driver("sqlite", {
  execute: () => Effect.succeed([]),
  stream: () => Stream.empty
})

// @ts-expect-error sqlite drivers must return an Effect from execute
Sqlite.Executor.driver(() => [])

Sqlite.Executor.driver({
  execute: () => Effect.succeed([]),
  // @ts-expect-error sqlite driver stream handlers must return a Stream
  stream: () => Effect.succeed([])
})

void pgId
void pgHappenedOn
void pgHappenedOnNull
void pgHappenedOnEncoded
void pgNote

const mysqlMapping: StdRoot.Scalar.DriverValueMapping = {
  fromDriver: (value) => value,
  toDriver: (value) => value
}

const mysqlEvents = Std.Table.make("driver_value_mapping_type_events", {
  id: Std.Column.text().pipe(
    Std.Column.primaryKey,
    Std.Column.driverValueMapping(mysqlMapping)
  ),
  happenedOn: Std.Column.date().pipe(
    Std.Column.schema(Schema.DateFromString),
    Std.Column.nullable,
    Std.Column.driverValueMapping(mysqlMapping)
  )
})

const mysqlPlan = StdRoot.Query.select({
  id: mysqlEvents.id,
  happenedOn: mysqlEvents.happenedOn
}).pipe(StdRoot.Query.from(mysqlEvents))

type MysqlRow = StdRoot.Query.ResultRow<typeof mysqlPlan>
const mysqlId: MysqlRow["id"] = "event-id"
const mysqlHappenedOn: MysqlRow["happenedOn"] = new Date()
const mysqlHappenedOnNull: MysqlRow["happenedOn"] = null

// @ts-expect-error MySQL driver mapping must not erase the DateFromString column schema
const mysqlHappenedOnEncoded: MysqlRow["happenedOn"] = "2026-03-18"

StdRoot.Query.insert(mysqlEvents, {
  id: "event-id",
  happenedOn: new Date()
})

StdRoot.Query.insert(mysqlEvents, {
  id: "event-id",
  // @ts-expect-error MySQL insert input must stay the schema type, not the encoded driver type
  happenedOn: "2026-03-18"
})

Mysql.Renderer.make({
  valueMappings: {
    text: mysqlMapping,
    string: mysqlMapping
  }
})

Mysql.Renderer.make({
  valueMappings: {
    // @ts-expect-error value mapping keys must be known mysql type, family, or runtime keys
    jsonb: mysqlMapping
  }
})

Mysql.Executor.make({
  valueMappings: {
    text: mysqlMapping
  },
  driver: Mysql.Executor.driver(() => Effect.succeed([]))
})

Mysql.Executor.make({
  valueMappings: {
    // @ts-expect-error value mapping keys must be known mysql type, family, or runtime keys
    timestamptzz: mysqlMapping
  },
  driver: Mysql.Executor.driver(() => Effect.succeed([]))
})

Sqlite.Renderer.make({
  valueMappings: {
    text: mysqlMapping,
    string: mysqlMapping
  }
})

Sqlite.Renderer.make({
  valueMappings: {
    // @ts-expect-error value mapping keys must be known sqlite type, family, or runtime keys
    jsonb: mysqlMapping
  }
})

Sqlite.Executor.make({
  valueMappings: {
    // @ts-expect-error value mapping keys must be known sqlite type, family, or runtime keys
    timestamptzz: mysqlMapping
  },
  driver: Sqlite.Executor.driver(() => Effect.succeed([]))
})

void mysqlId
void mysqlHappenedOn
void mysqlHappenedOnNull
void mysqlHappenedOnEncoded
