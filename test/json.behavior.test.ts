import { describe, expect, test } from "bun:test"
import * as Schema from "effect/Schema"

import * as Mysql from "../src/mysql.ts"
import * as Postgres from "../src/postgres.ts"

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

const makeTable = <TableModule extends typeof Postgres | typeof Mysql>(table: TableModule) =>
  table.Table.make("docs", {
    id: table.Column.uuid().pipe(table.Column.primaryKey),
    payload: table.Column.json(payloadSchema)
  })

describe("json behavior", () => {
  test("postgres renders the JSON expression surface", () => {
    const docs = makeTable(Postgres)

    const exactPath = Postgres.Query.json.path(
      Postgres.Query.json.key("profile"),
      Postgres.Query.json.key("address"),
      Postgres.Query.json.key("city")
    )
    const wildcardPath = Postgres.Query.json.path(
      Postgres.Query.json.key("profile"),
      Postgres.Query.json.key("tags"),
      Postgres.Query.json.wildcard()
    )

    const plan = Postgres.Query.select({
      profileJson: Postgres.Query.json.get(docs.payload, Postgres.Query.json.key("profile")),
      profileText: Postgres.Query.json.text(docs.payload, Postgres.Query.json.key("profile")),
      cityJson: Postgres.Query.json.get(docs.payload, exactPath),
      cityText: Postgres.Query.json.text(docs.payload, exactPath),
      wildcardJson: Postgres.Query.json.get(docs.payload, wildcardPath),
      hasProfile: Postgres.Query.json.hasKey(docs.payload, "profile"),
      hasAny: Postgres.Query.json.hasAnyKeys(docs.payload, "profile", "note"),
      hasAll: Postgres.Query.json.hasAllKeys(docs.payload, "profile", "note"),
      contains: Postgres.Query.json.contains(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      containedBy: Postgres.Query.json.containedBy(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      deleteNote: Postgres.Query.json.delete(docs.payload, Postgres.Query.json.key("note")),
      removeNote: Postgres.Query.json.remove(docs.payload, Postgres.Query.json.key("note")),
      setPostcode: Postgres.Query.json.set(
        docs.payload,
        Postgres.Query.json.path(Postgres.Query.json.key("profile"), Postgres.Query.json.key("address"), Postgres.Query.json.key("postcode")),
        "1000"
      ),
      insertSuite: Postgres.Query.json.insert(
        docs.payload,
        Postgres.Query.json.path(Postgres.Query.json.key("profile"), Postgres.Query.json.key("address"), Postgres.Query.json.key("suite")),
        "12A"
      ),
      concatValue: Postgres.Query.json.concat({ a: 1 }, { b: 2 }),
      mergeValue: Postgres.Query.json.merge({ a: 1 }, { b: 2 }),
      builtObject: Postgres.Query.json.buildObject({ a: 1, b: "x" }),
      builtArray: Postgres.Query.json.buildArray(1, "x", true),
      toJson: Postgres.Query.json.toJson(Postgres.Query.literal(1)),
      toJsonb: Postgres.Query.json.toJsonb(Postgres.Query.literal(1)),
      typeName: Postgres.Query.json.typeOf(docs.payload),
      length: Postgres.Query.json.length(docs.payload),
      keys: Postgres.Query.json.keys(docs.payload),
      pathExists: Postgres.Query.json.pathExists(docs.payload, wildcardPath),
      pathMatch: Postgres.Query.json.pathMatch(docs.payload, '$.profile.address[*] ? (@.city == "Paris")'),
      stripNulls: Postgres.Query.json.stripNulls(docs.payload)
    }).pipe(Postgres.Query.from(docs))

    const rendered = Postgres.Renderer.make().render(plan)

    expect(rendered.sql).toBe(
      'select ("docs"."payload" -> $1) as "profileJson", ("docs"."payload" ->> $2) as "profileText", ("docs"."payload" #> array[$3, $4, $5]) as "cityJson", ("docs"."payload" #>> array[$6, $7, $8]) as "cityText", jsonb_path_query_first(cast("docs"."payload" as jsonb), $9) as "wildcardJson", (cast("docs"."payload" as jsonb) ? $10) as "hasProfile", (cast("docs"."payload" as jsonb) ?| array[$11, $12]) as "hasAny", (cast("docs"."payload" as jsonb) ?& array[$13, $14]) as "hasAll", (cast("docs"."payload" as jsonb) @> cast($15 as jsonb)) as "contains", (cast("docs"."payload" as jsonb) <@ cast($16 as jsonb)) as "containedBy", (cast("docs"."payload" as jsonb) - $17) as "deleteNote", (cast("docs"."payload" as jsonb) - $18) as "removeNote", jsonb_set(cast("docs"."payload" as jsonb), array[$19, $20, $21], cast($22 as jsonb), true) as "setPostcode", jsonb_insert(cast("docs"."payload" as jsonb), array[$23, $24, $25], cast($26 as jsonb), false) as "insertSuite", (cast($27 as jsonb) || cast($28 as jsonb)) as "concatValue", (cast($29 as jsonb) || cast($30 as jsonb)) as "mergeValue", jsonb_build_object($31, $32, $33, $34) as "builtObject", jsonb_build_array($35, $36, true) as "builtArray", to_json($37) as "toJson", to_jsonb($38) as "toJsonb", jsonb_typeof(cast("docs"."payload" as jsonb)) as "typeName", (case when jsonb_typeof(cast("docs"."payload" as jsonb)) = \'array\' then jsonb_array_length(cast("docs"."payload" as jsonb)) when jsonb_typeof(cast("docs"."payload" as jsonb)) = \'object\' then jsonb_object_length(cast("docs"."payload" as jsonb)) else null end) as "length", (case when jsonb_typeof(cast("docs"."payload" as jsonb)) = \'object\' then array(select jsonb_object_keys(cast("docs"."payload" as jsonb))) else null end) as "keys", (cast("docs"."payload" as jsonb) @? $39) as "pathExists", (cast("docs"."payload" as jsonb) @@ $40) as "pathMatch", jsonb_strip_nulls(cast("docs"."payload" as jsonb)) as "stripNulls" from "public"."docs"'
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
      1,
      "$.profile.tags[*]",
      "$.profile.address[*] ? (@.city == \"Paris\")"
    ])
  })

  test("mysql rejects unsupported json path match", () => {
    const docs = makeTable(Mysql)

    const plan = Mysql.Query.select({
      pathMatch: Mysql.Query.json.pathMatch(docs.payload, '$.profile.address[*] ? (@.city == "Paris")')
    }).pipe(Mysql.Query.from(docs))

    expect(() => Mysql.Renderer.make().render(plan)).toThrow(
      "Unsupported JSON feature for mysql: jsonPathMatch"
    )
  })

  test("mysql renders the JSON expression surface it supports", () => {
    const docs = makeTable(Mysql)

    const exactPath = Mysql.Query.json.path(
      Mysql.Query.json.key("profile"),
      Mysql.Query.json.key("address"),
      Mysql.Query.json.key("city")
    )
    const wildcardPath = Mysql.Query.json.path(
      Mysql.Query.json.key("profile"),
      Mysql.Query.json.key("tags"),
      Mysql.Query.json.wildcard()
    )

    const plan = Mysql.Query.select({
      profileJson: Mysql.Query.json.get(docs.payload, Mysql.Query.json.key("profile")),
      profileText: Mysql.Query.json.text(docs.payload, Mysql.Query.json.key("profile")),
      cityJson: Mysql.Query.json.get(docs.payload, exactPath),
      cityText: Mysql.Query.json.text(docs.payload, exactPath),
      wildcardJson: Mysql.Query.json.get(docs.payload, wildcardPath),
      hasProfile: Mysql.Query.json.hasKey(docs.payload, "profile"),
      hasAny: Mysql.Query.json.hasAnyKeys(docs.payload, "profile", "note"),
      hasAll: Mysql.Query.json.hasAllKeys(docs.payload, "profile", "note"),
      contains: Mysql.Query.json.contains(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      containedBy: Mysql.Query.json.containedBy(docs.payload, {
        profile: {
          address: {
            city: "Paris"
          }
        }
      }),
      deleteNote: Mysql.Query.json.delete(docs.payload, Mysql.Query.json.key("note")),
      removeNote: Mysql.Query.json.remove(docs.payload, Mysql.Query.json.key("note")),
      setPostcode: Mysql.Query.json.set(
        docs.payload,
        Mysql.Query.json.path(Mysql.Query.json.key("profile"), Mysql.Query.json.key("address"), Mysql.Query.json.key("postcode")),
        "1000"
      ),
      insertSuite: Mysql.Query.json.insert(
        docs.payload,
        Mysql.Query.json.path(Mysql.Query.json.key("profile"), Mysql.Query.json.key("address"), Mysql.Query.json.key("suite")),
        "12A"
      ),
      concatValue: Mysql.Query.json.concat({ a: 1 }, { b: 2 }),
      mergeValue: Mysql.Query.json.merge({ a: 1 }, { b: 2 }),
      builtObject: Mysql.Query.json.buildObject({ a: 1, b: "x" }),
      builtArray: Mysql.Query.json.buildArray(1, "x", true),
      toJson: Mysql.Query.json.toJson(Mysql.Query.literal(1)),
      toJsonb: Mysql.Query.json.toJsonb(Mysql.Query.literal(1)),
      typeName: Mysql.Query.json.typeOf(docs.payload),
      length: Mysql.Query.json.length(docs.payload),
      keys: Mysql.Query.json.keys(docs.payload),
      pathExists: Mysql.Query.json.pathExists(docs.payload, wildcardPath)
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

  test("postgres and mysql render json-backed insert and update mutations", () => {
    const renderMutation = <TableModule extends typeof Postgres | typeof Mysql>(table: TableModule) => {
      const docs = table.Table.make("docs", {
        id: table.Column.uuid().pipe(table.Column.primaryKey),
        payload: table.Column.json(mutationSchema)
      })

      const insertPlan = table.Query.insert(docs, {
        id: "doc-1",
        payload: table.Query.json.buildObject({
          profile: {
            city: "Paris"
          }
        })
      })

      const updatePlan = table.Query.update(docs, {
        payload: table.Query.json.merge(
          docs.payload,
          table.Query.json.buildObject({
            profile: {
              city: "Paris"
            }
          })
        )
      })

      return {
        insert: table.Renderer.make().render(insertPlan),
        update: table.Renderer.make().render(updatePlan)
      }
    }

    const postgres = renderMutation(Postgres)
    expect(postgres.insert.sql).toBe(
      'insert into "public"."docs" ("id", "payload") values ($1, jsonb_build_object($2, $3))'
    )
    expect(postgres.insert.params).toEqual([
      "doc-1",
      "profile",
      {
        city: "Paris"
      }
    ])
    expect(postgres.update.sql).toBe(
      'update "public"."docs" set "payload" = (cast("docs"."payload" as jsonb) || cast(jsonb_build_object($1, $2) as jsonb))'
    )
    expect(postgres.update.params).toEqual([
      "profile",
      {
        city: "Paris"
      }
    ])

    const mysql = renderMutation(Mysql)
    expect(mysql.insert.sql).toBe(
      "insert into `docs` (`id`, `payload`) values (?, json_object(?, ?))"
    )
    expect(mysql.insert.params).toEqual([
      "doc-1",
      "profile",
      {
        city: "Paris"
      }
    ])
    expect(mysql.update.sql).toBe(
      "update `docs` set `payload` = json_merge_preserve(`docs`.`payload`, json_object(?, ?))"
    )
    expect(mysql.update.params).toEqual([
      "profile",
      {
        city: "Paris"
      }
    ])
  })
})
