import type { RenderState, SqlDialect } from "./dialect.ts"

const quoteIdentifier = (value: string): string => `\`${value.replaceAll("`", "``")}\``

const renderLiteral = (value: unknown, state: RenderState): string => {
  if (value === null) {
    return "null"
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }
  state.params.push(value)
  return "?"
}

/**
 * Internal runtime dialect sketch for MySQL.
 *
 * This is intentionally not wired into the public renderer surface yet. It
 * exists to pressure-test the current abstraction seam and to document the
 * concrete SQL differences we still need to account for as dialect support
 * grows.
 */
export const mysqlDialect: SqlDialect<"mysql"> = {
  name: "mysql",
  quoteIdentifier,
  renderLiteral,
  renderTableReference(tableName, baseTableName, schemaName) {
    const renderedBase = schemaName && schemaName !== "public"
      ? `${quoteIdentifier(schemaName)}.${quoteIdentifier(baseTableName)}`
      : quoteIdentifier(baseTableName)
    return tableName === baseTableName
      ? renderedBase
      : `${renderedBase} as ${quoteIdentifier(tableName)}`
  },
  renderConcat(values) {
    return `concat(${values.join(", ")})`
  }
}
