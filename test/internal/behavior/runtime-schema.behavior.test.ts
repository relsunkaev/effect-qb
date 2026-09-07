// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import { expressionRuntimeSchema } from "#internal/runtime/schema.ts"
import * as Postgres from "#postgres"
import { Column, Json, Table } from "#standard"

const schemaOf = (expression: unknown): Schema.Top => {
  const schema = expressionRuntimeSchema(expression as never)
  expect(schema).toBeDefined()
  return schema!
}

const decode = (expression: unknown, value: unknown): unknown =>
  Schema.decodeUnknownSync(schemaOf(expression))(value)

describe("runtime schema inference", () => {
  test("narrows exact JSON object paths and preserves refined leaves", () => {
    const docs = Table.make("schema_docs", {
      id: Column.uuid().pipe(Column.primaryKey),
      payload: Postgres.Column.jsonb(Schema.Struct({
        profile: Schema.Struct({
          city: Schema.String.check(Schema.isMaxLength(5))
        })
      }))
    })

    const city = Postgres.Jsonb.get(docs.payload.profile.city)

    expect(decode(city, "Paris")).toBe("Paris")
    expect(() => decode(city, "Phoenix")).toThrow()
  })

  test("narrows exact JSON tuple indexes and preserves transformations", () => {
    const docs = Table.make("schema_tuple_docs", {
      id: Column.uuid().pipe(Column.primaryKey),
      payload: Postgres.Column.jsonb(Schema.Struct({
        tags: Schema.Tuple([Schema.String, Schema.NumberFromString])
      }))
    })

    const secondTag = Postgres.Jsonb.get(docs.payload.tags[1])

    expect(decode(secondTag, "42")).toBe(42)
  })

  test("narrows JSON paths through unions", () => {
    const docs = Table.make("schema_union_docs", {
      id: Column.uuid().pipe(Column.primaryKey),
      payload: Postgres.Column.jsonb(Schema.Union([
        Schema.Struct({
          kind: Schema.Literal("signup"),
          email: Schema.String
        }),
        Schema.Struct({
          kind: Schema.Literal("purchase"),
          amount: Schema.Number
        })
      ]))
    })

    const kind = Postgres.Jsonb.get(docs.payload.kind)

    expect(decode(kind, "signup")).toBe("signup")
    expect(decode(kind, "purchase")).toBe("purchase")
    expect(() => decode(kind, "refund")).toThrow()
  })

  test("handles optional JSON properties and falls back for missing paths", () => {
    const docs = Table.make("schema_optional_docs", {
      id: Column.uuid().pipe(Column.primaryKey),
      payload: Postgres.Column.jsonb(Schema.Struct({
        profile: Schema.Struct({
          nickname: Schema.optional(Schema.String.check(Schema.isMaxLength(4)))
        })
      }))
    })

    const nickname = Postgres.Jsonb.get(docs.payload.profile.nickname)
    const missing = Postgres.Jsonb.get(docs.payload.profile, Postgres.Jsonb.key("unknown"))

    expect(decode(nickname, "Rami")).toBe("Rami")
    expect(() => decode(nickname, "Ramazan")).toThrow()
    expect(decode(missing, { arbitrary: [1, true, null] })).toEqual({
      arbitrary: [1, true, null]
    })
  })

  test("falls back to JSON value schemas for wildcard paths", () => {
    const docs = Table.make("schema_wildcard_docs", {
      id: Column.uuid().pipe(Column.primaryKey),
      payload: Postgres.Column.jsonb(Schema.Struct({
        tags: Schema.Tuple([Schema.String, Schema.NumberFromString])
      }))
    })

    const exactSecondTag = Postgres.Jsonb.get(docs.payload.tags[1])
    const wildcardTags = Postgres.Jsonb.get(docs.payload.tags, Postgres.Jsonb.wildcard())

    expect(decode(exactSecondTag, "42")).toBe(42)
    expect(decode(wildcardTags, "42")).toBe("42")
    expect(decode(wildcardTags, ["a", 1, true])).toEqual(["a", 1, true])
  })

  test("keeps JSON-compatible toJson schemas and falls back for non-JSON schemas", () => {
    const docs = Table.make("schema_to_json_docs", {
      id: Column.uuid().pipe(Column.primaryKey),
      shortCode: Column.text().pipe(
        Column.schema(Schema.String.check(Schema.isMaxLength(3)))
      ),
      payloadBytes: Postgres.Column.bytea()
    })

    const shortCodeJson = Json.toJson(docs.shortCode)
    const bytesJson = Json.toJson(docs.payloadBytes)

    expect(decode(shortCodeJson, "abc")).toBe("abc")
    expect(() => decode(shortCodeJson, "abcd")).toThrow()
    expect(decode(bytesJson, "AQID")).toBe("AQID")
    expect(decode(bytesJson, new Uint8Array([1, 2, 3]))).toEqual({ 0: 1, 1: 2, 2: 3 })
  })
})

test("JSON replacements decode changed leaves and preserve untouched codecs", () => {
  const docs = Table.make("focus_schema_docs", {
    payload: Postgres.Column.jsonb(Schema.Struct({
      profile: Schema.Struct({ city: Schema.String, count: Schema.NumberFromString }),
      pair: Schema.Tuple([Schema.String, Schema.NumberFromString])
    }))
  })
  const changed = docs.payload.pipe(
    Postgres.Jsonb.replace(Postgres.Jsonb.focus().key("profile").key("city"), 123),
    Postgres.Jsonb.replace(Postgres.Jsonb.focus().key("pair").index(0), true)
  )
  expect(decode(changed, { profile: { city: 123, count: "42" }, pair: [true, "7"] }))
    .toEqual({ profile: { city: 123, count: 42 }, pair: [true, 7] })
  expect(() => decode(changed, { profile: { city: "old", count: "42" }, pair: [true, "7"] })).toThrow()
})

test("JSON replacements retain missing and null intermediate containers", () => {
  const docs = Table.make("optional_focus_schema_docs", {
    payload: Postgres.Column.jsonb(Schema.Struct({
      profile: Schema.optionalKey(Schema.NullOr(Schema.Struct({ city: Schema.String })))
    }))
  })
  const changed = docs.payload.pipe(
    Postgres.Jsonb.replace(Postgres.Jsonb.focus().key("profile").key("city"), 123)
  )
  expect(decode(changed, {})).toEqual({})
  expect(decode(changed, { profile: null })).toEqual({ profile: null })
  expect(decode(changed, { profile: { city: 123 } })).toEqual({ profile: { city: 123 } })
})

test("JSON replacement can append to an empty tuple without reusing its empty schema", () => {
  const docs = Table.make("empty_tuple_docs", {
    payload: Postgres.Column.jsonb(Schema.Tuple([]))
  })
  const changed = docs.payload.pipe(Postgres.Jsonb.replace(Postgres.Jsonb.focus().index(0), 123))
  expect(decode(changed, [123])).toEqual([123])
})
