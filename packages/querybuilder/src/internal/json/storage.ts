import type * as Expression from "../scalar.js"

declare const StoredShape: unique symbol

/** Schema encoding belongs to a whole JSON value, not to a SQL path result. */
export type WithStoredJson<Db extends Expression.DbType.Any, Encoded> =
  Db extends Expression.DbType.Json<any, any>
    ? Omit<Db, typeof StoredShape> & { readonly [StoredShape]: Encoded }
    : Db

export type WithoutStoredJson<Db extends Expression.DbType.Any> = Omit<Db, typeof StoredShape>

export type StoredOf<Value extends Expression.Any> =
  Expression.DbTypeOf<Value> extends { readonly [StoredShape]: infer Encoded }
    ? Encoded | (Expression.NullabilityOf<Value> extends "never" ? never : null)
    : Expression.RuntimeOf<Value>
