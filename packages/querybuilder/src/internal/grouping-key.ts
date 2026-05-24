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

const requiredExpressionGroupingKey = (
  functionName: string,
  value: unknown
): string => {
  if (!isExpression(value)) {
    throw new Error(`${functionName}(...) requires a value expression`)
  }
  return groupingKeyOfExpression(value)
}

const requiredBinaryExpressionGroupingKey = (
  functionName: string,
  left: unknown,
  right: unknown
): string => {
  if (!isExpression(left) || !isExpression(right)) {
    throw new Error(`${functionName}(...) requires left and right expressions`)
  }
  return `${groupingKeyOfExpression(left)},${groupingKeyOfExpression(right)}`
}

const functionCallArgsGroupingKey = (args: unknown): string => {
  if (!Array.isArray(args)) {
    throw new Error("function calls require an argument array")
  }
  if (args.some((arg) => !isExpression(arg))) {
    throw new Error("function call arguments require value expressions")
  }
  return args.map(groupingKeyOfExpression).join(",")
}

const requiredVariadicGroupingValues = (
  functionName: string,
  values: unknown
): readonly Expression.Any[] => {
  const arityError = () => {
    switch (functionName) {
      case "and":
        return new Error("and(...) requires at least one predicate")
      case "or":
        return new Error("or(...) requires at least one predicate")
      case "coalesce":
        return new Error("coalesce(...) requires at least one value")
      case "concat":
        return new Error("concat(...) requires at least two values")
      case "in":
        return new Error("in(...) requires at least one candidate value")
      case "notIn":
        return new Error("notIn(...) requires at least one candidate value")
      case "between":
        return new Error("between(...) requires exactly three operands")
      default:
        return new Error(`${functionName}(...) requires value expressions`)
    }
  }
  if (!Array.isArray(values)) {
    throw arityError()
  }
  const entries = values as readonly unknown[]
  const hasExpectedArity =
    functionName === "between"
      ? entries.length === 3
      : functionName === "concat" || functionName === "in" || functionName === "notIn"
        ? entries.length >= 2
        : entries.length >= 1
  if (!hasExpectedArity) {
    throw arityError()
  }
  if (entries.some((entry) => !isExpression(entry))) {
    throw new Error(`${functionName}(...) requires value expressions`)
  }
  return entries as readonly Expression.Any[]
}

const variadicGroupingKey = (
  functionName: string,
  values: unknown
): string => requiredVariadicGroupingValues(functionName, values).map(groupingKeyOfExpression).join(",")

const castTargetGroupingKey = (target: unknown): string => {
  if (
    target !== null &&
    typeof target === "object" &&
    typeof (target as { readonly dialect?: unknown }).dialect === "string" &&
    typeof (target as { readonly kind?: unknown }).kind === "string"
  ) {
    return `${(target as { readonly dialect: string }).dialect}:${(target as { readonly kind: string }).kind}`
  }
  throw new Error("cast(...) requires a target db type")
}

const escapeGroupingText = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/\|/g, "\\|")
    .replace(/=/g, "\\=")
    .replace(/>/g, "\\>")

const functionCallNameGroupingKey = (name: unknown): string => {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("function calls require a non-empty function name")
  }
  return escapeGroupingText(name)
}

const quantifiedComparisonGroupingName = (
  kind: "comparisonAny" | "comparisonAll"
): "compareAny" | "compareAll" =>
  kind === "comparisonAny" ? "compareAny" : "compareAll"

const caseGroupingKey = (
  branches: unknown,
  fallback: unknown
): string => {
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new Error("case(...) requires at least one branch")
  }
  if (!isExpression(fallback)) {
    throw new Error("case(...) requires an else expression")
  }
  if (branches.some((branch) =>
    typeof branch !== "object" ||
    branch === null ||
    !isExpression((branch as { readonly when?: unknown }).when) ||
    !isExpression((branch as { readonly then?: unknown }).then)
  )) {
    throw new Error("case(...) requires every branch to define when and then expressions")
  }
  return `case(${branches.map((branch: ExpressionAst.CaseBranchNode) =>
    `when:${groupingKeyOfExpression(branch.when)}=>${groupingKeyOfExpression(branch.then)}`).join("|")};else:${groupingKeyOfExpression(fallback)})`
}

const collationGroupingKey = (collation: unknown): string => {
  if (!Array.isArray(collation) || collation.length === 0 || collation.some((segment) => typeof segment !== "string" || segment.length === 0)) {
    throw new Error("collate(...) requires at least one collation identifier")
  }
  return collation.map(escapeGroupingText).join(",")
}

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

const isOptionalJsonPathNumber = (value: unknown): boolean =>
  value === undefined || (typeof value === "number" && Number.isFinite(value))

