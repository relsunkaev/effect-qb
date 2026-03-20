import * as Schema from "effect/Schema"
import * as SchemaAST from "effect/SchemaAST"

import * as Expression from "./expression.js"
import * as ExpressionAst from "./expression-ast.js"
import * as Query from "./query.js"
import * as JsonPath from "./json/path.js"
import { flattenSelection } from "./projections.js"
import {
  BigIntStringSchema,
  DecimalStringSchema,
  InstantStringSchema,
  JsonValueSchema,
  LocalDateStringSchema,
  LocalDateTimeStringSchema,
  LocalTimeStringSchema,
  OffsetTimeStringSchema,
  YearStringSchema
} from "./runtime-value.js"
import { mysqlDatatypeKinds } from "../mysql/datatypes/spec.js"
import { postgresDatatypeKinds } from "../postgres/datatypes/spec.js"
import type { RuntimeTag } from "./datatypes/shape.js"

export type RuntimeSchema = Schema.Schema<any, any, any>

const schemaCache = new WeakMap<Expression.Any, RuntimeSchema | undefined>()

const stripParameterizedKind = (kind: string): string => {
  const openParen = kind.indexOf("(")
  return openParen === -1 ? kind : kind.slice(0, openParen)
}

const stripArrayKind = (kind: string): string => {
  let current = kind
  while (current.endsWith("[]")) {
    current = current.slice(0, -2)
  }
  return current
}

const baseKind = (kind: string): string => stripArrayKind(stripParameterizedKind(kind))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const runtimeSchemaForTag = (tag: RuntimeTag): RuntimeSchema | undefined => {
  switch (tag) {
    case "string":
      return Schema.String
    case "number":
      return Schema.Number
    case "bigintString":
      return BigIntStringSchema
    case "boolean":
      return Schema.Boolean
    case "json":
      return JsonValueSchema
    case "localDate":
      return LocalDateStringSchema
    case "localTime":
      return LocalTimeStringSchema
    case "offsetTime":
      return OffsetTimeStringSchema
    case "localDateTime":
      return LocalDateTimeStringSchema
    case "instant":
      return InstantStringSchema
    case "year":
      return YearStringSchema
    case "decimalString":
      return DecimalStringSchema
    case "bytes":
      return Schema.Uint8ArrayFromSelf
    case "array":
      return Schema.Array(Schema.Unknown)
    case "record":
      return Schema.Record({
        key: Schema.String,
        value: Schema.Unknown
      })
    case "null":
      return Schema.Null
    case "unknown":
      return undefined
  }
}

const runtimeTagOfBaseDbType = (
  dialect: string,
  kind: string
): RuntimeTag | undefined => {
  const normalizedKind = baseKind(kind)
  if (dialect === "postgres") {
    return postgresDatatypeKinds[normalizedKind as keyof typeof postgresDatatypeKinds]?.runtime
  }
  if (dialect === "mysql") {
    return mysqlDatatypeKinds[normalizedKind as keyof typeof mysqlDatatypeKinds]?.runtime
  }
  return undefined
}

export const runtimeSchemaForDbType = (
  dbType: Expression.DbType.Any
): RuntimeSchema | undefined => {
  if ("base" in dbType) {
    return runtimeSchemaForDbType(dbType.base)
  }
  if ("element" in dbType) {
    return Schema.Array(runtimeSchemaForDbType(dbType.element) ?? Schema.Unknown)
  }
  if ("fields" in dbType) {
    const fields = Object.fromEntries(
      Object.entries(dbType.fields).map(([key, field]) => [key, runtimeSchemaForDbType(field) ?? Schema.Unknown])
    )
    return Schema.Struct(fields as Record<string, RuntimeSchema>)
  }
  if ("variant" in dbType && dbType.variant === "json") {
    return JsonValueSchema
  }
  if ("variant" in dbType && (dbType.variant === "enum" || dbType.variant === "set")) {
    return Schema.String
  }
  const runtimeTag = runtimeTagOfBaseDbType(dbType.dialect, dbType.kind)
  return runtimeTag === undefined ? undefined : runtimeSchemaForTag(runtimeTag)
}

const makeSchemaFromAst = (ast: SchemaAST.AST): RuntimeSchema =>
  Schema.make(ast)

const unionAst = (asts: ReadonlyArray<SchemaAST.AST>): SchemaAST.AST | undefined => {
  if (asts.length === 0) {
    return undefined
  }
  if (asts.length === 1) {
    return asts[0]
  }
  return SchemaAST.Union.make(asts)
}

