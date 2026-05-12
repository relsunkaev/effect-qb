import * as Expression from "./scalar.js"
import * as ExpressionAst from "./expression-ast.js"
import * as JsonPath from "./json/path.js"
import { columnPredicateKey } from "./predicate/runtime.js"

const subqueryPlanIds = new WeakMap<object, string>()
let nextSubqueryPlanId = 0

const subqueryPlanGroupingKey = (plan: unknown): string => {
  if (plan === null || typeof plan !== "object") {
    return "unknown"
  }
  const existing = subqueryPlanIds.get(plan)
  if (existing !== undefined) {
    return existing
  }
  const next = `${nextSubqueryPlanId++}`
  subqueryPlanIds.set(plan, next)
  return next
}

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

const isExpression = (value: unknown): value is Expression.Any =>
  value !== null && typeof value === "object" && Expression.TypeId in value

const expressionGroupingKey = (value: unknown): string =>
  isExpression(value) ? groupingKeyOfExpression(value) : "missing"

const escapeGroupingText = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/\|/g, "\\|")
    .replace(/=/g, "\\=")
    .replace(/>/g, "\\>")

const jsonSegmentGroupingKey = (segment: unknown): string => {
  if (segment !== null && typeof segment === "object" && "kind" in segment) {
    switch ((segment as { readonly kind: string }).kind) {
      case "key":
        return `key:${escapeGroupingText((segment as JsonPath.KeySegment).key)}`
      case "index":
        return `index:${(segment as JsonPath.IndexSegment).index}`
      case "wildcard":
        return "wildcard"
      case "slice": {
        const slice = segment as JsonPath.SliceSegment
        return `slice:${slice.start ?? ""}:${slice.end ?? ""}`
      }
      case "descend":
        return "descend"
    }
  }
  if (typeof segment === "string") {
    return `key:${escapeGroupingText(segment)}`
  }
  if (typeof segment === "number") {
    return `index:${segment}`
  }
  return "unknown"
}

const jsonPathGroupingKey = (segments: readonly unknown[] | undefined): string =>
  (segments ?? []).map(jsonSegmentGroupingKey).join(",")

const isJsonPath = (value: unknown): value is JsonPath.Path =>
  value !== null && typeof value === "object" && JsonPath.TypeId in value

const jsonOpaquePathGroupingKey = (value: unknown): string => {
  if (isJsonPath(value)) {
    return `jsonpath:${jsonPathGroupingKey(value.segments)}`
  }
  if (typeof value === "string") {
    return `jsonpath:${escapeGroupingText(value)}`
  }
  if (isExpression(value)) {
    return `jsonpath:${groupingKeyOfExpression(value)}`
  }
  return "jsonpath:unknown"
}

const jsonEntryGroupingKey = (
  entry: { readonly key: string; readonly value: Expression.Any }
): string => `${escapeGroupingText(entry.key)}=>${groupingKeyOfExpression(entry.value)}`

export const groupingKeyOfExpression = (expression: Expression.Any): string => {
  const ast = (expression as Expression.Any & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.Any
  })[ExpressionAst.TypeId]
  switch (ast.kind) {
    case "column":
      return `column:${columnPredicateKey(ast.tableName, ast.columnName)}`
    case "literal":
      return `literal:${literalGroupingKey(ast.value)}`
    case "cast":
      return `cast(${groupingKeyOfExpression(ast.value)} as ${ast.target.dialect}:${ast.target.kind})`
    case "collate":
      return `collate(${groupingKeyOfExpression(ast.value)},${ast.collation.map(escapeGroupingText).join(",")})`
    case "function":
      return `function(${escapeGroupingText(ast.name)},${ast.args.map(groupingKeyOfExpression).join(",")})`
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
    case "neq":
    case "lt":
    case "lte":
    case "gt":
    case "gte":
    case "like":
    case "ilike":
    case "regexMatch":
    case "regexIMatch":
    case "regexNotMatch":
    case "regexNotIMatch":
    case "isDistinctFrom":
    case "isNotDistinctFrom":
    case "contains":
    case "containedBy":
    case "overlaps":
      return `${ast.kind}(${groupingKeyOfExpression(ast.left)},${groupingKeyOfExpression(ast.right)})`
    case "and":
    case "or":
    case "coalesce":
    case "concat":
    case "in":
    case "notIn":
    case "between":
      return `${ast.kind}(${ast.values.map(groupingKeyOfExpression).join(",")})`
    case "case":
      return `case(${ast.branches.map((branch: ExpressionAst.CaseBranchNode) =>
        `when:${groupingKeyOfExpression(branch.when)}=>${groupingKeyOfExpression(branch.then)}`).join("|")};else:${groupingKeyOfExpression(ast.else)})`
    case "exists":
      return `exists(${subqueryPlanGroupingKey(ast.plan)})`
    case "scalarSubquery":
      return `scalarSubquery(${subqueryPlanGroupingKey(ast.plan)})`
    case "inSubquery":
      return `inSubquery(${groupingKeyOfExpression(ast.left)},${subqueryPlanGroupingKey(ast.plan)})`
    case "comparisonAny":
    case "comparisonAll":
      return `${ast.kind}(${ast.operator},${groupingKeyOfExpression(ast.left)},${subqueryPlanGroupingKey(ast.plan)})`
    case "jsonGet":
    case "jsonPath":
    case "jsonAccess":
    case "jsonTraverse":
    case "jsonGetText":
    case "jsonPathText":
    case "jsonAccessText":
    case "jsonTraverseText":
      return `json(${ast.kind},${expressionGroupingKey(ast.base)},${jsonPathGroupingKey(ast.segments)})`
    case "jsonHasKey":
    case "jsonKeyExists":
    case "jsonHasAnyKeys":
    case "jsonHasAllKeys":
      return `json(${ast.kind},${expressionGroupingKey(ast.base)},${(ast.keys ?? []).map(escapeGroupingText).join(",")})`
    case "jsonConcat":
    case "jsonMerge":
      return `json(${ast.kind},${expressionGroupingKey(ast.left)},${expressionGroupingKey(ast.right)},)`
    case "jsonDelete":
    case "jsonDeletePath":
    case "jsonRemove":
      return `json(${ast.kind},${expressionGroupingKey(ast.base)},${expressionGroupingKey(undefined)},${jsonPathGroupingKey(ast.segments)})`
    case "jsonSet":
      return `json(${ast.kind},${expressionGroupingKey(ast.base)},${expressionGroupingKey(ast.newValue)},${jsonPathGroupingKey(ast.segments)})`
    case "jsonInsert":
      return `json(${ast.kind},${expressionGroupingKey(ast.base)},${expressionGroupingKey(ast.insert)},${jsonPathGroupingKey(ast.segments)})`
    case "jsonPathExists":
    case "jsonPathMatch":
      return `json(${ast.kind},${expressionGroupingKey(ast.base)},${jsonOpaquePathGroupingKey(ast.query)})`
    case "jsonBuildObject":
      return `json(${ast.kind},${(ast.entries ?? []).map(jsonEntryGroupingKey).join("|")})`
    case "jsonBuildArray":
      return `json(${ast.kind},${(ast.values ?? []).map(groupingKeyOfExpression).join(",")})`
    case "jsonToJson":
    case "jsonToJsonb":
    case "jsonTypeOf":
    case "jsonLength":
    case "jsonKeys":
    case "jsonStripNulls":
      return `json(${ast.kind},${expressionGroupingKey(ast.value)})`
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
