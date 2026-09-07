import * as Query from "../query.js"
import type * as QueryAst from "../query-ast.js"
import * as Expression from "../scalar.js"
import * as ExpressionAst from "../expression-ast.js"
import type { RenderState, SqlDialect } from "../dialect.js"
import { renderCustomSql } from "../custom-sql-renderer.js"
import { quoteColumn, casedTableReferenceName } from "./source-context.js"

export const expectValueExpression = (
  _functionName: string,
  value: unknown
): Expression.Any => value as Expression.Any

export const expectBinaryExpressions = (
  _functionName: string,
  left: unknown,
  right: unknown
): readonly [Expression.Any, Expression.Any] => [left as Expression.Any, right as Expression.Any]

export const renderBinaryExpression = (
  functionName: string,
  operator: string,
  left: unknown,
  right: unknown,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const [leftExpression, rightExpression] = expectBinaryExpressions(functionName, left, right)
  return `(${dialect.renderExpression(leftExpression, state, dialect)} ${operator} ${dialect.renderExpression(rightExpression, state, dialect)})`
}

export const renderSubqueryExpressionPlan = (
  plan: Query.Plan.Any,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const statement = Query.getQueryState(plan).statement
  if (statement !== "select" && statement !== "set") {
    throw new Error("subquery expressions only accept select-like query plans")
  }
  return dialect.renderQueryAst(
    Query.getAst(plan) as QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>,
    state,
    dialect
  ).sql
}

/** Shared AST traversal; nested expressions retain the selected dialect owner. */
export const renderCommonExpression = (
  expression: Expression.Any,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const ast = (expression as Expression.Any & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.Any
  })[ExpressionAst.TypeId]
  switch (ast.kind) {
    case "column":
      return state.rowLocalColumns || ast.tableName.length === 0
        ? quoteColumn(ast.columnName, state, dialect, ast.tableName)
        : `${dialect.quoteIdentifier(casedTableReferenceName(ast.tableName, state))}.${quoteColumn(ast.columnName, state, dialect, ast.tableName)}`
    case "literal":
      if (typeof ast.value === "number" && !Number.isFinite(ast.value)) {
        throw new Error("Expected a finite numeric value")
      }
      return dialect.renderLiteral(ast.value, state, expression[Expression.TypeId])
    case "customSql":
      return renderCustomSql(ast, state, dialect, dialect.renderExpression)
    case "eq":
      return renderBinaryExpression("eq", "=", ast.left, ast.right, state, dialect)
    case "neq":
      return renderBinaryExpression("neq", "<>", ast.left, ast.right, state, dialect)
    case "lt":
      return renderBinaryExpression("lt", "<", ast.left, ast.right, state, dialect)
    case "lte":
      return renderBinaryExpression("lte", "<=", ast.left, ast.right, state, dialect)
    case "gt":
      return renderBinaryExpression("gt", ">", ast.left, ast.right, state, dialect)
    case "gte":
      return renderBinaryExpression("gte", ">=", ast.left, ast.right, state, dialect)
    case "like":
      return renderBinaryExpression("like", "like", ast.left, ast.right, state, dialect)
    case "isNull":
      return `(${dialect.renderExpression(expectValueExpression("isNull", ast.value), state, dialect)} is null)`
    case "isNotNull":
      return `(${dialect.renderExpression(expectValueExpression("isNotNull", ast.value), state, dialect)} is not null)`
    case "not":
      return `(not ${dialect.renderExpression(expectValueExpression("not", ast.value), state, dialect)})`
    case "upper":
      return `upper(${dialect.renderExpression(expectValueExpression("upper", ast.value), state, dialect)})`
    case "lower":
      return `lower(${dialect.renderExpression(expectValueExpression("lower", ast.value), state, dialect)})`
    case "count":
      return `count(${dialect.renderExpression(expectValueExpression("count", ast.value), state, dialect)})`
    case "max":
      return `max(${dialect.renderExpression(expectValueExpression("max", ast.value), state, dialect)})`
    case "min":
      return `min(${dialect.renderExpression(expectValueExpression("min", ast.value), state, dialect)})`
    case "and":
      return `(${ast.values.map((value: Expression.Any) => dialect.renderExpression(value, state, dialect)).join(" and ")})`
    case "or":
      return `(${ast.values.map((value: Expression.Any) => dialect.renderExpression(value, state, dialect)).join(" or ")})`
    case "coalesce":
      return `coalesce(${ast.values.map((value: Expression.Any) => dialect.renderExpression(value, state, dialect)).join(", ")})`
    case "in":
      return `(${dialect.renderExpression(ast.values[0]!, state, dialect)} in (${ast.values.slice(1).map((value: Expression.Any) => dialect.renderExpression(value, state, dialect)).join(", ")}))`
    case "notIn":
      return `(${dialect.renderExpression(ast.values[0]!, state, dialect)} not in (${ast.values.slice(1).map((value: Expression.Any) => dialect.renderExpression(value, state, dialect)).join(", ")}))`
    case "between":
      return `(${dialect.renderExpression(ast.values[0]!, state, dialect)} between ${dialect.renderExpression(ast.values[1]!, state, dialect)} and ${dialect.renderExpression(ast.values[2]!, state, dialect)})`
    case "concat":
      return dialect.renderConcat(ast.values.map((value: Expression.Any) => dialect.renderExpression(value, state, dialect)))
    case "case":
      return `case ${ast.branches.map((branch) =>
        `when ${dialect.renderExpression(branch.when, state, dialect)} then ${dialect.renderExpression(branch.then, state, dialect)}`
      ).join(" ")} else ${dialect.renderExpression(ast.else, state, dialect)} end`
    case "exists":
      return `exists (${renderSubqueryExpressionPlan(ast.plan, state, dialect)})`
    case "scalarSubquery":
      return `(${renderSubqueryExpressionPlan(ast.plan, state, dialect)})`
    case "inSubquery":
      return `(${dialect.renderExpression(expectValueExpression("inSubquery", ast.left), state, dialect)} in (${renderSubqueryExpressionPlan(ast.plan, state, dialect)}))`
  }
  throw new Error("Unsupported expression for SQL rendering")
}
