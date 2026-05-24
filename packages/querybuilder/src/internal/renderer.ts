import * as Query from "./query.js"
import * as Expression from "./scalar.js"
import * as ExpressionAst from "./expression-ast.js"
import { flattenSelection, type Projection, validateProjections } from "./projections.js"
import * as QueryAst from "./query-ast.js"
import * as Plan from "./row-set.js"

/** Symbol used to attach rendered-query phantom row metadata. */
export const TypeId: unique symbol = Symbol.for("effect-qb/Renderer")

export type TypeId = typeof TypeId

/** Column projection metadata emitted by the renderer. */
export type { Projection }

/**
 * Rendered SQL plus phantom row typing.
 *
 * The rendered query exposes the SQL text, parameter values, target dialect,
 * and projection metadata alongside the canonical row type implied by the
 * source query plan.
 */
export interface RenderedQuery<Row, Dialect extends string = string> {
  readonly sql: string
  readonly params: readonly unknown[]
  readonly dialect: Dialect
  readonly projections: readonly Projection[]
  readonly valueMappings?: Expression.DriverValueMappings
  readonly [TypeId]: {
    readonly row: Row
    readonly dialect: Dialect
  }
}

/** Extracts the row type carried by a rendered query. */
export type RowOf<Value extends RenderedQuery<any, any>> = Value[typeof TypeId]["row"]

/**
 * Public rendering contract.
 *
 * Renderers only accept complete, dialect-compatible plans. The returned
 * `RenderedQuery` keeps the canonical `Query.ResultRow<...>` type attached for
 * downstream executor layers, and the built-in renderer also performs a
 * matching runtime aggregate-shape validation.
 */
export interface Renderer<Dialect extends string = string> {
  readonly dialect: Dialect
  render<PlanValue extends Query.Plan.Any>(
    plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
  ): RenderedQuery<Query.ResultRow<PlanValue>, Dialect>
}

type CustomRender<Dialect extends string> = <PlanValue extends Query.Plan.Any>(
  plan: Query.DialectCompatiblePlan<PlanValue, Dialect>
) => {
  readonly sql: string
  readonly params?: readonly unknown[]
  readonly projections?: readonly Projection[]
  readonly valueMappings?: Expression.DriverValueMappings
}

const projectionPathKey = (path: readonly string[]): string => JSON.stringify(path)

const formatProjectionPath = (path: readonly string[]): string => path.join(".")

export const DialectConflict = "__effect_qb_dialect_conflict__"

const isObject = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null

const isExpression = (value: unknown): value is Expression.Any =>
  isObject(value) && Expression.TypeId in value

const isPlan = (value: unknown): value is Query.Plan.Any =>
  isObject(value) && Plan.TypeId in value

const mergeRuntimeDialect = (
  left: string | undefined,
  right: string | undefined
): string | undefined => {
  if (left === DialectConflict || right === DialectConflict) {
    return DialectConflict
  }
  if (right === undefined || right === "standard") {
    return left ?? right
  }
  if (left === undefined || left === "standard") {
    return right
  }
  return left === right ? left : DialectConflict
}

type RuntimeDialectContext = {
  readonly plans: WeakSet<object>
  readonly expressions: WeakSet<object>
}

const visitExpressionList = (
  values: unknown,
  dialect: string | undefined,
  context: RuntimeDialectContext
): string | undefined =>
  Array.isArray(values)
    ? values.reduce<string | undefined>(
        (current, child) => visitExpression(child, current, context),
        dialect
      )
    : dialect

