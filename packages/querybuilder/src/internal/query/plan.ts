import { pipeArguments, type Pipeable } from "effect/Pipeable"
import type * as Schema from "effect/Schema"
import * as Expression from "../scalar.js"
import * as RowSet from "../row-set.js"
import * as ExpressionAst from "../expression-ast.js"
import * as QueryAst from "./ast.js"
import type { QueryCapability } from "./requirements.js"
import type { PredicateContext } from "../predicate/context.js"
import type { PredicateFormula } from "../predicate/formula.js"
import { trueFormula } from "../predicate/runtime.js"
import type {
  TupleDependencies,
  GroupingKeyOfAst,
  TrueAssumptions,
  InsertSourceState,
  QueryPlan,
  Plan,
  SelectionShape,
  QueryState
} from "./plan-types.js"

export type * from "./plan-types.js"
export { union_query_capabilities } from "./requirements.js"

/** Internal symbol used to preserve query-only phantom metadata through inference. */
export const QueryTypeId: unique symbol = Symbol.for("effect-qb/Query/internal")

/**
 * Creates a runtime query-plan value from public plan metadata plus the
 * internal clause AST.
 */
export const makePlan = <
  Selection,
  Required,
  Available extends Record<string, RowSet.AnySource>,
  Dialect extends string,
  Grouped extends string = never,
  ScopedNames extends string = Extract<keyof Available, string>,
  Outstanding extends string = Extract<Required, string>,
  Assumptions extends PredicateFormula = TrueAssumptions,
  Capabilities extends QueryCapability = "read",
  Statement extends QueryAst.QueryStatement = "select",
  Target = any,
  InsertState extends InsertSourceState = InsertSourceState,
  Facts extends PredicateContext = PredicateContext
>(
  state: RowSet.State<Selection, Required, Available, Dialect>,
  ast: QueryAst.Ast<Selection, Grouped, Statement>,
  options: {
    readonly assumptions?: Assumptions
    readonly capabilities?: Capabilities
    readonly statement?: Statement
    readonly target?: Target
    readonly insertSource?: InsertState
    readonly facts?: Facts
  } = {}
): QueryPlan<Selection, Required, Available, Dialect, Grouped, ScopedNames, Outstanding, Assumptions, Capabilities, Statement, Target, InsertState, Facts> => {
  const plan = Object.create(PlanProto)
  Object.defineProperty(plan, "pipe", {
    configurable: true,
    writable: true,
    value: function(this: Pipeable) {
      return pipeArguments(plan, arguments)
    }
  })
  plan[RowSet.TypeId] = state
  plan[QueryAst.TypeId] = ast
  plan[QueryTypeId] = {
    required: undefined as unknown as Outstanding,
    availableNames: undefined as unknown as ScopedNames,
    grouped: undefined as unknown as Grouped,
    assumptions: ((options.assumptions ?? trueFormula()) as Assumptions),
    facts: ((options.facts ?? undefined) as unknown as Facts),
    capabilities: undefined as unknown as Capabilities,
    statement: (options.statement ?? ("select" as Statement)) as Statement,
    target: (options.target ?? (undefined as unknown as Target)) as Target,
    insertSource: (options.insertSource ?? ("ready" as InsertState)) as InsertState
  }
  return plan
}

/** Typed construction inputs; public DSL signatures supply phantom result types. */
export type RuntimePlanConstructor = (...args: Parameters<typeof makePlan>) => any

/** Updates selection/grouping, merging source requirements and retaining query metadata. */
export const updatePlan = (
  plan: Plan.Any,
  changes: {
    readonly ast: Partial<Pick<QueryAst.Ast<SelectionShape>, "select" | "groupBy">>
    readonly additionalRequired: readonly string[]
  }
): Plan.Any => {
  const current = plan[RowSet.TypeId]
  const required = new Set([...currentRequiredList(current.required), ...changes.additionalRequired])
  return makePlan({
    ...current,
    selection: changes.ast.select ?? current.selection,
    required: [...required].filter((name) => !(name in current.available))
  }, {
    ...getAst(plan),
    ...changes.ast
  }, getQueryState(plan))
}

/** Returns the internal AST carried by a query plan. */
export const getAst = <
  Selection,
  Grouped extends string,
  Statement extends QueryAst.QueryStatement
>(
  plan: QueryPlan<Selection, any, any, any, Grouped, any, any, any, any, Statement>
): QueryAst.Ast<Selection, Grouped, Statement> => plan[QueryAst.TypeId]

/** Returns the internal phantom query state carried by a query plan. */
export const getQueryState = (
  plan: QueryPlan<any, any, any, any, any, any, any, any, any, any>
): QueryState<any, any, any, any, any, any, any, any, any> => plan[QueryTypeId]

/**
 * Creates a runtime expression object from fully computed static metadata.
 *
 * The query helpers use this instead of exposing ad hoc object shapes, so every
 * produced expression has the same structural contract as bound columns.
 */
export const makeExpression = <
  Runtime,
  Db extends Expression.DbType.Any,
  Nullable extends Expression.Nullability,
  Dialect extends string,
  Kind extends Expression.ScalarKind,
  Deps extends Expression.BindingId = never,
  Ast extends ExpressionAst.Any = ExpressionAst.Any,
  GroupKey extends string = GroupingKeyOfAst<Ast>
