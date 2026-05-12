import type { RenderState, RenderValueContext, SqlDialect } from "../../internal/dialect.js"
import { toDriverValue } from "../../internal/runtime/driver-value-mapping.js"

const quoteIdentifier = (value: string): string => `"${value.replaceAll("\"", "\"\"")}"`

const renderLiteral = (value: unknown, state: RenderState, context: RenderValueContext = {}): string => {
  const driverValue = toDriverValue(value, {
    dialect: "sqlite",
    valueMappings: state.valueMappings,
    ...context
  })
  if (driverValue === null) {
    return "null"
  }
  state.params.push(driverValue)
  return "?"
}

/**
 * Built-in runtime dialect implementation for SQLite.
 */
export const sqliteDialect: SqlDialect<"sqlite"> = {
  name: "sqlite",
  quoteIdentifier,
  renderLiteral,
  renderTableReference(tableName, baseTableName, schemaName) {
    const renderedBase = schemaName
      ? `${quoteIdentifier(schemaName)}.${quoteIdentifier(baseTableName)}`
      : quoteIdentifier(baseTableName)
    return tableName === baseTableName
      ? renderedBase
      : `${renderedBase} as ${quoteIdentifier(tableName)}`
  },
  renderConcat(values) {
    return `(${values.join(" || ")})`
  }
}
