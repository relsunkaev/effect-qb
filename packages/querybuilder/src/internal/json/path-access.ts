import type { StoredOf, WithoutStoredJson } from "./storage.js"
import { pipeArguments, type Pipeable } from "effect/Pipeable"

import * as ExpressionAst from "../expression-ast.js"
import * as Expression from "../scalar.js"
import * as JsonPath from "./path.js"
import type { JsonValueAtPath } from "./types.js"

const WrappedTypeId: unique symbol = Symbol.for("effect-qb/JsonPathAccess")

type JsonDb = Expression.DbType.Json<any, any>

type AnyJsonExpression = Expression.Scalar<
  any,
  JsonDb,
  Expression.Nullability,
  string,
  Expression.ScalarKind,
  Expression.BindingId
>

type JsonNullabilityOf<Output> =
  null extends Output
    ? Exclude<Output, null> extends never ? "always" : "maybe"
    : "never"

type IsAny<Value> = 0 extends (1 & Value) ? true : false

type SegmentTuple<Segments> = Segments extends readonly JsonPath.CanonicalSegment[]
  ? Segments
  : readonly JsonPath.CanonicalSegment[]

type JsonAccessAst<Value> = Value extends {
  readonly [ExpressionAst.TypeId]: infer Ast
} ? Ast : never

type JsonAccessParts<
  Value,
  Acc extends readonly JsonPath.CanonicalSegment[] = readonly [],
  Depth extends readonly unknown[] = []
> =
  Depth["length"] extends 8 ? readonly [Value, Acc] :
    [JsonAccessAst<Value>] extends [never]
      ? readonly [Value, Acc]
      : JsonAccessAst<Value> extends ExpressionAst.JsonAccessNode<any, infer Base extends Expression.Any, infer Segments>
      ? JsonAccessParts<Base, readonly [...SegmentTuple<Segments>, ...Acc], readonly [...Depth, unknown]>
      : readonly [Value, Acc]

type JsonAccessRoot<Value> =
  JsonAccessParts<Value> extends readonly [infer Base, readonly JsonPath.CanonicalSegment[]]
    ? Base
    : Value

type JsonAccessSegments<Value> =
  JsonAccessParts<Value> extends readonly [any, infer Segments extends readonly JsonPath.CanonicalSegment[]]
    ? Segments
    : readonly []

type JsonAccessBase<Value> =
  JsonAccessRoot<Value> extends Expression.Any ? JsonAccessRoot<Value> : Value

type JsonPathOutput<
  Root,
  Segments extends readonly JsonPath.CanonicalSegment[],
  Operation extends string
> =
  JsonValueAtPath<Exclude<Root, null>, JsonPath.Path<Segments>, Operation> |
  (null extends Root ? null : never)

type JsonAccessExpression<
  Base extends AnyJsonExpression,
  Segments extends readonly JsonPath.CanonicalSegment[]
> = WithJsonPathAccess<
  Expression.Scalar<
    JsonPathOutput<StoredOf<JsonAccessBase<Base>>, Segments, "json.get">,
    WithoutStoredJson<Expression.DbTypeOf<JsonAccessBase<Base>>>,
    JsonNullabilityOf<JsonPathOutput<StoredOf<JsonAccessBase<Base>>, Segments, "json.get">>,
    Expression.DbTypeOf<JsonAccessBase<Base>>["dialect"],
    Expression.KindOf<JsonAccessBase<Base>>,
    Expression.DependenciesOf<JsonAccessBase<Base>>
  > & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.JsonAccessNode<
      JsonPath.IsExactPath<JsonPath.Path<Segments>> extends true ? "jsonPath" : "jsonTraverse",
      JsonAccessBase<Base>,
      Segments
    >
  }
>

type JsonKeyAccess<
  Base extends AnyJsonExpression,
  Key extends string
> = JsonAccessExpression<Base, readonly [...JsonAccessSegments<Base>, JsonPath.KeySegment<Key>]>

type JsonIndexAccess<
  Base extends AnyJsonExpression,
  Index extends number
> = JsonAccessExpression<Base, readonly [...JsonAccessSegments<Base>, JsonPath.IndexSegment<Index>]>

