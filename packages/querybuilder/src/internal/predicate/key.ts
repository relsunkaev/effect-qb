import type * as Expression from "../scalar.js"
import type * as ExpressionAst from "../expression-ast.js"
import type * as JsonPath from "../json/path.js"

export type ColumnKey<
  TableName extends string,
  ColumnName extends string
> = `${TableName}.${ColumnName}`

export type ColumnKeyOfAst<Ast extends ExpressionAst.Any> =
  Ast extends ExpressionAst.ColumnNode<infer TableName extends string, infer ColumnName extends string>
    ? ColumnKey<TableName, ColumnName>
    : never

type JsonTopLevelKey<Segments extends ExpressionAst.JsonSegmentTuple> =
  Segments extends readonly [infer Segment extends JsonPath.KeySegment<infer Key extends string>]
    ? Key
    : never

export type JsonPathPredicateKey<
  Base extends Expression.Any,
  Segments extends ExpressionAst.JsonSegmentTuple
> = [ColumnKeyOfExpression<Base>] extends [never]
  ? never
  : [JsonTopLevelKey<Segments>] extends [never]
    ? never
    : `${ColumnKeyOfExpression<Base>}#json:${JsonTopLevelKey<Segments>}`

export type PredicateKeyOfAst<Ast extends ExpressionAst.Any> =
  Ast extends ExpressionAst.ColumnNode<infer TableName extends string, infer ColumnName extends string>
    ? ColumnKey<TableName, ColumnName>
    : Ast extends ExpressionAst.JsonAccessNode<infer Kind, infer Base extends Expression.Any, infer Segments extends ExpressionAst.JsonSegmentTuple>
      ? Kind extends "jsonGetText" | "jsonPathText" | "jsonAccessText" | "jsonTraverseText"
        ? JsonPathPredicateKey<Base, Segments>
        : never
      : never

type AstOf<Value extends Expression.Any> = Value extends {
  readonly [ExpressionAst.TypeId]: infer Ast extends ExpressionAst.Any
} ? Ast : never

export type ColumnKeyOfExpression<Value extends Expression.Any> = ColumnKeyOfAst<AstOf<Value>>
export type PredicateKeyOfExpression<Value extends Expression.Any> = PredicateKeyOfAst<AstOf<Value>>

export type LiteralKey<Value> =
  Value extends string ? `string:${Value}` :
    Value extends number ? `number:${Value}` :
      Value extends boolean ? `boolean:${Value}` :
        Value extends null ? "null" :
          Value extends Date ? `date:${string}` :
            "unknown"

export type ValueKey<Value> = LiteralKey<Value>
