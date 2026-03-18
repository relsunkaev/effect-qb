import type * as Expression from "../expression.ts"
import type { CoercionKindOf } from "./coercion-kind.ts"

type SameKind<
  Left extends string,
  Right extends string
> = [Left] extends [Right]
  ? ([Right] extends [Left] ? true : false)
  : false

export type CanCompareDbTypes<
  Left extends Expression.DbType.Any,
  Right extends Expression.DbType.Any,
  Dialect extends string
> = Left extends { readonly dialect: Dialect }
  ? Right extends { readonly dialect: Dialect }
    ? CoercionKindOf<Left> extends "null"
      ? false
      : CoercionKindOf<Right> extends "null"
        ? false
        : SameKind<CoercionKindOf<Left>, CoercionKindOf<Right>>
    : false
  : false

export type CanTextuallyCoerceDbType<
  Db extends Expression.DbType.Any,
  Dialect extends string
> = Db extends { readonly dialect: Dialect }
  ? CoercionKindOf<Db> extends "text"
    ? true
    : false
  : false

export type CanCastDbType<
  Source extends Expression.DbType.Any,
  Target extends Expression.DbType.Any,
  Dialect extends string
> = Source extends { readonly dialect: Dialect }
  ? Target extends { readonly dialect: Dialect }
    ? CoercionKindOf<Target> extends "null" ? false : true
    : false
  : false
