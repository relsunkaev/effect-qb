import * as Expression from "../Expression.ts"
import * as ExpressionAst from "./expression-ast.ts"

const literalGroupingKey = (value: unknown): string => {
  if (value instanceof Date) {
    return `date:${value.toISOString()}`
  }
  if (value === null) {
    return "null"
  }
  switch (typeof value) {
    case "string":
      return `string:${JSON.stringify(value)}`
    case "number":
      return `number:${value}`
    case "boolean":
      return `boolean:${value}`
    default:
      return `literal:${JSON.stringify(value)}`
  }
}

export const groupingKeyOfExpression = (expression: Expression.Any): string => {
  const ast = (expression as Expression.Any & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.Any
  })[ExpressionAst.TypeId]
  switch (ast.kind) {
    case "column":
      return `column:${ast.tableName}.${ast.columnName}`
    case "literal":
      return `literal:${literalGroupingKey(ast.value)}`
    case "isNull":
    case "isNotNull":
    case "not":
    case "upper":
    case "lower":
    case "count":
    case "max":
    case "min":
      return `${ast.kind}(${groupingKeyOfExpression(ast.value)})`
    case "eq":
      return `${ast.kind}(${groupingKeyOfExpression(ast.left)},${groupingKeyOfExpression(ast.right)})`
    case "and":
    case "or":
    case "coalesce":
    case "concat":
      return `${ast.kind}(${ast.values.map(groupingKeyOfExpression).join(",")})`
    case "case":
      return `case(${ast.branches.map((branch: ExpressionAst.CaseBranchNode) =>
        `when:${groupingKeyOfExpression(branch.when)}=>${groupingKeyOfExpression(branch.then)}`).join("|")};else:${groupingKeyOfExpression(ast.else)})`
    default:
      throw new Error("Unsupported expression for grouping key generation")
  }
}

export const dedupeGroupedExpressions = <Values extends readonly Expression.Any[]>(
  values: Values
): Values => {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = groupingKeyOfExpression(value)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  }) as unknown as Values
}
