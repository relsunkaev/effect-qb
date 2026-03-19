import * as Expression from "./expression.ts"
import { groupingKeyOfExpression } from "./grouping-key.ts"

/** Recursive selection value accepted by aggregate-shape validation. */
export type SelectionValue =
  | Expression.Any
  | {
      readonly [key: string]: SelectionValue
    }

const isExpression = (value: unknown): value is Expression.Any =>
  typeof value === "object" && value !== null && Expression.TypeId in value

const selectionHasAggregate = (selection: SelectionValue): boolean => {
  if (isExpression(selection)) {
    return selection[Expression.TypeId].aggregation === "aggregate"
  }
  return Object.values(selection).some((value) => selectionHasAggregate(value))
}

const isGroupedSelectionValid = (
  selection: SelectionValue,
  groupedExpressions: ReadonlySet<string>
): boolean => {
  if (isExpression(selection)) {
    const aggregation = selection[Expression.TypeId].aggregation
    if (aggregation === "aggregate") {
      return true
    }
    if (aggregation === "window") {
      return false
    }
    if (Object.keys(selection[Expression.TypeId].dependencies).length === 0) {
      return true
    }
    return groupedExpressions.has(groupingKeyOfExpression(selection))
  }
  return Object.values(selection).every((value) => isGroupedSelectionValid(value, groupedExpressions))
}

/**
 * Validates that grouped/scalar selection mixing is legal for the provided
 * `groupBy(...)` expressions.
 */
export const validateAggregationSelection = (
  selection: SelectionValue,
  grouped: readonly Expression.Any[]
): void => {
  const groupedExpressions = new Set(grouped.map(groupingKeyOfExpression))
  const hasAggregate = selectionHasAggregate(selection)
  const isValid = hasAggregate || grouped.length > 0
    ? isGroupedSelectionValid(selection, groupedExpressions)
    : true
  if (!isValid) {
    throw new Error("Invalid grouped selection: scalar expressions must be covered by groupBy(...) when aggregates are present")
  }
}