const visitExpression = (
  value: unknown,
  dialect: string | undefined,
  context: RuntimeDialectContext
): string | undefined => {
  if (!isExpression(value)) {
    return dialect
  }
  let next = mergeRuntimeDialect(dialect, value[Expression.TypeId].dialect)
  if (context.expressions.has(value)) {
    return next
  }
  context.expressions.add(value)
  const ast = (value as { readonly [ExpressionAst.TypeId]?: ExpressionAst.Any })[ExpressionAst.TypeId]
  if (ast === undefined) {
    return next
  }
  switch (ast.kind) {
    case "cast": {
      const targetDialect = isObject(ast.target) && typeof ast.target.dialect === "string"
        ? ast.target.dialect
        : undefined
      next = mergeRuntimeDialect(next, targetDialect)
      return visitExpression(ast.value, next, context)
    }
    case "collate":
    case "upper":
    case "lower":
    case "count":
    case "max":
    case "min":
    case "isNull":
    case "isNotNull":
    case "not":
    case "jsonToJson":
    case "jsonToJsonb":
    case "jsonTypeOf":
    case "jsonLength":
    case "jsonKeys":
    case "jsonStripNulls":
      return visitExpression(ast.value, next, context)
    case "function":
    case "and":
    case "or":
    case "coalesce":
    case "concat":
    case "in":
    case "notIn":
    case "between":
    case "jsonBuildArray":
      return visitExpressionList(
        (ast as { readonly values?: readonly unknown[]; readonly args?: readonly unknown[] }).values ??
          (ast as { readonly args?: readonly unknown[] }).args ??
          [],
        next,
        context
      )
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
    case "jsonConcat":
    case "jsonMerge":
      return visitExpression(ast.right, visitExpression(ast.left, next, context), context)
    case "case": {
      const branches = Array.isArray(ast.branches) ? ast.branches : []
      const withBranches = branches.reduce(
        (current, branch) => isObject(branch)
          ? visitExpression(branch.then, visitExpression(branch.when, current, context), context)
          : current,
        next
      )
      return visitExpression(ast.else, withBranches, context)
    }
    case "exists":
    case "scalarSubquery":
      return visitPlan(ast.plan, next, context)
    case "inSubquery":
    case "comparisonAny":
    case "comparisonAll":
      return visitPlan(ast.plan, visitExpression(ast.left, next, context), context)
    case "window": {
      const withValue = visitExpression(ast.value, next, context)
      const partitions = Array.isArray(ast.partitionBy) ? ast.partitionBy : []
      const orderBy = Array.isArray(ast.orderBy) ? ast.orderBy : []
      const withPartitions = partitions.reduce((current, child) => visitExpression(child, current, context), withValue)
      return orderBy.reduce((current, order) => isObject(order) ? visitExpression(order.value, current, context) : current, withPartitions)
    }
    case "jsonGet":
    case "jsonPath":
    case "jsonAccess":
    case "jsonTraverse":
    case "jsonGetText":
    case "jsonPathText":
    case "jsonAccessText":
    case "jsonTraverseText":
    case "jsonDelete":
    case "jsonDeletePath":
    case "jsonRemove":
      return visitExpression(ast.base, next, context)
    case "jsonHasKey":
    case "jsonKeyExists":
    case "jsonHasAnyKeys":
    case "jsonHasAllKeys":
      return visitExpression(ast.base, next, context)
    case "jsonSet":
      return visitExpression(ast.newValue, visitExpression(ast.base, next, context), context)
    case "jsonInsert":
      return visitExpression(ast.insert, visitExpression(ast.base, next, context), context)
    case "jsonPathExists":
    case "jsonPathMatch":
      return visitExpression(ast.query, visitExpression(ast.base, next, context), context)
    case "jsonBuildObject":
      return ((ast as { readonly entries?: readonly { readonly value: unknown }[] }).entries ?? []).reduce<string | undefined>(
        (current, entry) => visitExpression(entry.value, current, context),
        next
      )
    case "column":
    case "literal":
    case "excluded":
      return next
  }
  return next
}

const visitSelection = (
  value: unknown,
  dialect: string | undefined,
  context: RuntimeDialectContext
): string | undefined => {
  if (isExpression(value)) {
    return visitExpression(value, dialect, context)
  }
  if (!isObject(value)) {
    return dialect
  }
  return Object.values(value).reduce<string | undefined>(
    (current, child) => visitSelection(child, current, context),
    dialect
  )
}

const visitSource = (
  value: unknown,
  dialect: string | undefined,
  context: RuntimeDialectContext
): string | undefined => {
  if (!isObject(value)) {
    return dialect
  }
  let next = isPlan(value)
    ? mergeRuntimeDialect(dialect, value[Plan.TypeId].dialect)
    : dialect
  const sourceDialect = value.dialect
  if (typeof sourceDialect === "string") {
    next = mergeRuntimeDialect(next, sourceDialect)
  }
  if ("plan" in value) {
    next = visitPlan(value.plan, next, context)
  } else if (QueryAst.TypeId in value) {
    next = visitPlan(value, next, context)
  }
  return next
}

const visitSourceClause = (
  clause: QueryAst.FromClause | QueryAst.JoinClause | undefined,
  dialect: string | undefined,
  context: RuntimeDialectContext
): string | undefined => clause === undefined ? dialect : visitSource(clause.source, dialect, context)

const visitAssignment = (
  assignment: QueryAst.AssignmentClause,
  dialect: string | undefined,
  context: RuntimeDialectContext
): string | undefined => visitExpression(assignment.value, dialect, context)

const visitAssignments = (
  assignments: readonly QueryAst.AssignmentClause[] | undefined,
  dialect: string | undefined,
  context: RuntimeDialectContext
): string | undefined =>
  assignments?.reduce((current, assignment) => visitAssignment(assignment, current, context), dialect) ?? dialect

const visitInsertSource = (
  source: QueryAst.InsertSourceClause | undefined,
  dialect: string | undefined,
  context: RuntimeDialectContext
): string | undefined => {
  if (source === undefined) {
    return dialect
  }
  switch (source.kind) {
    case "values":
      return source.rows.reduce(
        (current, row) => visitAssignments(row.values, current, context),
        dialect
      )
    case "query":
      return visitPlan(source.query, dialect, context)
    case "unnest":
      return dialect
  }
}

