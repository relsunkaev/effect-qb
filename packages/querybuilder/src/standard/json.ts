import * as Expression from "../internal/scalar.js"
import * as ExpressionAst from "../internal/expression-ast.js"
import type { JsonPathUsageError } from "../internal/json/errors.js"
import * as JsonPath from "../internal/json/path.js"
import type {
  JsonDeleteAtPath,
  JsonInsertAtPath,
  JsonSetAtPath,
  JsonTextResult as JsonTextRuntimeResult,
  JsonValueAtPath
} from "../internal/json/types.js"
import type { LiteralStringInput } from "../internal/table-options.js"
import type { JsonObjectKeyOf, WithJsonPathAccess } from "../internal/json/path-access.js"
import type { standardDatatypes } from "./datatypes/index.js"
import { json as standardJson } from "../internal/standard-dsl.js"

type JsonExpression<Runtime = unknown> = Expression.Scalar<
  Runtime,
  Expression.DbType.Json<any, any>,
  Expression.Nullability,
  string,
  Expression.ScalarKind,
  Expression.BindingId
>

type JsonPathInput = JsonPath.CanonicalSegment | JsonPath.Path<any>

type TextDb = ReturnType<typeof standardDatatypes.text>
type BoolDb = ReturnType<typeof standardDatatypes.boolean>
type DialectOf<Value extends Expression.Any> = Value[typeof Expression.TypeId]["dialect"]

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

type JsonPathExistsQuery = JsonPathInput | JsonPathPredicateQuery

type JsonPathExistsQueryInput<Query extends JsonPathExistsQuery> =
  Query extends string ? LiteralStringInput<Query> : Query

type SegmentTuple<Segments> = Segments extends readonly JsonPath.CanonicalSegment[]
  ? Segments
  : readonly JsonPath.CanonicalSegment[]

type JsonPathSegmentsOf<Target extends JsonPathInput> =
  Target extends JsonPath.Path<infer Segments extends readonly JsonPath.CanonicalSegment[]> ? Segments :
    Target extends JsonPath.CanonicalSegment ? readonly [Target] :
      readonly []

type JsonPathOutputOf<
  Root,
  Target extends JsonPathInput,
  Operation extends string
> = Target extends JsonPath.Path<any>
  ? JsonValueAtPath<Root, Target, Operation>
  : Target extends JsonPath.CanonicalSegment
    ? JsonValueAtPath<Root, JsonPath.Path<[Target]>, Operation>
    : never

type JsonDeleteOutputOf<
  Root,
  Target extends JsonPathInput,
  Operation extends string
> = Target extends JsonPath.Path<any>
  ? JsonDeleteAtPath<Root, Target, Operation>
  : Target extends JsonPath.CanonicalSegment
    ? JsonDeleteAtPath<Root, JsonPath.Path<[Target]>, Operation>
    : never

type JsonSetOutputOf<
  Root,
  Target extends JsonPathInput,
  Next,
  Operation extends string
> = Target extends JsonPath.Path<any>
  ? JsonSetAtPath<Root, Target, Next, Operation>
  : Target extends JsonPath.CanonicalSegment
    ? JsonSetAtPath<Root, JsonPath.Path<[Target]>, Next, Operation>
    : never

type JsonSetOutputWithCreateMissing<
  Root,
  Target extends JsonPathInput,
  Next,
  Operation extends string,
  CreateMissing extends boolean
> = false extends CreateMissing
  ? Root | JsonSetOutputOf<Root, Target, Next, Operation>
  : JsonSetOutputOf<Root, Target, Next, Operation>

type JsonInsertOutputOf<
  Root,
  Target extends JsonPathInput,
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
  Target extends JsonPathInput,
  Operation extends string
> = JsonPathOutputOf<Root, Target, Operation> extends JsonPathUsageError<any, any, any, any>
  ? JsonPathOutputOf<Root, Target, Operation>
  : unknown

type JsonDeletePathGuard<
  Root,
  Target extends JsonPathInput,
  Operation extends string
> = JsonDeleteOutputOf<Root, Target, Operation> extends JsonPathUsageError<any, any, any, any>
  ? JsonDeleteOutputOf<Root, Target, Operation>
  : unknown

