import type * as Expression from "./scalar.js"
import type { CastTargetError, OperandCompatibilityError } from "./coercion-errors.js"
import type { CanCastDbType, CanCompareDbTypes, CanTextuallyCoerceDbType } from "./coercion-rules.js"

export type ComparableDbType<
  Left extends Expression.DbType.Any,
  Right extends Expression.DbType.Any,
  Dialect extends string,
  Operator extends string = "comparison"
> = CanCompareDbTypes<Left, Right, Dialect> extends true
  ? Right
  : OperandCompatibilityError<Operator, Left, Right, Dialect, "the same db type family">

export type TextCompatibleDbType<
  Db extends Expression.DbType.Any,
  Dialect extends string,
  Operator extends string = "text operator"
> = CanTextuallyCoerceDbType<Db, Dialect> extends true
  ? Db
  : OperandCompatibilityError<Operator, Db, Db, Dialect, "a text-compatible db type">

export type CastableDbType<
  Source extends Expression.DbType.Any,
  Target extends Expression.DbType.Any,
  Dialect extends string
> = CanCastDbType<Source, Target, Dialect> extends true
  ? Target
  : CastTargetError<Source, Target, Dialect>

export type RuntimeOfDbType<Db extends Expression.DbType.Any> = Expression.RuntimeOfDbType<Db>
