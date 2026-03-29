import type * as Expression from "../internal/scalar.js"
import { postgresDsl } from "./internal/dsl.js"

type CastInput = Parameters<typeof postgresDsl.cast>[0]
type CastTarget = Parameters<typeof postgresDsl.cast>[1]
type CastExpression<Target extends CastTarget> = Expression.Scalar<
  Expression.RuntimeOfDbType<Target>,
  Target,
  Expression.Nullability,
  Target["dialect"],
  Expression.ScalarKind,
  Expression.BindingId
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
    ? ((value: CastInput) => postgresDsl.cast(value as never, args[0] as never))
    : postgresDsl.cast(args[0] as never, args[1] as never)) as unknown as typeof to

/** Postgres cast helpers. */
export const cast = { to }
