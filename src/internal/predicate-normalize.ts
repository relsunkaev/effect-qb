import type * as Expression from "../Expression.ts"
import type * as ExpressionAst from "./expression-ast.ts"
import type { ColumnKeyOfExpression, ValueKey } from "./predicate-key.ts"
import type { AtomFormula, FalseFormula, PredicateFormula, TrueFormula } from "./predicate-formula.ts"
import type { EqColumnAtom, EqLiteralAtom, NonNullAtom, NullAtom, UnknownAtom } from "./predicate-atom.ts"

type AstOf<Value extends Expression.Any> = Value extends {
  readonly [ExpressionAst.TypeId]: infer Ast extends ExpressionAst.Any
} ? Ast : never

type LiteralValueOfExpression<Value extends Expression.Any> = AstOf<Value> extends ExpressionAst.LiteralNode<infer Literal>
  ? Literal
  : never

type True = TrueFormula
type False = FalseFormula

type UnknownTag<Tag extends string> = AtomFormula<UnknownAtom<Tag>>
type AtomOf<Atom extends import("./predicate-atom.ts").PredicateAtom> = AtomFormula<Atom>

type FormulaOfEq<
  Left extends Expression.Any,
  Right extends Expression.Any
> =
  [ColumnKeyOfExpression<Left>] extends [never]
    ? [ColumnKeyOfExpression<Right>] extends [never]
      ? LiteralValueOfExpression<Left> extends infer LeftLiteral
        ? LiteralValueOfExpression<Right> extends infer RightLiteral
          ? [LeftLiteral] extends [never]
            ? UnknownTag<"eq:unsupported">
            : [RightLiteral] extends [never]
              ? UnknownTag<"eq:unsupported">
              : LeftLiteral extends null
                ? False
                : RightLiteral extends null
                  ? False
                  : [LeftLiteral] extends [RightLiteral]
                    ? True
                    : False
          : UnknownTag<"eq:unsupported">
        : UnknownTag<"eq:unsupported">
      : LiteralValueOfExpression<Left> extends infer LeftLiteral
        ? [LeftLiteral] extends [never]
          ? UnknownTag<"eq:unsupported">
          : LeftLiteral extends null
            ? False
            : AtomOf<EqLiteralAtom<ColumnKeyOfExpression<Right>, ValueKey<LeftLiteral>>>
        : UnknownTag<"eq:unsupported">
    : [ColumnKeyOfExpression<Right>] extends [never]
      ? LiteralValueOfExpression<Right> extends infer RightLiteral
        ? [RightLiteral] extends [never]
          ? UnknownTag<"eq:unsupported">
          : RightLiteral extends null
            ? False
            : AtomOf<EqLiteralAtom<ColumnKeyOfExpression<Left>, ValueKey<RightLiteral>>>
        : UnknownTag<"eq:unsupported">
      : AtomOf<import("./predicate-atom.ts").EqColumnAtom<ColumnKeyOfExpression<Left>, ColumnKeyOfExpression<Right>>>

type FormulaOfVariadic<
  Kind extends ExpressionAst.VariadicKind,
  Values extends readonly Expression.Any[]
> = Kind extends "and"
  ? import("./predicate-formula.ts").NormalizeBooleanConstants<import("./predicate-formula.ts").AllFormula<{
      readonly [K in keyof Values]: Values[K] extends Expression.Any ? FormulaOfExpression<Values[K]> : never
    } & readonly PredicateFormula[]>>
  : Kind extends "or"
    ? import("./predicate-formula.ts").NormalizeBooleanConstants<import("./predicate-formula.ts").AnyFormula<{
        readonly [K in keyof Values]: Values[K] extends Expression.Any ? FormulaOfExpression<Values[K]> : never
      } & readonly PredicateFormula[]>>
    : UnknownTag<`variadic:${Kind}`>

export type FormulaOfExpression<Value extends Expression.Any> =
  AstOf<Value> extends infer Ast extends ExpressionAst.Any
    ? Ast extends ExpressionAst.LiteralNode<infer Literal>
      ? Literal extends true
        ? True
        : Literal extends false
          ? False
          : UnknownTag<"literal:non-boolean">
      : Ast extends ExpressionAst.UnaryNode<infer Kind extends ExpressionAst.UnaryKind, infer Inner extends Expression.Any>
        ? Kind extends "isNull"
          ? [ColumnKeyOfExpression<Inner>] extends [never]
            ? UnknownTag<"isNull:unsupported">
            : AtomOf<NullAtom<ColumnKeyOfExpression<Inner>>>
          : Kind extends "isNotNull"
            ? [ColumnKeyOfExpression<Inner>] extends [never]
              ? UnknownTag<"isNotNull:unsupported">
              : AtomOf<NonNullAtom<ColumnKeyOfExpression<Inner>>>
            : Kind extends "not"
              ? import("./predicate-formula.ts").Not<FormulaOfExpression<Inner>>
              : UnknownTag<`unary:${Kind}`>
        : Ast extends ExpressionAst.BinaryNode<"eq", infer Left extends Expression.Any, infer Right extends Expression.Any>
          ? FormulaOfEq<Left, Right>
          : Ast extends ExpressionAst.VariadicNode<infer Kind extends ExpressionAst.VariadicKind, infer Values extends readonly Expression.Any[]>
            ? FormulaOfVariadic<Kind, Values>
            : UnknownTag<`expr:${Ast["kind"]}`>
    : UnknownTag<"missing-ast">

export type FormulaOfPredicate<Value> =
  Value extends true ? True :
    Value extends false ? False :
      Value extends Expression.Any ? FormulaOfExpression<Value> :
        UnknownTag<"predicate:unsupported">
