import { parse, toSql, type Expr } from "pgsql-ast-parser"
import { TypeId, fromSql, make, render, type SchemaExpression } from "./schema-expression-value.js"

export { TypeId, fromSql, isSchemaExpression, render, type Any, type SchemaExpression } from "./schema-expression-value.js"

// Keep serialization lazy: callers can retain and update their AST before rendering.
export const fromAst = (ast: Expr): SchemaExpression =>
  make({ ast, render: () => toSql.expr(ast) })

export const parseExpression = (sql: string): SchemaExpression =>
  fromAst(parse(sql, "expr"))

export const toAst = (expression: SchemaExpression): Expr => {
  const ast = expression[TypeId].ast
  if (ast !== undefined) {
    return ast
  }
  return parse(render(expression), "expr")
}

export const normalize = (expression: SchemaExpression): SchemaExpression =>
  (() => {
    const sql = render(expression)
    try {
      return parseExpression(sql)
    } catch {
      return fromSql(sql)
    }
  })()
