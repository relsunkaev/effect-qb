import type { RenderState, RenderValueContext, SqlDialect } from "../../internal/dialect.js"
import { toDriverValue } from "../../internal/runtime/driver-value-mapping.js"
import { standardDialect } from "../../standard/dialect.js"

const quoteIdentifier = (value: string): string => `"${value.replaceAll("\"", "\"\"")}"`

const renderLiteral = (value: unknown, state: RenderState, context: RenderValueContext = {}): string => {
  const driverValue = toDriverValue(value, {
    dialect: "postgres",
    valueMappings: state.valueMappings,
    ...context
  })
  if (driverValue === null) {
    return "null"
  }
  if (typeof driverValue === "boolean") {
    return driverValue ? "true" : "false"
  }
  state.params.push(driverValue)
  return `$${state.params.length}`
}

/**
 * Built-in runtime dialect implementation for Postgres.
 */
export const postgresDialect: SqlDialect<"postgres"> = {
  ...standardDialect,
  name: "postgres",
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