type JsonSetPathGuard<
  Root,
  Target extends JsonPathInput,
  Next,
  Operation extends string
> = JsonSetOutputOf<Root, Target, Next, Operation> extends JsonPathUsageError<any, any, any, any>
  ? JsonSetOutputOf<Root, Target, Next, Operation>
  : unknown

type JsonInsertPathGuard<
  Root,
  Target extends JsonPathInput,
  Next,
  InsertAfter extends boolean,
  Operation extends string
> = JsonInsertOutputOf<Root, Target, Next, InsertAfter, Operation> extends JsonPathUsageError<any, any, any, any>
  ? JsonInsertOutputOf<Root, Target, Next, InsertAfter, Operation>
  : unknown

type JsonMutationPathUsageError<Target, Operation extends string> = {
  readonly __effect_qb_error__: "effect-qb: json mutation helpers only accept exact key/index paths"
  readonly __effect_qb_operation__: Operation
  readonly __effect_qb_json_path__: Target
}

type ExactJsonPathGuard<Target, Operation extends string> = Target extends JsonPath.Path<any>
  ? JsonPath.IsExactPath<Target> extends true ? unknown : JsonMutationPathUsageError<Target, Operation>
  : Target extends JsonPath.ExactSegment
    ? unknown
    : JsonMutationPathUsageError<Target, Operation>

type JsonKindOf<Value extends Expression.Any> = Expression.KindOf<Value>

type JsonAccessKind<Target extends JsonPathInput> =
  Target extends JsonPath.Path<any>
    ? JsonPath.IsExactPath<Target> extends true ? "jsonPath" : "jsonTraverse"
    : Target extends JsonPath.ExactSegment ? "jsonGet" : "jsonAccess"

type JsonTextAccessKind<Target extends JsonPathInput> =
  Target extends JsonPath.Path<any>
    ? JsonPath.IsExactPath<Target> extends true ? "jsonPathText" : "jsonTraverseText"
    : Target extends JsonPath.ExactSegment ? "jsonGetText" : "jsonAccessText"

type JsonDbOf<Base extends JsonExpression<any>> =
  Expression.DbTypeOf<Base> extends Expression.DbType.Json<infer Dialect, infer Variant>
    ? Expression.DbType.Json<Dialect, Variant>
    : Expression.DbType.Json

type JsonResultExpression<
  Runtime,
  Db extends Expression.DbType.Json<any, any>,
  Kind extends Expression.ScalarKind = Expression.ScalarKind,
  Dependencies extends Expression.BindingId = Expression.BindingId,
  Ast extends ExpressionAst.Any = never,
  Dialect extends string = string
> = Expression.Scalar<
  Runtime,
  Db,
  Expression.Nullability,
  Dialect,
  Kind,
  Dependencies
> & ([Ast] extends [never] ? unknown : {
  readonly [ExpressionAst.TypeId]: Ast
})

type JsonGetResultExpression<
  Base extends JsonExpression<any>,
  Target extends JsonPathInput,
  Operation extends string
> = WithJsonPathAccess<JsonResultExpression<
  JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, Operation>,
  JsonDbOf<Base>,
  Expression.KindOf<Base>,
  Expression.DependenciesOf<Base>,
  ExpressionAst.JsonAccessNode<JsonAccessKind<Target>, Base, JsonPathSegmentsOf<Target>>,
  DialectOf<Base>
>>

type JsonTextRuntime<
  Base extends JsonExpression<any>,
  Target extends JsonPathInput
> =
  JsonTextRuntimeResult<Exclude<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.text">, JsonPathUsageError<any, any, any, any> | null>> |
  (null extends JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.text"> ? null : never)

type JsonTextResultExpression<
  Base extends JsonExpression<any>,
  Target extends JsonPathInput
> = Expression.Scalar<
  JsonTextRuntime<Base, Target>,
  TextDb,
  Expression.Nullability,
  DialectOf<Base>,
  JsonKindOf<Base>,
  Expression.DependenciesOf<Base>
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.JsonAccessNode<JsonTextAccessKind<Target>, Base, JsonPathSegmentsOf<Target>>
}

type JsonTextTerminalExpression<
  Base extends JsonExpression<any>
