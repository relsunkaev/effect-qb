import { expect, test } from "bun:test"
import { toDriverValue } from "#internal/runtime/driver-value-mapping.ts"
import { Column, Query, Table, Type } from "#standard"
import { Renderer } from "#sqlite"

test("SQLite binds booleans as integers without changing JSON or other dialects", () => {
  const context = { dialect: "sqlite", dbType: Type.boolean() }
  expect(toDriverValue(true, context)).toBe(1)
  expect(toDriverValue(false, context)).toBe(0)
  expect(toDriverValue(null, context)).toBeNull()
  expect(toDriverValue(true, { ...context, dialect: "postgres" })).toBe(true)
  expect(toDriverValue(true, { dialect: "sqlite", dbType: Type.json() })).toBe("true")
  expect(toDriverValue(true, { ...context, valueMappings: { boolean: { toDriver: () => "custom" } } })).toBe("custom")
  const records = Table.make("sqlite_booleans", { active: Column.boolean() })
  expect(Renderer.make().render(Query.insert(records, { active: true })).params).toEqual([1])
  expect(Renderer.make().render(Query.insert(records, { active: false })).params).toEqual([0])
  const custom = Renderer.make({ valueMappings: { boolean: { toDriver: () => "custom" } } })
  expect(custom.render(Query.insert(records, { active: true })).params).toEqual(["custom"])
})
