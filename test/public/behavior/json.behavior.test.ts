// @ts-nocheck
import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import * as Mysql from "#mysql"
import * as Postgres from "#postgres"

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

const makeJsonTable = (table: any) =>
  table.Table.make("docs", {
    id: table.Column.uuid().pipe(table.Column.primaryKey),
    payload: table.Column.json(payloadSchema)
  })

const makeJsonbTable = (table: typeof Postgres) =>
  table.Table.make("docs", {
    id: table.Column.uuid().pipe(table.Column.primaryKey),
    payload: table.Column.jsonb(payloadSchema)
  })

describe("json behavior", () => {
  test("postgres renders the shared json surface for json columns", () => {
    const docs = makeJsonTable(Postgres)

    const exactPath = Postgres.Json.json.path(
      Postgres.Json.json.key("profile"),
      Postgres.Json.json.key("address"),
      Postgres.Json.json.key("city")
    )

    const plan = Postgres.Query.select({
      profileJson: Postgres.Json.json.get(docs.payload, Postgres.Json.json.key("profile")),
      profileText: Postgres.Json.json.text(docs.payload, Postgres.Json.json.key("profile")),
      cityJson: Postgres.Json.json.get(docs.payload, exactPath),
      cityText: Postgres.Json.json.text(docs.payload, exactPath),
      builtObject: Postgres.Json.json.buildObject({ a: 1, b: "x" }),
      builtArray: Postgres.Json.json.buildArray(1, "x", true),
      toJson: Postgres.Json.json.toJson(Postgres.Query.literal(1)),
      typeName: Postgres.Json.json.typeOf(docs.payload),
      length: Postgres.Json.json.length(docs.payload),
      keys: Postgres.Json.json.keys(docs.payload),
      stripNulls: Postgres.Json.json.stripNulls(docs.payload)
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("docs"."payload" -> $1) as "profileJson", ("docs"."payload" ->> $2) as "profileText", ("docs"."payload" #> array[$3, $4, $5]) as "cityJson", ("docs"."payload" #>> array[$6, $7, $8]) as "cityText", json_build_object($9, $10, $11, $12) as "builtObject", json_build_array($13, $14, true) as "builtArray", to_json($15) as "toJson", json_typeof("docs"."payload") as "typeName", (case when json_typeof("docs"."payload") = \'array\' then json_array_length("docs"."payload") when json_typeof("docs"."payload") = \'object\' then (select count(*)::int from json_object_keys("docs"."payload")) else null end) as "length", (case when json_typeof("docs"."payload") = \'object\' then array(select json_object_keys("docs"."payload")) else null end) as "keys", json_strip_nulls("docs"."payload") as "stripNulls" from "public"."docs"'
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

    const cityPath = Postgres.Json.json.path(
      Postgres.Json.json.key("profile"),
      Postgres.Json.json.key("address"),
      Postgres.Json.json.key("city")
    )

    const plan = Postgres.Query.select({
      cityJson: Postgres.Json.json.get(docs.payload, cityPath),
      cityText: Postgres.Json.json.text(docs.payload, cityPath),
      typeName: Postgres.Json.json.typeOf(docs.payload),
      stripNulls: Postgres.Json.json.stripNulls(docs.payload)
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("docs"."payload" #> array[$1, $2, $3]) as "cityJson", ("docs"."payload" #>> array[$4, $5, $6]) as "cityText", jsonb_typeof("docs"."payload") as "typeName", jsonb_strip_nulls("docs"."payload") as "stripNulls" from "public"."docs"'
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

  test("postgres renders the jsonb-only expression surface", () => {
    const docs = makeJsonbTable(Postgres)

    const exactPath = Postgres.Json.jsonb.path(
      Postgres.Json.jsonb.key("profile"),
      Postgres.Json.jsonb.key("address"),
      Postgres.Json.jsonb.key("city")
    )
    const wildcardPath = Postgres.Json.jsonb.path(
      Postgres.Json.jsonb.key("profile"),
      Postgres.Json.jsonb.key("tags"),
      Postgres.Json.jsonb.wildcard()
    )

    const plan = Postgres.Query.select({
      profileJson: Postgres.Json.jsonb.get(docs.payload, Postgres.Json.jsonb.key("profile")),
      profileText: Postgres.Json.jsonb.text(docs.payload, Postgres.Json.jsonb.key("profile")),
      cityJson: Postgres.Json.jsonb.get(docs.payload, exactPath),
      cityText: Postgres.Json.jsonb.text(docs.payload, exactPath),
      wildcardJson: Postgres.Json.jsonb.get(docs.payload, wildcardPath),
      hasProfile: Postgres.Json.jsonb.hasKey(docs.payload, "profile"),
      hasAny: Postgres.Json.jsonb.hasAnyKeys(docs.payload, "profile", "note"),
      hasAll: Postgres.Json.jsonb.hasAllKeys(docs.payload, "profile", "note"),
      contains: Postgres.Json.jsonb.contains(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      containedBy: Postgres.Json.jsonb.containedBy(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      deleteNote: Postgres.Json.jsonb.delete(docs.payload, Postgres.Json.jsonb.key("note")),
      removeNote: Postgres.Json.jsonb.remove(docs.payload, Postgres.Json.jsonb.key("note")),
      setPostcode: Postgres.Json.jsonb.set(
        docs.payload,
        Postgres.Json.jsonb.path(Postgres.Json.jsonb.key("profile"), Postgres.Json.jsonb.key("address"), Postgres.Json.jsonb.key("postcode")),
        "1000"
      ),
      insertSuite: Postgres.Json.jsonb.insert(
        docs.payload,
        Postgres.Json.jsonb.path(Postgres.Json.jsonb.key("profile"), Postgres.Json.jsonb.key("address"), Postgres.Json.jsonb.key("suite")),
        "12A"
      ),
      concatValue: Postgres.Json.jsonb.concat({ a: 1 }, { b: 2 }),
      mergeValue: Postgres.Json.jsonb.merge({ a: 1 }, { b: 2 }),
      builtObject: Postgres.Json.jsonb.buildObject({ a: 1, b: "x" }),
      builtArray: Postgres.Json.jsonb.buildArray(1, "x", true),
      toJsonb: Postgres.Json.jsonb.toJsonb(Postgres.Query.literal(1)),
      typeName: Postgres.Json.jsonb.typeOf(docs.payload),
      length: Postgres.Json.jsonb.length(docs.payload),
      keys: Postgres.Json.jsonb.keys(docs.payload),
      pathExists: Postgres.Json.jsonb.pathExists(docs.payload, wildcardPath),
      pathMatch: Postgres.Json.jsonb.pathMatch(docs.payload, '$.profile.address[*] ? (@.city == "Paris")'),
      stripNulls: Postgres.Json.jsonb.stripNulls(docs.payload)
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("docs"."payload" -> $1) as "profileJson", ("docs"."payload" ->> $2) as "profileText", ("docs"."payload" #> array[$3, $4, $5]) as "cityJson", ("docs"."payload" #>> array[$6, $7, $8]) as "cityText", jsonb_path_query_first("docs"."payload", $9) as "wildcardJson", ("docs"."payload" ? cast($10 as text)) as "hasProfile", ("docs"."payload" ?| array[cast($11 as text), cast($12 as text)]) as "hasAny", ("docs"."payload" ?& array[cast($13 as text), cast($14 as text)]) as "hasAll", ("docs"."payload" @> cast($15 as jsonb)) as "contains", ("docs"."payload" <@ cast($16 as jsonb)) as "containedBy", ("docs"."payload" - $17) as "deleteNote", ("docs"."payload" - $18) as "removeNote", jsonb_set("docs"."payload", array[$19, $20, $21], cast($22 as jsonb), true) as "setPostcode", jsonb_insert("docs"."payload", array[$23, $24, $25], cast($26 as jsonb), false) as "insertSuite", (cast($27 as jsonb) || cast($28 as jsonb)) as "concatValue", (cast($29 as jsonb) || cast($30 as jsonb)) as "mergeValue", jsonb_build_object($31, $32, $33, $34) as "builtObject", jsonb_build_array($35, $36, true) as "builtArray", to_jsonb($37) as "toJsonb", jsonb_typeof("docs"."payload") as "typeName", (case when jsonb_typeof("docs"."payload") = \'array\' then jsonb_array_length("docs"."payload") when jsonb_typeof("docs"."payload") = \'object\' then (select count(*)::int from jsonb_object_keys("docs"."payload")) else null end) as "length", (case when jsonb_typeof("docs"."payload") = \'object\' then array(select jsonb_object_keys("docs"."payload")) else null end) as "keys", ("docs"."payload" @? $38) as "pathExists", ("docs"."payload" @@ $39) as "pathMatch", jsonb_strip_nulls("docs"."payload") as "stripNulls" from "public"."docs"'
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

    const cityPath = Postgres.Json.jsonb.path(
      Postgres.Json.jsonb.key("profile"),
      Postgres.Json.jsonb.key("address"),
      Postgres.Json.jsonb.key("city")
    )

    const plan = Postgres.Query.select({
      cityJson: Postgres.Json.jsonb.get(docs.payload, cityPath),
      cityText: Postgres.Json.jsonb.text(docs.payload, cityPath),
      setCity: Postgres.Json.jsonb.set(docs.payload, cityPath, "Paris"),
      deleteCity: Postgres.Json.jsonb.delete(docs.payload, cityPath)
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("docs"."payload" #> array[$1, $2, $3]) as "cityJson", ("docs"."payload" #>> array[$4, $5, $6]) as "cityText", jsonb_set("docs"."payload", array[$7, $8, $9], cast($10 as jsonb), true) as "setCity", ("docs"."payload" #- array[$11, $12, $13]) as "deleteCity" from "public"."docs"'
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

  test("mysql rejects unsupported json path match", () => {
    const docs = makeJsonTable(Mysql)

    const plan = Mysql.Query.select({
      pathMatch: Mysql.Json.json.pathMatch(docs.payload, '$.profile.address[*] ? (@.city == "Paris")')
    }).pipe(Mysql.Query.from(docs))

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported JSON feature for mysql: jsonPathMatch"
    )
  })

  test("mysql renders the JSON expression surface it supports", () => {
    const docs = makeJsonTable(Mysql)

    const exactPath = Mysql.Json.json.path(
      Mysql.Json.json.key("profile"),
      Mysql.Json.json.key("address"),
      Mysql.Json.json.key("city")
    )
    const wildcardPath = Mysql.Json.json.path(
      Mysql.Json.json.key("profile"),
      Mysql.Json.json.key("tags"),
      Mysql.Json.json.wildcard()
    )

    const plan = Mysql.Query.select({
      profileJson: Mysql.Json.json.get(docs.payload, Mysql.Json.json.key("profile")),
      profileText: Mysql.Json.json.text(docs.payload, Mysql.Json.json.key("profile")),
      cityJson: Mysql.Json.json.get(docs.payload, exactPath),
      cityText: Mysql.Json.json.text(docs.payload, exactPath),
      wildcardJson: Mysql.Json.json.get(docs.payload, wildcardPath),
      hasProfile: Mysql.Json.json.hasKey(docs.payload, "profile"),
      hasAny: Mysql.Json.json.hasAnyKeys(docs.payload, "profile", "note"),
      hasAll: Mysql.Json.json.hasAllKeys(docs.payload, "profile", "note"),
      contains: Mysql.Json.json.contains(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      containedBy: Mysql.Json.json.containedBy(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      deleteNote: Mysql.Json.json.delete(docs.payload, Mysql.Json.json.key("note")),
      removeNote: Mysql.Json.json.remove(docs.payload, Mysql.Json.json.key("note")),
      setPostcode: Mysql.Json.json.set(
        docs.payload,
        Mysql.Json.json.path(Mysql.Json.json.key("profile"), Mysql.Json.json.key("address"), Mysql.Json.json.key("postcode")),
        "1000"
      ),
      insertSuite: Mysql.Json.json.insert(
        docs.payload,
        Mysql.Json.json.path(Mysql.Json.json.key("profile"), Mysql.Json.json.key("address"), Mysql.Json.json.key("suite")),
        "12A"
      ),
      concatValue: Mysql.Json.json.concat({ a: 1 }, { b: 2 }),
      mergeValue: Mysql.Json.json.merge({ a: 1 }, { b: 2 }),
      builtObject: Mysql.Json.json.buildObject({ a: 1, b: "x" }),
      builtArray: Mysql.Json.json.buildArray(1, "x", true),
      toJson: Mysql.Json.json.toJson(Mysql.Query.literal(1)),
      toJsonb: Mysql.Json.json.toJsonb(Mysql.Query.literal(1)),
      typeName: Mysql.Json.json.typeOf(docs.payload),
      length: Mysql.Json.json.length(docs.payload),
      keys: Mysql.Json.json.keys(docs.payload),
      pathExists: Mysql.Json.json.pathExists(docs.payload, wildcardPath)
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select json_extract(`docs`.`payload`, ?) as `profileJson`, json_unquote(json_extract(`docs`.`payload`, ?)) as `profileText`, json_extract(`docs`.`payload`, ?) as `cityJson`, json_unquote(json_extract(`docs`.`payload`, ?)) as `cityText`, json_extract(`docs`.`payload`, ?) as `wildcardJson`, json_contains_path(`docs`.`payload`, ?, ?) as `hasProfile`, json_contains_path(`docs`.`payload`, ?, ?, ?) as `hasAny`, json_contains_path(`docs`.`payload`, ?, ?, ?) as `hasAll`, json_contains(`docs`.`payload`, ?) as `contains`, json_contains(?, `docs`.`payload`) as `containedBy`, json_remove(`docs`.`payload`, ?) as `deleteNote`, json_remove(`docs`.`payload`, ?) as `removeNote`, json_set(`docs`.`payload`, ?, ?) as `setPostcode`, json_insert(`docs`.`payload`, ?, ?) as `insertSuite`, json_merge_preserve(?, ?) as `concatValue`, json_merge_preserve(?, ?) as `mergeValue`, json_object(?, ?, ?, ?) as `builtObject`, json_array(?, ?, true) as `builtArray`, cast(? as json) as `toJson`, cast(? as json) as `toJsonb`, json_type(`docs`.`payload`) as `typeName`, json_length(`docs`.`payload`) as `length`, json_keys(`docs`.`payload`) as `keys`, json_contains_path(`docs`.`payload`, ?, ?) as `pathExists` from `docs`"
    )
    expect(rendered.params).toEqual([
      "$.profile",
      "$.profile",
      "$.profile.address.city",
      "$.profile.address.city",
      "$.profile.tags[*]",
      "$.profile",
      "one",
      "$.profile",
      "$.note",
      "one",
      "$.profile",
      "$.note",
      "all",
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
      "$.note",
      "$.note",
      "$.profile.address.postcode",
      "1000",
      "$.profile.address.suite",
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
      1,
      "one",
      "$.profile.tags[*]"
    ])
  })

  test("mysql reuses the same JSON path object across read and write operators", () => {
    const docs = makeJsonTable(Mysql)

    const cityPath = Mysql.Json.json.path(
      Mysql.Json.json.key("profile"),
      Mysql.Json.json.key("address"),
      Mysql.Json.json.key("city")
    )

    const plan = Mysql.Query.select({
      cityJson: Mysql.Json.json.get(docs.payload, cityPath),
      cityText: Mysql.Json.json.text(docs.payload, cityPath),
      setCity: Mysql.Json.json.set(docs.payload, cityPath, "Paris"),
      deleteCity: Mysql.Json.json.delete(docs.payload, cityPath)
    }).pipe(Mysql.Query.from(docs))

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      "select json_extract(`docs`.`payload`, ?) as `cityJson`, json_unquote(json_extract(`docs`.`payload`, ?)) as `cityText`, json_set(`docs`.`payload`, ?, ?) as `setCity`, json_remove(`docs`.`payload`, ?, ?, ?) as `deleteCity` from `docs`"
    )
    expect(rendered.params).toEqual([
      "$.profile.address.city",
      "$.profile.address.city",
      "$.profile.address.city",
      "Paris",
      "$.profile",
      "$.address",
      "$.city"
    ])
  })

  test("postgres renders json and jsonb mutations with separate helper surfaces", () => {
    const docsJson = Postgres.Table.make("docs_json", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      payload: Postgres.Column.json(mutationSchema)
    })
    const docsJsonb = Postgres.Table.make("docs_jsonb", {
      id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
      payload: Postgres.Column.jsonb(mutationSchema)
    })

    const insertPlan = Postgres.Query.insert(docsJson, {
      id: "doc-1",
      payload: Postgres.Json.json.buildObject({
        profile: {
          city: "Paris"
        }
      })
    })

    const updatePlan = Postgres.Query.update(docsJsonb, {
      payload: Postgres.Json.jsonb.merge(
        docsJsonb.payload,
        Postgres.Json.jsonb.buildObject({
          profile: {
            city: "Paris"
          }
        })
      )
    })

    const insert = Postgres.Renderer.make().render(insertPlan)
    expect(insert.sql).toBe(
      'insert into "public"."docs_json" ("id", "payload") values ($1, json_build_object($2, $3))'
    )
    expect(insert.params).toEqual([
      "doc-1",
      "profile",
      {
        city: "Paris"
      }
    ])

    const update = Postgres.Renderer.make().render(updatePlan)
    expect(update.sql).toBe(
      'update "public"."docs_jsonb" set "payload" = ("docs_jsonb"."payload" || jsonb_build_object($1, $2))'
    )
    expect(update.params).toEqual([
      "profile",
      {
        city: "Paris"
      }
    ])
  })

  test("mysql keeps a single json mutation surface", () => {
    const docs = Mysql.Table.make("docs", {
      id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
      payload: Mysql.Column.json(mutationSchema)
    })

    const insertPlan = Mysql.Query.insert(docs, {
      id: "doc-1",
      payload: Mysql.Json.json.buildObject({
        profile: {
          city: "Paris"
        }
      })
    })

    const updatePlan = Mysql.Query.update(docs, {
      payload: Mysql.Json.json.merge(
        docs.payload,
        Mysql.Json.json.buildObject({
          profile: {
            city: "Paris"
          }
        })
      )
    })

    const insert = Mysql.Renderer.make().render(insertPlan)
    expect(insert.sql).toBe(
      "insert into `docs` (`id`, `payload`) values (?, json_object(?, ?))"
    )
    expect(insert.params).toEqual([
      "doc-1",
      "profile",
      {
        city: "Paris"
      }
    ])

    const update = Mysql.Renderer.make().render(updatePlan)
    expect(update.sql).toBe(
      "update `docs` set `payload` = json_merge_preserve(`docs`.`payload`, json_object(?, ?))"
    )
    expect(update.params).toEqual([
      "profile",
      {
        city: "Paris"
      }
    ])
  })
})
