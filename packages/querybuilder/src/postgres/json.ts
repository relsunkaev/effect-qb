import type { StoredOf, WithoutStoredJson } from "../internal/json/storage.js"
import * as Expression from "../internal/scalar.js"
import * as ExpressionAst from "../internal/expression-ast.js"
import type { JsonPathUsageError } from "../internal/json/errors.js"
import * as JsonPath from "../internal/json/path.js"
import type {
  JsonDeleteAtPath,
  JsonInsertAtPath,
  JsonSetAtPath,
  JsonTextResult,
  JsonValueAtPath
} from "../internal/json/types.js"
import type { LiteralStringInput } from "../internal/table-options.js"
import type { JsonObjectKeyOf, WithJsonPathAccess } from "../internal/json/path-access.js"
import type { postgresDatatypes } from "./datatypes/index.js"
import { json as postgresJson, jsonb as postgresJsonb } from "./internal/dsl.js"

type PostgresJsonExpression<Runtime = unknown> = Expression.Scalar<
  Runtime,
  Expression.DbType.Json<"postgres" | "standard", "json" | "jsonb">,
  Expression.Nullability,
  string,
  Expression.ScalarKind,
  Expression.BindingId
>

type PostgresJsonbExpression<Runtime = unknown> = Expression.Scalar<
  Runtime,
  Expression.DbType.Json<"postgres", "jsonb">,
  Expression.Nullability,
  string,
  Expression.ScalarKind,
  Expression.BindingId
>

type AnyJsonExpression<Runtime = unknown> = Expression.Scalar<
  Runtime,
  Expression.DbType.Json<any, any>,
  Expression.Nullability,
  string,
  Expression.ScalarKind,
  Expression.BindingId
>

type ExactJsonPathInput = JsonPath.ExactSegment | JsonPath.Path<any>

type JsonPathPredicateExpression = Expression.Scalar<
  string | null,
  Expression.DbType.Any,
  Expression.Nullability,
  string,
  Expression.ScalarKind,
  Expression.BindingId
>

type JsonPathPredicateQuery = JsonPath.Path<any> | JsonPathPredicateExpression | string

type JsonPathPredicateQueryInput<Query extends JsonPathPredicateQuery> =
  Query extends string ? LiteralStringInput<Query> : Query

type ExactJsonPathUsageError<Target> = {
  readonly __effect_qb_error__: "effect-qb: postgres json helpers only accept exact key/index paths"
  readonly __effect_qb_json_path__: Target
  readonly __effect_qb_hint__: "Use Postgres.Jsonb.key(), wildcard(), slice(), or descend() in a pipe when you need jsonb path traversal"
}

type ExactJsonPathGuard<Target> = Target extends JsonPath.Path<any>
  ? JsonPath.IsExactPath<Target> extends true ? unknown : ExactJsonPathUsageError<Target>
  : Target extends JsonPath.ExactSegment
    ? unknown
    : ExactJsonPathUsageError<Target>

type JsonPathOutputOf<
  Root,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment,
  Operation extends string
> = Target extends JsonPath.Path<any>
  ? JsonValueAtPath<Root, Target, Operation>
  : Target extends JsonPath.CanonicalSegment
    ? JsonValueAtPath<Root, JsonPath.Path<[Target]>, Operation>
    : never

type JsonDeleteOutputOf<
  Root,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment,
  Operation extends string
> = Target extends JsonPath.Path<any>
  ? JsonDeleteAtPath<Root, Target, Operation>
  : Target extends JsonPath.CanonicalSegment
    ? JsonDeleteAtPath<Root, JsonPath.Path<[Target]>, Operation>
    : never

type JsonSetOutputOf<
  Root,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment,
  Next,
  Operation extends string
> = Target extends JsonPath.Path<any>
  ? JsonSetAtPath<Root, Target, Next, Operation>
  : Target extends JsonPath.CanonicalSegment
    ? JsonSetAtPath<Root, JsonPath.Path<[Target]>, Next, Operation>
    : never

type JsonSetOutputWithCreateMissing<
  Root,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment,
  Next,
  Operation extends string,
  CreateMissing extends boolean
> = false extends CreateMissing
  ? Root | JsonSetOutputOf<Root, Target, Next, Operation>
  : JsonSetOutputOf<Root, Target, Next, Operation>

type JsonInsertOutputOf<
  Root,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment,
  Next,
  InsertAfter extends boolean,
  Operation extends string
> = Target extends JsonPath.Path<any>
  ? JsonInsertAtPath<Root, Target, Next, InsertAfter, Operation>
  : Target extends JsonPath.CanonicalSegment
    ? JsonInsertAtPath<Root, JsonPath.Path<[Target]>, Next, InsertAfter, Operation>
    : never

type JsonValuePathGuard<
  Root,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment,
  Operation extends string
> = JsonPathOutputOf<Root, Target, Operation> extends JsonPathUsageError<any, any, any, any>
  ? JsonPathOutputOf<Root, Target, Operation>
  : unknown

type JsonDeletePathGuard<
  Root,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment,
  Operation extends string
> = JsonDeleteOutputOf<Root, Target, Operation> extends JsonPathUsageError<any, any, any, any>
  ? JsonDeleteOutputOf<Root, Target, Operation>
  : unknown

type JsonSetPathGuard<
  Root,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment,
  Next,
  Operation extends string
> = JsonSetOutputOf<Root, Target, Next, Operation> extends JsonPathUsageError<any, any, any, any>
  ? JsonSetOutputOf<Root, Target, Next, Operation>
  : unknown

type JsonInsertPathGuard<
  Root,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment,
  Next,
  InsertAfter extends boolean,
  Operation extends string
> = JsonInsertOutputOf<Root, Target, Next, InsertAfter, Operation> extends JsonPathUsageError<any, any, any, any>
  ? JsonInsertOutputOf<Root, Target, Next, InsertAfter, Operation>
  : unknown

type JsonbOnlyUsageError<
  Operation extends string,
  Value extends PostgresJsonExpression<any>
