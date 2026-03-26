import type * as Expression from "../internal/expression.js"
import { postgresQuery } from "./private/query.js"

type CastInput = Parameters<typeof postgresQuery.cast>[0]
type CastTarget = Parameters<typeof postgresQuery.cast>[1]
type CastExpression<Target extends CastTarget> = Expression.Expression<
  Expression.RuntimeOfDbType<Target>,
  Target,
  Expression.Nullability,
  string,
  Expression.AggregationKind,
  any,
  Expression.SourceDependencies,
  Expression.SourceNullabilityMode
>

const to: {
  <Value extends CastInput, Target extends CastTarget>(
    value: Value,
    target: Target
  ): CastExpression<Target>
  <Target extends CastTarget>(
    target: Target
  ): <Value extends CastInput>(value: Value) => CastExpression<Target>
} = ((...args: [CastInput, CastTarget] | [CastTarget]) =>
  args.length === 1
    ? ((value: CastInput) => postgresQuery.cast(value as never, args[0] as never))
    : postgresQuery.cast(args[0] as never, args[1] as never)) as unknown as typeof to

/** Postgres cast helpers. */
export const cast = { to }
