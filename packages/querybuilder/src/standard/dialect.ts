import { quoteDoubleQuotedIdentifier, type RenderState, type RenderValueContext, type SqlDialect } from "../internal/dialect.js"
import { renderExpression, renderQueryAst, renderSourceReference } from "../internal/dialect-renderers/postgres.js"
import { toDriverValue } from "../internal/runtime/driver-value-mapping.js"

const quoteIdentifier = quoteDoubleQuotedIdentifier

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
    const renderedBase = schemaName && schemaName !== "public"
      ? `${quoteIdentifier(schemaName)}.${quoteIdentifier(baseTableName)}`
      : quoteIdentifier(baseTableName)
    return tableName === baseTableName
      ? renderedBase
      : `${renderedBase} as ${quoteIdentifier(tableName)}`
  },
  renderConcat(values) {
    return `(${values.join(" || ")})`
  },
  renderSourceReference,
  renderQueryAst,
  renderExpression
}