> = {
  readonly __effect_qb_error__: "effect-qb: postgres jsonb helpers require a jsonb expression"
  readonly __effect_qb_json_operation__: Operation
  readonly __effect_qb_received_kind__: Expression.DbTypeOf<Value>["kind"]
  readonly __effect_qb_hint__: "Use Column.jsonb(...), Cast.to(..., Type.jsonb()), or Postgres.Jsonb.toJsonb(...)"
}

type JsonbBaseGuard<
  Base extends PostgresJsonExpression<any>,
  Operation extends string
> = Expression.DbTypeOf<Base> extends Expression.DbType.Json<"postgres", "jsonb">
  ? unknown
  : JsonbOnlyUsageError<Operation, Base>

type JsonPathSegmentsOf<Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment> =
  Target extends JsonPath.Path<infer Segments extends readonly JsonPath.CanonicalSegment[]> ? Segments :
    Target extends JsonPath.CanonicalSegment ? readonly [Target] :
      readonly []

type JsonGetAccessKind<Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment> =
  Target extends JsonPath.Path<any>
    ? JsonPath.IsExactPath<Target> extends true ? "jsonPath" : "jsonTraverse"
    : Target extends JsonPath.ExactSegment ? "jsonGet" : "jsonAccess"

type JsonTextAccessKind<Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment> =
  Target extends JsonPath.Path<any>
    ? JsonPath.IsExactPath<Target> extends true ? "jsonPathText" : "jsonTraverseText"
    : Target extends JsonPath.ExactSegment ? "jsonGetText" : "jsonAccessText"

type PostgresTextDb = ReturnType<typeof postgresDatatypes.text>
type PostgresBoolDb = ReturnType<typeof postgresDatatypes.boolean>

type DialectOf<Value extends Expression.Any> = Value[typeof Expression.TypeId]["dialect"]
type ScalarKindOf<Value extends Expression.Any> =
  Extract<Expression.KindOf<Value>, "scalar"> extends never
    ? Expression.KindOf<Value>
    : Extract<Expression.KindOf<Value>, "scalar">

type JsonResultExpression<
  Runtime,
  Db extends Expression.DbType.Json<any, any>,
  Kind extends Expression.ScalarKind = Expression.ScalarKind,
  Dependencies extends Expression.BindingId = Expression.BindingId,
  Ast extends ExpressionAst.Any = never,
  Dialect extends string = string
> = Expression.Scalar<
  Runtime,
  WithoutStoredJson<Db>,
  Expression.Nullability,
  Dialect,
  Kind,
  Dependencies
> & ([Ast] extends [never] ? unknown : {
  readonly [ExpressionAst.TypeId]: Ast
})

type JsonDbOf<Base extends PostgresJsonExpression<any>> =
  Expression.DbTypeOf<Base> extends Expression.DbType.Json<"postgres", infer Variant>
    ? Expression.DbType.Json<"postgres", Variant>
    : Expression.DbType.Json<"postgres", "json">

type JsonGetResultExpression<
  Base extends PostgresJsonExpression<any>,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment,
  Operation extends string
> = WithJsonPathAccess<JsonResultExpression<
  JsonPathOutputOf<StoredOf<Base>, Target, Operation>,
  JsonDbOf<Base>,
  Expression.KindOf<Base>,
  Expression.DependenciesOf<Base>,
  ExpressionAst.JsonAccessNode<JsonGetAccessKind<Target>, Base, JsonPathSegmentsOf<Target>>,
  DialectOf<Base>
>>

type JsonTextRuntime<
  Base extends AnyJsonExpression<any>,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment
> =
  JsonTextResult<Exclude<JsonPathOutputOf<StoredOf<Base>, Target, "json.text">, JsonPathUsageError<any, any, any, any> | null>> |
  (null extends JsonPathOutputOf<StoredOf<Base>, Target, "json.text"> ? null : never)

type JsonTextResultExpression<
  Base extends AnyJsonExpression<any>,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment
> = Expression.Scalar<
  JsonTextRuntime<Base, Target>,
  PostgresTextDb,
  Expression.Nullability,
  DialectOf<Base>,
  Expression.KindOf<Base>,
  Expression.DependenciesOf<Base>
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.JsonAccessNode<JsonTextAccessKind<Target>, Base, JsonPathSegmentsOf<Target>>
}

type SegmentTuple<Segments> = Segments extends readonly JsonPath.CanonicalSegment[]
  ? Segments
  : readonly JsonPath.CanonicalSegment[]

type JsonAccessAst<Value> = Value extends {
  readonly [ExpressionAst.TypeId]: infer Ast
} ? Ast : never

type JsonAccessExpression = {
  readonly [ExpressionAst.TypeId]: ExpressionAst.JsonAccessNode<any, any, any>
}

type JsonAccessParts<
  Value,
  Acc extends readonly JsonPath.CanonicalSegment[] = readonly [],
  Depth extends readonly unknown[] = []
> =
  Depth["length"] extends 8 ? readonly [Value, readonly JsonPath.CanonicalSegment[]] :
    [JsonAccessAst<Value>] extends [never]
      ? Acc extends readonly [] ? never : readonly [Value, Acc]
      : JsonAccessAst<Value> extends ExpressionAst.JsonAccessNode<any, infer Base extends Expression.Any, infer Segments>
      ? JsonAccessParts<Base, readonly [...SegmentTuple<Segments>, ...Acc], readonly [...Depth, unknown]>
      : Acc extends readonly [] ? never : readonly [Value, Acc]

type JsonAccessRoot<Value> =
  JsonAccessParts<Value> extends readonly [infer Base, readonly JsonPath.CanonicalSegment[]]
    ? Base
    : Value

type JsonAccessSegments<Value> =
  JsonAccessParts<Value> extends readonly [any, infer Segments extends readonly JsonPath.CanonicalSegment[]]
    ? Segments
    : never

type JsonAccessPath<Value> = JsonPath.Path<JsonAccessSegments<Value>>

type JsonAccessBase<Value extends Expression.Any> =
  [JsonAccessSegments<Value>] extends [never]
    ? Value
    : JsonAccessRoot<Value> extends Expression.Any
      ? JsonAccessRoot<Value>
      : Value

type JsonTextValueRuntime<Value extends Expression.Any> =
  (Exclude<StoredOf<Value>, JsonPathUsageError<any, any, any, any> | null> extends infer Runtime
    ? Runtime extends string ? Runtime : string
    : string) |
  (null extends StoredOf<Value> ? null : never)

