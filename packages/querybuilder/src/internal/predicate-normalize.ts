import type * as Expression from "./expression.js"
import type * as ExpressionAst from "./expression-ast.js"
import type { ColumnKeyOfExpression, ValueKey } from "./predicate-key.js"
import type { AllFormula, AnyFormula, AtomFormula, FalseFormula, NotFormula, PredicateFormula, TrueFormula } from "./predicate-formula.js"
import type { EqColumnAtom, EqLiteralAtom, NeqLiteralAtom, NonNullAtom, NullAtom, UnknownAtom } from "./predicate-atom.js"

type AstOf<Value extends Expression.Any> = Value extends {
  readonly [ExpressionAst.TypeId]: infer Ast extends ExpressionAst.Any
} ? Ast : never

type LiteralValueOfExpression<Value extends Expression.Any> = AstOf<Value> extends ExpressionAst.LiteralNode<infer Literal>
  ? Literal
  : never

type True = TrueFormula
type False = FalseFormula

type UnknownTag<Tag extends string> = AtomFormula<UnknownAtom<Tag>>
type AtomOf<Atom extends import("./predicate-atom.js").PredicateAtom> = AtomFormula<Atom>
type FactOf<Atom extends import("./predicate-atom.js").PredicateAtom> = AtomFormula<Atom>

type NonNullFactsOfExpression<Value extends Expression.Any> =
  [ColumnKeyOfExpression<Value>] extends [never]
    ? never
    : FactOf<NonNullAtom<ColumnKeyOfExpression<Value>>>

type CombineFacts<
  Left extends PredicateFormula,
  Right extends PredicateFormula
> = [Left] extends [never]
  ? Right
  : [Right] extends [never]
    ? Left
    : import("./predicate-formula.js").NormalizeBooleanConstants<AllFormula<[Left, Right]>>

type FactsOfExpressions<Values extends readonly Expression.Any[]> =
  Values extends readonly [
    infer Head extends Expression.Any,
    ...infer Tail extends readonly Expression.Any[]
  ]
    ? CombineFacts<FormulaOfExpression<Head>, FactsOfExpressions<Tail>>
    : never

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
      : AtomOf<import("./predicate-atom.js").EqColumnAtom<ColumnKeyOfExpression<Left>, ColumnKeyOfExpression<Right>>>

type FormulaOfNeq<
  Left extends Expression.Any,
  Right extends Expression.Any
> =
  [ColumnKeyOfExpression<Left>] extends [never]
    ? [ColumnKeyOfExpression<Right>] extends [never]
      ? LiteralValueOfExpression<Left> extends infer LeftLiteral
        ? LiteralValueOfExpression<Right> extends infer RightLiteral
          ? [LeftLiteral] extends [never]
            ? UnknownTag<"neq:unsupported">
            : [RightLiteral] extends [never]
              ? UnknownTag<"neq:unsupported">
              : LeftLiteral extends null
                ? False
                : RightLiteral extends null
                  ? False
                  : [LeftLiteral] extends [RightLiteral]
                    ? False
                    : True
          : UnknownTag<"neq:unsupported">
        : UnknownTag<"neq:unsupported">
      : LiteralValueOfExpression<Left> extends infer LeftLiteral
        ? [LeftLiteral] extends [never]
          ? UnknownTag<"neq:unsupported">
          : LeftLiteral extends null
            ? False
            : AtomOf<NeqLiteralAtom<ColumnKeyOfExpression<Right>, ValueKey<LeftLiteral>>>
        : UnknownTag<"neq:unsupported">
    : [ColumnKeyOfExpression<Right>] extends [never]
      ? LiteralValueOfExpression<Right> extends infer RightLiteral
        ? [RightLiteral] extends [never]
          ? UnknownTag<"neq:unsupported">
          : RightLiteral extends null
            ? False
            : AtomOf<NeqLiteralAtom<ColumnKeyOfExpression<Left>, ValueKey<RightLiteral>>>
        : UnknownTag<"neq:unsupported">
      : CombineFacts<NonNullFactsOfExpression<Left>, NonNullFactsOfExpression<Right>>

