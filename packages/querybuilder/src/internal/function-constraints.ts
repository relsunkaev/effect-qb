import type { OperandCompatibilityError } from "./coercion/errors.js"
import type * as Expression from "./scalar.js"

type BaseDbType<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
    ? BaseDbType<Base>
    : Db

type ShallowBaseDbType<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
    ? Base
    : Db

export type OrderedInput<
  Value extends Expression.Any,
  Dialect extends string,
  Operator extends string
> = BaseDbType<Expression.DbTypeOf<Value>> extends infer Db extends Expression.DbType.Any
  ? Db extends { readonly traits: { readonly ordered: true } }
    ? Value
    : OperandCompatibilityError<Operator, Db, Db, Dialect, "an ordered db type">
  : never

export type CaseConversionInput<
  Value,
  Db extends Expression.DbType.Any,
  Dialect extends string,
  Operator extends string
> = BaseDbType<Db> extends infer Base extends Expression.DbType.Any
  ? Base extends { readonly family: "text" }
    ? Value
    : Dialect extends "mysql" | "sqlite"
      ? Base extends { readonly family: "uuid" }
        ? Value
        : OperandCompatibilityError<Operator, Base, Base, Dialect, "a character string db type">
      : OperandCompatibilityError<Operator, Base, Base, Dialect, "a character string db type">
  : never

type IsNullExpression<Value extends Expression.Any> =
  ShallowBaseDbType<Expression.DbTypeOf<Value>> extends { readonly family: "null" }
    ? true
    : false

type CompareGroup<Value extends Expression.Any> =
  ShallowBaseDbType<Expression.DbTypeOf<Value>> extends {
    readonly compareGroup: infer Group extends string
  }
    ? Group
    : never

type CoalescePairGuard<
  Left extends Expression.Any,
  Right extends Expression.Any,
  Dialect extends string
> = [CompareGroup<Left>] extends [CompareGroup<Right>]
  ? [CompareGroup<Right>] extends [CompareGroup<Left>]
    ? true
    : OperandCompatibilityError<
        "coalesce",
        Expression.DbTypeOf<Left>,
        Expression.DbTypeOf<Right>,
        Dialect,
        "the same db type family"
      >
  : OperandCompatibilityError<
      "coalesce",
      Expression.DbTypeOf<Left>,
      Expression.DbTypeOf<Right>,
      Dialect,
      "the same db type family"
    >

type CoalesceTailGuard<
  Head extends Expression.Any,
  Tail extends readonly Expression.Any[],
  Dialect extends string
> = Tail extends readonly [
  infer Next extends Expression.Any,
  ...infer Rest extends readonly Expression.Any[]
]
  ? IsNullExpression<Next> extends true
    ? CoalesceTailGuard<Head, Rest, Dialect>
    : CoalescePairGuard<Head, Next, Dialect> extends true
      ? CoalesceTailGuard<Head, Rest, Dialect>
      : CoalescePairGuard<Head, Next, Dialect>
  : true

type CoalesceTupleGuard<
  Values extends readonly Expression.Any[],
  Dialect extends string
> = Values extends readonly [
  infer Head extends Expression.Any,
  ...infer Tail extends readonly Expression.Any[]
]
  ? IsNullExpression<Head> extends true
    ? CoalesceTupleGuard<Tail, Dialect>
    : CoalesceTailGuard<Head, Tail, Dialect>
  : true

export type CoalesceConstraint<
  Values extends readonly Expression.Any[],
  Dialect extends string
> = CoalesceTupleGuard<Values, Dialect> extends true
  ? unknown
  : readonly [CoalesceTupleGuard<Values, Dialect>]