type ReservedPathKey =
  | "pipe"
  | "then"
  | "toString"
  | "toJSON"
  | "valueOf"
  | "constructor"
  | "__proto__"
  | "prototype"
  | "inspect"
  | "schema"
  | "metadata"
  | "columns"
  | "name"

type KeysOfUnion<Value> = Value extends unknown ? keyof Value : never

type JsonObjectKey<Key> = Key extends string
  ? Key extends ReservedPathKey ? never :
    Key extends `${number}` ? never :
      Key
  : never

type TupleNumberKey<Key> = Key extends `${infer Index extends number}` ? Index : never

type JsonTupleAccessors<
  Base extends AnyJsonExpression,
  Runtime extends readonly unknown[]
> = {
  readonly [Key in Extract<keyof Runtime, `${number}`> as TupleNumberKey<Key>]: JsonIndexAccess<Base, TupleNumberKey<Key>>
} & {
  readonly [index: number]: JsonIndexAccess<Base, number>
}

type JsonArrayAccessors<
  Base extends AnyJsonExpression,
  Runtime extends readonly unknown[]
> = number extends Runtime["length"]
  ? {
      readonly [index: number]: JsonIndexAccess<Base, number>
    }
  : JsonTupleAccessors<Base, Runtime>

type JsonObjectAccessors<
  Base extends AnyJsonExpression,
  Runtime extends object
> = {
  readonly [Key in KeysOfUnion<Runtime> as JsonObjectKey<Key>]: JsonKeyAccess<Base, JsonObjectKey<Key>>
}

type JsonObjectPredicateKeys<Runtime> =
  Runtime extends readonly unknown[]
    ? never
    : Runtime extends object
      ? Extract<KeysOfUnion<Runtime>, string>
      : never

export type JsonObjectKeyOf<Value extends Expression.Any> =
  IsAny<StoredOf<Value>> extends true
    ? string
    : Exclude<StoredOf<Value>, null> extends infer Runtime
      ? string extends JsonObjectPredicateKeys<Runtime>
        ? string
        : JsonObjectPredicateKeys<Runtime>
      : never

type JsonPathAccessors<Base extends AnyJsonExpression> =
  IsAny<StoredOf<Base>> extends true
    ? {}
    : Exclude<StoredOf<Base>, null> extends infer Runtime
      ? Runtime extends readonly unknown[]
        ? JsonArrayAccessors<Base, Runtime>
        : Runtime extends object
          ? JsonObjectAccessors<Base, Runtime>
          : {}
      : {}

export type WithJsonPathAccess<Value> = Value extends AnyJsonExpression
  ? Value & JsonPathAccessors<Value>
  : Value

const accessKinds = new Set<string>([
  "jsonGet",
  "jsonPath",
  "jsonAccess",
  "jsonTraverse",
  "jsonGetText",
  "jsonPathText",
  "jsonAccessText",
  "jsonTraverseText"
])

const reservedKeys = new Set<string>([
  "pipe",
  "then",
  "toString",
  "toJSON",
  "valueOf",
  "constructor",
  "__proto__",
  "prototype",
  "inspect",
  "schema",
  "metadata",
  "columns",
  "name"
])

const isObjectLike = (value: unknown): value is object =>
  (typeof value === "object" || typeof value === "function") && value !== null

const isExpression = (value: unknown): value is Expression.Any =>
  isObjectLike(value) && Expression.TypeId in value

const isJsonExpression = (value: unknown): value is AnyJsonExpression => {
  if (!isExpression(value)) {
    return false
  }
  const dbType = value[Expression.TypeId].dbType as { readonly kind?: string; readonly variant?: string }
  return dbType.kind === "json" || dbType.kind === "jsonb" || dbType.variant === "json" || dbType.variant === "jsonb"
}

const isWrapped = (value: object): boolean =>
  (value as { readonly [WrappedTypeId]?: true })[WrappedTypeId] === true

const normalizeSegment = (segment: JsonPath.CanonicalSegment): JsonPath.CanonicalSegment => {
  switch (segment.kind) {
    case "key":
      return JsonPath.key(segment.key)
    case "index":
      return JsonPath.index(segment.index)
    case "wildcard":
      return JsonPath.wildcard()
    case "slice":
      return JsonPath.slice(segment.start, segment.end)
    case "descend":
      return JsonPath.descend()
  }
}

