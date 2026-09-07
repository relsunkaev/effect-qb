import { expect, test } from "bun:test"
import { standardDatatypes } from "../../../packages/querybuilder/src/standard/datatypes/index.ts"
import { postgresDatatypes } from "../../../packages/querybuilder/src/postgres/datatypes/index.ts"
import { mysqlDatatypes } from "../../../packages/querybuilder/src/mysql/datatypes/index.ts"
import { sqliteDatatypes } from "../../../packages/querybuilder/src/sqlite/datatypes/index.ts"

test("witness construction retains concrete numeric families and aliases", () => {
  expect(standardDatatypes.integer()).toMatchObject({ dialect: "standard", kind: "integer", family: "integer", runtime: "number" })
  expect(postgresDatatypes.boolean()).toEqual(postgresDatatypes.bool())
  expect(mysqlDatatypes.integer()).toMatchObject({ dialect: "mysql", kind: "integer", family: "numeric", runtime: "number" })
  expect(sqliteDatatypes.integer()).toMatchObject({ dialect: "sqlite", kind: "integer", family: "integer", runtime: "number" })
  expect(postgresDatatypes.int8()).toMatchObject({ runtime: "bigintString" })
  expect(mysqlDatatypes.decimal()).toMatchObject({ runtime: "decimalString" })
})

test("custom and UUID witnesses retain their existing metadata boundaries", () => {
  for (const [dialect, module] of [
    ["standard", standardDatatypes], ["postgres", postgresDatatypes],
    ["mysql", mysqlDatatypes], ["sqlite", sqliteDatatypes]
  ] as const) {
    expect(module.custom("application_type")).toEqual({ dialect, kind: "application_type" })
    expect(module.uuid()).toMatchObject({ dialect, kind: "uuid", runtime: "string" })
  }
})

test("JSON serialization remains dialect-owned for primitive and structured values", () => {
  for (const module of [standardDatatypes, sqliteDatatypes]) {
    const encode = module.json().driverValueMapping.toDriver
    expect(encode("text")).toBe('"text"')
    expect(encode(null)).toBe("null")
    expect(encode({ key: true })).toBe('{"key":true}')
  }
  const mysqlEncode = mysqlDatatypes.json().driverValueMapping.toDriver
  expect(mysqlEncode("text")).toBe("text")
  expect(mysqlEncode(null)).toBeNull()
  expect(mysqlEncode({ key: true })).toBe('{"key":true}')
  expect(postgresDatatypes.json()).toMatchObject({ dialect: "postgres", kind: "json", variant: "json" })
  expect(postgresDatatypes.jsonb()).toMatchObject({ dialect: "postgres", kind: "jsonb", variant: "jsonb" })
})