const propertyAstOf = (
  ast: SchemaAST.AST,
  key: string
): SchemaAST.AST | undefined => {
  switch (ast._tag) {
    case "Transformation":
      return propertyAstOf(SchemaAST.typeAST(ast), key)
    case "Refinement":
      return propertyAstOf(ast.from, key)
    case "Suspend":
      return propertyAstOf(ast.f(), key)
    case "TypeLiteral": {
      const property = ast.propertySignatures.find((entry) => entry.name === key)
      if (property !== undefined) {
        return property.type
      }
      const index = ast.indexSignatures.find((entry) => entry.parameter._tag === "StringKeyword")
      return index?.type
    }
    case "Union": {
      const values = ast.types.flatMap((member) => {
        const next = propertyAstOf(member, key)
        return next === undefined ? [] : [next]
      })
      return unionAst(values)
    }
    default:
      return undefined
  }
}

const numberAstOf = (
  ast: SchemaAST.AST,
  index: number
): SchemaAST.AST | undefined => {
  switch (ast._tag) {
    case "Transformation":
      return numberAstOf(SchemaAST.typeAST(ast), index)
    case "Refinement":
      return numberAstOf(ast.from, index)
    case "Suspend":
      return numberAstOf(ast.f(), index)
    case "TupleType": {
      const element = ast.elements[index]
      if (element !== undefined) {
        return element.type
      }
      if (ast.rest.length === 0) {
        return undefined
      }
      return unionAst(ast.rest.map((entry) => entry.type))
    }
    case "Union": {
      const values = ast.types.flatMap((member) => {
        const next = numberAstOf(member, index)
        return next === undefined ? [] : [next]
      })
      return unionAst(values)
    }
    default:
      return undefined
  }
}

const exactJsonSegments = (
  segments: readonly JsonPath.CanonicalSegment[]
): segments is readonly (JsonPath.KeySegment | JsonPath.IndexSegment)[] =>
  segments.every((segment) => segment.kind === "key" || segment.kind === "index")

const schemaAstAtExactJsonPath = (
  schema: RuntimeSchema,
  segments: readonly JsonPath.CanonicalSegment[]
): SchemaAST.AST | undefined => {
  let current: SchemaAST.AST = SchemaAST.typeAST(schema.ast)
  for (const segment of segments) {
    if (segment.kind === "key") {
      const property = propertyAstOf(current, segment.key)
      if (property === undefined) {
        return undefined
      }
      current = property
      continue
    }
    if (segment.kind === "index") {
      const next = numberAstOf(current, segment.index)
      if (next === undefined) {
        return undefined
      }
      current = next
      continue
    }
    return undefined
  }
  return current
}

const unionSchemas = (schemas: ReadonlyArray<RuntimeSchema | undefined>): RuntimeSchema | undefined => {
  const resolved = schemas.filter((schema): schema is RuntimeSchema => schema !== undefined)
  if (resolved.length === 0) {
    return undefined
  }
  if (resolved.length === 1) {
    return resolved[0]
  }
  return Schema.Union(...resolved)
}

const firstSelectedExpression = (
  plan: Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>
): Expression.Any | undefined => {
  const selection = Query.getAst(plan).select
  return flattenSelection(selection as Record<string, unknown>)[0]?.expression
}

const isJsonCompatibleAst = (ast: SchemaAST.AST): boolean => {
  switch (ast._tag) {
    case "StringKeyword":
    case "NumberKeyword":
    case "BooleanKeyword":
    case "TupleType":
    case "TypeLiteral":
      return true
    case "Literal":
      return ast.literal === null ||
        typeof ast.literal === "string" ||
        typeof ast.literal === "number" ||
        typeof ast.literal === "boolean"
    case "Union":
      return ast.types.every(isJsonCompatibleAst)
    case "Transformation":
      return isJsonCompatibleAst(SchemaAST.typeAST(ast))
    case "Suspend":
      return isJsonCompatibleAst(ast.f())
    default:
      return false
  }
}

const jsonCompatibleSchema = (schema: RuntimeSchema | undefined): RuntimeSchema | undefined => {
  if (schema === undefined) {
    return undefined
  }
  const ast = SchemaAST.typeAST(schema.ast)
  return isJsonCompatibleAst(ast) ? schema : JsonValueSchema
}

const buildStructSchema = (
  entries: readonly { readonly key: string; readonly value: Expression.Any }[]
): RuntimeSchema => {
  const fields = Object.fromEntries(
    entries.map((entry) => [entry.key, expressionRuntimeSchema(entry.value) ?? JsonValueSchema])
  )
  return Schema.Struct(fields as Record<string, RuntimeSchema>)
}