type JsonTextValueNullability<Value extends Expression.Any> =
  null extends JsonTextValueRuntime<Value> ? "maybe" : "never"

type JsonAccessTextResultExpression<Value extends AnyJsonExpression<any>> =
  Value extends JsonAccessExpression
    ? Expression.Scalar<
        JsonTextValueRuntime<Value>,
        PostgresTextDb,
        JsonTextValueNullability<Value>,
        DialectOf<Value>,
        ScalarKindOf<Value>,
        Expression.DependenciesOf<Value>
      > & {
        readonly [ExpressionAst.TypeId]: ExpressionAst.JsonAccessNode<
          "jsonPathText",
          JsonAccessBase<Value>,
          JsonAccessSegments<Value>
        >
      }
    : JsonTextTerminalExpression<Value>

type JsonAccessDeleteResultExpression<
  Value extends PostgresJsonExpression<any>,
  Operation extends string
> = Value extends JsonAccessExpression
  ? JsonAccessRoot<Value> extends PostgresJsonExpression<any>
  ? WithJsonPathAccess<JsonResultExpression<
      JsonDeleteOutputOf<StoredOf<JsonAccessRoot<Value>>, JsonAccessPath<Value>, Operation>,
      Expression.DbTypeOf<JsonAccessRoot<Value>>,
      Expression.KindOf<JsonAccessRoot<Value>>,
      Expression.DependenciesOf<JsonAccessRoot<Value>>,
      never,
      DialectOf<JsonAccessRoot<Value>>
    >>
  : never
  : WithJsonPathAccess<JsonResultExpression<
      unknown,
      Expression.DbTypeOf<Value>,
      Expression.KindOf<Value>,
      Expression.DependenciesOf<Value>,
      never,
      DialectOf<Value>
    >>

type JsonAccessSetResultExpression<
  Value extends PostgresJsonExpression<any>,
  Next,
  CreateMissing extends boolean
> = Value extends JsonAccessExpression
  ? JsonAccessRoot<Value> extends PostgresJsonExpression<any>
  ? WithJsonPathAccess<JsonResultExpression<
      JsonSetOutputWithCreateMissing<StoredOf<JsonAccessRoot<Value>>, JsonAccessPath<Value>, Next, "json.set", CreateMissing>,
      Expression.DbTypeOf<JsonAccessRoot<Value>>,
      Expression.KindOf<JsonAccessRoot<Value>>,
      Expression.DependenciesOf<JsonAccessRoot<Value>>,
      never,
      DialectOf<JsonAccessRoot<Value>>
    >>
  : never
  : WithJsonPathAccess<JsonResultExpression<
      unknown,
      Expression.DbTypeOf<Value>,
      Expression.KindOf<Value>,
      Expression.DependenciesOf<Value>,
      never,
      DialectOf<Value>
    >>

type JsonAccessInsertResultExpression<
  Value extends PostgresJsonExpression<any>,
  Next,
  InsertAfter extends boolean
> = Value extends JsonAccessExpression
  ? JsonAccessRoot<Value> extends PostgresJsonExpression<any>
  ? WithJsonPathAccess<JsonResultExpression<
      JsonInsertOutputOf<StoredOf<JsonAccessRoot<Value>>, JsonAccessPath<Value>, Next, InsertAfter, "json.insert">,
      Expression.DbTypeOf<JsonAccessRoot<Value>>,
      Expression.KindOf<JsonAccessRoot<Value>>,
      Expression.DependenciesOf<JsonAccessRoot<Value>>,
      never,
      DialectOf<JsonAccessRoot<Value>>
    >>
  : never
  : WithJsonPathAccess<JsonResultExpression<
      unknown,
      Expression.DbTypeOf<Value>,
      Expression.KindOf<Value>,
      Expression.DependenciesOf<Value>,
      never,
      DialectOf<Value>
    >>

type JsonTextTerminalExpression<
  Base extends AnyJsonExpression<any>
> = Expression.Scalar<
  string | null,
  PostgresTextDb,
  Expression.Nullability,
  DialectOf<Base>,
  Expression.KindOf<Base>,
  Expression.DependenciesOf<Base>
>

type JsonPredicateExpression<
  Base extends PostgresJsonExpression<any>
> = Expression.Scalar<
  boolean,
  PostgresBoolDb,
  "never",
  DialectOf<Base>,
  Expression.KindOf<Base>,
  Expression.DependenciesOf<Base>
>

type JsonNullablePredicateExpression<
  Base extends PostgresJsonExpression<any>
> = Expression.Scalar<
  boolean | null,
  PostgresBoolDb,
  "maybe",
  DialectOf<Base>,
  Expression.KindOf<Base>,
  Expression.DependenciesOf<Base>
>

type JsonbDeleteCallResult<
  First,
  Second,
  Operation extends "json.delete" | "json.remove"
> =
  First extends JsonPath.CanonicalSegment | JsonPath.Path<any>
    ? <Base extends PostgresJsonbExpression<any>>(
        base: Base
      ) => WithJsonPathAccess<JsonResultExpression<
        JsonDeleteOutputOf<StoredOf<Base>, First, Operation>,
        Expression.DbTypeOf<Base>,
        Expression.KindOf<Base>,
        Expression.DependenciesOf<Base>,
        never,
        DialectOf<Base>
      >>
    : First extends PostgresJsonbExpression<any>
      ? [Second] extends [undefined]
        ? JsonAccessDeleteResultExpression<First, Operation>
        : Second extends JsonPath.CanonicalSegment | JsonPath.Path<any>
          ? WithJsonPathAccess<JsonResultExpression<
              JsonDeleteOutputOf<StoredOf<First>, Second, Operation>,
              Expression.DbTypeOf<First>,
              Expression.KindOf<First>,
              Expression.DependenciesOf<First>,
              never,
              DialectOf<First>
            >>
          : never
      : never

type JsonAccessDeleteGuard<
  Value,
  Operation extends "json.delete" | "json.remove"