> = Expression.Scalar<
  string | null,
  TextDb,
  Expression.Nullability,
  DialectOf<Base>,
  JsonKindOf<Base>,
  Expression.DependenciesOf<Base>
>

type JsonDeleteResultExpression<
  Base extends JsonExpression<any>,
  Target extends JsonPathInput
> = WithJsonPathAccess<JsonResultExpression<
  JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.delete">,
  JsonDbOf<Base>,
  JsonKindOf<Base>,
  Expression.DependenciesOf<Base>,
  never,
  DialectOf<Base>
>>

type JsonDeleteTerminalExpression<
  Base extends JsonExpression<any>
> = WithJsonPathAccess<JsonResultExpression<
  unknown,
  JsonDbOf<Base>,
  JsonKindOf<Base>,
  Expression.DependenciesOf<Base>,
  never,
  DialectOf<Base>
>>

type JsonPredicateExpression<
  Base extends Expression.Any
> = Expression.Scalar<
  boolean,
  BoolDb,
  "never",
  DialectOf<Base>,
  JsonKindOf<Base>,
  Expression.DependenciesOf<Base>
>

type JsonAccessAst<Value> = Value extends {
  readonly [ExpressionAst.TypeId]: infer Ast
} ? Ast : never

type JsonAccessExpression = {
  readonly [ExpressionAst.TypeId]: ExpressionAst.JsonAccessNode<any, any, any>
}

type NotJsonAccess<Value> = Value extends JsonAccessExpression ? never : unknown

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
  (Exclude<Expression.RuntimeOf<Value>, JsonPathUsageError<any, any, any, any> | null> extends infer Runtime
    ? Runtime extends string ? Runtime : string
    : string) |
  (null extends Expression.RuntimeOf<Value> ? null : never)

type JsonTextValueNullability<Value extends Expression.Any> =
  null extends JsonTextValueRuntime<Value> ? "maybe" : "never"

type JsonAccessTextResultExpression<Value extends JsonExpression<any>> =
  Value extends JsonAccessExpression
    ? Expression.Scalar<
        JsonTextValueRuntime<Value>,
        TextDb,
        JsonTextValueNullability<Value>,
        DialectOf<Value>,
        JsonKindOf<Value>,
        Expression.DependenciesOf<Value>
      > & {
        readonly [ExpressionAst.TypeId]: ExpressionAst.JsonAccessNode<
          "jsonPathText",
          JsonAccessBase<Value>,
          JsonAccessSegments<Value>
        >
      }
    : JsonTextTerminalExpression<Value>

type JsonAccessGetResultExpression<
  Value extends JsonExpression<any>,
  Operation extends string
> = Value extends JsonAccessExpression
  ? JsonAccessRoot<Value> extends JsonExpression<any>
    ? JsonGetResultExpression<JsonAccessRoot<Value>, JsonAccessPath<Value>, Operation>
    : never
  : Value

type JsonAccessDeleteResultExpression<
  Value extends JsonExpression<any>,
  Operation extends string
> = Value extends JsonAccessExpression
  ? JsonAccessRoot<Value> extends JsonExpression<any>
      ? WithJsonPathAccess<JsonResultExpression<
        JsonDeleteOutputOf<Expression.RuntimeOf<JsonAccessRoot<Value>>, JsonAccessPath<Value>, Operation>,
        JsonDbOf<JsonAccessRoot<Value>>,
        JsonKindOf<JsonAccessRoot<Value>>,
        Expression.DependenciesOf<JsonAccessRoot<Value>>,
        never,
        DialectOf<JsonAccessRoot<Value>>
      >>
    : never
  : JsonDeleteTerminalExpression<Value>

type JsonAccessSetResultExpression<
  Value extends JsonExpression<any>,
  Next,
  CreateMissing extends boolean
