import type * as Expression from "../expression.ts"

export type OperandCompatibilityError<
  Operator extends string,
  Left extends Expression.DbType.Any,
  Right extends Expression.DbType.Any,
  Dialect extends string,
  Expected extends string
> = {
  readonly __effect_qb_error__: "effect-qb: incompatible operand types"
  readonly __effect_qb_operator__: Operator
  readonly __effect_qb_left_db_type__: Left
  readonly __effect_qb_right_db_type__: Right
  readonly __effect_qb_dialect__: Dialect
  readonly __effect_qb_expected__: Expected
  readonly __effect_qb_hint__: "Use cast(...) or pick values from the same db type family"
}

export type CastTargetError<
  Source extends Expression.DbType.Any,
  Target extends Expression.DbType.Any,
  Dialect extends string
> = {
  readonly __effect_qb_error__: "effect-qb: unsupported cast target"
  readonly __effect_qb_source_db_type__: Source
  readonly __effect_qb_target_db_type__: Target
  readonly __effect_qb_dialect__: Dialect
  readonly __effect_qb_hint__: "Use one of the supported Q.type.<kind>() witnesses"
}