> = Value extends PostgresJsonExpression<any>
  ? Value extends JsonAccessExpression
    ? JsonAccessRoot<Value> extends PostgresJsonExpression<any>
      ? JsonDeletePathGuard<StoredOf<JsonAccessRoot<Value>>, JsonAccessPath<Value>, Operation>
      : unknown
    : unknown
  : unknown

type JsonbDeleteFirstGuard<
  First,
  Operation extends "json.delete" | "json.remove"
> = First extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  ? ExactJsonPathGuard<First>
  : JsonAccessDeleteGuard<First, Operation>

type JsonbDeleteSecondGuard<
  First,
  Second,
  Operation extends "json.delete" | "json.remove"
> = First extends PostgresJsonExpression<any>
  ? Second extends JsonPath.CanonicalSegment | JsonPath.Path<any>
    ? JsonDeletePathGuard<StoredOf<First>, Second, Operation>
    : unknown
  : unknown

type JsonTextCallResult<
  First,
  Second,
  AllowedTarget extends JsonPath.CanonicalSegment | JsonPath.Path<any>
> =
  First extends AllowedTarget
    ? <Base extends PostgresJsonExpression<any>>(base: Base) => JsonTextResultExpression<Base, First>
    : First extends PostgresJsonExpression<any>
      ? [Second] extends [undefined]
        ? JsonAccessTextResultExpression<First>
        : Second extends AllowedTarget
          ? JsonTextResultExpression<First, Second>
          : never
      : never

interface JsonbBaseSegmentOperation<Segment extends JsonPath.CanonicalSegment> {
  <Base extends PostgresJsonbExpression<any>>(
    base: Base
  ): JsonGetResultExpression<Base, Segment, "json.get">
}

interface JsonbKeySegmentOperation<Key extends string>
  extends JsonbBaseSegmentOperation<JsonPath.KeySegment<Key>>, JsonPath.KeySegment<Key> {}

interface JsonbIndexSegmentOperation<Index extends number>
  extends JsonbBaseSegmentOperation<JsonPath.IndexSegment<Index>>, JsonPath.IndexSegment<Index> {}

interface JsonbWildcardSegmentOperation
  extends JsonbBaseSegmentOperation<JsonPath.WildcardSegment>, JsonPath.WildcardSegment {}

interface JsonbSliceSegmentOperation<
  Start extends number | undefined,
  End extends number | undefined
> extends JsonbBaseSegmentOperation<JsonPath.SliceSegment<Start, End>>, JsonPath.SliceSegment<Start, End> {}

interface JsonbDescendSegmentOperation
  extends JsonbBaseSegmentOperation<JsonPath.DescendSegment>, JsonPath.DescendSegment {}

type JsonbSegmentOperation<Segment extends JsonPath.CanonicalSegment> =
  Segment extends JsonPath.KeySegment<infer Key extends string> ? JsonbKeySegmentOperation<Key> :
    Segment extends JsonPath.IndexSegment<infer Index extends number> ? JsonbIndexSegmentOperation<Index> :
      Segment extends JsonPath.WildcardSegment ? JsonbWildcardSegmentOperation :
        Segment extends JsonPath.SliceSegment<infer Start extends number | undefined, infer End extends number | undefined> ? JsonbSliceSegmentOperation<Start, End> :
          Segment extends JsonPath.DescendSegment ? JsonbDescendSegmentOperation :
            never

const emptyPath = JsonPath.path()

const isObjectLike = (value: unknown): value is object =>
  (typeof value === "object" || typeof value === "function") && value !== null

const isExpression = (value: unknown): value is Expression.Any =>
  isObjectLike(value) && Expression.TypeId in value

const isPath = (value: unknown): value is JsonPath.Path<any> =>
  isObjectLike(value) && JsonPath.TypeId in value

const isSegment = (value: unknown): value is JsonPath.CanonicalSegment =>
  isObjectLike(value) && JsonPath.SegmentTypeId in value

const isTarget = (value: unknown): value is JsonPath.Path<any> | JsonPath.CanonicalSegment =>
  isPath(value) || isSegment(value)

const normalizeSegment = <Segment extends JsonPath.CanonicalSegment>(
  segment: Segment
): Segment => {
  switch (segment.kind) {
    case "key":
      return JsonPath.key(segment.key) as Segment
    case "index":
      return JsonPath.index(segment.index) as Segment
    case "wildcard":
      return JsonPath.wildcard() as Segment
    case "slice":
      return JsonPath.slice(segment.start, segment.end) as Segment
    case "descend":
      return JsonPath.descend() as Segment
  }
}

const normalizeTarget = <Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment>(
  target: Target
): Target =>
  isPath(target)
    ? JsonPath.path(...target.segments.map(normalizeSegment)) as Target
    : normalizeSegment(target as JsonPath.CanonicalSegment) as unknown as Target

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

const accessPathOf = (value: Expression.Any): {
  readonly base: Expression.Any
  readonly path: JsonPath.Path<readonly JsonPath.CanonicalSegment[]>
} | undefined => {
  const segments: JsonPath.CanonicalSegment[] = []
  let base: Expression.Any = value
  while (isExpression(base)) {
    const ast = (base as Expression.Any & {
      readonly [ExpressionAst.TypeId]: ExpressionAst.Any
    })[ExpressionAst.TypeId] as { readonly kind?: unknown; readonly base?: unknown; readonly segments?: unknown }
    if (typeof ast.kind !== "string" || !accessKinds.has(ast.kind) || !isExpression(ast.base) || !Array.isArray(ast.segments)) {
      break
    }
    segments.unshift(...ast.segments.map(normalizeSegment))
    base = ast.base
  }
  return segments.length === 0
    ? undefined
    : {
        base,
        path: JsonPath.path(...segments)
      }
}

const jsonGetDirect = <
  Base extends PostgresJsonExpression<any>,
  Target extends ExactJsonPathInput
>(
  base: Base,
  target: Target & ExactJsonPathGuard<Target>
): JsonGetResultExpression<Base, Target, "json.get"> =>
  postgresJson.get(base as never, normalizeTarget(target) as never) as unknown as JsonGetResultExpression<Base, Target, "json.get">

const jsonTextDirect = <
  Base extends PostgresJsonExpression<any>,
  Target extends ExactJsonPathInput