> = Value extends JsonAccessExpression
  ? JsonAccessRoot<Value> extends JsonExpression<any>
    ? WithJsonPathAccess<JsonResultExpression<
        JsonSetOutputWithCreateMissing<Expression.RuntimeOf<JsonAccessRoot<Value>>, JsonAccessPath<Value>, Next, "json.set", CreateMissing>,
        JsonDbOf<JsonAccessRoot<Value>>,
        JsonKindOf<JsonAccessRoot<Value>>,
        Expression.DependenciesOf<JsonAccessRoot<Value>>,
        never,
        DialectOf<JsonAccessRoot<Value>>
      >>
    : never
  : WithJsonPathAccess<JsonResultExpression<
      unknown,
      JsonDbOf<Value>,
      JsonKindOf<Value>,
      Expression.DependenciesOf<Value>,
      never,
      DialectOf<Value>
    >>

type JsonAccessInsertResultExpression<
  Value extends JsonExpression<any>,
  Next,
  InsertAfter extends boolean
> = Value extends JsonAccessExpression
  ? JsonAccessRoot<Value> extends JsonExpression<any>
    ? WithJsonPathAccess<JsonResultExpression<
        JsonInsertOutputOf<Expression.RuntimeOf<JsonAccessRoot<Value>>, JsonAccessPath<Value>, Next, InsertAfter, "json.insert">,
        JsonDbOf<JsonAccessRoot<Value>>,
        JsonKindOf<JsonAccessRoot<Value>>,
        Expression.DependenciesOf<JsonAccessRoot<Value>>,
        never,
        DialectOf<JsonAccessRoot<Value>>
      >>
    : never
  : WithJsonPathAccess<JsonResultExpression<
      unknown,
      JsonDbOf<Value>,
      JsonKindOf<Value>,
      Expression.DependenciesOf<Value>,
      never,
      DialectOf<Value>
    >>

type JsonAccessDeleteGuard<
  Value,
  Operation extends "json.delete" | "json.remove"
> = Value extends JsonExpression<any>
  ? Value extends JsonAccessExpression
    ? JsonAccessRoot<Value> extends JsonExpression<any>
      ? ExactJsonPathGuard<JsonAccessPath<Value>, Operation> &
        JsonDeletePathGuard<Expression.RuntimeOf<JsonAccessRoot<Value>>, JsonAccessPath<Value>, Operation>
      : unknown
    : unknown
  : unknown

type JsonAccessSetGuard<
  Value,
  Next,
  CreateMissing extends boolean
> = Value extends JsonExpression<any>
  ? Value extends JsonAccessExpression
    ? JsonAccessRoot<Value> extends JsonExpression<any>
      ? ExactJsonPathGuard<JsonAccessPath<Value>, "json.set"> &
        JsonSetPathGuard<Expression.RuntimeOf<JsonAccessRoot<Value>>, JsonAccessPath<Value>, Next, "json.set">
      : unknown
    : unknown
  : unknown

type JsonAccessInsertGuard<
  Value,
  Next,
  InsertAfter extends boolean
> = Value extends JsonExpression<any>
  ? Value extends JsonAccessExpression
    ? JsonAccessRoot<Value> extends JsonExpression<any>
      ? ExactJsonPathGuard<JsonAccessPath<Value>, "json.insert"> &
        JsonInsertPathGuard<Expression.RuntimeOf<JsonAccessRoot<Value>>, JsonAccessPath<Value>, Next, InsertAfter, "json.insert">
      : unknown
    : unknown
  : unknown

interface BaseSegmentOperation<Segment extends JsonPath.CanonicalSegment> {
  <Base extends JsonExpression<any>>(base: Base): JsonGetResultExpression<Base, Segment, "json.get">
}

interface KeySegmentOperation<Key extends string>
  extends BaseSegmentOperation<JsonPath.KeySegment<Key>>, JsonPath.KeySegment<Key> {}

interface IndexSegmentOperation<Index extends number>
  extends BaseSegmentOperation<JsonPath.IndexSegment<Index>>, JsonPath.IndexSegment<Index> {}

interface WildcardSegmentOperation
  extends BaseSegmentOperation<JsonPath.WildcardSegment>, JsonPath.WildcardSegment {}

interface SliceSegmentOperation<
  Start extends number | undefined,
  End extends number | undefined
> extends BaseSegmentOperation<JsonPath.SliceSegment<Start, End>>, JsonPath.SliceSegment<Start, End> {}

interface DescendSegmentOperation
  extends BaseSegmentOperation<JsonPath.DescendSegment>, JsonPath.DescendSegment {}

