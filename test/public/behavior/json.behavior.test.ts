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

    const exactPath = Postgres.Function.json.path(
      Postgres.Function.json.key("profile"),
      Postgres.Function.json.key("address"),
      Postgres.Function.json.key("city")
    )

    const plan = Postgres.Query.select({
      profileJson: Postgres.Function.json.get(docs.payload, Postgres.Function.json.key("profile")),
      profileText: Postgres.Function.json.text(docs.payload, Postgres.Function.json.key("profile")),
      cityJson: Postgres.Function.json.get(docs.payload, exactPath),
      cityText: Postgres.Function.json.text(docs.payload, exactPath),
      builtObject: Postgres.Function.json.buildObject({ a: 1, b: "x" }),
      builtArray: Postgres.Function.json.buildArray(1, "x", true),
      toJson: Postgres.Function.json.toJson(Postgres.Query.literal(1)),
      typeName: Postgres.Function.json.typeOf(docs.payload),
      length: Postgres.Function.json.length(docs.payload),
      keys: Postgres.Function.json.keys(docs.payload),
      stripNulls: Postgres.Function.json.stripNulls(docs.payload)
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

    const cityPath = Postgres.Function.json.path(
      Postgres.Function.json.key("profile"),
      Postgres.Function.json.key("address"),
      Postgres.Function.json.key("city")
    )

    const plan = Postgres.Query.select({
      cityJson: Postgres.Function.json.get(docs.payload, cityPath),
      cityText: Postgres.Function.json.text(docs.payload, cityPath),
      typeName: Postgres.Function.json.typeOf(docs.payload),
      stripNulls: Postgres.Function.json.stripNulls(docs.payload)
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

    const exactPath = Postgres.Function.jsonb.path(
      Postgres.Function.jsonb.key("profile"),
      Postgres.Function.jsonb.key("address"),
      Postgres.Function.jsonb.key("city")
    )
    const wildcardPath = Postgres.Function.jsonb.path(
      Postgres.Function.jsonb.key("profile"),
      Postgres.Function.jsonb.key("tags"),
      Postgres.Function.jsonb.wildcard()
    )

    const plan = Postgres.Query.select({
      profileJson: Postgres.Function.jsonb.get(docs.payload, Postgres.Function.jsonb.key("profile")),
      profileText: Postgres.Function.jsonb.text(docs.payload, Postgres.Function.jsonb.key("profile")),
      cityJson: Postgres.Function.jsonb.get(docs.payload, exactPath),
      cityText: Postgres.Function.jsonb.text(docs.payload, exactPath),
      wildcardJson: Postgres.Function.jsonb.get(docs.payload, wildcardPath),
      hasProfile: Postgres.Function.jsonb.hasKey(docs.payload, "profile"),
      hasAny: Postgres.Function.jsonb.hasAnyKeys(docs.payload, "profile", "note"),
      hasAll: Postgres.Function.jsonb.hasAllKeys(docs.payload, "profile", "note"),
      contains: Postgres.Function.jsonb.contains(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      containedBy: Postgres.Function.jsonb.containedBy(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      deleteNote: Postgres.Function.jsonb.delete(docs.payload, Postgres.Function.jsonb.key("note")),
      removeNote: Postgres.Function.jsonb.remove(docs.payload, Postgres.Function.jsonb.key("note")),
      setPostcode: Postgres.Function.jsonb.set(
        docs.payload,
        Postgres.Function.jsonb.path(Postgres.Function.jsonb.key("profile"), Postgres.Function.jsonb.key("address"), Postgres.Function.jsonb.key("postcode")),
        "1000"
      ),
      insertSuite: Postgres.Function.jsonb.insert(
        docs.payload,
        Postgres.Function.jsonb.path(Postgres.Function.jsonb.key("profile"), Postgres.Function.jsonb.key("address"), Postgres.Function.jsonb.key("suite")),
        "12A"
      ),
      concatValue: Postgres.Function.jsonb.concat({ a: 1 }, { b: 2 }),
      mergeValue: Postgres.Function.jsonb.merge({ a: 1 }, { b: 2 }),
      builtObject: Postgres.Function.jsonb.buildObject({ a: 1, b: "x" }),
      builtArray: Postgres.Function.jsonb.buildArray(1, "x", true),
      toJsonb: Postgres.Function.jsonb.toJsonb(Postgres.Query.literal(1)),
      typeName: Postgres.Function.jsonb.typeOf(docs.payload),
      length: Postgres.Function.jsonb.length(docs.payload),
      keys: Postgres.Function.jsonb.keys(docs.payload),
      pathExists: Postgres.Function.jsonb.pathExists(docs.payload, wildcardPath),
      pathMatch: Postgres.Function.jsonb.pathMatch(docs.payload, '$.profile.address[*] ? (@.city == "Paris")'),
      stripNulls: Postgres.Function.jsonb.stripNulls(docs.payload)
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

    const cityPath = Postgres.Function.jsonb.path(
      Postgres.Function.jsonb.key("profile"),
      Postgres.Function.jsonb.key("address"),
      Postgres.Function.jsonb.key("city")
    )

    const plan = Postgres.Query.select({
      cityJson: Postgres.Function.jsonb.get(docs.payload, cityPath),
      cityText: Postgres.Function.jsonb.text(docs.payload, cityPath),
      setCity: Postgres.Function.jsonb.set(docs.payload, cityPath, "Paris"),
      deleteCity: Postgres.Function.jsonb.delete(docs.payload, cityPath)
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
      pathMatch: Mysql.Function.json.pathMatch(docs.payload, '$.profile.address[*] ? (@.city == "Paris")')
    }).pipe(Mysql.Query.from(docs))

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported JSON feature for mysql: jsonPathMatch"
    )
  })

  test("mysql renders the JSON expression surface it supports", () => {
    const docs = makeJsonTable(Mysql)

    const exactPath = Mysql.Function.json.path(
      Mysql.Function.json.key("profile"),
      Mysql.Function.json.key("address"),
      Mysql.Function.json.key("city")
    )
    const wildcardPath = Mysql.Function.json.path(
      Mysql.Function.json.key("profile"),
      Mysql.Function.json.key("tags"),
      Mysql.Function.json.wildcard()
    )

    const plan = Mysql.Query.select({
      profileJson: Mysql.Function.json.get(docs.payload, Mysql.Function.json.key("profile")),
      profileText: Mysql.Function.json.text(docs.payload, Mysql.Function.json.key("profile")),
      cityJson: Mysql.Function.json.get(docs.payload, exactPath),
      cityText: Mysql.Function.json.text(docs.payload, exactPath),
      wildcardJson: Mysql.Function.json.get(docs.payload, wildcardPath),
      hasProfile: Mysql.Function.json.hasKey(docs.payload, "profile"),
      hasAny: Mysql.Function.json.hasAnyKeys(docs.payload, "profile", "note"),
      hasAll: Mysql.Function.json.hasAllKeys(docs.payload, "profile", "note"),
      contains: Mysql.Function.json.contains(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      containedBy: Mysql.Function.json.containedBy(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      deleteNote: Mysql.Function.json.delete(docs.payload, Mysql.Function.json.key("note")),
      removeNote: Mysql.Function.json.remove(docs.payload, Mysql.Function.json.key("note")),
      setPostcode: Mysql.Function.json.set(
        docs.payload,
        Mysql.Function.json.path(Mysql.Function.json.key("profile"), Mysql.Function.json.key("address"), Mysql.Function.json.key("postcode")),
        "1000"
      ),
      insertSuite: Mysql.Function.json.insert(
        docs.payload,
        Mysql.Function.json.path(Mysql.Function.json.key("profile"), Mysql.Function.json.key("address"), Mysql.Function.json.key("suite")),
        "12A"
      ),
      concatValue: Mysql.Function.json.concat({ a: 1 }, { b: 2 }),
      mergeValue: Mysql.Function.json.merge({ a: 1 }, { b: 2 }),
      builtObject: Mysql.Function.json.buildObject({ a: 1, b: "x" }),
      builtArray: Mysql.Function.json.buildArray(1, "x", true),
      toJson: Mysql.Function.json.toJson(Mysql.Query.literal(1)),
      toJsonb: Mysql.Function.json.toJsonb(Mysql.Query.literal(1)),
      typeName: Mysql.Function.json.typeOf(docs.payload),
      length: Mysql.Function.json.length(docs.payload),
      keys: Mysql.Function.json.keys(docs.payload),
      pathExists: Mysql.Function.json.pathExists(docs.payload, wildcardPath)
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

    const cityPath = Mysql.Function.json.path(
      Mysql.Function.json.key("profile"),
      Mysql.Function.json.key("address"),
      Mysql.Function.json.key("city")
    )

    const plan = Mysql.Query.select({
      cityJson: Mysql.Function.json.get(docs.payload, cityPath),
      cityText: Mysql.Function.json.text(docs.payload, cityPath),
      setCity: Mysql.Function.json.set(docs.payload, cityPath, "Paris"),
      deleteCity: Mysql.Function.json.delete(docs.payload, cityPath)
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
      payload: Postgres.Function.json.buildObject({
        profile: {
          city: "Paris"
        }
      })
    })

    const updatePlan = Postgres.Query.update(docsJsonb, {
      payload: Postgres.Function.jsonb.merge(
        docsJsonb.payload,
        Postgres.Function.jsonb.buildObject({
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
      payload: Mysql.Function.json.buildObject({
        profile: {
          city: "Paris"
        }
      })
    })

    const updatePlan = Mysql.Query.update(docs, {
      payload: Mysql.Function.json.merge(
        docs.payload,
        Mysql.Function.json.buildObject({
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