>(
  base: Base,
  target: Target & ExactJsonPathGuard<Target>
): JsonTextResultExpression<Base, Target> =>
  postgresJson.text(base as never, normalizeTarget(target) as never) as unknown as JsonTextResultExpression<Base, Target>

const jsonbGetDirect = <
  Base extends PostgresJsonbExpression<any>,
  Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
>(
  base: Base,
  target: Target & JsonValuePathGuard<StoredOf<Base>, Target, "json.get">
): JsonGetResultExpression<Base, Target, "json.get"> =>
  postgresJsonb.get(base as Base, normalizeTarget(target)) as unknown as JsonGetResultExpression<Base, Target, "json.get">

const jsonbTextDirect = <
  Base extends PostgresJsonbExpression<any>,
  Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
>(
  base: Base,
  target: Target & JsonValuePathGuard<StoredOf<Base>, Target, "json.text">
): JsonTextResultExpression<Base, Target> =>
  postgresJsonb.text(base as Base, normalizeTarget(target)) as unknown as JsonTextResultExpression<Base, Target>

const jsonbSegmentOperation = <Segment extends JsonPath.CanonicalSegment>(
  segment: Segment
): JsonbSegmentOperation<Segment> =>
  Object.assign(
    ((base: PostgresJsonbExpression<any>) => jsonbGetDirect(base as never, segment as never)) as unknown as JsonbSegmentOperation<Segment>,
    segment
  )

const json = {
  get: ((...args: readonly [unknown] | readonly [unknown, unknown]) => {
    if (args.length === 1) {
      const [first] = args
      if (isTarget(first)) {
        return (base: PostgresJsonExpression<any>) => jsonGetDirect(base as never, first as never)
      }
      return first
    }
    return jsonGetDirect(args[0] as never, args[1] as never)
  }) as unknown as {
      <Base extends PostgresJsonExpression<any>, Target extends ExactJsonPathInput>(
        base: Base,
        target: Target & ExactJsonPathGuard<Target>
      ): JsonGetResultExpression<Base, Target, "json.get">
      <Target extends ExactJsonPathInput>(
        target: Target & ExactJsonPathGuard<Target>
      ): <Base extends PostgresJsonExpression<any>>(base: Base) => JsonGetResultExpression<Base, Target, "json.get">
      <Base>(base: Base & PostgresJsonExpression<any>): Base & PostgresJsonExpression<any>
    },
  access: <
    Base extends PostgresJsonExpression<any>,
    Target extends ExactJsonPathInput
  >(
    base: Base,
    target: Target & ExactJsonPathGuard<Target> & JsonValuePathGuard<StoredOf<Base>, Target, "json.access">
  ) => postgresJson.access(base, normalizeTarget(target)),
  traverse: <
    Base extends PostgresJsonExpression<any>,
    Target extends ExactJsonPathInput
  >(
    base: Base,
    target: Target & ExactJsonPathGuard<Target> & JsonValuePathGuard<StoredOf<Base>, Target, "json.traverse">
  ) => postgresJson.traverse(base, normalizeTarget(target)),
  text: ((...args: readonly [unknown] | readonly [unknown, unknown]) => {
    if (args.length === 1) {
      const [first] = args
      if (isTarget(first)) {
        return (base: PostgresJsonExpression<any>) => jsonTextDirect(base as never, first as never)
      }
      const access = isExpression(first) ? accessPathOf(first) : undefined
      return access === undefined
        ? postgresJson.text(first as never, emptyPath as never)
        : jsonTextDirect(access.base as never, access.path as never)
    }
    return jsonTextDirect(args[0] as never, args[1] as never)
  }) as unknown as <Base extends PostgresJsonExpression<any>>(base: Base) => JsonAccessTextResultExpression<Base>,
  accessText: <
    Base extends PostgresJsonExpression<any>,
    Target extends ExactJsonPathInput
  >(
    base: Base,
    target: Target & ExactJsonPathGuard<Target> & JsonValuePathGuard<StoredOf<Base>, Target, "json.accessText">
  ) => postgresJson.accessText(base, normalizeTarget(target)),
  traverseText: <
    Base extends PostgresJsonExpression<any>,
    Target extends ExactJsonPathInput
  >(
    base: Base,
    target: Target & ExactJsonPathGuard<Target> & JsonValuePathGuard<StoredOf<Base>, Target, "json.traverseText">
  ) => postgresJson.traverseText(base, normalizeTarget(target)),
  buildObject: postgresJson.buildObject,
  buildArray: postgresJson.buildArray,
  toJson: postgresJson.toJson,
  typeOf: postgresJson.typeOf,
  length: postgresJson.length,
  keys: postgresJson.keys,
  stripNulls: postgresJson.stripNulls,
  pathMatch: <
    Base extends PostgresJsonExpression<any>,
    Query extends JsonPathPredicateQuery
  >(
    base: Base,
    query: JsonPathPredicateQueryInput<Query>
  ) => postgresJson.pathMatch(base, query) as unknown as JsonNullablePredicateExpression<Base>,
  delete: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base,
    target: Target & JsonDeletePathGuard<StoredOf<Base>, Target, "json.delete">
  ): JsonResultExpression<
    JsonDeleteOutputOf<StoredOf<Base>, Target, "json.delete">,
    Expression.DbTypeOf<Base>
  > => postgresJson.delete(base as any, normalizeTarget(target) as any) as unknown as JsonResultExpression<
    JsonDeleteOutputOf<StoredOf<Base>, Target, "json.delete">,
    Expression.DbTypeOf<Base>
  >,
  remove: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base,
    target: Target & JsonDeletePathGuard<StoredOf<Base>, Target, "json.remove">
  ): JsonResultExpression<
    JsonDeleteOutputOf<StoredOf<Base>, Target, "json.remove">,
    Expression.DbTypeOf<Base>
  > => postgresJson.remove(base as any, normalizeTarget(target) as any) as unknown as JsonResultExpression<
    JsonDeleteOutputOf<StoredOf<Base>, Target, "json.remove">,
    Expression.DbTypeOf<Base>
  >
}