type SegmentOperation<Segment extends JsonPath.CanonicalSegment> =
  Segment extends JsonPath.KeySegment<infer Key extends string> ? KeySegmentOperation<Key> :
    Segment extends JsonPath.IndexSegment<infer Index extends number> ? IndexSegmentOperation<Index> :
      Segment extends JsonPath.WildcardSegment ? WildcardSegmentOperation :
        Segment extends JsonPath.SliceSegment<infer Start extends number | undefined, infer End extends number | undefined> ? SliceSegmentOperation<Start, End> :
          Segment extends JsonPath.DescendSegment ? DescendSegmentOperation :
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

const isTarget = (value: unknown): value is JsonPathInput =>
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

const normalizeTarget = <Target extends JsonPathInput>(
  target: Target
): Target =>
  isPath(target)
    ? JsonPath.path(...target.segments.map(normalizeSegment)) as Target
    : normalizeSegment(target as JsonPath.CanonicalSegment) as unknown as Target

const normalizeTargetPath = <Target extends JsonPathInput>(
  target: Target
): JsonPath.Path<JsonPathSegmentsOf<Target>> =>
  isPath(target)
    ? JsonPath.path(...target.segments.map(normalizeSegment)) as JsonPath.Path<JsonPathSegmentsOf<Target>>
    : JsonPath.path(normalizeSegment(target as JsonPath.CanonicalSegment)) as unknown as JsonPath.Path<JsonPathSegmentsOf<Target>>

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

const targetOrAccessPath = (
  value: unknown
): {
  readonly base: Expression.Any
  readonly path: JsonPath.Path<readonly JsonPath.CanonicalSegment[]>
} | undefined =>
  isExpression(value) ? accessPathOf(value) : undefined

const segmentOperation = <Segment extends JsonPath.CanonicalSegment>(
  segment: Segment
): SegmentOperation<Segment> =>
  Object.assign(
    ((base: JsonExpression<any>) => standardJson.get(base as never, segment as never)) as unknown as SegmentOperation<Segment>,
    segment
  )

export const key = <const Key extends string>(value: Key): SegmentOperation<JsonPath.KeySegment<Key>> =>
  segmentOperation(JsonPath.key(value))

export const index = <const Index extends number>(value: Index): SegmentOperation<JsonPath.IndexSegment<Index>> =>
  segmentOperation(JsonPath.index(value))

export const wildcard = (): SegmentOperation<JsonPath.WildcardSegment> =>
  segmentOperation(JsonPath.wildcard())

export const slice = <
  const Start extends number | undefined = undefined,
  const End extends number | undefined = undefined
>(
  start?: Start,
  end?: End
): SegmentOperation<JsonPath.SliceSegment<Start, End>> =>
  segmentOperation(JsonPath.slice(start, end))

export const descend = (): SegmentOperation<JsonPath.DescendSegment> =>
  segmentOperation(JsonPath.descend())

export interface Get {
  <Base extends JsonExpression<any>, Target extends JsonPathInput>(
    base: Base,
    target: Target & JsonValuePathGuard<Expression.RuntimeOf<Base>, Target, "json.get">
  ): JsonGetResultExpression<Base, Target, "json.get">
  <Target extends JsonPathInput>(
    target: Target & JsonValuePathGuard<any, Target, "json.get">
  ): <Base extends JsonExpression<any>>(base: Base) => JsonGetResultExpression<Base, Target, "json.get">
  <Base extends JsonExpression<any>>(base: Base): JsonAccessGetResultExpression<Base, "json.get">
}

export const get = ((...args: readonly [unknown] | readonly [unknown, unknown]) => {
  if (args.length === 1) {
    const [first] = args
    if (isTarget(first)) {
      return (base: JsonExpression<any>) => standardJson.get(base as never, normalizeTarget(first) as never)
    }
    const access = targetOrAccessPath(first)
    return access === undefined
      ? first
      : standardJson.get(access.base as never, access.path as never)
  }
  const [base, target] = args
  return standardJson.get(base as never, normalizeTarget(target as JsonPathInput) as never)
}) as Get

