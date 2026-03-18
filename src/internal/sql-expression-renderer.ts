import * as Query from "../query.ts"
import * as Expression from "../expression.ts"
import * as QueryAst from "./query-ast.ts"
import type { RenderState, SqlDialect } from "./dialect.ts"
import * as ExpressionAst from "./expression-ast.ts"
import { flattenSelection, type Projection } from "./projections.ts"
import { type SelectionValue, validateAggregationSelection } from "./aggregation-validation.ts"

export interface RenderedQueryAst {
  readonly sql: string
  readonly projections: readonly Projection[]
}

export const renderQueryAst = (
  ast: QueryAst.Ast<Record<string, unknown>, any>,
  state: RenderState,
  dialect: SqlDialect
): RenderedQueryAst => {
  validateAggregationSelection(ast.select as SelectionValue, ast.groupBy)
  const flattened = flattenSelection(ast.select as Record<string, unknown>)
  const projections = flattened.map(({ path, alias }) => ({
    path,
    alias
  }))
  const selectSql = flattened.map(({ expression, alias }) =>
    `${renderExpression(expression, state, dialect)} as ${dialect.quoteIdentifier(alias)}`).join(", ")
  const clauses = [`select ${selectSql}`]
  if (ast.from) {
    clauses.push(`from ${renderSourceReference(ast.from.source, ast.from.tableName, ast.from.baseTableName, state, dialect)}`)
  }
  for (const join of ast.joins) {
    clauses.push(`${join.kind} join ${renderSourceReference(join.source, join.tableName, join.baseTableName, state, dialect)} on ${renderExpression(join.on, state, dialect)}`)
  }
  if (ast.where.length > 0) {
    clauses.push(`where ${ast.where.map((entry: QueryAst.WhereClause) => renderExpression(entry.predicate, state, dialect)).join(" and ")}`)
  }
  if (ast.groupBy.length > 0) {
    clauses.push(`group by ${ast.groupBy.map((value: QueryAst.Ast["groupBy"][number]) => renderExpression(value, state, dialect)).join(", ")}`)
  }
  if (ast.having.length > 0) {
    clauses.push(`having ${ast.having.map((entry: QueryAst.HavingClause) => renderExpression(entry.predicate, state, dialect)).join(" and ")}`)
  }
  if (ast.orderBy.length > 0) {
    clauses.push(`order by ${ast.orderBy.map((entry: QueryAst.OrderByClause) => `${renderExpression(entry.value, state, dialect)} ${entry.direction}`).join(", ")}`)
  }
  return {
    sql: clauses.join(" "),
    projections
  }
}

const renderSourceReference = (
  source: unknown,
  tableName: string,
  baseTableName: string,
  state: RenderState,
  dialect: SqlDialect
): string => {
  if (typeof source === "object" && source !== null && "kind" in source && (source as { readonly kind?: string }).kind === "derived") {
    const derived = source as unknown as {
      readonly name: string
      readonly plan: Query.QueryPlan<any, any, any, any, any, any, any, any, any>
    }
    return `(${renderQueryAst(Query.getAst(derived.plan) as QueryAst.Ast<Record<string, unknown>, any>, state, dialect).sql}) as ${dialect.quoteIdentifier(derived.name)}`
  }
  return dialect.renderTableReference(tableName, baseTableName)
}

/**
 * Renders a scalar expression AST into SQL text.
 *
 * This is parameterized by a runtime dialect so the same expression walker can
 * be reused across dialect-specific renderers while still delegating quoting
 * and literal serialization to the concrete dialect implementation.
 */
export const renderExpression = (
  expression: Expression.Any,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const ast = (expression as Expression.Any & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.Any
  })[ExpressionAst.TypeId]
  switch (ast.kind) {
    case "column":
      return `${dialect.quoteIdentifier(ast.tableName)}.${dialect.quoteIdentifier(ast.columnName)}`
    case "literal":
      return dialect.renderLiteral(ast.value, state)
    case "eq":
      return `(${renderExpression(ast.left, state, dialect)} = ${renderExpression(ast.right, state, dialect)})`
    case "neq":
      return `(${renderExpression(ast.left, state, dialect)} <> ${renderExpression(ast.right, state, dialect)})`
    case "lt":
      return `(${renderExpression(ast.left, state, dialect)} < ${renderExpression(ast.right, state, dialect)})`
    case "lte":
      return `(${renderExpression(ast.left, state, dialect)} <= ${renderExpression(ast.right, state, dialect)})`
    case "gt":
      return `(${renderExpression(ast.left, state, dialect)} > ${renderExpression(ast.right, state, dialect)})`
    case "gte":
      return `(${renderExpression(ast.left, state, dialect)} >= ${renderExpression(ast.right, state, dialect)})`
    case "like":
      return `(${renderExpression(ast.left, state, dialect)} like ${renderExpression(ast.right, state, dialect)})`
    case "ilike":
      return dialect.name === "postgres"
        ? `(${renderExpression(ast.left, state, dialect)} ilike ${renderExpression(ast.right, state, dialect)})`
        : `(lower(${renderExpression(ast.left, state, dialect)}) like lower(${renderExpression(ast.right, state, dialect)}))`
    case "isNull":
      return `(${renderExpression(ast.value, state, dialect)} is null)`
    case "isNotNull":
      return `(${renderExpression(ast.value, state, dialect)} is not null)`
    case "not":
      return `(not ${renderExpression(ast.value, state, dialect)})`
    case "upper":
      return `upper(${renderExpression(ast.value, state, dialect)})`
    case "lower":
      return `lower(${renderExpression(ast.value, state, dialect)})`
    case "count":
      return `count(${renderExpression(ast.value, state, dialect)})`
    case "max":
      return `max(${renderExpression(ast.value, state, dialect)})`
    case "min":
      return `min(${renderExpression(ast.value, state, dialect)})`
    case "and":
      return `(${ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(" and ")})`
    case "or":
      return `(${ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(" or ")})`
    case "coalesce":
      return `coalesce(${ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(", ")})`
    case "in":
      return `(${renderExpression(ast.values[0]!, state, dialect)} in (${ast.values.slice(1).map((value: Expression.Any) => renderExpression(value, state, dialect)).join(", ")}))`
    case "between":
      return `(${renderExpression(ast.values[0]!, state, dialect)} between ${renderExpression(ast.values[1]!, state, dialect)} and ${renderExpression(ast.values[2]!, state, dialect)})`
    case "concat":
      return dialect.renderConcat(ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)))
    case "case":
      return `case ${ast.branches.map((branch) =>
        `when ${renderExpression(branch.when, state, dialect)} then ${renderExpression(branch.then, state, dialect)}`
      ).join(" ")} else ${renderExpression(ast.else, state, dialect)} end`
    case "exists":
      return `exists (${renderQueryAst(
        Query.getAst(ast.plan) as QueryAst.Ast<Record<string, unknown>, any>,
        state,
        dialect
      ).sql})`
  }
  throw new Error("Unsupported expression for SQL rendering")
}
