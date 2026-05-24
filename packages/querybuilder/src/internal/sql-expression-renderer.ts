import type { RenderedAst, RenderState, SqlDialect } from "./dialect.js"
import type * as Expression from "./scalar.js"
import type * as QueryAst from "./query-ast.js"

export const renderQueryAst = (
  ast: QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>,
  state: RenderState,
  dialect: SqlDialect
): RenderedAst => {
  return dialect.renderQueryAst(ast, state, dialect)
}

export const renderExpression = (
  expression: Expression.Any,
  state: RenderState,
  dialect: SqlDialect
): string => {
  return dialect.renderExpression(expression, state, dialect)
}
