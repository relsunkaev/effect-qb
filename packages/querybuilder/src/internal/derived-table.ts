import { pipeArguments } from "effect/Pipeable"

import * as Expression from "./expression.js"
import * as Plan from "./plan.js"
import {
  type CompletePlan,
  type CteSource,
  type DerivedSelectionOf,
  type DerivedSource,
  type LateralSource,
  type QueryPlan,
  getAst,
  makeExpression,
  type SelectionOfPlan
} from "./query.js"
import * as ExpressionAst from "./expression-ast.js"
import { flattenSelection } from "./projections.js"

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
  plan: PlanValue,
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
      runtimeSchema: expression[Expression.TypeId].runtimeSchema,
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
  derived.required = undefined as never
  derived.columns = columns
  return derived as unknown as DerivedSource<PlanValue, Alias>
}

export const makeCteSource = <
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any>,
  Alias extends string
>(
  plan: CompletePlan<PlanValue>,
  alias: Alias,
  recursive = false
): CteSource<PlanValue, Alias> => {
  const columns = reboundedColumns(plan, alias)
  const cte = Object.create(DerivedProto) as Record<string, unknown>
  Object.assign(cte, columns)
  cte.kind = "cte"
  cte.name = alias
  cte.baseName = alias
  cte.dialect = plan[Plan.TypeId].dialect
  cte.plan = plan
  cte.recursive = recursive
  cte.required = undefined as never
  cte.columns = columns
  return cte as unknown as CteSource<PlanValue, Alias>
}

export const makeLateralSource = <
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any>,
  Alias extends string
>(
  plan: PlanValue,
  alias: Alias
): LateralSource<PlanValue, Alias> => {
  const columns = reboundedColumns(plan, alias)
  const lateral = Object.create(DerivedProto) as Record<string, unknown>
  Object.assign(lateral, columns)
  lateral.kind = "lateral"
  lateral.name = alias
  lateral.baseName = alias
  lateral.dialect = plan[Plan.TypeId].dialect
  lateral.plan = plan
  lateral.required = undefined as never
  lateral.columns = columns
  return lateral as unknown as LateralSource<PlanValue, Alias>
}
