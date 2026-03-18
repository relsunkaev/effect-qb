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

    expect(rendered.sql).toContain('-> $1')
    expect(rendered.sql).toContain('->> $2')
    expect(rendered.sql).toContain('#> array[$3, $4, $5]')
    expect(rendered.sql).toContain('#>> array[$6, $7, $8]')
    expect(rendered.sql).toContain('@> cast($15 as jsonb)')
    expect(rendered.sql).toContain('<@ cast($16 as jsonb)')
    expect(rendered.sql).toContain('? $10')
    expect(rendered.sql).toContain('?| array[$11, $12]')
    expect(rendered.sql).toContain('?& array[$13, $14]')
    expect(rendered.sql).toContain('jsonb_set(')
    expect(rendered.sql).toContain('jsonb_insert(')
    expect(rendered.sql).toContain('jsonb_build_object(')
    expect(rendered.sql).toContain('jsonb_build_array(')
    expect(rendered.sql).toContain('to_json(')
    expect(rendered.sql).toContain('to_jsonb(')
    expect(rendered.sql).toContain('jsonb_typeof(')
    expect(rendered.sql).toContain('jsonb_object_keys(')
    expect(rendered.sql).toContain('jsonb_strip_nulls(')
    expect(rendered.sql).toContain('@?')
    expect(rendered.sql).toContain('@@')
    expect(rendered.params).toContainEqual({
      profile: {
        address: {
          city: "Paris"
        }
      }
    })
    expect(rendered.params).toContain("$.profile.address[*] ? (@.city == \"Paris\")")
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

    expect(rendered.sql).toContain("json_extract(")
    expect(rendered.sql).toContain("json_unquote(")
    expect(rendered.sql).toContain("json_contains(")
    expect(rendered.sql).toContain("json_remove(")
    expect(rendered.sql).toContain("json_set(")
    expect(rendered.sql).toContain("json_insert(")
    expect(rendered.sql).toContain("json_merge_preserve(")
    expect(rendered.sql).toContain("json_object(")
    expect(rendered.sql).toContain("json_array(")
    expect(rendered.sql).toContain("json_type(")
    expect(rendered.sql).toContain("json_length(")
    expect(rendered.sql).toContain("json_keys(")
    expect(rendered.sql).toContain("json_contains_path(")
    expect(rendered.params).toContainEqual({
      profile: {
        address: {
          city: "Paris"
        }
      }
    })
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
      'insert into "docs" ("id", "payload") values ($1, jsonb_build_object($2, $3))'
    )
    expect(postgres.insert.params).toEqual([
      "doc-1",
      "profile",
      {
        city: "Paris"
      }
    ])
    expect(postgres.update.sql).toBe(
      'update "docs" set "payload" = (cast("docs"."payload" as jsonb) || cast(jsonb_build_object($1, $2) as jsonb))'
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
