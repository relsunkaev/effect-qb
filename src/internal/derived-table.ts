import { pipeArguments } from "effect/Pipeable"

import * as Expression from "../expression.ts"
import * as Plan from "../plan.ts"
import {
  type CompletePlan,
  type DerivedSelectionOf,
  type DerivedSource,
  type QueryPlan,
  getAst,
  makeExpression,
  type SelectionOfPlan
} from "../query.ts"
import * as ExpressionAst from "./expression-ast.ts"
import { flattenSelection } from "./projections.ts"

const DerivedProto = {
  pipe(this: unknown) {
    return pipeArguments(this, arguments)
  }
}

const setPath = (
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown
): void => {
  let current = target
  for (let index = 0; index < path.length - 1; index++) {
    const segment = path[index]!
    const existing = current[segment]
    if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
      current = existing as Record<string, unknown>
      continue
    }
    const next: Record<string, unknown> = {}
    current[segment] = next
    current = next
  }
  current[path[path.length - 1]!] = value
}

const pathAlias = (path: readonly string[]): string => path.join("__")

const reboundedColumns = <
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any>,
  Alias extends string
>(
  plan: CompletePlan<PlanValue>,
  alias: Alias
): DerivedSelectionOf<SelectionOfPlan<PlanValue>, Alias> => {
  const ast = getAst(plan)
  const selection = {} as Record<string, unknown>
  for (const projection of flattenSelection(ast.select as Record<string, unknown>)) {
    const expectedAlias = pathAlias(projection.path)
    if (projection.alias !== expectedAlias) {
      throw new Error(
        `Derived subqueries currently require path-based output aliases; expected '${expectedAlias}' for path '${projection.path.join(".")}'`
      )
    }
    const expression = projection.expression
    setPath(selection, projection.path, makeExpression({
      runtime: undefined as never,
      dbType: expression[Expression.TypeId].dbType,
      nullability: expression[Expression.TypeId].nullability,
      dialect: expression[Expression.TypeId].dialect,
      aggregation: "scalar",
      source: {
        tableName: alias,
        columnName: projection.alias,
        baseTableName: alias
      },
      sourceNullability: "propagate" as const,
      dependencies: {
        [alias]: true
      } as Record<Alias, true>
    }, {
      kind: "column",
      tableName: alias,
      columnName: projection.alias
    } satisfies ExpressionAst.ColumnNode<Alias, string>))
  }
  return selection as DerivedSelectionOf<SelectionOfPlan<PlanValue>, Alias>
}

export const makeDerivedSource = <
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any>,
  Alias extends string
>(
  plan: CompletePlan<PlanValue>,
  alias: Alias
): DerivedSource<PlanValue, Alias> => {
  const columns = reboundedColumns(plan, alias)
  const derived = Object.create(DerivedProto) as Record<string, unknown>
  Object.assign(derived, columns)
  derived.kind = "derived"
  derived.name = alias
  derived.baseName = alias
  derived.dialect = plan[Plan.TypeId].dialect
  derived.plan = plan
  derived.columns = columns
  return derived as unknown as DerivedSource<PlanValue, Alias>
}
