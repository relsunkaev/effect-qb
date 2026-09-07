import { quoteBacktickIdentifier, type RenderState, type RenderValueContext, type SqlDialect } from "../../internal/dialect.js"
import { renderExpression, renderQueryAst, renderSourceReference } from "../../internal/dialect-renderers/mysql.js"
import { toDriverValue } from "../../internal/runtime/driver-value-mapping.js"
import { standardDialect } from "../../standard/dialect.js"

const quoteIdentifier = quoteBacktickIdentifier

const renderLiteral = (value: unknown, state: RenderState, context: RenderValueContext = {}): string => {
  const driverValue = toDriverValue(value, {
    dialect: "mysql",
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

/** Built-in runtime dialect implementation for MySQL. */
export const mysqlDialect: SqlDialect<"mysql"> = {
  ...standardDialect,
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
  },
  renderSourceReference,
  renderQueryAst,
  renderExpression
}