type TextPipe = <Base extends JsonExpression<any>>(
  base: Base
) => Base extends JsonAccessExpression
  ? JsonAccessTextResultExpression<Base>
  : JsonTextTerminalExpression<Base>

type Text = TextPipe

export const text = (((...args: readonly [unknown] | readonly [unknown, unknown]) => {
  if (args.length === 1) {
    const [first] = args
    if (isTarget(first)) {
      return (base: JsonExpression<any>) => standardJson.text(base as never, normalizeTarget(first) as never)
    }
    const access = targetOrAccessPath(first)
    return access === undefined
      ? standardJson.text(first as never, emptyPath as never)
      : standardJson.text(access.base as never, access.path as never)
  }
  const [base, target] = args
  return standardJson.text(base as never, normalizeTarget(target as JsonPathInput) as never)
}) as unknown) as Text

type DeletePipe = <Base extends JsonExpression<any> & JsonAccessExpression>(
  base: Base & JsonAccessDeleteGuard<Base, "json.delete">
) => JsonAccessDeleteResultExpression<Base, "json.delete">

type Delete = DeletePipe

export const delete_ = (((...args: readonly [unknown] | readonly [unknown, unknown]) => {
  if (args.length === 1) {
    const [first] = args
    if (isTarget(first)) {
      return (base: JsonExpression<any>) => standardJson.delete(base as never, normalizeTarget(first) as never)
    }
    const access = targetOrAccessPath(first)
    if (access === undefined) {
      throw new Error("Json.delete requires a piped JSON path or an explicit target")
    }
    return standardJson.delete(access.base as never, access.path as never)
  }
  const [base, target] = args
  return standardJson.delete(base as never, normalizeTarget(target as JsonPathInput) as never)
}) as unknown) as Delete

export { delete_ as delete }

export const access = standardJson.access
export const traverse = standardJson.traverse
export const accessText = standardJson.accessText
export const traverseText = standardJson.traverseText
export const contains = standardJson.contains
export const containedBy = standardJson.containedBy

export const hasKey = ((...args: readonly [unknown] | readonly [unknown, unknown]) => {
  if (args.length === 1) {
    const [key] = args
    return (base: JsonExpression<any>) => standardJson.hasKey(base as never, key as never)
  }
  const [base, key] = args
  return standardJson.hasKey(base as never, key as never)
}) as {
  <Base extends JsonExpression<any>, Key extends JsonObjectKeyOf<Base>>(
    base: Base,
    key: Key
  ): JsonPredicateExpression<Base>
  <Key extends string>(
    key: Key
  ): <Base extends JsonExpression<any>>(
    base: Base & (Key extends JsonObjectKeyOf<Base> ? unknown : never)
  ) => JsonPredicateExpression<Base>
}

export const keyExists = hasKey

export const hasAnyKeys = ((base: JsonExpression<any>, ...keys: readonly string[]) =>
  standardJson.hasAnyKeys(base as never, ...(keys as [string, ...string[]]) as never)) as {
  <Base extends JsonExpression<any>, Keys extends readonly [JsonObjectKeyOf<Base>, ...JsonObjectKeyOf<Base>[]]>(
    base: Base,
    ...keys: Keys
  ): JsonPredicateExpression<Base>
}

export const hasAllKeys = ((base: JsonExpression<any>, ...keys: readonly string[]) =>
  standardJson.hasAllKeys(base as never, ...(keys as [string, ...string[]]) as never)) as {
  <Base extends JsonExpression<any>, Keys extends readonly [JsonObjectKeyOf<Base>, ...JsonObjectKeyOf<Base>[]]>(
    base: Base,
    ...keys: Keys
  ): JsonPredicateExpression<Base>
}

type RemovePipe = <Base extends JsonExpression<any> & JsonAccessExpression>(
  base: Base & JsonAccessDeleteGuard<Base, "json.remove">
) => JsonAccessDeleteResultExpression<Base, "json.remove">

type Remove = RemovePipe

