import type { RenderState, SqlDialect } from "./dialect.js"
import type * as ExpressionAst from "./expression-ast.js"
import * as Expression from "./scalar.js"

export const renderCustomSql = (
  node: ExpressionAst.CustomSqlNode,
  state: RenderState,
  dialect: SqlDialect,
  renderExpression: (expression: Expression.Any, state: RenderState, dialect: SqlDialect) => string
): string => node.strings.map((part, index) => {
  const value = node.values[index]
  if (value === undefined) {
    return part
  }
  return part + (
    Expression.TypeId in value
      ? renderExpression(value, state, dialect)
      : value.parts.map((segment) => dialect.quoteIdentifier(segment)).join(".")
  )
}).join("")