type FormulaOfIsNotDistinctFrom<
  Left extends Expression.Any,
  Right extends Expression.Any
> =
  LiteralValueOfExpression<Left> extends infer LeftLiteral
    ? LiteralValueOfExpression<Right> extends infer RightLiteral
      ? [LeftLiteral] extends [never]
        ? [RightLiteral] extends [never]
          ? UnknownTag<"isNotDistinctFrom:unsupported">
          : RightLiteral extends null
            ? [ColumnKeyOfExpression<Left>] extends [never]
              ? UnknownTag<"isNotDistinctFrom:unsupported">
              : AtomOf<NullAtom<ColumnKeyOfExpression<Left>>>
            : UnknownTag<"isNotDistinctFrom:unsupported">
        : LeftLiteral extends null
          ? [ColumnKeyOfExpression<Right>] extends [never]
            ? UnknownTag<"isNotDistinctFrom:unsupported">
            : AtomOf<NullAtom<ColumnKeyOfExpression<Right>>>
          : RightLiteral extends null
            ? [ColumnKeyOfExpression<Left>] extends [never]
              ? UnknownTag<"isNotDistinctFrom:unsupported">
              : AtomOf<NullAtom<ColumnKeyOfExpression<Left>>>
            : [ColumnKeyOfExpression<Left>] extends [never]
              ? [ColumnKeyOfExpression<Right>] extends [never]
                ? CombineFacts<NonNullFactsOfExpression<Left>, NonNullFactsOfExpression<Right>>
                : AtomOf<EqLiteralAtom<ColumnKeyOfExpression<Right>, ValueKey<LeftLiteral>>>
              : AtomOf<EqLiteralAtom<ColumnKeyOfExpression<Left>, ValueKey<RightLiteral>>>
      : UnknownTag<"isNotDistinctFrom:unsupported">
    : UnknownTag<"isNotDistinctFrom:unsupported">

type OrFormulas<
  Items extends readonly PredicateFormula[]
> = import("./predicate-formula.js").NormalizeBooleanConstants<AnyFormula<Items>>

type AndFormulas<
  Items extends readonly PredicateFormula[]
> = import("./predicate-formula.js").NormalizeBooleanConstants<AllFormula<Items>>

type FormulaTupleOf<
  Values extends readonly Expression.Any[]
> = {
  readonly [K in keyof Values]: Values[K] extends Expression.Any ? FormulaOfExpression<Values[K]> : never
} & readonly PredicateFormula[]

type AllFormulaOfValues<
  Values extends readonly Expression.Any[]
> = import("./predicate-formula.js").NormalizeBooleanConstants<AllFormula<FormulaTupleOf<Values>>>

type AnyFormulaOfValues<
  Values extends readonly Expression.Any[]
> = import("./predicate-formula.js").NormalizeBooleanConstants<AnyFormula<FormulaTupleOf<Values>>>

type FormulaOfInValues<
  Left extends Expression.Any,
  Values extends readonly Expression.Any[],
  Current extends readonly PredicateFormula[] = []
> = Values extends readonly [
  infer Head extends Expression.Any,
  ...infer Tail extends readonly Expression.Any[]
]
  ? FormulaOfInValues<Left, Tail, [...Current, FormulaOfEq<Left, Head>]>
  : Current

type FormulaOfNotInValues<
  Left extends Expression.Any,
  Values extends readonly Expression.Any[],
  Current extends readonly PredicateFormula[] = []
> = Values extends readonly [
  infer Head extends Expression.Any,
  ...infer Tail extends readonly Expression.Any[]
]
  ? FormulaOfNotInValues<Left, Tail, [...Current, FormulaOfNeq<Left, Head>]>
  : Current

type FormulaOfVariadic<
  Kind extends ExpressionAst.VariadicKind,
  Values extends readonly Expression.Any[]