export const remove = (((...args: readonly [unknown] | readonly [unknown, unknown]) => {
  if (args.length === 1) {
    const [first] = args
    if (isTarget(first)) {
      return (base: JsonExpression<any>) => standardJson.remove(base as never, normalizeTarget(first) as never)
    }
    const access = targetOrAccessPath(first)
    if (access === undefined) {
      throw new Error("Json.remove requires a piped JSON path or an explicit target")
    }
    return standardJson.remove(access.base as never, access.path as never)
  }
  const [base, target] = args
  return standardJson.remove(base as never, normalizeTarget(target as JsonPathInput) as never)
}) as unknown) as Remove

export const set = ((...args: readonly unknown[]) => {
  if (args.length === 1 || (args.length === 2 && !isExpression(args[0]))) {
    const [next, options] = args
    return (base: JsonExpression<any>) => {
      const access = accessPathOf(base)
      if (access === undefined) {
        throw new Error("Json.set requires a piped JSON path or an explicit target")
      }
      return standardJson.set(access.base as never, access.path as never, next as never, options as never)
    }
  }
  if ((args.length === 2 || args.length === 3) && isExpression(args[0]) && !isTarget(args[1])) {
    const [base, next, options] = args
    const access = accessPathOf(base)
    if (access === undefined) {
      throw new Error("Json.set requires a piped JSON path or an explicit target")
    }
    return standardJson.set(access.base as never, access.path as never, next as never, options as never)
  }
  const [base, target, next, options] = args
  return standardJson.set(base as never, normalizeTarget(target as JsonPathInput) as never, next as never, options as never)
}) as unknown as {
  <Next extends Parameters<typeof standardJson.set>[2], CreateMissing extends boolean = true>(
    next: Next,
    options?: {
      readonly createMissing?: CreateMissing
    }
  ): <Base extends JsonExpression<any> & JsonAccessExpression>(
    base: Base & JsonAccessSetGuard<Base, NoInfer<Next>, NoInfer<CreateMissing>>
  ) => JsonAccessSetResultExpression<Base, Next, CreateMissing>
  <Base extends JsonExpression<any> & JsonAccessExpression, Next extends Parameters<typeof standardJson.set>[2], CreateMissing extends boolean = true>(
    base: Base & JsonAccessSetGuard<Base, NoInfer<Next>, NoInfer<CreateMissing>>,
    next: Next,
    options?: {
      readonly createMissing?: CreateMissing
    }
  ): JsonAccessSetResultExpression<Base, Next, CreateMissing>
  <Base extends JsonExpression<any>, Target extends JsonPathInput, Next extends Parameters<typeof standardJson.set>[2], CreateMissing extends boolean = true>(
    base: Base,
    target: Target & ExactJsonPathGuard<Target, "json.set"> & JsonSetPathGuard<Expression.RuntimeOf<Base>, Target, NoInfer<Next>, "json.set">,
    next: Next,
    options?: {
      readonly createMissing?: CreateMissing
    }
  ): JsonResultExpression<
    JsonSetOutputWithCreateMissing<Expression.RuntimeOf<Base>, Target, Next, "json.set", CreateMissing>,
    JsonDbOf<Base>,
    JsonKindOf<Base>,
    Expression.DependenciesOf<Base>,
    never,
    DialectOf<Base>
  >
}

/** Describe a reusable location; replacement types are inferred from each input. */
export const focus = JsonPath.focus

/** Replace a focused value and return the whole, potentially reshaped document. */
export const replace = <
  Target extends JsonPath.NonEmptyFocus,
  Next extends Parameters<typeof standardJson.set>[2],
  CreateMissing extends boolean = true
>(
  target: Target,
  next: Next,
  options?: { readonly createMissing?: CreateMissing }
) => <Base extends JsonExpression<any>>(
  base: Base & JsonSetPathGuard<Expression.RuntimeOf<NoInfer<Base>>, Target, NoInfer<Next>, "json.set">
): JsonResultExpression<
  JsonSetOutputWithCreateMissing<Expression.RuntimeOf<Base>, Target, Next, "json.set", CreateMissing>,
  JsonDbOf<Base>, JsonKindOf<Base>, Expression.DependenciesOf<Base>, never, DialectOf<Base>
> => standardJson.set(base as never, normalizeTarget(target) as never, next as never, options as never) as never