const isJsonPathSegment = (segment: unknown): boolean => {
  if (typeof segment === "string") {
    return true
  }
  if (typeof segment === "number") {
    return Number.isFinite(segment)
  }
  if (segment === null || typeof segment !== "object" || !("kind" in segment)) {
    return false
  }
  switch ((segment as { readonly kind?: unknown }).kind) {
    case "key":
      return typeof (segment as { readonly key?: unknown }).key === "string"
    case "index": {
      const index = (segment as { readonly index?: unknown }).index
      return typeof index === "number" && Number.isFinite(index)
    }
    case "wildcard":
    case "descend":
      return true
    case "slice":
      return isOptionalJsonPathNumber((segment as { readonly start?: unknown }).start) &&
        isOptionalJsonPathNumber((segment as { readonly end?: unknown }).end)
    default:
      return false
  }
}

const jsonPathGroupingKey = (segments: unknown): string => {
  if (segments === undefined) {
    return ""
  }
  if (!Array.isArray(segments)) {
    throw new Error("JSON path expressions require a segment array")
  }
  if (segments.some((segment) => !isJsonPathSegment(segment))) {
    throw new Error("JSON path segments require string, number, or path segment objects")
  }
  return segments.map(jsonSegmentGroupingKey).join(",")
}

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

const jsonKeysGroupingKey = (keys: unknown): string => {
  if (!Array.isArray(keys) || keys.length === 0) {
    return ""
  }
  if (keys.some((key) => typeof key !== "string" || key.length === 0)) {
    throw new Error("json key predicates require string keys")
  }
  return keys.map(escapeGroupingText).join(",")
}

const jsonBuildObjectGroupingKey = (entries: unknown): string => {
  if (!Array.isArray(entries)) {
    throw new Error("json build object expressions require an entries array")
  }
  if (entries.some((entry) =>
    typeof entry !== "object" ||
    entry === null ||
    typeof (entry as { readonly key?: unknown }).key !== "string" ||
    !isExpression((entry as { readonly value?: unknown }).value)
  )) {
    throw new Error("json build object entries require string keys and value expressions")
  }
  return entries.map((entry: { readonly key: string; readonly value: Expression.Any }) =>
    `${escapeGroupingText(entry.key)}=>${groupingKeyOfExpression(entry.value)}`).join("|")
}

const jsonBuildArrayGroupingKey = (values: unknown): string => {
  if (!Array.isArray(values)) {
    throw new Error("json build array expressions require a value array")
  }
  if (values.some((value) => !isExpression(value))) {
    throw new Error("json build array entries require value expressions")
  }
  return values.map(groupingKeyOfExpression).join(",")
}

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
      return `cast(${requiredExpressionGroupingKey("cast", ast.value)} as ${castTargetGroupingKey(ast.target)})`
    case "collate":
      return `collate(${requiredExpressionGroupingKey("collate", ast.value)},${collationGroupingKey(ast.collation)})`
    case "function":
      return `function(${functionCallNameGroupingKey(ast.name)},${functionCallArgsGroupingKey(ast.args)})`
    case "isNull":
    case "isNotNull":
    case "not":
    case "upper":
    case "lower":
    case "count":
    case "max":
    case "min":
      return `${ast.kind}(${requiredExpressionGroupingKey(ast.kind, ast.value)})`
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
      return `${ast.kind}(${requiredBinaryExpressionGroupingKey(ast.kind, ast.left, ast.right)})`
    case "and":
    case "or":
    case "coalesce":
    case "concat":
    case "in":
    case "notIn":
    case "between":
      return `${ast.kind}(${variadicGroupingKey(ast.kind, ast.values)})`
    case "case":
      return caseGroupingKey(ast.branches, ast.else)
    case "exists":
      return `exists(${subqueryPlanGroupingKey(ast.plan)})`
    case "scalarSubquery":
      return `scalarSubquery(${subqueryPlanGroupingKey(ast.plan)})`
    case "inSubquery":
      return `inSubquery(${requiredExpressionGroupingKey("inSubquery", ast.left)},${subqueryPlanGroupingKey(ast.plan)})`
    case "comparisonAny":
    case "comparisonAll":
      return `${ast.kind}(${ast.operator},${requiredExpressionGroupingKey(quantifiedComparisonGroupingName(ast.kind), ast.left)},${subqueryPlanGroupingKey(ast.plan)})`
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
      return `json(${ast.kind},${expressionGroupingKey(ast.base)},${jsonKeysGroupingKey(ast.keys)})`
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
      return `json(${ast.kind},${jsonBuildObjectGroupingKey(ast.entries)})`
    case "jsonBuildArray":
      return `json(${ast.kind},${jsonBuildArrayGroupingKey(ast.values)})`
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