const jsonb = {
  focus: JsonPath.focus,
  replace: <
    Target extends JsonPath.NonEmptyFocus,
    Next extends Parameters<typeof postgresJsonb.set>[2],
    CreateMissing extends boolean = true
  >(
    target: Target,
    next: Next,
    options?: { readonly createMissing?: CreateMissing }
  ) => <Base extends PostgresJsonExpression<any>>(
    base: Base & JsonbBaseGuard<NoInfer<Base>, "jsonb.replace"> & JsonSetPathGuard<StoredOf<NoInfer<Base>>, Target, NoInfer<Next>, "json.set">
  ): JsonResultExpression<
    JsonSetOutputWithCreateMissing<StoredOf<Base>, Target, Next, "json.set", CreateMissing>,
    Expression.DbTypeOf<Base>, Expression.KindOf<Base>, Expression.DependenciesOf<Base>, never, DialectOf<Base>
  > => postgresJsonb.set(base as never, normalizeTarget(target) as never, next as never, options as never) as never,

  key: <const Key extends string>(value: Key): JsonbSegmentOperation<JsonPath.KeySegment<Key>> =>
    jsonbSegmentOperation(JsonPath.key(value)),
  index: <const Index extends number>(value: Index): JsonbSegmentOperation<JsonPath.IndexSegment<Index>> =>
    jsonbSegmentOperation(JsonPath.index(value)),
  wildcard: (): JsonbSegmentOperation<JsonPath.WildcardSegment> =>
    jsonbSegmentOperation(JsonPath.wildcard()),
  slice: <
    const Start extends number | undefined = undefined,
    const End extends number | undefined = undefined
  >(
    start?: Start,
    end?: End
  ): JsonbSegmentOperation<JsonPath.SliceSegment<Start, End>> =>
    jsonbSegmentOperation(JsonPath.slice(start, end)),
  descend: (): JsonbSegmentOperation<JsonPath.DescendSegment> =>
    jsonbSegmentOperation(JsonPath.descend()),
  get: ((...args: readonly [unknown] | readonly [unknown, unknown]) => {
    if (args.length === 1) {
      const [first] = args
      if (isTarget(first)) {
        return (base: PostgresJsonbExpression<any>) => jsonbGetDirect(base as never, first as never)
      }
      const access = isExpression(first) ? accessPathOf(first) : undefined
      return access === undefined
        ? first
        : jsonbGetDirect(access.base as never, access.path as never)
    }
    return jsonbGetDirect(args[0] as never, args[1] as never)
  }) as unknown as {
    <Base>(
      base: Base & PostgresJsonbExpression<any>
    ): Base & PostgresJsonbExpression<any>
    <Base extends PostgresJsonbExpression<any>, Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>>(
      base: Base,
      target: Target & JsonValuePathGuard<StoredOf<Base>, Target, "json.get">
    ): JsonGetResultExpression<Base, Target, "json.get">
    <Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>>(
      target: Target & JsonValuePathGuard<any, Target, "json.get">
    ): <Base extends PostgresJsonbExpression<any>>(
      base: Base
    ) => JsonGetResultExpression<Base, Target, "json.get">
  },
  access: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.access">,
    target: Target & JsonValuePathGuard<StoredOf<Base>, Target, "json.access">
  ) => postgresJsonb.access(base as Base, normalizeTarget(target)),
  traverse: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.traverse">,
    target: Target & JsonValuePathGuard<StoredOf<Base>, Target, "json.traverse">
  ) => postgresJsonb.traverse(base as Base, normalizeTarget(target)),
  text: ((...args: readonly [unknown] | readonly [unknown, unknown]) => {
    if (args.length === 1) {
      const [first] = args
      if (isTarget(first)) {
        return (base: PostgresJsonbExpression<any>) => jsonbTextDirect(base as never, first as never)
      }
      const access = isExpression(first) ? accessPathOf(first) : undefined
      return access === undefined
        ? postgresJsonb.text(first as never, emptyPath as never)
        : jsonbTextDirect(access.base as never, access.path as never)
    }
    return jsonbTextDirect(args[0] as never, args[1] as never)
  }) as unknown as <Base extends PostgresJsonbExpression<any>>(base: Base) => JsonAccessTextResultExpression<Base>,
  accessText: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.accessText">,
    target: Target & JsonValuePathGuard<StoredOf<Base>, Target, "json.accessText">
  ) => postgresJsonb.accessText(base as Base, normalizeTarget(target)),
  traverseText: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.traverseText">,
    target: Target & JsonValuePathGuard<StoredOf<Base>, Target, "json.traverseText">
  ) => postgresJsonb.traverseText(base as Base, normalizeTarget(target)),
  contains: <
    Left extends PostgresJsonExpression<any>,
    Right extends Parameters<typeof postgresJsonb.contains>[1]
  >(
    left: Left & JsonbBaseGuard<Left, "jsonb.contains">,
    right: Right
  ) => postgresJsonb.contains(left as Left, right),
  containedBy: <
    Left extends PostgresJsonExpression<any>,
    Right extends Parameters<typeof postgresJsonb.containedBy>[1]
  >(
    left: Left & JsonbBaseGuard<Left, "jsonb.containedBy">,
    right: Right
  ) => postgresJsonb.containedBy(left as Left, right),
  hasKey: ((...args: readonly [unknown] | readonly [unknown, unknown]) => {
    if (args.length === 1) {
      const [key] = args
      return (base: PostgresJsonExpression<any>) => postgresJsonb.hasKey(base as never, key as never)
    }
    const [base, key] = args
    return postgresJsonb.hasKey(base as never, key as never)
  }) as {
    <Base extends PostgresJsonExpression<any>, Key extends JsonObjectKeyOf<Base>>(
      base: Base & JsonbBaseGuard<Base, "jsonb.hasKey">,
      key: Key
    ): JsonPredicateExpression<Base>
    <Key extends string>(
      key: Key
    ): <Base extends PostgresJsonExpression<any>>(
      base: Base & JsonbBaseGuard<Base, "jsonb.hasKey"> & (Key extends JsonObjectKeyOf<Base> ? unknown : never)
    ) => JsonPredicateExpression<Base>
  },
  keyExists: ((...args: readonly [unknown] | readonly [unknown, unknown]) => {
    if (args.length === 1) {
      const [key] = args
      return (base: PostgresJsonExpression<any>) => postgresJsonb.keyExists(base as never, key as never)
    }
    const [base, key] = args
    return postgresJsonb.keyExists(base as never, key as never)
  }) as {
    <Base extends PostgresJsonExpression<any>, Key extends JsonObjectKeyOf<Base>>(
      base: Base & JsonbBaseGuard<Base, "jsonb.keyExists">,
      key: Key
    ): JsonPredicateExpression<Base>
    <Key extends string>(
      key: Key
    ): <Base extends PostgresJsonExpression<any>>(
      base: Base & JsonbBaseGuard<Base, "jsonb.keyExists"> & (Key extends JsonObjectKeyOf<Base> ? unknown : never)
    ) => JsonPredicateExpression<Base>
  },
  hasAnyKeys: ((base: PostgresJsonExpression<any>, ...keys: readonly string[]) =>
    postgresJsonb.hasAnyKeys(base as never, ...(keys as [string, ...string[]]))) as {
    <Base extends PostgresJsonExpression<any>, Keys extends readonly [JsonObjectKeyOf<Base>, ...JsonObjectKeyOf<Base>[]]>(
      base: Base & JsonbBaseGuard<Base, "jsonb.hasAnyKeys">,
      ...keys: Keys
    ): JsonPredicateExpression<Base>
  },
  hasAllKeys: ((base: PostgresJsonExpression<any>, ...keys: readonly string[]) =>
    postgresJsonb.hasAllKeys(base as never, ...(keys as [string, ...string[]]))) as {
    <Base extends PostgresJsonExpression<any>, Keys extends readonly [JsonObjectKeyOf<Base>, ...JsonObjectKeyOf<Base>[]]>(
      base: Base & JsonbBaseGuard<Base, "jsonb.hasAllKeys">,
      ...keys: Keys
    ): JsonPredicateExpression<Base>
  },
  delete: ((...args: readonly [unknown] | readonly [unknown, unknown]) => {
    if (args.length === 1) {
      const [first] = args
      if (isTarget(first)) {
        return (base: PostgresJsonbExpression<any>) => postgresJsonb.delete(base as any, normalizeTarget(first) as any)
      }
      const access = isExpression(first) ? accessPathOf(first) : undefined
      if (access === undefined) {
        throw new Error("Jsonb.delete requires a piped JSON path or an explicit target")
      }
      return postgresJsonb.delete(access.base as any, access.path as any)
    }
    return postgresJsonb.delete(args[0] as any, normalizeTarget(args[1] as JsonPath.CanonicalSegment | JsonPath.Path<any>) as any)
  }) as unknown as <First extends PostgresJsonbExpression<any> | JsonPath.CanonicalSegment | JsonPath.Path<any>, Second extends JsonPath.CanonicalSegment | JsonPath.Path<any> | undefined = undefined>(
    first: First & JsonbDeleteFirstGuard<First, "json.delete">,
    second?: Second & JsonbDeleteSecondGuard<First, Second, "json.delete">
  ) => JsonbDeleteCallResult<First, Second, "json.delete">,
  remove: ((...args: readonly [unknown] | readonly [unknown, unknown]) => {
    if (args.length === 1) {
      const [first] = args
      if (isTarget(first)) {
        return (base: PostgresJsonbExpression<any>) => postgresJsonb.remove(base as any, normalizeTarget(first) as any)
      }
      const access = isExpression(first) ? accessPathOf(first) : undefined
      if (access === undefined) {
        throw new Error("Jsonb.remove requires a piped JSON path or an explicit target")
      }
      return postgresJsonb.remove(access.base as any, access.path as any)
    }
    return postgresJsonb.remove(args[0] as any, normalizeTarget(args[1] as JsonPath.CanonicalSegment | JsonPath.Path<any>) as any)
  }) as unknown as <First extends PostgresJsonbExpression<any> | JsonPath.CanonicalSegment | JsonPath.Path<any>, Second extends JsonPath.CanonicalSegment | JsonPath.Path<any> | undefined = undefined>(
    first: First & JsonbDeleteFirstGuard<First, "json.remove">,
    second?: Second & JsonbDeleteSecondGuard<First, Second, "json.remove">
  ) => JsonbDeleteCallResult<First, Second, "json.remove">,
  set: ((...args: readonly unknown[]) => {
    if (args.length === 1 || (args.length === 2 && !isExpression(args[0]))) {
      const [next, options] = args
      return (base: PostgresJsonbExpression<any>) => {
        const access = accessPathOf(base)
        if (access === undefined) {
          throw new Error("Jsonb.set requires a piped JSON path or an explicit target")
        }
        return postgresJsonb.set(access.base as any, access.path as any, next as any, options as any)
      }
    }
    if ((args.length === 2 || args.length === 3) && isExpression(args[0]) && !isTarget(args[1])) {
      const [base, next, options] = args
      const access = accessPathOf(base)
      if (access === undefined) {
        throw new Error("Jsonb.set requires a piped JSON path or an explicit target")
      }
      return postgresJsonb.set(access.base as any, access.path as any, next as any, options as any)
    }
    const [base, target, next, options] = args
    return postgresJsonb.set(base as any, normalizeTarget(target as JsonPath.CanonicalSegment | JsonPath.Path<any>) as any, next as any, options as any)
  }) as unknown as {
    <Next extends Parameters<typeof postgresJsonb.set>[2], CreateMissing extends boolean = true>(
      next: Next,
      options?: {
        readonly createMissing?: CreateMissing
      }
    ): <Base extends PostgresJsonbExpression<any>>(base: Base) => JsonAccessSetResultExpression<Base, Next, CreateMissing>
    <Base extends PostgresJsonbExpression<any>, Next extends Parameters<typeof postgresJsonb.set>[2], CreateMissing extends boolean = true>(
      base: Base,
      next: Next,
      options?: {
        readonly createMissing?: CreateMissing
      }
    ): JsonAccessSetResultExpression<Base, Next, CreateMissing>
    <Base extends PostgresJsonbExpression<any>, Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>, Next extends Parameters<typeof postgresJsonb.set>[2], CreateMissing extends boolean = true>(
      base: Base,
      target: Target & JsonSetPathGuard<StoredOf<Base>, Target, NoInfer<Next>, "json.set">,
      next: Next,
      options?: {
        readonly createMissing?: CreateMissing
      }
    ): JsonResultExpression<
      JsonSetOutputWithCreateMissing<StoredOf<Base>, Target, Next, "json.set", CreateMissing>,
      Expression.DbTypeOf<Base>,
      Expression.KindOf<Base>,
      Expression.DependenciesOf<Base>,
      never,
      DialectOf<Base>
    >
  },
  insert: ((...args: readonly unknown[]) => {
    if (args.length === 1 || (args.length === 2 && !isExpression(args[0]))) {
      const [next, options] = args
      return (base: PostgresJsonbExpression<any>) => {
        const access = accessPathOf(base)
        if (access === undefined) {
          throw new Error("Jsonb.insert requires a piped JSON path or an explicit target")
        }
        return postgresJsonb.insert(access.base as any, access.path as any, next as any, options as any)
      }
    }
    if ((args.length === 2 || args.length === 3) && isExpression(args[0]) && !isTarget(args[1])) {
      const [base, next, options] = args
      const access = accessPathOf(base)
      if (access === undefined) {
        throw new Error("Jsonb.insert requires a piped JSON path or an explicit target")
      }
      return postgresJsonb.insert(access.base as any, access.path as any, next as any, options as any)
    }
    const [base, target, next, options] = args
    return postgresJsonb.insert(base as any, normalizeTarget(target as JsonPath.CanonicalSegment | JsonPath.Path<any>) as any, next as any, options as any)
  }) as unknown as {
    <Next extends Parameters<typeof postgresJsonb.insert>[2], InsertAfter extends boolean = false>(
      next: Next,
      options?: {
        readonly insertAfter?: InsertAfter
      }
    ): <Base extends PostgresJsonbExpression<any>>(base: Base) => JsonAccessInsertResultExpression<Base, Next, InsertAfter>
    <Base extends PostgresJsonbExpression<any>, Next extends Parameters<typeof postgresJsonb.insert>[2], InsertAfter extends boolean = false>(
      base: Base,
      next: Next,
      options?: {
        readonly insertAfter?: InsertAfter
      }
    ): JsonAccessInsertResultExpression<Base, Next, InsertAfter>
    <Base extends PostgresJsonbExpression<any>, Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>, Next extends Parameters<typeof postgresJsonb.insert>[2], InsertAfter extends boolean = false>(
      base: Base,
      target: Target & JsonInsertPathGuard<StoredOf<Base>, Target, NoInfer<Next>, NoInfer<InsertAfter>, "json.insert">,
      next: Next,
      options?: {
        readonly insertAfter?: InsertAfter
      }
    ): JsonResultExpression<
      JsonInsertOutputOf<StoredOf<Base>, Target, Next, InsertAfter, "json.insert">,
      Expression.DbTypeOf<Base>,
      Expression.KindOf<Base>,
      Expression.DependenciesOf<Base>,
      never,
      DialectOf<Base>
    >
  },
  concat: postgresJsonb.concat,
  merge: postgresJsonb.merge,
  buildObject: postgresJsonb.buildObject,
  buildArray: postgresJsonb.buildArray,
  toJsonb: postgresJsonb.toJsonb,
  typeOf: <
    Base extends PostgresJsonExpression<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.typeOf">
  ) => postgresJsonb.typeOf(base as Base),
  length: <
    Base extends PostgresJsonExpression<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.length">
  ) => postgresJsonb.length(base as Base),
  keys: <
    Base extends PostgresJsonExpression<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.keys">
  ) => postgresJsonb.keys(base as Base),
  stripNulls: <
    Base extends PostgresJsonExpression<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.stripNulls">
  ) => postgresJsonb.stripNulls(base as Base),
  pathExists: ((...args: readonly [unknown] | readonly [unknown, unknown]) => {
    if (args.length === 1) {
      const [first] = args
      if (isTarget(first) || typeof first === "string") {
        return (base: PostgresJsonbExpression<any>) => postgresJsonb.pathExists(base as any, isTarget(first) ? normalizeTarget(first) as any : first as any)
      }
      const access = isExpression(first) ? accessPathOf(first) : undefined
      if (access === undefined) {
        throw new Error("Jsonb.pathExists requires a piped JSON path or an explicit query")
      }
      return postgresJsonb.pathExists(access.base as any, access.path as any)
    }
    const [base, query] = args
    return postgresJsonb.pathExists(base as any, isTarget(query) ? normalizeTarget(query) as any : query as any)
  }) as unknown as {
    <Base extends PostgresJsonbExpression<any>, Query extends JsonPathPredicateQuery>(
      base: Base,
      query: JsonPathPredicateQueryInput<Query>
    ): ReturnType<typeof postgresJsonb.pathExists<Base, Query>>
    <Query extends JsonPathPredicateQuery>(
      query: JsonPathPredicateQueryInput<Query>
    ): <Base extends PostgresJsonbExpression<any>>(base: Base) => ReturnType<typeof postgresJsonb.pathExists<Base, Query>>
    <Base extends PostgresJsonbExpression<any>>(base: Base): JsonPredicateExpression<Base>
  },
  pathMatch: <
    Base extends PostgresJsonExpression<any>,
    Query extends JsonPathPredicateQuery
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.pathMatch">,
    query: JsonPathPredicateQueryInput<Query>
  ) => postgresJsonb.pathMatch(base as Base, query) as unknown as JsonNullablePredicateExpression<Base>
}

/** Postgres shared JSON helpers for exact paths and functions that work on both json and jsonb. */
export { json }
export const get = json.get
export const access = json.access
export const traverse = json.traverse
export const text = json.text
export const accessText = json.accessText
export const traverseText = json.traverseText
export const buildObject = json.buildObject
export const buildArray = json.buildArray
export const toJson = json.toJson
export const typeOf = json.typeOf
export const length = json.length
export const keys = json.keys
export const stripNulls = json.stripNulls
export const pathMatch = json.pathMatch
export const delete_ = json.delete
export { delete_ as delete }
export const remove = json.remove
/** Postgres jsonb-only helpers for containment, mutation, wildcard paths, and SQL/JSON path predicates. */
export { jsonb }
