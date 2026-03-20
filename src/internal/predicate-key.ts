import type * as Expression from "./expression.js"
import type * as ExpressionAst from "./expression-ast.js"

export type ColumnKey<
  TableName extends string,
  ColumnName extends string
> = `${TableName}.${ColumnName}`

export type ColumnKeyOfAst<Ast extends ExpressionAst.Any> =
  Ast extends ExpressionAst.ColumnNode<infer TableName extends string, infer ColumnName extends string>
    ? ColumnKey<TableName, ColumnName>
    : never

type AstOf<Value extends Expression.Any> = Value extends {
  readonly [ExpressionAst.TypeId]: infer Ast extends ExpressionAst.Any
} ? Ast : never

export type ColumnKeyOfExpression<Value extends Expression.Any> = ColumnKeyOfAst<AstOf<Value>>

export type LiteralKey<Value> =
  Value extends string ? `string:${Value}` :
    Value extends number ? `number:${Value}` :
      Value extends boolean ? `boolean:${Value}` :
        Value extends null ? "null" :
          Value extends Date ? `date:${string}` :
            "unknown"

export type ValueKey<Value> = LiteralKey<Value>
