import { expect, test } from "bun:test"
import * as SchemaExpression from "../../../packages/querybuilder/src/postgres/schema-expression.js"
import * as Value from "../../../packages/querybuilder/src/internal/schema-expression-value.js"

test("raw schema SQL renders without parsing and preserves pipe composition", () => {
  const value = SchemaExpression.fromSql("  custom_sqlite_function(value)  ")
  expect(Value.isSchemaExpression(value)).toBe(true)
  expect(value.pipe(Value.render)).toBe("custom_sqlite_function(value)")
})

test("parser-created values render through the lightweight boundary", () => {
  const value = SchemaExpression.parseExpression("1 + 2")
  expect(Value.render(value)).toBe(SchemaExpression.render(value))
  expect(SchemaExpression.toAst(value).type).toBe("binary")
  expect(Value.render(SchemaExpression.normalize(value))).toBe(Value.render(value))
})

test("AST serialization remains lazy and reflects retained AST changes", () => {
  const ast = SchemaExpression.toAst(SchemaExpression.parseExpression("1"))
  if (ast.type !== "integer") throw new Error("Expected integer AST")
  const value = SchemaExpression.fromAst(ast)
  expect(Value.render(value)).toBe("(1)")
  ast.value = 2
  expect(Value.render(value)).toBe("(2)")
})
