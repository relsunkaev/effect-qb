import type { RenderState, SqlDialect } from "./dialect.ts"

const quoteIdentifier = (value: string): string => `"${value.replaceAll("\"", "\"\"")}"`

const renderLiteral = (value: unknown, state: RenderState): string => {
  if (value === null) {
    return "null"
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }
  state.params.push(value)
  return `$${state.params.length}`
}

/**
 * Built-in runtime dialect implementation for Postgres.
 */
export const postgresDialect: SqlDialect<"postgres"> = {
  name: "postgres",
  quoteIdentifier,
  renderLiteral,
  renderTableReference(tableName, baseTableName) {
    return tableName === baseTableName
      ? quoteIdentifier(baseTableName)
      : `${quoteIdentifier(baseTableName)} as ${quoteIdentifier(tableName)}`
  },
  renderConcat(values) {
    return `(${values.join(" || ")})`
  }
}
