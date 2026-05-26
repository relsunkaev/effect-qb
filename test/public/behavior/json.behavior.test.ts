// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import * as StdRoot from "#standard"

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

const mutationSchema = Schema.Struct({
  profile: Schema.Struct({
    city: Schema.String
  })
})

const makeJsonTable = (_table: any) =>
  StdRoot.Table.make("docs", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    payload: StdRoot.Column.json(payloadSchema)
  })

const makeJsonbTable = (_table: typeof Postgres) =>
  StdRoot.Table.make("docs", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    payload: Postgres.Column.jsonb(payloadSchema)
  })

describe("json behavior", () => {
  const jsonDocId = "11111111-1111-1111-1111-111111111111"

  test("postgres renders the shared json surface for json columns", () => {
    const docs = makeJsonTable(Postgres)

    const exactPath = Postgres.Json.path(
      Postgres.Json.key("profile"),
      Postgres.Json.key("address"),
      Postgres.Json.key("city")
    )

    const plan = Postgres.Query.select({
      profileJson: Postgres.Json.get(docs.payload, Postgres.Json.key("profile")),
      profileText: Postgres.Json.text(docs.payload, Postgres.Json.key("profile")),
      cityJson: Postgres.Json.get(docs.payload, exactPath),
      cityText: Postgres.Json.text(docs.payload, exactPath),
      builtObject: Postgres.Json.buildObject({ a: 1, b: "x" }),
      builtArray: Postgres.Json.buildArray(1, "x", true),
      toJson: Postgres.Json.toJson(Postgres.Query.literal(1)),
      typeName: Postgres.Json.typeOf(docs.payload),
      length: Postgres.Json.length(docs.payload),
      keys: Postgres.Json.keys(docs.payload),
      stripNulls: Postgres.Json.stripNulls(docs.payload)
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("docs"."payload" -> $1) as "profileJson", ("docs"."payload" ->> $2) as "profileText", ("docs"."payload" #> array[$3, $4, $5]) as "cityJson", ("docs"."payload" #>> array[$6, $7, $8]) as "cityText", json_build_object($9, $10, $11, $12) as "builtObject", json_build_array($13, $14, true) as "builtArray", to_json($15) as "toJson", json_typeof("docs"."payload") as "typeName", (case when json_typeof("docs"."payload") = \'array\' then json_array_length("docs"."payload") when json_typeof("docs"."payload") = \'object\' then (select count(*)::int from json_object_keys("docs"."payload")) else null end) as "length", (case when json_typeof("docs"."payload") = \'object\' then to_json(array(select json_object_keys("docs"."payload"))) else null end) as "keys", json_strip_nulls("docs"."payload") as "stripNulls" from "docs"'
    )
    expect(rendered.params).toEqual([
      "profile",
      "profile",
      "profile",
      "address",
      "city",
      "profile",
      "address",
      "city",
      "a",
      1,
      "b",
      "x",
      1,
      "x",
      1
    ])
  })

  test("postgres shared json helpers still accept jsonb columns for exact paths", () => {
    const docs = makeJsonbTable(Postgres)

    const cityPath = Postgres.Json.path(
      Postgres.Json.key("profile"),
      Postgres.Json.key("address"),
      Postgres.Json.key("city")
    )

    const plan = Postgres.Query.select({
      cityJson: Postgres.Json.get(docs.payload, cityPath),
      cityText: Postgres.Json.text(docs.payload, cityPath),
      typeName: Postgres.Json.typeOf(docs.payload),
      stripNulls: Postgres.Json.stripNulls(docs.payload)
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("docs"."payload" #> array[$1, $2, $3]) as "cityJson", ("docs"."payload" #>> array[$4, $5, $6]) as "cityText", jsonb_typeof("docs"."payload") as "typeName", jsonb_strip_nulls("docs"."payload") as "stripNulls" from "docs"'
    )
    expect(rendered.params).toEqual([
      "profile",
      "address",
      "city",
      "profile",
      "address",
      "city"
    ])
  })

  test("json path predicate facts keep dotted key segments distinct", () => {
    const docs = StdRoot.Table.make("docs", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      payload: Postgres.Column.jsonb(Schema.Struct({
        "a.b": Schema.Struct({
          kind: Schema.Literal("flat", "other")
        }),
        a: Schema.Struct({
          b: Schema.Struct({
            kind: Schema.Literal("nested", "other")
          })
        })
      }))
    })
    const flatKind = Postgres.Jsonb.text(
      docs.payload,
      Postgres.Jsonb.path(
        Postgres.Jsonb.key("a.b"),
        Postgres.Jsonb.key("kind")
      )
    )

    const plan = Postgres.Query.select({
      payload: docs.payload
    }).pipe(
      Postgres.Query.from(docs),
      Postgres.Query.where(Postgres.Query.eq(flatKind, "flat"))
    )

    const rows = Effect.runSync(Postgres.Executor.make({
      driver: Postgres.Executor.driver("postgres", () => Effect.succeed([
        {
          payload: {
            "a.b": {
              kind: "flat"
            },
            a: {
              b: {
                kind: "nested"
              }
            }
          }
        }
      ]))
    }).execute(plan))

    expect(rows).toEqual([
      {
        payload: {
          "a.b": {
            kind: "flat"
          },
          a: {
            b: {
              kind: "nested"
            }
          }
        }
      }
    ])
  })

  test("postgres groups by jsonb text expressions", () => {
    const docs = makeJsonbTable(Postgres)
    const cityPath = Postgres.Jsonb.path(
      Postgres.Jsonb.key("profile"),
      Postgres.Jsonb.key("address"),
      Postgres.Jsonb.key("city")
    )
    const city = Postgres.Jsonb.text(docs.payload, cityPath)

    const plan = Postgres.Query.select({
      city,
      count: Postgres.Function.count(docs.id)
    }).pipe(
      Postgres.Query.from(docs),
      Postgres.Query.groupBy(city)
    )

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("docs"."payload" #>> array[$1, $2, $3]) as "city", count("docs"."id") as "count" from "docs" group by ("docs"."payload" #>> array[$4, $5, $6])'
    )
    expect(rendered.params).toEqual([
      "profile",
      "address",
      "city",
      "profile",
      "address",
      "city"
    ])
  })

  test("postgres binds direct json array indexes as numbers", () => {
    const docs = StdRoot.Table.make("docs", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      payload: Postgres.Column.jsonb(Schema.Array(Schema.String))
    })

    const plan = Postgres.Query.select({
      firstJson: Postgres.Jsonb.get(docs.payload, Postgres.Jsonb.index(0)),
      secondText: Postgres.Jsonb.text(docs.payload, Postgres.Jsonb.index(1)),
      withoutFirst: Postgres.Jsonb.delete(docs.payload, Postgres.Jsonb.index(0))
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("docs"."payload" -> $1) as "firstJson", ("docs"."payload" ->> $2) as "secondText", ("docs"."payload" - $3) as "withoutFirst" from "docs"'
    )
    expect(rendered.params).toEqual([
      0,
      1,
      0
    ])
  })

  test("postgres renders json keys as json values", () => {
    const docs = makeJsonTable(Postgres)

    const plan = Postgres.Query.select({
      keys: Postgres.Json.keys(docs.payload)
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select (case when json_typeof("docs"."payload") = \'object\' then to_json(array(select json_object_keys("docs"."payload"))) else null end) as "keys" from "docs"'
    )
    expect(rendered.params).toEqual([])
  })

  test("postgres renders the jsonb-only expression surface", () => {
    const docs = makeJsonbTable(Postgres)

    const exactPath = Postgres.Jsonb.path(
      Postgres.Jsonb.key("profile"),
      Postgres.Jsonb.key("address"),
      Postgres.Jsonb.key("city")
    )
    const wildcardPath = Postgres.Jsonb.path(
      Postgres.Jsonb.key("profile"),
      Postgres.Jsonb.key("tags"),
      Postgres.Jsonb.wildcard()
    )

    const plan = Postgres.Query.select({
      profileJson: Postgres.Jsonb.get(docs.payload, Postgres.Jsonb.key("profile")),
      profileText: Postgres.Jsonb.text(docs.payload, Postgres.Jsonb.key("profile")),
      cityJson: Postgres.Jsonb.get(docs.payload, exactPath),
      cityText: Postgres.Jsonb.text(docs.payload, exactPath),
      wildcardJson: Postgres.Jsonb.get(docs.payload, wildcardPath),
      hasProfile: Postgres.Jsonb.hasKey(docs.payload, "profile"),
      hasAny: Postgres.Jsonb.hasAnyKeys(docs.payload, "profile", "note"),
      hasAll: Postgres.Jsonb.hasAllKeys(docs.payload, "profile", "note"),
      contains: Postgres.Jsonb.contains(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      containedBy: Postgres.Jsonb.containedBy(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      deleteNote: Postgres.Jsonb.delete(docs.payload, Postgres.Jsonb.key("note")),
      removeNote: Postgres.Jsonb.remove(docs.payload, Postgres.Jsonb.key("note")),
      setPostcode: Postgres.Jsonb.set(
        docs.payload,
        Postgres.Jsonb.path(Postgres.Jsonb.key("profile"), Postgres.Jsonb.key("address"), Postgres.Jsonb.key("postcode")),
        "1000"
      ),
      insertSuite: Postgres.Jsonb.insert(
        docs.payload,
        Postgres.Jsonb.path(Postgres.Jsonb.key("profile"), Postgres.Jsonb.key("address"), Postgres.Jsonb.key("suite")),
        "12A"
      ),
      concatValue: Postgres.Jsonb.concat({ a: 1 }, { b: 2 }),
      mergeValue: Postgres.Jsonb.merge({ a: 1 }, { b: 2 }),
      builtObject: Postgres.Jsonb.buildObject({ a: 1, b: "x" }),
      builtArray: Postgres.Jsonb.buildArray(1, "x", true),
      toJsonb: Postgres.Jsonb.toJsonb(Postgres.Query.literal(1)),
      typeName: Postgres.Jsonb.typeOf(docs.payload),
      length: Postgres.Jsonb.length(docs.payload),
      keys: Postgres.Jsonb.keys(docs.payload),
      pathExists: Postgres.Jsonb.pathExists(docs.payload, wildcardPath),
      pathMatch: Postgres.Jsonb.pathMatch(docs.payload, '$.profile.address[*] ? (@.city == "Paris")'),
      stripNulls: Postgres.Jsonb.stripNulls(docs.payload)
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("docs"."payload" -> $1) as "profileJson", ("docs"."payload" ->> $2) as "profileText", ("docs"."payload" #> array[$3, $4, $5]) as "cityJson", ("docs"."payload" #>> array[$6, $7, $8]) as "cityText", jsonb_path_query_first("docs"."payload", $9) as "wildcardJson", ("docs"."payload" ? cast($10 as text)) as "hasProfile", ("docs"."payload" ?| array[cast($11 as text), cast($12 as text)]) as "hasAny", ("docs"."payload" ?& array[cast($13 as text), cast($14 as text)]) as "hasAll", ("docs"."payload" @> cast($15 as jsonb)) as "contains", ("docs"."payload" <@ cast($16 as jsonb)) as "containedBy", ("docs"."payload" - $17) as "deleteNote", ("docs"."payload" - $18) as "removeNote", jsonb_set("docs"."payload", array[$19, $20, $21], cast($22 as jsonb), true) as "setPostcode", jsonb_insert("docs"."payload", array[$23, $24, $25], cast($26 as jsonb), false) as "insertSuite", (cast($27 as jsonb) || cast($28 as jsonb)) as "concatValue", (cast($29 as jsonb) || cast($30 as jsonb)) as "mergeValue", jsonb_build_object($31, $32, $33, $34) as "builtObject", jsonb_build_array($35, $36, true) as "builtArray", to_jsonb($37) as "toJsonb", jsonb_typeof("docs"."payload") as "typeName", (case when jsonb_typeof("docs"."payload") = \'array\' then jsonb_array_length("docs"."payload") when jsonb_typeof("docs"."payload") = \'object\' then (select count(*)::int from jsonb_object_keys("docs"."payload")) else null end) as "length", (case when jsonb_typeof("docs"."payload") = \'object\' then to_json(array(select jsonb_object_keys("docs"."payload"))) else null end) as "keys", ("docs"."payload" @? $38) as "pathExists", ("docs"."payload" @@ $39) as "pathMatch", jsonb_strip_nulls("docs"."payload") as "stripNulls" from "docs"'
    )
    expect(rendered.params).toEqual([
      "profile",
      "profile",
      "profile",
      "address",
      "city",
      "profile",
      "address",
      "city",
      "$.profile.tags[*]",
      "profile",
      "profile",
      "note",
      "profile",
      "note",
      {
        profile: {
          address: {
            city: "Paris"
          }
        }
      },
      {
        profile: {
          address: {
            city: "Paris"
          }
        }
      },
      "note",
      "note",
      "profile",
      "address",
      "postcode",
      "1000",
      "profile",
      "address",
      "suite",
      "12A",
      {
        a: 1
      },
      {
        b: 2
      },
      {
        a: 1
      },
      {
        b: 2
      },
      "a",
      1,
      "b",
      "x",
      1,
      "x",
      1,
      "$.profile.tags[*]",
      "$.profile.address[*] ? (@.city == \"Paris\")"
    ])
  })

  test("postgres reuses the same jsonb path object across read and write operators", () => {
    const docs = makeJsonbTable(Postgres)

    const cityPath = Postgres.Jsonb.path(
      Postgres.Jsonb.key("profile"),
      Postgres.Jsonb.key("address"),
      Postgres.Jsonb.key("city")
    )

    const plan = Postgres.Query.select({
      cityJson: Postgres.Jsonb.get(docs.payload, cityPath),
      cityText: Postgres.Jsonb.text(docs.payload, cityPath),
      setCity: Postgres.Jsonb.set(docs.payload, cityPath, "Paris"),
      deleteCity: Postgres.Jsonb.delete(docs.payload, cityPath)
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("docs"."payload" #> array[$1, $2, $3]) as "cityJson", ("docs"."payload" #>> array[$4, $5, $6]) as "cityText", jsonb_set("docs"."payload", array[$7, $8, $9], cast($10 as jsonb), true) as "setCity", ("docs"."payload" #- array[$11, $12, $13]) as "deleteCity" from "docs"'
    )
    expect(rendered.params).toEqual([
      "profile",
      "address",
      "city",
      "profile",
      "address",
      "city",
      "profile",
      "address",
      "city",
      "Paris",
      "profile",
      "address",
      "city"
    ])
  })

  test("postgres escapes control characters in rendered json path keys", () => {
    const docs = makeJsonbTable(Postgres)
    const controlPath = Postgres.Jsonb.path(
      Postgres.Jsonb.key("line\nbreak"),
      Postgres.Jsonb.key("tab\tkey")
    )

    const plan = Postgres.Query.select({
      exists: Postgres.Jsonb.pathExists(docs.payload, controlPath)
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("docs"."payload" @? $1) as "exists" from "docs"'
    )
    expect(rendered.params).toEqual([
      '$."line\\nbreak"."tab\\tkey"'
    ])
  })

  test("postgres renders jsonb set without creating missing keys", () => {
    const docs = makeJsonbTable(Postgres)

    const suitePath = Postgres.Jsonb.path(
      Postgres.Jsonb.key("profile"),
      Postgres.Jsonb.key("address"),
      Postgres.Jsonb.key("suite")
    )

    const plan = Postgres.Query.select({
      setSuite: Postgres.Jsonb.set(docs.payload, suitePath, "12A", {
        createMissing: false
      })
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select jsonb_set("docs"."payload", array[$1, $2, $3], cast($4 as jsonb), false) as "setSuite" from "docs"'
    )
    expect(rendered.params).toEqual([
      "profile",
      "address",
      "suite",
      "12A"
    ])
  })

  test("postgres preserves jsonb helper string scalars that look like JSON", () => {
    const docs = makeJsonbTable(Postgres)
    const suitePath = Postgres.Jsonb.path(
      Postgres.Jsonb.key("profile"),
      Postgres.Jsonb.key("address"),
      Postgres.Jsonb.key("suite")
    )

    const plan = Postgres.Query.select({
      setSuite: Postgres.Jsonb.set(docs.payload, suitePath, "42"),
      builtObject: Postgres.Jsonb.buildObject({ code: "42" })
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.params).toEqual([
      "profile",
      "address",
      "suite",
      "42",
      "code",
      "42"
    ])
  })

  test("mysql rejects unsupported json path match", () => {
    const docs = makeJsonTable(Mysql)

    const plan = Mysql.Query.select({
      pathMatch: Mysql.Json.pathMatch(docs.payload, '$.profile.address[*] ? (@.city == "Paris")')
    }).pipe(Mysql.Query.from(docs))

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported JSON feature for mysql: jsonPathMatch"
    )
  })

  test("mysql renders the JSON expression surface it supports", () => {
    const docs = makeJsonTable(Mysql)

    const exactPath = Mysql.Json.path(
      Mysql.Json.key("profile"),
      Mysql.Json.key("address"),
      Mysql.Json.key("city")
    )
    const wildcardPath = Mysql.Json.path(
      Mysql.Json.key("profile"),
      Mysql.Json.key("tags"),
      Mysql.Json.wildcard()
    )

    const plan = Mysql.Query.select({
      profileJson: Mysql.Json.get(docs.payload, Mysql.Json.key("profile")),
      profileText: Mysql.Json.text(docs.payload, Mysql.Json.key("profile")),
      cityJson: Mysql.Json.get(docs.payload, exactPath),
      cityText: Mysql.Json.text(docs.payload, exactPath),
      wildcardJson: Mysql.Json.get(docs.payload, wildcardPath),
      hasProfile: Mysql.Json.hasKey(docs.payload, "profile"),
      hasAny: Mysql.Json.hasAnyKeys(docs.payload, "profile", "note"),
      hasAll: Mysql.Json.hasAllKeys(docs.payload, "profile", "note"),
      contains: Mysql.Json.contains(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      containedBy: Mysql.Json.containedBy(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      deleteNote: Mysql.Json.delete(docs.payload, Mysql.Json.key("note")),
      removeNote: Mysql.Json.remove(docs.payload, Mysql.Json.key("note")),
      setPostcode: Mysql.Json.set(
        docs.payload,
        Mysql.Json.path(Mysql.Json.key("profile"), Mysql.Json.key("address"), Mysql.Json.key("postcode")),
        "1000"
      ),
      insertSuite: Mysql.Json.insert(
        docs.payload,
        Mysql.Json.path(Mysql.Json.key("profile"), Mysql.Json.key("address"), Mysql.Json.key("suite")),
        "12A"
      ),
      concatValue: Mysql.Json.concat({ a: 1 }, { b: 2 }),
      mergeValue: Mysql.Json.merge({ a: 1 }, { b: 2 }),
      builtObject: Mysql.Json.buildObject({ a: 1, b: "x" }),
      builtArray: Mysql.Json.buildArray(1, "x", true),
      toJson: Mysql.Json.toJson(Mysql.Query.literal(1)),
      toJsonb: Mysql.Json.toJsonb(Mysql.Query.literal(1)),
      typeName: Mysql.Json.typeOf(docs.payload),
      length: Mysql.Json.length(docs.payload),
      keys: Mysql.Json.keys(docs.payload),
      pathExists: Mysql.Json.pathExists(docs.payload, wildcardPath)
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select json_extract(`docs`.`payload`, ?) as `profileJson`, json_unquote(json_extract(`docs`.`payload`, ?)) as `profileText`, json_extract(`docs`.`payload`, ?) as `cityJson`, json_unquote(json_extract(`docs`.`payload`, ?)) as `cityText`, json_extract(`docs`.`payload`, ?) as `wildcardJson`, json_contains_path(`docs`.`payload`, ?, ?) as `hasProfile`, json_contains_path(`docs`.`payload`, ?, ?, ?) as `hasAny`, json_contains_path(`docs`.`payload`, ?, ?, ?) as `hasAll`, json_contains(`docs`.`payload`, cast(? as json)) as `contains`, json_contains(cast(? as json), `docs`.`payload`) as `containedBy`, json_remove(`docs`.`payload`, ?) as `deleteNote`, json_remove(`docs`.`payload`, ?) as `removeNote`, json_set(`docs`.`payload`, ?, ?) as `setPostcode`, json_insert(`docs`.`payload`, ?, ?) as `insertSuite`, json_merge_preserve(cast(? as json), cast(? as json)) as `concatValue`, json_merge_preserve(cast(? as json), cast(? as json)) as `mergeValue`, json_object(?, ?, ?, ?) as `builtObject`, json_array(?, ?, true) as `builtArray`, cast(? as json) as `toJson`, cast(? as json) as `toJsonb`, json_type(`docs`.`payload`) as `typeName`, json_length(`docs`.`payload`) as `length`, json_keys(`docs`.`payload`) as `keys`, json_contains_path(`docs`.`payload`, ?, ?) as `pathExists` from `docs`"
    )
    expect(rendered.params).toEqual([
      "$.profile",
      "$.profile",
      "$.profile.address.city",
      "$.profile.address.city",
      "$.profile.tags[*]",
      "one",
      "$.profile",
      "one",
      "$.profile",
      "$.note",
      "all",
      "$.profile",
      "$.note",
      JSON.stringify({ profile: { address: { city: "Paris" } } }),
      JSON.stringify({ profile: { address: { city: "Paris" } } }),
      "$.note",
      "$.note",
      "$.profile.address.postcode",
      "1000",
      "$.profile.address.suite",
      "12A",
      JSON.stringify({ a: 1 }),
      JSON.stringify({ b: 2 }),
      JSON.stringify({ a: 1 }),
      JSON.stringify({ b: 2 }),
      "a",
      1,
      "b",
      "x",
      1,
      "x",
      1,
      1,
      "one",
      "$.profile.tags[*]"
    ])
  })

  test("mysql reuses the same JSON path object across read and write operators", () => {
    const docs = makeJsonTable(Mysql)

    const cityPath = Mysql.Json.path(
      Mysql.Json.key("profile"),
      Mysql.Json.key("address"),
      Mysql.Json.key("city")
    )

    const plan = Mysql.Query.select({
      cityJson: Mysql.Json.get(docs.payload, cityPath),
      cityText: Mysql.Json.text(docs.payload, cityPath),
      setCity: Mysql.Json.set(docs.payload, cityPath, "Paris"),
      deleteCity: Mysql.Json.delete(docs.payload, cityPath)
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select json_extract(`docs`.`payload`, ?) as `cityJson`, json_unquote(json_extract(`docs`.`payload`, ?)) as `cityText`, json_set(`docs`.`payload`, ?, ?) as `setCity`, json_remove(`docs`.`payload`, ?) as `deleteCity` from `docs`"
    )
    expect(rendered.params).toEqual([
      "$.profile.address.city",
      "$.profile.address.city",
      "$.profile.address.city",
      "Paris",
      "$.profile.address.city"
    ])
  })

  test("mysql renders nested JSON value arguments as JSON instead of raw driver objects", () => {
    const docs = makeJsonTable(Mysql)

    const rendered = Mysql.Renderer.make().render(Mysql.Query.select({
      built: Mysql.Json.buildObject({
        nested: { ok: true },
        tags: ["mysql"]
      }),
      patched: Mysql.Json.set(
        docs.payload,
        Mysql.Json.path(Mysql.Json.key("nested")),
        { ok: true }
      )
    }).pipe(Mysql.Query.from(docs)))

    expect(rendered.sql).toBe(
      "select json_object(?, cast(? as json), ?, cast(? as json)) as `built`, json_set(`docs`.`payload`, ?, cast(? as json)) as `patched` from `docs`"
    )
    expect(rendered.params).toEqual([
      "nested",
      JSON.stringify({ ok: true }),
      "tags",
      JSON.stringify(["mysql"]),
      "$.nested",
      JSON.stringify({ ok: true })
    ])
  })

  test("mysql escapes control characters in rendered json path keys", () => {
    const docs = makeJsonTable(Mysql)
    const controlPath = Mysql.Json.path(
      Mysql.Json.key("line\nbreak"),
      Mysql.Json.key("tab\tkey")
    )

    const plan = Mysql.Query.select({
      value: Mysql.Json.get(docs.payload, controlPath)
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select json_extract(`docs`.`payload`, ?) as `value` from `docs`"
    )
    expect(rendered.params).toEqual([
      '$."line\\nbreak"."tab\\tkey"'
    ])
  })

  test("mysql renders json set without creating missing keys", () => {
    const docs = makeJsonTable(Mysql)

    const suitePath = Mysql.Json.path(
      Mysql.Json.key("profile"),
      Mysql.Json.key("address"),
      Mysql.Json.key("suite")
    )

    const plan = Mysql.Query.select({
      setSuite: Mysql.Json.set(docs.payload, suitePath, "12A", {
        createMissing: false
      })
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select json_replace(`docs`.`payload`, ?, ?) as `setSuite` from `docs`"
    )
    expect(rendered.params).toEqual([
      "$.profile.address.suite",
      "12A"
    ])
  })

  test("mysql preserves json helper string scalars that look like JSON", () => {
    const docs = makeJsonTable(Mysql)

    const suitePath = Mysql.Json.path(
      Mysql.Json.key("profile"),
      Mysql.Json.key("address"),
      Mysql.Json.key("suite")
    )

    const plan = Mysql.Query.select({
      setSuite: Mysql.Json.set(docs.payload, suitePath, "42"),
      builtObject: Mysql.Json.buildObject({ code: "42" })
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.params).toEqual([
      "$.profile.address.suite",
      "42",
      "code",
      "42"
    ])
  })

  test("mysql renders array json insert paths with the array insert operator", () => {
    const docs = makeJsonTable(Mysql)

    const firstTagPath = Mysql.Json.path(
      Mysql.Json.key("profile"),
      Mysql.Json.key("tags"),
      Mysql.Json.index(1)
    )

    const plan = Mysql.Query.select({
      insertTag: Mysql.Json.insert(docs.payload, firstTagPath, "city"),
      insertTagAfter: Mysql.Json.insert(docs.payload, firstTagPath, "country", {
        insertAfter: true
      })
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select json_array_insert(`docs`.`payload`, ?, ?) as `insertTag`, json_array_insert(`docs`.`payload`, ?, ?) as `insertTagAfter` from `docs`"
    )
    expect(rendered.params).toEqual([
      "$.profile.tags[1]",
      "city",
      "$.profile.tags[2]",
      "country"
    ])
  })

  test("mysql renders negative json array indexes with last-relative syntax", () => {
    const docs = makeJsonTable(Mysql)

    const lastTagPath = Mysql.Json.path(
      Mysql.Json.key("profile"),
      Mysql.Json.key("tags"),
      Mysql.Json.index(-1)
    )
    const penultimateTagPath = Mysql.Json.path(
      Mysql.Json.key("profile"),
      Mysql.Json.key("tags"),
      Mysql.Json.index(-2)
    )

    const plan = Mysql.Query.select({
      lastTag: Mysql.Json.get(docs.payload, lastTagPath),
      penultimateTag: Mysql.Json.get(docs.payload, penultimateTagPath)
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select json_extract(`docs`.`payload`, ?) as `lastTag`, json_extract(`docs`.`payload`, ?) as `penultimateTag` from `docs`"
    )
    expect(rendered.params).toEqual([
      "$.profile.tags[last]",
      "$.profile.tags[last-1]"
    ])
  })

  test("mysql renders negative json array slices with last-relative syntax", () => {
    const docs = makeJsonTable(Mysql)

    const recentTagsPath = Mysql.Json.path(
      Mysql.Json.key("profile"),
      Mysql.Json.key("tags"),
      Mysql.Json.slice(-3, -1)
    )

    const plan = Mysql.Query.select({
      recentTags: Mysql.Json.get(docs.payload, recentTagsPath)
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select json_extract(`docs`.`payload`, ?) as `recentTags` from `docs`"
    )
    expect(rendered.params).toEqual([
      "$.profile.tags[last-2 to last]"
    ])
  })

  test("mysql renders recursive json path descent without a leading dot", () => {
    const docs = makeJsonTable(Mysql)

    const cityDescendPath = Mysql.Json.path(
      Mysql.Json.descend(),
      Mysql.Json.key("city")
    )

    const plan = Mysql.Query.select({
      cityValues: Mysql.Json.get(docs.payload, cityDescendPath)
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select json_extract(`docs`.`payload`, ?) as `cityValues` from `docs`"
    )
    expect(rendered.params).toEqual([
      "$**.city"
    ])
  })

  test("mysql preserves nested json delete paths as one path argument", () => {
    const docs = makeJsonTable(Mysql)
    const cityPath = Mysql.Json.path(
      Mysql.Json.key("profile"),
      Mysql.Json.key("address"),
      Mysql.Json.key("city")
    )

    const plan = Mysql.Query.select({
      deleteCity: Mysql.Json.delete(docs.payload, cityPath)
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select json_remove(`docs`.`payload`, ?) as `deleteCity` from `docs`"
    )
    expect(rendered.params).toEqual([
      "$.profile.address.city"
    ])
  })

  test("mysql rejects non-exact json mutation paths before rendering SQL", () => {
    const docs = makeJsonTable(Mysql)
    const wildcardPath = Mysql.Json.path(
      Mysql.Json.key("profile"),
      Mysql.Json.key("tags"),
      Mysql.Json.wildcard()
    )

    const deleteWildcard = Mysql.Json.delete(docs.payload as any, wildcardPath as any)
    const setWildcard = Mysql.Json.set(docs.payload as any, wildcardPath as any, "featured" as any)
    const insertWildcard = Mysql.Json.insert(docs.payload as any, wildcardPath as any, "featured" as any)

    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.select({ deleteWildcard }).pipe(Mysql.Query.from(docs)))
    ).toThrow("MySQL JSON mutation paths require key/index segments")
    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.select({ setWildcard }).pipe(Mysql.Query.from(docs)))
    ).toThrow("MySQL JSON mutation paths require key/index segments")
    expect(() =>
      Mysql.Renderer.make().render(Mysql.Query.select({ insertWildcard }).pipe(Mysql.Query.from(docs)))
    ).toThrow("MySQL JSON mutation paths require key/index segments")
  })

  test("mysql binds json_contains_path mode before path arguments", () => {
    const docs = makeJsonTable(Mysql)

    const plan = Mysql.Query.select({
      hasProfile: Mysql.Json.hasKey(docs.payload, "profile"),
      hasAny: Mysql.Json.hasAnyKeys(docs.payload, "profile", "note"),
      hasAll: Mysql.Json.hasAllKeys(docs.payload, "profile", "note")
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select json_contains_path(`docs`.`payload`, ?, ?) as `hasProfile`, json_contains_path(`docs`.`payload`, ?, ?, ?) as `hasAny`, json_contains_path(`docs`.`payload`, ?, ?, ?) as `hasAll` from `docs`"
    )
    expect(rendered.params).toEqual([
      "one",
      "$.profile",
      "one",
      "$.profile",
      "$.note",
      "all",
      "$.profile",
      "$.note"
    ])
  })

  test("mysql renders dialect-specific json path objects for path exists", () => {
    const docs = makeJsonTable(Mysql)

    const lastTagPath = Mysql.Json.path(
      Mysql.Json.key("profile"),
      Mysql.Json.key("tags"),
      Mysql.Json.index(-1)
    )
    const cityDescendPath = Mysql.Json.path(
      Mysql.Json.descend(),
      Mysql.Json.key("city")
    )

    const plan = Mysql.Query.select({
      hasLastTag: Mysql.Json.pathExists(docs.payload, lastTagPath),
      hasAnyCity: Mysql.Json.pathExists(docs.payload, cityDescendPath)
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select json_contains_path(`docs`.`payload`, ?, ?) as `hasLastTag`, json_contains_path(`docs`.`payload`, ?, ?) as `hasAnyCity` from `docs`"
    )
    expect(rendered.params).toEqual([
      "one",
      "$.profile.tags[last]",
      "one",
      "$**.city"
    ])
  })

  test("postgres renders json and jsonb mutations with separate helper surfaces", () => {
    const docsJson = StdRoot.Table.make("docs_json", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      payload: StdRoot.Column.json(mutationSchema)
    })
    const docsJsonb = StdRoot.Table.make("docs_jsonb", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      payload: Postgres.Column.jsonb(mutationSchema)
    })

    const insertPlan = Postgres.Query.insert(docsJson, {
      id: jsonDocId,
      payload: Postgres.Json.buildObject({
        profile: {
          city: "Paris"
        }
      })
    })

    const updatePlan = Postgres.Query.update(docsJsonb, {
      payload: Postgres.Jsonb.merge(
        docsJsonb.payload,
        Postgres.Jsonb.buildObject({
          profile: {
            city: "Paris"
          }
        })
      )
    })

    const insert = Postgres.Renderer.make().render(insertPlan)
    expect(insert.sql).toBe(
      'insert into "docs_json" ("id", "payload") values ($1, json_build_object($2, $3))'
    )
    expect(insert.params).toEqual([
      jsonDocId,
      "profile",
      {
        city: "Paris"
      }
    ])

    const update = Postgres.Renderer.make().render(updatePlan)
    expect(update.sql).toBe(
      'update "docs_jsonb" set "payload" = ("docs_jsonb"."payload" || jsonb_build_object($1, $2))'
    )
    expect(update.params).toEqual([
      "profile",
      {
        city: "Paris"
      }
    ])
  })

  test("mysql keeps a single json mutation surface", () => {
    const docs = StdRoot.Table.make("docs", {
      id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
      payload: StdRoot.Column.json(mutationSchema)
    })

    const insertPlan = Mysql.Query.insert(docs, {
      id: jsonDocId,
      payload: Mysql.Json.buildObject({
        profile: {
          city: "Paris"
        }
      })
    })

    const updatePlan = Mysql.Query.update(docs, {
      payload: Mysql.Json.merge(
        docs.payload,
        Mysql.Json.buildObject({
          profile: {
            city: "Paris"
          }
        })
      )
    })

    const insert = Mysql.Renderer.make().render(insertPlan)
    expect(insert.sql).toBe(
      "insert into `docs` (`id`, `payload`) values (?, json_object(?, cast(? as json)))"
    )
    expect(insert.params).toEqual([
      jsonDocId,
      "profile",
      JSON.stringify({ city: "Paris" })
    ])

    const update = Mysql.Renderer.make().render(updatePlan)
    expect(update.sql).toBe(
      "update `docs` set `payload` = json_merge_preserve(`docs`.`payload`, json_object(?, cast(? as json)))"
    )
    expect(update.params).toEqual([
      "profile",
      JSON.stringify({ city: "Paris" })
    ])
  })
})