const buildTupleSchema = (values: readonly Expression.Any[]): RuntimeSchema =>
  Schema.Tuple(...values.map((value) => expressionRuntimeSchema(value) ?? JsonValueSchema))

const deriveRuntimeSchema = (expression: Expression.Any): RuntimeSchema | undefined => {
  const state = expression[Expression.TypeId]
  if (state.runtimeSchema !== undefined) {
    return state.runtimeSchema
  }
  const ast = (expression as Expression.Any & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.Any
  })[ExpressionAst.TypeId]
  switch (ast.kind) {
    case "column":
    case "excluded":
      return state.runtimeSchema
    case "literal":
      if (ast.value === null) {
        return Schema.Null
      }
      if (typeof ast.value === "string" || typeof ast.value === "number" || typeof ast.value === "boolean") {
        return Schema.Literal(ast.value)
      }
      return runtimeSchemaForDbType(state.dbType)
    case "cast":
      return runtimeSchemaForDbType(ast.target)
    case "isNull":
    case "isNotNull":
    case "not":
    case "eq":
    case "neq":
    case "lt":
    case "lte":
    case "gt":
    case "gte":
    case "like":
    case "ilike":
    case "isDistinctFrom":
    case "isNotDistinctFrom":
    case "contains":
    case "containedBy":
    case "overlaps":
    case "and":
    case "or":
    case "in":
    case "notIn":
    case "between":
    case "exists":
    case "inSubquery":
    case "comparisonAny":
    case "comparisonAll":
    case "jsonHasKey":
    case "jsonKeyExists":
    case "jsonHasAnyKeys":
    case "jsonHasAllKeys":
    case "jsonPathExists":
    case "jsonPathMatch":
      return Schema.Boolean
    case "upper":
    case "lower":
    case "concat":
    case "jsonGetText":
    case "jsonPathText":
    case "jsonAccessText":
    case "jsonTraverseText":
    case "jsonTypeOf":
      return Schema.String
    case "count":
    case "jsonLength":
      return Schema.Number
    case "max":
    case "min":
      return expressionRuntimeSchema(ast.value)
    case "case":
      return unionSchemas([
        ...ast.branches.map((branch) => expressionRuntimeSchema(branch.then)),
        expressionRuntimeSchema(ast.else)
      ])
    case "coalesce":
      return unionSchemas(ast.values.map(expressionRuntimeSchema))
    case "scalarSubquery":
      {
        const selection = firstSelectedExpression(ast.plan)
        return selection === undefined ? undefined : expressionRuntimeSchema(selection)
      }
    case "window":
      return ast.function === "over" && ast.value !== undefined
        ? expressionRuntimeSchema(ast.value)
        : Schema.Number
    case "jsonGet":
    case "jsonPath":
    case "jsonAccess":
    case "jsonTraverse": {
      const baseSchema = expressionRuntimeSchema(ast.base!)
      const segments = ast.segments
      if (baseSchema === undefined || segments === undefined || !exactJsonSegments(segments)) {
        return JsonValueSchema
      }
      const subAst = schemaAstAtExactJsonPath(baseSchema, segments)
      return subAst === undefined ? JsonValueSchema : makeSchemaFromAst(subAst)
    }
    case "jsonDelete":
    case "jsonDeletePath":
    case "jsonRemove":
    case "jsonSet":
    case "jsonInsert":
      return expressionRuntimeSchema(ast.base!)
    case "jsonStripNulls":
      return expressionRuntimeSchema(ast.value!)
    case "jsonConcat":
    case "jsonMerge":
      return JsonValueSchema
    case "jsonBuildObject":
      return buildStructSchema(ast.entries ?? [])
    case "jsonBuildArray":
      return buildTupleSchema(ast.values ?? [])
    case "jsonToJson":
    case "jsonToJsonb":
      return jsonCompatibleSchema(expressionRuntimeSchema(ast.value!))
    case "jsonKeys":
      return Schema.Array(Schema.String)
  }
}

export const expressionRuntimeSchema = (
  expression: Expression.Any
): RuntimeSchema | undefined => {
  const cached = schemaCache.get(expression)
  if (cached !== undefined || schemaCache.has(expression)) {
    return cached
  }
  const resolved = deriveRuntimeSchema(expression) ?? runtimeSchemaForDbType(expression[Expression.TypeId].dbType)
  schemaCache.set(expression, resolved)
  return resolved
}