> = Kind extends "and"
  ? AllFormulaOfValues<Values>
  : Kind extends "or"
    ? AnyFormulaOfValues<Values>
    : Kind extends "in"
      ? Values extends readonly [infer Left extends Expression.Any, ...infer Tail extends readonly Expression.Any[]]
        ? OrFormulas<FormulaOfInValues<Left, Tail>>
        : False
      : Kind extends "notIn"
        ? Values extends readonly [infer Left extends Expression.Any, ...infer Tail extends readonly Expression.Any[]]
          ? AndFormulas<FormulaOfNotInValues<Left, Tail>>
          : True
        : Kind extends "between"
          ? FactsOfExpressions<Values> extends infer Facts extends PredicateFormula
            ? [Facts] extends [never]
              ? UnknownTag<"variadic:between">
              : CombineFacts<Facts, UnknownTag<"variadic:between">>
            : UnknownTag<"variadic:between">
        : UnknownTag<`variadic:${Kind}`>

type FormulaOfUnary<
  Kind extends ExpressionAst.UnaryKind,
  Inner extends Expression.Any
> = Kind extends "isNull"
  ? [ColumnKeyOfExpression<Inner>] extends [never]
    ? UnknownTag<"isNull:unsupported">
    : AtomOf<NullAtom<ColumnKeyOfExpression<Inner>>>
  : Kind extends "isNotNull"
    ? [ColumnKeyOfExpression<Inner>] extends [never]
      ? UnknownTag<"isNotNull:unsupported">
      : AtomOf<NonNullAtom<ColumnKeyOfExpression<Inner>>>
    : Kind extends "not"
      ? import("./predicate-formula.js").Not<FormulaOfExpression<Inner>>
      : UnknownTag<`unary:${Kind}`>

type FormulaOfBinary<
  Kind extends ExpressionAst.BinaryKind,
  Left extends Expression.Any,
  Right extends Expression.Any
> = Kind extends "eq"
  ? FormulaOfEq<Left, Right>
  : Kind extends "neq"
    ? FormulaOfNeq<Left, Right>
    : Kind extends "lt" | "lte" | "gt" | "gte" | "like" | "ilike" | "contains" | "containedBy" | "overlaps"
      ? CombineFacts<NonNullFactsOfExpression<Left>, NonNullFactsOfExpression<Right>>
      : Kind extends "isNotDistinctFrom"
        ? FormulaOfIsNotDistinctFrom<Left, Right>
        : Kind extends "isDistinctFrom"
          ? import("./predicate-formula.js").Not<FormulaOfIsNotDistinctFrom<Left, Right>>
          : CombineFacts<NonNullFactsOfExpression<Left>, NonNullFactsOfExpression<Right>>

type FormulaOfAst<
  Ast extends ExpressionAst.Any
> = [Ast] extends [ExpressionAst.LiteralNode<infer Literal>]
  ? Literal extends true
    ? True
    : Literal extends false
      ? False
      : UnknownTag<"literal:non-boolean">
  : [Ast] extends [ExpressionAst.UnaryNode<infer Kind extends ExpressionAst.UnaryKind, infer Inner extends Expression.Any>]
    ? FormulaOfUnary<Kind, Inner>
    : [Ast] extends [ExpressionAst.VariadicNode<infer Kind extends ExpressionAst.VariadicKind, infer Values extends readonly Expression.Any[]>]
      ? FormulaOfVariadic<Kind, Values>
      : [Ast] extends [ExpressionAst.BinaryNode<infer Kind extends ExpressionAst.BinaryKind, infer Left extends Expression.Any, infer Right extends Expression.Any>]
        ? FormulaOfBinary<Kind, Left, Right>
        : UnknownTag<`expr:${Ast["kind"]}`>

export type FormulaOfExpression<Value extends Expression.Any> =
  [AstOf<Value>] extends [infer Ast extends ExpressionAst.Any]
    ? FormulaOfAst<Ast>
    : UnknownTag<"missing-ast">

export type FormulaOfPredicate<Value> =
  Value extends true ? True :
    Value extends false ? False :
      Value extends Expression.Any ? FormulaOfExpression<Value> :
        UnknownTag<"predicate:unsupported">
