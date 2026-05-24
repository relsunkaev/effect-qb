import { parse, toSql, type Expr } from "pgsql-ast-parser"
import { pipeArguments, type Pipeable } from "effect/Pipeable"

export const TypeId: unique symbol = Symbol.for("effect-qb/SchemaExpression")

export type TypeId = typeof TypeId

const SchemaExpressionProto = {
  pipe(this: Pipeable) {
    return pipeArguments(this, arguments)
  }
}

const attachPipe = <Value extends object>(value: Value): Value => {
  Object.defineProperty(value, "pipe", {
    configurable: true,
    writable: true,
    value: function(this: Value) {
      return pipeArguments(value, arguments)
    }
  })
  return value
}

export interface SchemaExpression extends Pipeable {
  readonly [TypeId]: {
    readonly ast?: Expr
    readonly sql?: string
  }
}

export type Any = SchemaExpression

export const isSchemaExpression = (value: unknown): value is SchemaExpression =>
  typeof value === "object" && value !== null && TypeId in value

export const fromAst = (ast: Expr): SchemaExpression => {
  const expression = attachPipe(Object.create(SchemaExpressionProto))
  expression[TypeId] = {
    ast
  }
  return expression
}

export const fromSql = (sql: string): SchemaExpression => {
  const expression = attachPipe(Object.create(SchemaExpressionProto))
  expression[TypeId] = {
    sql: sql.trim()
  }
  return expression
}

export const parseExpression = (sql: string): SchemaExpression =>
  fromAst(parse(sql, "expr"))

export const toAst = (expression: SchemaExpression): Expr => {
  const ast = expression[TypeId].ast
  if (ast !== undefined) {
    return ast
  }
  return parse(render(expression), "expr")
}

export const render = (expression: SchemaExpression): string =>
  expression[TypeId].sql ?? toSql.expr(toAst(expression))

export const normalize = (expression: SchemaExpression): SchemaExpression =>
  (() => {
    const sql = render(expression)
    try {
      return parseExpression(sql)
    } catch {
      return fromSql(sql)
    }
  })()
