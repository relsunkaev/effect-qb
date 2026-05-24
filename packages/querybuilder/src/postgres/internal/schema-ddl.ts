import type * as Expression from "../../internal/scalar.js"
import type { RenderState, SqlDialect } from "../../internal/dialect.js"
import * as SchemaExpression from "../../internal/schema-expression.js"
import { renderExpression } from "../../internal/sql-expression-renderer.js"
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
      if (Number.isNaN(value.getTime())) {
        throw new Error("Expected a valid Date value")
      }
      return escapeString(value.toISOString())
    }
    return escapeString(String(value))
  }
}

const makeExpressionState = (state: Partial<RenderState> = {}): RenderState => ({
  ...state,
  params: [],
  ctes: [],
  cteNames: new Set(),
  cteSources: new Map()
})

export const renderDdlExpressionSql = (
  expression: DdlExpressionLike,
  state?: Partial<RenderState>
): string =>
  SchemaExpression.isSchemaExpression(expression)
    ? SchemaExpression.render(expression)
    : renderExpression(expression as Expression.Any, makeExpressionState(state), inlineLiteralDialect)

const stripRedundantOuterParens = (value: string): string => {
  let current = value.trim()
  while (current.startsWith("(") && current.endsWith(")")) {
    let depth = 0
    let wrapsWholeExpression = true
    let inSingleQuote = false
    let inDoubleQuote = false
    for (let index = 0; index < current.length; index++) {
      const char = current[index]!
      const previous = index > 0 ? current[index - 1] : undefined
      if (char === "'" && !inDoubleQuote && previous !== "\\") {
        inSingleQuote = !inSingleQuote
        continue
      }
      if (char === "\"" && !inSingleQuote && previous !== "\\") {
        inDoubleQuote = !inDoubleQuote
        continue
      }
      if (inSingleQuote || inDoubleQuote) {
        continue
      }
      if (char === "(") {
        depth += 1
      } else if (char === ")") {
        depth -= 1
        if (depth === 0 && index < current.length - 1) {
          wrapsWholeExpression = false
          break
        }
      }
    }
    if (!wrapsWholeExpression) {
      break
    }
    current = current.slice(1, -1).trim()
  }
  return current
}

const canonicalizeDdlExpressionSql = (value: string): string =>
  stripRedundantOuterParens(
    value
      .trim()
      .replace(/\s+/g, " ")
      .replace(/"[^"]+"\./g, "")
      .replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, "$1")
      .replace(/\bCOLLATE\b/g, "collate")
      .replace(
        /cast\(((?:'(?:[^']|'')*'|"[^"]+"|[a-zA-Z_][a-zA-Z0-9_]*|\([^()]+\))) as ([^)]+)\)/gi,
        (_, expression: string, target: string) => `${expression}::${target.trim()}`
      )
  )

export const normalizeDdlExpressionSql = (
  expression: DdlExpressionLike,
  state?: Partial<RenderState>
): string => {
  const rendered = renderDdlExpressionSql(expression, state)
  try {
    return canonicalizeDdlExpressionSql(toSql.expr(parse(rendered, "expr")))
  } catch {
    return canonicalizeDdlExpressionSql(rendered)
  }
}
