import * as Schema from "effect/Schema"
import type * as Expression from "./scalar.js"
import type * as ExpressionAst from "./expression-ast.js"
import { makeExpression, type LiteralValue } from "./query.js"
import type { RuntimeOfDbType } from "./coercion/analysis.js"

export interface QueryDialectProfile<
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any,
  TypeWitnesses extends object = object
> {
  readonly dialect: Dialect
  readonly textDb: TextDb
  readonly numericDb: NumericDb
  readonly boolDb: BoolDb
  readonly timestampDb: TimestampDb
  readonly nullDb: NullDb
  readonly type: TypeWitnesses
}

export type DialectLiteralDbType<
  Value extends LiteralValue,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> =
  Value extends string ? TextDb :
    Value extends number ? NumericDb :
      Value extends boolean ? BoolDb :
        Value extends Date ? TimestampDb :
          NullDb

export type DialectLiteralRuntime<
  Value extends LiteralValue,
  TimestampDb extends Expression.DbType.Any
> = Value extends Date
  ? RuntimeOfDbType<TimestampDb>
  : Value

export type LiteralNullability<Value extends LiteralValue> = Value extends null ? "always" : "never"

export type DialectLiteralExpression<
  Value extends LiteralValue,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
> = Expression.Scalar<
  DialectLiteralRuntime<Value, TimestampDb>,
  DialectLiteralDbType<Value, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  LiteralNullability<Value>,
  Dialect,
  "scalar",
  never
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.LiteralNode<Value>
}

const literalSchemaOf = <Value extends LiteralValue>(
  value: Value
): Schema.Top | undefined => {
  if (value === null || value instanceof Date) {
    return undefined
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return undefined
  }
  return Schema.Literal(value) as unknown as Schema.Top
}

export const makeDialectLiteral = <
  const Value extends LiteralValue,
  Dialect extends string,
  TextDb extends Expression.DbType.Any,
  NumericDb extends Expression.DbType.Any,
  BoolDb extends Expression.DbType.Any,
  TimestampDb extends Expression.DbType.Any,
  NullDb extends Expression.DbType.Any
>(
  profile: QueryDialectProfile<Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
  value: Value
): DialectLiteralExpression<Value, Dialect, TextDb, NumericDb, BoolDb, TimestampDb, NullDb> =>
  makeExpression({
    runtime: undefined as any,
    dbType: (
      value === null ? profile.nullDb :
        value instanceof Date ? profile.timestampDb :
          typeof value === "string" ? profile.textDb :
            typeof value === "number" ? profile.numericDb :
              profile.boolDb
    ) as DialectLiteralDbType<Value, TextDb, NumericDb, BoolDb, TimestampDb, NullDb>,
    runtimeSchema: literalSchemaOf(value),
    nullability: (value === null ? "always" : "never") as LiteralNullability<Value>,
    dialect: profile.dialect as Dialect,
    kind: "scalar",
    dependencies: {}
  }, {
    kind: "literal",
    value
  })

export const makeDialectColumn = <
  Dialect extends string,
  Name extends string,
  Db extends Expression.DbType.Any
>(
  dialect: Dialect,
  name: Name,
  dbType: Db,
  nullable = false
): Expression.Scalar<
  Expression.RuntimeOfDbType<Db> | null,
  Db,
  Expression.Nullability,
  Dialect,
  "scalar",
  never
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.ColumnNode<"", Name>
} =>
  makeExpression({
    runtime: undefined as unknown as Expression.RuntimeOfDbType<Db> | (typeof nullable extends true ? null : never),
    dbType,
    nullability: (nullable ? "maybe" : "never") as typeof nullable extends true ? "maybe" : "never",
    dialect,
    kind: "scalar",
    dependencies: {}
  }, {
    kind: "column",
    tableName: "",
    columnName: name
  }) as Expression.Scalar<
    Expression.RuntimeOfDbType<Db> | null,
    Db,
    Expression.Nullability,
    Dialect,
    "scalar",
    never
  > & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.ColumnNode<"", Name>
  }
