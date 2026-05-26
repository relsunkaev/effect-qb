import * as Schema from "effect/Schema"
import { Column, Table } from "effect-qb"
import { Column as PgColumn, Json, Jsonb, Query as PgQuery } from "effect-qb/postgres"

const payloadSchema = Schema.Struct({
  profile: Schema.Struct({
    address: Schema.Struct({
      city: Schema.String,
      postcode: Schema.NullOr(Schema.String)
    }),
    tags: Schema.Array(Schema.String)
  }),
  note: Schema.NullOr(Schema.String)
})

const jsonDocs = Table.make("json_docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Column.json(payloadSchema)
})

const jsonbDocs = Table.make("jsonb_docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: PgColumn.jsonb(payloadSchema)
})

const jsonCityPath = Json.path(
  Json.key("profile"),
  Json.key("address"),
  Json.key("city")
)

const jsonbCityPath = Jsonb.path(
  Jsonb.key("profile"),
  Jsonb.key("address"),
  Jsonb.key("city")
)

const cityText = Json.text(jsonDocs.payload, jsonCityPath)
const jsonbCityText = Jsonb.text(jsonbDocs.payload, jsonbCityPath)

const missingRequiredCity = Jsonb.delete(jsonbDocs.payload, jsonbCityPath)

PgQuery.update(jsonbDocs, {
  // @ts-expect-error jsonb update values must still satisfy the target column schema
  payload: missingRequiredCity
})

void cityText
void jsonbCityText