export const insert = ((...args: readonly unknown[]) => {
  if (args.length === 1 || (args.length === 2 && !isExpression(args[0]))) {
    const [next, options] = args
    return (base: JsonExpression<any>) => {
      const access = accessPathOf(base)
      if (access === undefined) {
        throw new Error("Json.insert requires a piped JSON path or an explicit target")
      }
      return standardJson.insert(access.base as never, access.path as never, next as never, options as never)
    }
  }
  if ((args.length === 2 || args.length === 3) && isExpression(args[0]) && !isTarget(args[1])) {
    const [base, next, options] = args
    const access = accessPathOf(base)
    if (access === undefined) {
      throw new Error("Json.insert requires a piped JSON path or an explicit target")
    }
    return standardJson.insert(access.base as never, access.path as never, next as never, options as never)
  }
  const [base, target, next, options] = args
  return standardJson.insert(base as never, normalizeTarget(target as JsonPathInput) as never, next as never, options as never)
}) as unknown as {
  <Next extends Parameters<typeof standardJson.insert>[2], InsertAfter extends boolean = false>(
    next: Next,
    options?: {
      readonly insertAfter?: InsertAfter
    }
  ): <Base extends JsonExpression<any> & JsonAccessExpression>(
    base: Base & JsonAccessInsertGuard<Base, NoInfer<Next>, NoInfer<InsertAfter>>
  ) => JsonAccessInsertResultExpression<Base, Next, InsertAfter>
  <Base extends JsonExpression<any> & JsonAccessExpression, Next extends Parameters<typeof standardJson.insert>[2], InsertAfter extends boolean = false>(
    base: Base & JsonAccessInsertGuard<Base, NoInfer<Next>, NoInfer<InsertAfter>>,
    next: Next,
    options?: {
      readonly insertAfter?: InsertAfter
    }
  ): JsonAccessInsertResultExpression<Base, Next, InsertAfter>
  <Base extends JsonExpression<any>, Target extends JsonPathInput, Next extends Parameters<typeof standardJson.insert>[2], InsertAfter extends boolean = false>(
    base: Base,
    target: Target & ExactJsonPathGuard<Target, "json.insert"> & JsonInsertPathGuard<Expression.RuntimeOf<Base>, Target, NoInfer<Next>, NoInfer<InsertAfter>, "json.insert">,
    next: Next,
    options?: {
      readonly insertAfter?: InsertAfter
    }
  ): JsonResultExpression<
    JsonInsertOutputOf<Expression.RuntimeOf<Base>, Target, Next, InsertAfter, "json.insert">,
    JsonDbOf<Base>,
    JsonKindOf<Base>,
    Expression.DependenciesOf<Base>,
    never,
    DialectOf<Base>
  >
}

export const concat = standardJson.concat
export const merge = standardJson.merge
export const buildObject = standardJson.buildObject
export const buildArray = standardJson.buildArray
export const toJson = standardJson.toJson
export const toJsonb = standardJson.toJsonb
export const typeOf = standardJson.typeOf
export const length = standardJson.length
export const keys = standardJson.keys

export const pathExists = ((...args: readonly [unknown] | readonly [unknown, unknown]) => {
  if (args.length === 1) {
    const [first] = args
    if (isTarget(first) || typeof first === "string") {
      return (base: JsonExpression<any>) =>
        standardJson.pathExists(base as never, isTarget(first) ? normalizeTargetPath(first) as never : first as never)
    }
    const access = targetOrAccessPath(first)
    if (access === undefined) {
      throw new Error("Json.pathExists requires a piped JSON path or an explicit query")
    }
    return standardJson.pathExists(access.base as never, access.path as never)
  }
  const [base, query] = args
  return standardJson.pathExists(base as never, isTarget(query) ? normalizeTargetPath(query) as never : query as never)
}) as unknown as {
  <Base extends JsonExpression<any>, Query extends JsonPathExistsQuery>(
    base: Base,
    query: JsonPathExistsQueryInput<Query>
  ): JsonPredicateExpression<Base>
  <Query extends JsonPathExistsQuery>(
    query: JsonPathExistsQueryInput<Query>
  ): <Base extends JsonExpression<any>>(base: Base) => JsonPredicateExpression<Base>
  <Base extends JsonExpression<any>>(base: Base): JsonPredicateExpression<Base>
}