const accessPathOf = (value: Expression.Any): {
  readonly base: Expression.Any
  readonly segments: readonly JsonPath.CanonicalSegment[]
} => {
  const segments: JsonPath.CanonicalSegment[] = []
  let base: Expression.Any = value
  while (isExpression(base)) {
    const ast = (base as Expression.Any & {
      readonly [ExpressionAst.TypeId]?: ExpressionAst.Any
    })[ExpressionAst.TypeId] as { readonly kind?: unknown; readonly base?: unknown; readonly segments?: unknown } | undefined
    if (ast === undefined || typeof ast.kind !== "string" || !accessKinds.has(ast.kind) || !isExpression(ast.base) || !Array.isArray(ast.segments)) {
      break
    }
    segments.unshift(...ast.segments.map(normalizeSegment))
    base = ast.base
  }
  return { base, segments }
}

const isIntegerProperty = (property: string): boolean =>
  /^(?:-?(?:0|[1-9][0-9]*))$/.test(property)

const jsonAccessKind = (
  segments: readonly JsonPath.CanonicalSegment[]
): ExpressionAst.JsonAccessKind =>
  segments.every((segment) => segment.kind === "key" || segment.kind === "index")
    ? segments.length === 1 ? "jsonGet" : "jsonPath"
    : "jsonTraverse"

const makeExpression = <
  Runtime,
  Db extends Expression.DbType.Any,
  Nullable extends Expression.Nullability,
  Dialect extends string,
  Kind extends Expression.ScalarKind,
  Deps extends Expression.BindingId,
  Ast extends ExpressionAst.Any
>(
  state: Expression.State<Runtime, Db, Nullable, Dialect, Kind, Deps>,
  ast: Ast
): Expression.Scalar<Runtime, Db, Nullable, Dialect, Kind, Deps> & {
  readonly [ExpressionAst.TypeId]: Ast
} => {
  const expression = Object.create(null) as Expression.Scalar<Runtime, Db, Nullable, Dialect, Kind, Deps> & {
    [ExpressionAst.TypeId]: Ast
    [Expression.TypeId]: Expression.State<Runtime, Db, Nullable, Dialect, Kind, Deps>
    pipe: Pipeable["pipe"]
  }
  Object.defineProperty(expression, "pipe", {
    configurable: true,
    writable: true,
    value: function(this: Pipeable) {
      return pipeArguments(expression, arguments)
    }
  })
  expression[Expression.TypeId] = state
  expression[ExpressionAst.TypeId] = ast
  return expression
}

const makePathExpression = (
  value: AnyJsonExpression,
  segment: JsonPath.CanonicalSegment
): AnyJsonExpression => {
  const access = accessPathOf(value)
  const segments = [...access.segments, normalizeSegment(segment)]
  const base = access.base as AnyJsonExpression
  const baseState = base[Expression.TypeId]
  return withJsonPathAccess(makeExpression(
    {
      ...baseState,
      runtime: undefined,
      runtimeSchema: undefined,
      driverValueMapping: undefined,
      nullability: undefined as unknown as Expression.Nullability
    },
    {
      kind: jsonAccessKind(segments),
      base,
      segments
    } satisfies ExpressionAst.JsonAccessNode<any, any, any>
  ) as AnyJsonExpression)
}

const pathProxyHandler: ProxyHandler<AnyJsonExpression> = {
  get(target, property, receiver) {
    if (typeof property === "symbol") {
      return Reflect.get(target, property, receiver)
    }
    if (Reflect.has(target, property) || reservedKeys.has(property)) {
      return Reflect.get(target, property, receiver)
    }
    const segment = isIntegerProperty(property)
      ? JsonPath.index(Number(property))
      : JsonPath.key(property)
    return makePathExpression(target, segment)
  },
  has(target, property) {
    return Reflect.has(target, property)
  }
}

export const withJsonPathAccess = <Value>(value: Value): WithJsonPathAccess<Value> => {
  if (!isObjectLike(value) || !isJsonExpression(value) || isWrapped(value)) {
    return value as WithJsonPathAccess<Value>
  }
  const proxy = new Proxy(value, pathProxyHandler) as unknown as WithJsonPathAccess<Value> & {
    [WrappedTypeId]: true
  }
  Object.defineProperty(proxy, WrappedTypeId, {
    configurable: false,
    value: true
  })
  return proxy
}
