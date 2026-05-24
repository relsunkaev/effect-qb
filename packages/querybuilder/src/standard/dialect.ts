import type { RenderState, RenderValueContext, SqlDialect } from "../internal/dialect.js"
import { renderExpression, renderQueryAst } from "../internal/dialect-renderers/postgres.js"
import { toDriverValue } from "../internal/runtime/driver-value-mapping.js"

const quoteIdentifier = (value: string): string => `"${value.replaceAll("\"", "\"\"")}"`

const renderLiteral = (value: unknown, state: RenderState, context: RenderValueContext = {}): string => {
  const driverValue = toDriverValue(value, {
    dialect: "standard",
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
  return "?"
}

export const standardDialect: SqlDialect<"standard"> = {
  name: "standard",
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
  },
  renderQueryAst,
  renderExpression
}
