import * as Expression from "../Expression.ts"

/** Recursive selection value accepted by aggregate-shape validation. */
export type SelectionValue =
  | Expression.Any
  | {
      readonly [key: string]: SelectionValue
    }

const isExpression = (value: unknown): value is Expression.Any =>
  typeof value === "object" && value !== null && Expression.TypeId in value

const extractSourceKeys = (expression: Expression.Any): readonly string[] => {
  const source = expression[Expression.TypeId].source
  const sources = source === undefined ? [] : Array.isArray(source) ? source : [source]
  return [...new Set(sources
    .filter((value): value is { readonly tableName: string, readonly columnName: string } =>
      typeof value === "object" && value !== null && "tableName" in value && "columnName" in value)
    .map((value) => `${value.tableName}.${value.columnName}`))]
}

const selectionHasAggregate = (selection: SelectionValue): boolean => {
  if (isExpression(selection)) {
    return selection[Expression.TypeId].aggregation === "aggregate"
  }
  return Object.values(selection).some((value) => selectionHasAggregate(value))
}

const isGroupedSelectionValid = (
  selection: SelectionValue,
  groupedSources: ReadonlySet<string>
): boolean => {
  if (isExpression(selection)) {
    const aggregation = selection[Expression.TypeId].aggregation
    if (aggregation === "aggregate") {
      return true
    }
    if (aggregation === "window") {
      return false
    }
    return extractSourceKeys(selection).every((key) => groupedSources.has(key))
  }
  return Object.values(selection).every((value) => isGroupedSelectionValid(value, groupedSources))
}

/**
 * Validates that grouped/scalar selection mixing is legal for the provided
 * `groupBy(...)` expressions.
 */
export const validateAggregationSelection = (
  selection: SelectionValue,
  grouped: readonly Expression.Any[]
): void => {
  const groupedSources = new Set(grouped.flatMap((value) => extractSourceKeys(value)))
  const hasAggregate = selectionHasAggregate(selection)
  const isValid = hasAggregate || grouped.length > 0
    ? isGroupedSelectionValid(selection, groupedSources)
    : true
  if (!isValid) {
    throw new Error("Invalid grouped selection: scalar expressions must be covered by groupBy(...) when aggregates are present")
  }
}
