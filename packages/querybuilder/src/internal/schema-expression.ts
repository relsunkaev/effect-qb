import { parse, toSql, type Expr } from "pgsql-ast-parser"
import { pipeArguments, type Pipeable } from "effect/Pipeable"

export const TypeId: unique symbol = Symbol.for("effect-qb/SchemaExpression")

export type TypeId = typeof TypeId

const SchemaExpressionProto = {
  pipe(this: unknown) {
    return pipeArguments(this, arguments)
  }
}

export interface SchemaExpression extends Pipeable {
  readonly [TypeId]: {
    readonly dialect: "postgres"
    readonly ast: Expr
  }
}

export type Any = SchemaExpression

export const isSchemaExpression = (value: unknown): value is SchemaExpression =>
  typeof value === "object" && value !== null && TypeId in value

export const fromAst = (ast: Expr): SchemaExpression => {
  const expression = Object.create(SchemaExpressionProto)
  expression[TypeId] = {
    dialect: "postgres",
    ast
  }
  return expression
}

export const parseExpression = (sql: string): SchemaExpression =>
  fromAst(parse(sql, "expr"))

export const toAst = (expression: SchemaExpression): Expr => expression[TypeId].ast

export const render = (expression: SchemaExpression): string =>
  toSql.expr(expression[TypeId].ast)

export const normalize = (expression: SchemaExpression): SchemaExpression =>
  parseExpression(render(expression))
