import * as ExpressionAst from "./expression-ast.js"
import * as Expression from "./scalar.js"
import {
  makeExpression,
  mergeManyDependencies,
  type MergeNullabilityTuple,
  type TupleDependencies,
  type TupleDialect
} from "./query.js"
import { literal } from "./standard-dsl.js"
import { validateWindowFrame } from "./window-frame.js"

export interface WindowOrderTerm<
  Value extends Expression.Any = Expression.Any
> {
  readonly value: Value
  readonly direction?: "asc" | "desc"
}

export interface WindowOrderSpec<
  PartitionBy extends readonly Expression.Any[] = readonly Expression.Any[],
  OrderBy extends readonly [WindowOrderTerm, ...WindowOrderTerm[]] =
    readonly [WindowOrderTerm, ...WindowOrderTerm[]]
> {
  readonly partitionBy?: PartitionBy
  readonly orderBy: OrderBy
  readonly frame?: never
}

export interface WindowSpec<
  PartitionBy extends readonly Expression.Any[] = readonly Expression.Any[],
  OrderBy extends readonly [WindowOrderTerm, ...WindowOrderTerm[]] =
    readonly [WindowOrderTerm, ...WindowOrderTerm[]]
> {
  readonly partitionBy?: PartitionBy
  readonly orderBy: OrderBy
  readonly frame?: ExpressionAst.WindowFrameNode<"rows" | "range">
}

type PartitionExpressions<Spec extends WindowSpec> =
  Spec["partitionBy"] extends readonly Expression.Any[] ? Spec["partitionBy"] : readonly []

type OrderExpression<Spec extends WindowSpec> =
  Spec["orderBy"][number] extends WindowOrderTerm<infer Value> ? Value : never

type SpecExpressions<Spec extends WindowSpec> = readonly [
  ...PartitionExpressions<Spec>,
  ...ReadonlyArray<OrderExpression<Spec>>
]

type WindowResult<
  Kind extends Extract<ExpressionAst.WindowKind, "lag" | "lead" | "firstValue" | "lastValue">,
  Value extends Expression.Any,
  Spec extends WindowSpec,
  Nullable extends Expression.Nullability,
  Extra extends readonly Expression.Any[] = readonly []
> = Expression.Scalar<
  Expression.RuntimeOf<Value>,
  Expression.DbTypeOf<Value>,
  Nullable,
  TupleDialect<readonly [Value, ...SpecExpressions<Spec>, ...Extra]>,
  "window",
  TupleDependencies<readonly [Value, ...SpecExpressions<Spec>, ...Extra]>
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.WindowNode<
    Kind,
    Value,
    PartitionExpressions<Spec>,
    readonly ExpressionAst.WindowOrderByNode[]
  >
}

const normalizeSpec = <Spec extends WindowSpec>(spec: Spec) => {
  validateWindowFrame(spec.frame)
  return {
    partitionBy: spec.partitionBy ?? [],
    orderBy: spec.orderBy.map((term) => ({
      value: term.value,
      direction: term.direction ?? "asc"
    })),
    frame: spec.frame
  }
}

const windowExpression = <
  Kind extends Extract<ExpressionAst.WindowKind, "lag" | "lead" | "firstValue" | "lastValue">,
  Value extends Expression.Any,
  Spec extends WindowSpec,
  Nullable extends Expression.Nullability
>(
  kind: Kind,
  value: Value,
  spec: Spec,
  nullability: Nullable,
  options: {
    readonly offset?: Expression.Any
    readonly defaultValue?: Expression.Any
  } = {}
): WindowResult<Kind, Value, Spec, Nullable> => {
  const normalized = normalizeSpec(spec)
  const expressions = [
    value,
    ...normalized.partitionBy,
    ...normalized.orderBy.map((term) => term.value),
    ...(options.offset === undefined ? [] : [options.offset]),
    ...(options.defaultValue === undefined ? [] : [options.defaultValue])
  ]
  return makeExpression({
    runtime: undefined as unknown as Expression.RuntimeOf<Value>,
    dbType: value[Expression.TypeId].dbType,
    runtimeSchema: value[Expression.TypeId].runtimeSchema,
    driverValueMapping: value[Expression.TypeId].driverValueMapping,
    nullability,
    dialect: expressions.find((entry) => entry[Expression.TypeId].dialect !== "standard")?.[Expression.TypeId].dialect ??
      value[Expression.TypeId].dialect,
    kind: "window",
    dependencies: mergeManyDependencies(expressions)
  }, {
    kind: "window",
    function: kind,
    value,
    ...options,
    ...normalized
  }) as never
}

export interface OffsetOptions<
  Value extends Expression.Any,
  Spec extends WindowOrderSpec
> {
  readonly spec: Spec
  readonly offset?: number
  readonly default?: Expression.RuntimeOf<Value>
}

/** Value from a preceding row in the ordered window. */
export const lag = <
  Value extends Expression.Any,
  Spec extends WindowOrderSpec
>(
  value: Value,
  options: OffsetOptions<Value, Spec>
): WindowResult<"lag", Value, Spec, "maybe"> => {
  if (options.offset !== undefined && (!Number.isSafeInteger(options.offset) || options.offset < 0)) {
    throw new Error("lag offset must be a non-negative safe integer")
  }
  return windowExpression("lag", value, options.spec, "maybe", {
    ...(options.offset === undefined && options.default === undefined
      ? {}
      : { offset: literal(options.offset ?? 1) }),
    ...(options.default === undefined ? {} : { defaultValue: literal(options.default as any) })
  })
}

/** Value from a following row in the ordered window. */
export const lead = <
  Value extends Expression.Any,
  Spec extends WindowOrderSpec
>(
  value: Value,
  options: OffsetOptions<Value, Spec>
): WindowResult<"lead", Value, Spec, "maybe"> => {
  if (options.offset !== undefined && (!Number.isSafeInteger(options.offset) || options.offset < 0)) {
    throw new Error("lead offset must be a non-negative safe integer")
  }
  return windowExpression("lead", value, options.spec, "maybe", {
    ...(options.offset === undefined && options.default === undefined
      ? {}
      : { offset: literal(options.offset ?? 1) }),
    ...(options.default === undefined ? {} : { defaultValue: literal(options.default as any) })
  })
}

/** First value in the configured window frame. */
export const firstValue = <
  Value extends Expression.Any,
  Spec extends WindowSpec
>(
  value: Value,
  spec: Spec
): WindowResult<"firstValue", Value, Spec, Expression.NullabilityOf<Value>> =>
  windowExpression("firstValue", value, spec, value[Expression.TypeId].nullability)

/** Last value in the configured window frame. */
export const lastValue = <
  Value extends Expression.Any,
  Spec extends WindowSpec
>(
  value: Value,
  spec: Spec
): WindowResult<"lastValue", Value, Spec, Expression.NullabilityOf<Value>> =>
  windowExpression("lastValue", value, spec, value[Expression.TypeId].nullability)
