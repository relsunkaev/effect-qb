import type * as Expression from "../scalar.js"
import type { CanCastDbType as LookupCanCastDbType, CanCompareDbTypes as LookupCanCompareDbTypes, CanContainDbTypes as LookupCanContainDbTypes, CanTextuallyCoerceDbType as LookupCanTextuallyCoerceDbType } from "../datatypes/lookup.js"

export type CanCompareDbTypes<
  Left extends Expression.DbType.Any,
  Right extends Expression.DbType.Any,
  Dialect extends string
> = LookupCanCompareDbTypes<Left, Right, Dialect>

export type CanContainDbTypes<
  Left extends Expression.DbType.Any,
  Right extends Expression.DbType.Any,
  Dialect extends string
> = LookupCanContainDbTypes<Left, Right, Dialect>

export type CanTextuallyCoerceDbType<
  Db extends Expression.DbType.Any,
  Dialect extends string
> = LookupCanTextuallyCoerceDbType<Db, Dialect>

export type CanCastDbType<
  Source extends Expression.DbType.Any,
  Target extends Expression.DbType.Any,
  Dialect extends string
> = LookupCanCastDbType<Source, Target, Dialect>
