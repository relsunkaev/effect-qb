import { type RenderState, type RenderValueContext, type SqlDialect } from "../../internal/dialect.js"
import { renderExpression, renderQueryAst, renderSourceReference } from "../../internal/dialect-renderers/postgres.js"
import { toDriverValue } from "../../internal/runtime/driver-value-mapping.js"
import { standardDialect } from "../../standard/dialect.js"

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
  renderLiteral,
  renderSourceReference,
  renderQueryAst,
  renderExpression
}
