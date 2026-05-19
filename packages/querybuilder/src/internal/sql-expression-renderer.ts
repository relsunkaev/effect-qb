import type { RenderState, SqlDialect } from "./dialect.js"
import type * as Expression from "./scalar.js"
import type * as QueryAst from "./query-ast.js"
import type { Projection } from "./projections.js"
import { renderExpression as renderMysqlExpression } from "./dialect-renderers/mysql.js"
import { renderQueryAst as renderMysqlQueryAst } from "./dialect-renderers/mysql.js"
import { renderExpression as renderPostgresExpression } from "./dialect-renderers/postgres.js"
import { renderQueryAst as renderPostgresQueryAst } from "./dialect-renderers/postgres.js"
import { renderExpression as renderSqliteExpression } from "./dialect-renderers/sqlite.js"
import { renderQueryAst as renderSqliteQueryAst } from "./dialect-renderers/sqlite.js"

export interface RenderedAst {
  readonly sql: string
  readonly projections: readonly Projection[]
}

export const renderQueryAst = (
  ast: QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>,
  state: RenderState,
  dialect: SqlDialect
): RenderedAst => {
  switch (dialect.name) {
    case "mysql":
      return renderMysqlQueryAst(ast, state, dialect)
    case "sqlite":
      return renderSqliteQueryAst(ast, state, dialect)
    case "postgres":
    case "standard":
      return renderPostgresQueryAst(ast, state, dialect)
    default:
      throw new Error(`Unsupported SQL dialect: ${dialect.name}`)
  }
}

export const renderExpression = (
  expression: Expression.Any,
  state: RenderState,
  dialect: SqlDialect
): string => {
  switch (dialect.name) {
    case "mysql":
      return renderMysqlExpression(expression, state, dialect)
    case "sqlite":
      return renderSqliteExpression(expression, state, dialect)
    case "postgres":
    case "standard":
      return renderPostgresExpression(expression, state, dialect)
    default:
      throw new Error(`Unsupported SQL dialect: ${dialect.name}`)
  }
}
