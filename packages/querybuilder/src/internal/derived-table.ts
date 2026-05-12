import { pipeArguments } from "effect/Pipeable"

import * as Expression from "./scalar.js"
import * as Plan from "./row-set.js"
import {
  type CompletePlan,
  type CteSource,
  type DerivedSelectionOf,
  type DerivedSource,
  type LateralSource,
  type QueryPlan,
  getAst,
  getQueryState,
  makeExpression,
  currentRequiredList,
  type SelectionOfPlan
} from "./query.js"
import * as ExpressionAst from "./expression-ast.js"
import { flattenSelection, validateProjections } from "./projections.js"

const DerivedProto = {
  pipe(this: unknown) {
    return pipeArguments(this, arguments)
  }
}

const attachPipe = <Value extends object>(value: Value): Value => {
  Object.defineProperty(value, "pipe", {
    configurable: true,
    writable: true,
    value: function(this: unknown) {
      return pipeArguments(value, arguments)
    }
  })
  return value
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

const assertSourceComplete = (
  plan: QueryPlan<any, any, any, any, any, any, any, any, any, any>
): void => {
  const required = currentRequiredList(plan[Plan.TypeId].required)
  if (required.length > 0) {
    throw new Error(`query references sources that are not yet in scope: ${required.join(", ")}`)
  }
}

const assertInlineSourceStatement = (
  plan: QueryPlan<any, any, any, any, any, any, any, any, any, any>
): void => {
  const statement = getQueryState(plan).statement
  if (statement !== "select" && statement !== "set") {
    throw new Error("inline derived sources only accept select-like query plans")
  }
}

const reboundedColumns = <
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Alias extends string
>(
  plan: PlanValue,
  alias: Alias
): DerivedSelectionOf<SelectionOfPlan<PlanValue>, Alias> => {
  const ast = getAst(plan)
  const selection = {} as Record<string, unknown>
  const projections = flattenSelection(ast.select as Record<string, unknown>)
  validateProjections(projections)
  for (const projection of projections) {
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
      kind: "scalar",
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
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Alias extends string
>(
  plan: CompletePlan<PlanValue>,
  alias: Alias
): DerivedSource<PlanValue, Alias> => {
  assertInlineSourceStatement(plan)
  assertSourceComplete(plan)
  const columns = reboundedColumns(plan, alias)
  const derived = attachPipe(Object.create(DerivedProto)) as Record<string, unknown>
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
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Alias extends string
>(
  plan: CompletePlan<PlanValue>,
  alias: Alias,
  recursive = false
): CteSource<PlanValue, Alias> => {
  assertSourceComplete(plan)
  const columns = reboundedColumns(plan, alias)
  const cte = attachPipe(Object.create(DerivedProto)) as Record<string, unknown>
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
  PlanValue extends QueryPlan<any, any, any, any, any, any, any, any, any, any>,
  Alias extends string
>(
  plan: PlanValue,
  alias: Alias
): LateralSource<PlanValue, Alias> => {
  assertInlineSourceStatement(plan)
  const columns = reboundedColumns(plan, alias)
  const lateral = attachPipe(Object.create(DerivedProto)) as Record<string, unknown>
  Object.assign(lateral, columns)
  lateral.kind = "lateral"
  lateral.name = alias
  lateral.baseName = alias
  lateral.dialect = plan[Plan.TypeId].dialect
  lateral.plan = plan
  lateral.required = currentRequiredList(plan[Plan.TypeId].required) as never
  lateral.columns = columns
  return lateral as unknown as LateralSource<PlanValue, Alias>
}
