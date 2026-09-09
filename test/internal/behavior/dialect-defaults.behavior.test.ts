import { expect, test } from "bun:test"
import { standardDialect } from "../../../packages/querybuilder/src/standard/dialect.ts"
import { postgresDialect } from "../../../packages/querybuilder/src/postgres/internal/dialect.ts"
import { mysqlDialect } from "../../../packages/querybuilder/src/mysql/internal/dialect.ts"
import { sqliteDialect } from "../../../packages/querybuilder/src/sqlite/internal/dialect.ts"

for (const dialect of [standardDialect, postgresDialect, sqliteDialect]) {
  test(`${dialect.name} quotes schema-qualified aliases and concatenates with pipes`, () => {
    expect(dialect.quoteIdentifier('an"identifier')).toBe('"an""identifier"')
    expect(dialect.renderTableReference('an"alias', 'a"table', 'a"schema'))
      .toBe('"a""schema"."a""table" as "an""alias"')
    expect(dialect.renderTableReference("table", "table", "public")).toBe('"table"')
    expect(dialect.renderTableReference("table", "table")).toBe('"table"')
    expect(dialect.renderConcat(["left", "right"])).toBe("(left || right)")
  })
}

test("mysql retains backtick table references and function concatenation", () => {
  expect(mysqlDialect.renderTableReference("an`alias", "a`table", "a`schema"))
    .toBe("`a``schema`.`a``table` as `an``alias`")
  expect(mysqlDialect.renderConcat(["left", "right"])).toBe("concat(left, right)")
})
