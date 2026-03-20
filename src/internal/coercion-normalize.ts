import type * as Expression from "./expression.js"

/** Extracts the database type carried by an expression. */
export type DbTypeOfExpression<Value extends Expression.Any> = Expression.DbTypeOf<Value>

/** Extracts the decoded runtime type carried by an expression. */
export type RuntimeOfExpression<Value extends Expression.Any> = Expression.RuntimeOf<Value>