>(
  state: {
    readonly runtime: Runtime
    readonly dbType: Db
    readonly runtimeSchema?: Schema.Top
    readonly driverValueMapping?: Expression.DriverValueMapping
    readonly nullability: Nullable
    readonly dialect: Dialect
    readonly kind?: Kind
    readonly dependencies?: Record<string, true>
  },
  ast: Ast
): Expression.Scalar<Runtime, Db, Nullable, Dialect, Kind, Deps, GroupKey> & {
  readonly [ExpressionAst.TypeId]: Ast
} => {
  const expression = Object.create(ExpressionProto)
  Object.defineProperty(expression, "pipe", {
    configurable: true,
    writable: true,
    value: function(this: Pipeable) {
      return pipeArguments(expression, arguments)
    }
  })
  expression[Expression.TypeId] = {
    runtime: state.runtime,
    dbType: state.dbType,
    runtimeSchema: state.runtimeSchema,
    driverValueMapping: state.driverValueMapping,
    nullability: state.nullability,
    dialect: state.dialect,
    kind: state.kind ?? ("scalar" as Kind),
    dependencies: state.dependencies ?? {}
  } as Expression.State<Runtime, Db, Nullable, Dialect, Kind, Deps>
  expression[ExpressionAst.TypeId] = ast
  return expression
}

/**
 * Shared prototype for runtime expression values created by query helpers.
 *
 * These objects are intentionally minimal. They only need to support
 * `Pipeable.pipe(...)` plus the metadata stored under `Expression.TypeId`.
 */
const ExpressionProto = {
  pipe(this: Pipeable) {
    return pipeArguments(this, arguments)
  }
}

/**
 * Shared prototype for runtime plan values created by query helpers.
 *
 * Query plans behave like other Effect-style pipeable values so builders can be
 * chained through `.pipe(...)`.
 */
const PlanProto = {
  pipe(this: Pipeable) {
    return pipeArguments(this, arguments)
  }
}

/** Merges two expression dependency records into a single normalized record. */
export const mergeDependencies = <
  Left extends Expression.BindingId = never,
  Right extends Expression.BindingId = never
>(
  left: Record<Left, true> | undefined,
  right: Record<Right, true> | undefined = undefined
): Record<Left | Right, true> => ({
  ...(left ?? {}),
  ...(right ?? {})
}) as Record<Left | Right, true>

/** Merges expression aggregation kinds at runtime. */
export const mergeAggregationRuntime = (
  left: Expression.ScalarKind,
  right: Expression.ScalarKind = "scalar"
): Expression.ScalarKind =>
  left === "window" || right === "window"
    ? "window"
    : left === "aggregate" || right === "aggregate"
      ? "aggregate"
      : "scalar"

/** Folds runtime aggregation across a list of expressions. */
export const mergeAggregationManyRuntime = (
  values: readonly Expression.Any[]
): Expression.ScalarKind =>
  values.reduce(
    (current, value) => mergeAggregationRuntime(current, value[Expression.TypeId].kind),
    "scalar" as Expression.ScalarKind
  )

/** Merges expression nullability for null-propagating scalar operators. */
const mergeNullabilityRuntime = (
  left: Expression.Nullability,
  right: Expression.Nullability = "never"
): Expression.Nullability =>
  left === "always" || right === "always"
    ? "always"
    : left === "maybe" || right === "maybe"
      ? "maybe"
      : "never"

/** Folds runtime nullability across a list of expressions. */
export const mergeNullabilityManyRuntime = (
  values: readonly Expression.Any[]
): Expression.Nullability =>
  values.reduce(
    (current, value) => mergeNullabilityRuntime(current, value[Expression.TypeId].nullability),
    "never" as Expression.Nullability
  )

/** Merges dependency maps across a variadic expression input list. */
export const mergeManyDependencies = <Values extends readonly Expression.Any[]>(
  values: Values
): Record<TupleDependencies<Values>, true> =>
  values.reduce<Record<string, true>>(
    (current, value) => mergeDependencies(current, value[Expression.TypeId].dependencies) as Record<string, true>,
    {}
  ) as Record<TupleDependencies<Values>, true>

/**
 * Collects the required table names referenced by a runtime selection object.
 *
 * This mirrors the `ExtractRequired<...>` type-level computation so runtime plan
 * metadata stays aligned with the static model.
 */
export const extractRequiredRuntime = (selection: SelectionShape): readonly string[] => {
  const required = new Set<string>()
  const visit = (value: SelectionShape): void => {
    if (Expression.TypeId in value) {
      for (const tableName of Object.keys(value[Expression.TypeId].dependencies)) {
        required.add(tableName)
      }
      return
    }
    for (const nested of Object.values(value)) {
      visit(nested)
    }
  }
  visit(selection)
  return [...required]
}

/** Extracts the single top-level expression from a scalar subquery selection. */
export const extractSingleSelectedExpressionRuntime = (selection: SelectionShape): Expression.Any => {
  const record = selection as Record<string, Expression.Any>
  return record[Object.keys(record)[0]!]!
}

/** Converts the plan's runtime `required` metadata into a mutable string list. */
export const currentRequiredList = (required: unknown): string[] =>
  Array.isArray(required) ? [...required] : required === undefined ? [] : [required as string]
