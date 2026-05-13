// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import { expressionRuntimeSchema } from "#internal/runtime/schema.ts"
import * as Postgres from "#postgres"

const schemaOf = (expression: unknown): Schema.Top => {
  const schema = expressionRuntimeSchema(expression as never)
  expect(schema).toBeDefined()
  return schema!
}

const decode = (expression: unknown, value: unknown): unknown =>
  Schema.decodeUnknownSync(schemaOf(expression))(value)

describe("runtime schema inference", () => {
  test("narrows exact JSON object paths and preserves refined leaves", () => {
    const docs = Postgres.Table.make("schema_docs", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      payload: Postgres.Column.jsonb(Schema.Struct({
        profile: Schema.Struct({
          city: Schema.String.check(Schema.isMaxLength(5))
        })
      }))
    })

    const city = Postgres.Json.jsonb.get(
      docs.payload,
      Postgres.Json.jsonb.path(
        Postgres.Json.jsonb.key("profile"),
        Postgres.Json.jsonb.key("city")
      )
    )

    expect(decode(city, "Paris")).toBe("Paris")
    expect(() => decode(city, "Phoenix")).toThrow()
  })

  test("narrows exact JSON tuple indexes and preserves transformations", () => {
    const docs = Postgres.Table.make("schema_tuple_docs", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      payload: Postgres.Column.jsonb(Schema.Struct({
        tags: Schema.Tuple([Schema.String, Schema.NumberFromString])
      }))
    })

    const secondTag = Postgres.Json.jsonb.get(
      docs.payload,
      Postgres.Json.jsonb.path(
        Postgres.Json.jsonb.key("tags"),
        Postgres.Json.jsonb.index(1)
      )
    )

    expect(decode(secondTag, "42")).toBe(42)
  })

  test("narrows JSON paths through unions", () => {
    const docs = Postgres.Table.make("schema_union_docs", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
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

    const kind = Postgres.Json.jsonb.get(
      docs.payload,
      Postgres.Json.jsonb.key("kind")
    )

    expect(decode(kind, "signup")).toBe("signup")
    expect(decode(kind, "purchase")).toBe("purchase")
    expect(() => decode(kind, "refund")).toThrow()
  })

  test("handles optional JSON properties and falls back for missing paths", () => {
    const docs = Postgres.Table.make("schema_optional_docs", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      payload: Postgres.Column.jsonb(Schema.Struct({
        profile: Schema.Struct({
          nickname: Schema.optional(Schema.String.check(Schema.isMaxLength(4)))
        })
      }))
    })

    const nickname = Postgres.Json.jsonb.get(
      docs.payload,
      Postgres.Json.jsonb.path(
        Postgres.Json.jsonb.key("profile"),
        Postgres.Json.jsonb.key("nickname")
      )
    )
    const missing = Postgres.Json.jsonb.get(
      docs.payload,
      Postgres.Json.jsonb.path(
        Postgres.Json.jsonb.key("profile"),
        Postgres.Json.jsonb.key("unknown")
      )
    )

    expect(decode(nickname, "Rami")).toBe("Rami")
    expect(() => decode(nickname, "Ramazan")).toThrow()
    expect(decode(missing, { arbitrary: [1, true, null] })).toEqual({
      arbitrary: [1, true, null]
    })
  })

  test("falls back to JSON value schemas for wildcard paths", () => {
    const docs = Postgres.Table.make("schema_wildcard_docs", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      payload: Postgres.Column.jsonb(Schema.Struct({
        tags: Schema.Tuple([Schema.String, Schema.NumberFromString])
      }))
    })

    const exactSecondTag = Postgres.Json.jsonb.get(
      docs.payload,
      Postgres.Json.jsonb.path(
        Postgres.Json.jsonb.key("tags"),
        Postgres.Json.jsonb.index(1)
      )
    )
    const wildcardTags = Postgres.Json.jsonb.get(
      docs.payload,
      Postgres.Json.jsonb.path(
        Postgres.Json.jsonb.key("tags"),
        Postgres.Json.jsonb.wildcard()
      )
    )

    expect(decode(exactSecondTag, "42")).toBe(42)
    expect(decode(wildcardTags, "42")).toBe("42")
    expect(decode(wildcardTags, ["a", 1, true])).toEqual(["a", 1, true])
  })

  test("keeps JSON-compatible toJson schemas and falls back for non-JSON schemas", () => {
    const docs = Postgres.Table.make("schema_to_json_docs", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      shortCode: Postgres.Column.text().pipe(
        Postgres.Column.schema(Schema.String.check(Schema.isMaxLength(3)))
      ),
      payloadBytes: Postgres.Column.bytea()
    })

    const shortCodeJson = Postgres.Json.json.toJson(docs.shortCode)
    const bytesJson = Postgres.Json.json.toJson(docs.payloadBytes)

    expect(decode(shortCodeJson, "abc")).toBe("abc")
    expect(() => decode(shortCodeJson, "abcd")).toThrow()
    expect(decode(bytesJson, "AQID")).toBe("AQID")
    expect(() => decode(bytesJson, new Uint8Array([1, 2, 3]))).toThrow()
  })
})
