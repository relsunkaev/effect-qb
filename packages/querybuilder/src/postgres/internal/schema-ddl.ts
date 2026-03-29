import type * as Expression from "../../internal/scalar.js"
import type { RenderState, SqlDialect } from "../../internal/dialect.js"
import * as SchemaExpression from "../../internal/schema-expression.js"
import { renderExpression } from "./sql-expression-renderer.js"
import type { DdlExpressionLike } from "../../internal/table-options.js"
import { parse, toSql } from "pgsql-ast-parser"
import { postgresDialect } from "./dialect.js"

export const renderDdlExpression = (
  expression: DdlExpressionLike,
  state: RenderState,
  dialect: SqlDialect
): string =>
  SchemaExpression.isSchemaExpression(expression)
    ? SchemaExpression.render(expression)
    : renderExpression(expression as Expression.Any, state, dialect)

const escapeString = (value: string): string => `'${value.replaceAll("'", "''")}'`

const inlineLiteralDialect: SqlDialect<"postgres"> = {
  ...postgresDialect,
  renderLiteral(value) {
    if (value === null) {
      return "null"
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false"
    }
    if (typeof value === "number" || typeof value === "bigint") {
      return String(value)
    }
    if (value instanceof Date) {
      return escapeString(value.toISOString())
    }
    return escapeString(String(value))
  }
}

export const renderDdlExpressionSql = (expression: DdlExpressionLike): string =>
  SchemaExpression.isSchemaExpression(expression)
    ? SchemaExpression.render(expression)
    : renderExpression(expression as Expression.Any, {
        params: [],
        ctes: [],
        cteNames: new Set()
      }, inlineLiteralDialect)

export const normalizeDdlExpressionSql = (expression: DdlExpressionLike): string => {
  const rendered = renderDdlExpressionSql(expression)
  try {
    return toSql.expr(parse(rendered, "expr"))
  } catch {
    return rendered.trim()
  }
}