const visitPlan = (
  value: unknown,
  dialect: string | undefined,
  context: RuntimeDialectContext
): string | undefined => {
  if (!isPlan(value)) {
    return dialect
  }
  let next = mergeRuntimeDialect(dialect, value[Plan.TypeId].dialect)
  if (context.plans.has(value)) {
    return next
  }
  context.plans.add(value)
  if (!(QueryAst.TypeId in value)) {
    return next
  }
  const ast = Query.getAst(value)
  next = visitSelection(ast.select, next, context)
  next = visitSelection(ast.distinctOn, next, context)
  next = visitSourceClause(ast.from, next, context)
  next = ast.fromSources?.reduce((current, source) => visitSourceClause(source, current, context), next) ?? next
  next = visitSourceClause(ast.into, next, context)
  next = visitSourceClause(ast.target, next, context)
  next = ast.targets?.reduce((current, source) => visitSourceClause(source, current, context), next) ?? next
  next = visitSourceClause(ast.using, next, context)
  next = ast.where.reduce((current, clause) => visitExpression(clause.predicate, current, context), next)
  next = ast.having.reduce((current, clause) => visitExpression(clause.predicate, current, context), next)
  next = ast.joins.reduce(
    (current, join) => visitExpression(join.on, visitSourceClause(join, current, context), context),
    next
  )
  next = ast.groupBy.reduce((current, expression) => visitExpression(expression, current, context), next)
  next = ast.orderBy.reduce((current, order) => visitExpression(order.value, current, context), next)
  next = visitExpression(ast.limit, next, context)
  next = visitExpression(ast.offset, next, context)
  next = ast.setOperations?.reduce((current, operation) => visitPlan(operation.query, current, context), next) ?? next
  next = visitAssignments(ast.values, next, context)
  next = visitInsertSource(ast.insertSource, next, context)
  next = visitAssignments(ast.set, next, context)
  if (ast.conflict !== undefined) {
    next = visitExpression(ast.conflict.target?.kind === "columns" ? ast.conflict.target.where : undefined, next, context)
    next = visitAssignments(ast.conflict.values, next, context)
    next = visitExpression(ast.conflict.where, next, context)
  }
  if (ast.merge !== undefined) {
    next = visitExpression(ast.merge.on, next, context)
    next = visitExpression(ast.merge.whenMatched?.predicate, next, context)
    next = visitAssignments(ast.merge.whenMatched?.kind === "update" ? ast.merge.whenMatched.values : undefined, next, context)
    next = visitExpression(ast.merge.whenNotMatched?.predicate, next, context)
    next = visitAssignments(ast.merge.whenNotMatched?.values, next, context)
  }
  return next
}

export const runtimePlanDialect = (plan: Query.Plan.Any): string | undefined =>
  visitPlan(plan, undefined, {
    plans: new WeakSet<object>(),
    expressions: new WeakSet<object>()
  })

const validateProjectionPathsMatchSelection = (
  plan: Query.Plan.Any,
  projections: readonly Projection[]
): void => {
  const expected = flattenSelection(Query.getAst(plan).select as Record<string, unknown>)
  const expectedPaths = new Set(expected.map((projection) => projectionPathKey(projection.path)))
  const actualPaths = new Set(projections.map((projection) => projectionPathKey(projection.path)))
  for (const projection of projections) {
    if (!expectedPaths.has(projectionPathKey(projection.path))) {
      throw new Error(`Projection path ${formatProjectionPath(projection.path)} does not exist in the query selection`)
    }
  }
  for (const projection of expected) {
    if (!actualPaths.has(projectionPathKey(projection.path))) {
      throw new Error(`Projection path ${formatProjectionPath(projection.path)} is missing from rendered projections`)
    }
  }
}

/**
 * Constructs a renderer from a dialect and implementation callback.
 */
export function make<Dialect extends string>(
  dialect: Dialect,
  render: CustomRender<Dialect>
): Renderer<Dialect>
export function make<Dialect extends string>(
  dialect: Dialect,
  render: CustomRender<Dialect>
): Renderer<Dialect> {
  if (typeof render !== "function") {
    throw new Error(`Renderer.make requires an explicit render implementation for dialect: ${dialect}`)
  }
  return {
    dialect,
    render(plan) {
      const required = Query.currentRequiredList(plan[Plan.TypeId].required)
      if (required.length > 0) {
        throw new Error(`query references sources that are not yet in scope: ${required.join(", ")}`)
      }
      const planDialect = runtimePlanDialect(plan as Query.Plan.Any) ?? plan[Plan.TypeId].dialect
      if (planDialect === DialectConflict || (planDialect !== dialect && planDialect !== "standard")) {
        throw new Error("effect-qb: plan dialect is not compatible with the target renderer or executor")
      }
      const rendered = render(plan)
      const projections = rendered.projections ?? []
      validateProjections(projections)
      validateProjectionPathsMatchSelection(plan as Query.Plan.Any, projections)
      return {
        sql: rendered.sql,
        params: rendered.params ?? [],
        projections,
        valueMappings: rendered.valueMappings,
        dialect,
        [TypeId]: {
          row: undefined as any,
          dialect
        }
      }
    }
  } as Renderer<Dialect>
}
