import type * as Schema from "effect/Schema"

import * as ExpressionAst from "./expression-ast.js"
import * as Expression from "./scalar.js"
import {
  makeExpression,
  mergeAggregationManyRuntime,
  mergeManyDependencies,
  type MergeAggregation,
  type NormalizeDialect,
  type TupleDependencies,
  type TupleDialect
} from "./query.js"

/** A structured SQL identifier. Every path segment is quoted by the renderer. */
export type Identifier<
  Parts extends readonly [string, ...string[]] = readonly [string, ...string[]]
> = ExpressionAst.SqlIdentifierNode<Parts>

/** Creates a safely quoted identifier interpolation for {@link expression}. */
export const identifier = <
  const Parts extends readonly [string, ...string[]]
>(...parts: Parts): Identifier<Parts> => ({
  kind: "sqlIdentifier",
  parts
})

type Interpolation = Expression.Any | Identifier

type ExpressionsOf<
  Values extends readonly Interpolation[]
> = Extract<Values[number], Expression.Any>

type DialectOfValues<
  Values extends readonly Interpolation[],
  Db extends Expression.DbType.Any
> = [ExpressionsOf<Values>] extends [never]
  ? Db["dialect"]
  : TupleDialect<readonly ExpressionsOf<Values>[]>

type DependenciesOfValues<
  Values extends readonly Interpolation[]
> = TupleDependencies<readonly ExpressionsOf<Values>[]>

type KindOfValues<
  Values extends readonly Interpolation[],
  Current extends Expression.ScalarKind = "scalar"
> = Values extends readonly [infer Head, ...infer Tail extends readonly Interpolation[]]
  ? KindOfValues<
      Tail,
      Head extends Expression.Any
        ? MergeAggregation<Current, Expression.KindOf<Head>>
        : Current
    >
  : Current

export interface Options<
  Runtime,
  Db extends Expression.DbType.Any,
  Nullable extends Expression.Nullability,
  Kind extends Expression.ScalarKind = "scalar"
> {
  readonly dbType: Db
  readonly schema: Schema.Schema<Runtime>
  readonly nullability: Nullable
  readonly kind?: Kind
}

/**
 * Creates a typed SQL expression from a static template.
 *
 * Interpolations must be existing typed expressions or values returned by
 * {@link identifier}; runtime values should first be lifted with
 * `Query.literal(...)` so they remain bound parameters.
 */
export const expression = <
  Runtime,
  Db extends Expression.DbType.Any,
  Nullable extends Expression.Nullability,
  Kind extends Expression.ScalarKind = "scalar"
>(
  options: Options<Runtime, Db, Nullable, Kind>
) => <
  const Values extends readonly Interpolation[]
>(
  strings: TemplateStringsArray,
  ...values: Values
): Expression.Scalar<
  Runtime,
  Db,
  Nullable,
  NormalizeDialect<DialectOfValues<Values, Db>>,
  Kind extends "scalar" ? KindOfValues<Values> : Kind,
  DependenciesOfValues<Values>
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.CustomSqlNode<Values>
} => {
  const expressions = values.filter((value): value is Expression.Any =>
    Expression.TypeId in value)
  return makeExpression({
    runtime: undefined as unknown as Runtime,
    dbType: options.dbType,
    runtimeSchema: options.schema,
    driverValueMapping: options.dbType.driverValueMapping,
    nullability: options.nullability,
    dialect: (
      expressions.find((value) => value[Expression.TypeId].dialect !== "standard")?.[Expression.TypeId].dialect ??
      expressions[0]?.[Expression.TypeId].dialect ??
      options.dbType.dialect
    ) as NormalizeDialect<DialectOfValues<Values, Db>>,
    kind: (options.kind ?? mergeAggregationManyRuntime(expressions)) as Kind extends "scalar"
      ? KindOfValues<Values>
      : Kind,
    dependencies: mergeManyDependencies(expressions)
  }, {
    kind: "customSql",
    strings: [...strings],
    values
  }) as never
}
