import type { RenderState, RenderValueContext, SqlDialect } from "../../internal/dialect.js"
import { renderExpression, renderQueryAst } from "../../internal/dialect-renderers/mysql.js"
import { toDriverValue } from "../../internal/runtime/driver-value-mapping.js"
import { standardDialect } from "../../standard/dialect.js"

const quoteIdentifier = (value: string): string => `\`${value.replaceAll("`", "``")}\``

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

/**
 * Internal runtime dialect sketch for MySQL.
 *
 * This is intentionally not wired into the public renderer surface yet. It
 * exists to pressure-test the current abstraction seam and to document the
 * concrete SQL differences we still need to account for as dialect support
 * grows.
 */
export const mysqlDialect: SqlDialect<"mysql"> = {
  ...standardDialect,
  name: "mysql",
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
    return `concat(${values.join(", ")})`
  },
  renderQueryAst,
  renderExpression
}
