import * as Expression from "../../internal/scalar.js"
import type { JsonPathUsageError } from "../../internal/json/errors.js"
import * as JsonPath from "../../internal/json/path.js"
import type {
  JsonDeleteAtPath,
  JsonInsertAtPath,
  JsonSetAtPath,
  JsonValueAtPath
} from "../../internal/json/types.js"
import { postgresQuery } from "../private/query.js"

type PostgresJsonExpression<Runtime = unknown> = Expression.Scalar<
  Runtime,
  Expression.DbType.Json<"postgres", "json" | "jsonb">,
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

type ExactJsonPathInput = JsonPath.ExactSegment | JsonPath.Path<any>

type ExactJsonPathUsageError<Target> = {
  readonly __effect_qb_error__: "effect-qb: postgres json helpers only accept exact key/index paths"
  readonly __effect_qb_json_path__: Target
  readonly __effect_qb_hint__: "Use Postgres.Function.jsonb.path(...) when you need wildcard(), slice(), or descend() segments"
}

type ExactJsonPathGuard<Target> = Target extends JsonPath.Path<any>
  ? JsonPath.IsExactPath<Target> extends true ? unknown : ExactJsonPathUsageError<Target>
  : Target extends JsonPath.ExactSegment
    ? unknown
    : ExactJsonPathUsageError<Target>

type ExactJsonPathSegmentsGuard<Segments extends readonly JsonPath.CanonicalSegment[]> =
  JsonPath.IsExactPath<JsonPath.Path<Segments>> extends true ? unknown : ExactJsonPathUsageError<JsonPath.Path<Segments>>

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
  readonly __effect_qb_hint__: "Use Column.jsonb(...), Cast.to(..., Type.jsonb()), or Postgres.Function.jsonb.toJsonb(...)"
}

type JsonbBaseGuard<
  Base extends PostgresJsonExpression<any>,
  Operation extends string
> = Expression.DbTypeOf<Base> extends Expression.DbType.Json<"postgres", "jsonb">
  ? unknown
  : JsonbOnlyUsageError<Operation, Base>

type JsonNullabilityOf<Output> =
  null extends Output
    ? Exclude<Output, null> extends never ? "always" : "maybe"
    : "never"

type JsonResultExpression<
  Runtime,
  Db extends Expression.DbType.Json<any, any>
> = Expression.Scalar<
  Runtime,
  Db,
  JsonNullabilityOf<Runtime>,
  string,
  Expression.ScalarKind,
  Expression.BindingId
>

type JsonDbOf<Base extends PostgresJsonExpression<any>> =
  Expression.DbTypeOf<Base> extends Expression.DbType.Json<"postgres", infer Variant>
    ? Expression.DbType.Json<"postgres", Variant>
    : Expression.DbType.Json<"postgres", "json">

type JsonGetResultExpression<
  Base extends PostgresJsonExpression<any>,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment,
  Operation extends string
> = JsonResultExpression<
  JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, Operation>,
  JsonDbOf<Base>
>

type JsonTextRuntime<
  Base extends PostgresJsonExpression<any>,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment
> =
  Extract<JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.text">, string> |
  (null extends JsonPathOutputOf<Expression.RuntimeOf<Base>, Target, "json.text"> ? null : never)

type JsonTextResultExpression<
  Base extends PostgresJsonExpression<any>,
  Target extends JsonPath.Path<any> | JsonPath.CanonicalSegment
> = Expression.Scalar<
  JsonTextRuntime<Base, Target>,
  Expression.DbType.PgText,
  JsonNullabilityOf<JsonTextRuntime<Base, Target>>,
  string,
  Expression.ScalarKind,
  Expression.BindingId
>

const exactPath = <Segments extends readonly JsonPath.CanonicalSegment[]>(
  ...segments: Segments & ExactJsonPathSegmentsGuard<Segments>
): JsonPath.Path<Segments> => JsonPath.path(...segments) as unknown as JsonPath.Path<Segments>

const jsonGetDirect = <
  Base extends PostgresJsonExpression<any>,
  Target extends ExactJsonPathInput
>(
  base: Base,
  target: Target & ExactJsonPathGuard<Target>
): JsonGetResultExpression<Base, Target, "json.get"> =>
  postgresQuery.json.get(base as never, target as never) as unknown as JsonGetResultExpression<Base, Target, "json.get">

const jsonTextDirect = <
  Base extends PostgresJsonExpression<any>,
  Target extends ExactJsonPathInput
>(
  base: Base,
  target: Target & ExactJsonPathGuard<Target>
): JsonTextResultExpression<Base, Target> =>
  postgresQuery.json.text(base as never, target as never) as unknown as JsonTextResultExpression<Base, Target>

const json = {
  key: postgresQuery.json.key,
  index: postgresQuery.json.index,
  path: exactPath,
  get: ((...args: [PostgresJsonExpression<any>, ExactJsonPathInput] | [ExactJsonPathInput]) =>
    args.length === 1
      ? ((base: PostgresJsonExpression<any>) => jsonGetDirect(base as never, args[0] as never))
      : jsonGetDirect(args[0] as never, args[1] as never)) as unknown as
    typeof jsonGetDirect & {
      <Target extends ExactJsonPathInput>(
        target: Target & ExactJsonPathGuard<Target>
      ): <Base extends PostgresJsonExpression<any>>(base: Base) => ReturnType<typeof jsonGetDirect>
    },
  access: <
    Base extends PostgresJsonExpression<any>,
    Target extends ExactJsonPathInput
  >(
    base: Base,
    target: Target & ExactJsonPathGuard<Target> & JsonValuePathGuard<Expression.RuntimeOf<Base>, Target, "json.access">
  ) => postgresQuery.json.access(base, target),
  traverse: <
    Base extends PostgresJsonExpression<any>,
    Target extends ExactJsonPathInput
  >(
    base: Base,
    target: Target & ExactJsonPathGuard<Target> & JsonValuePathGuard<Expression.RuntimeOf<Base>, Target, "json.traverse">
  ) => postgresQuery.json.traverse(base, target),
  text: ((...args: [PostgresJsonExpression<any>, ExactJsonPathInput] | [ExactJsonPathInput]) =>
    args.length === 1
      ? ((base: PostgresJsonExpression<any>) => jsonTextDirect(base as never, args[0] as never))
      : jsonTextDirect(args[0] as never, args[1] as never)) as unknown as
    typeof jsonTextDirect & {
      <Target extends ExactJsonPathInput>(
        target: Target & ExactJsonPathGuard<Target>
      ): <Base extends PostgresJsonExpression<any>>(base: Base) => ReturnType<typeof jsonTextDirect>
    },
  accessText: <
    Base extends PostgresJsonExpression<any>,
    Target extends ExactJsonPathInput
  >(
    base: Base,
    target: Target & ExactJsonPathGuard<Target> & JsonValuePathGuard<Expression.RuntimeOf<Base>, Target, "json.accessText">
  ) => postgresQuery.json.accessText(base, target),
  traverseText: <
    Base extends PostgresJsonExpression<any>,
    Target extends ExactJsonPathInput
  >(
    base: Base,
    target: Target & ExactJsonPathGuard<Target> & JsonValuePathGuard<Expression.RuntimeOf<Base>, Target, "json.traverseText">
  ) => postgresQuery.json.traverseText(base, target),
  buildObject: postgresQuery.json.buildObject,
  buildArray: postgresQuery.json.buildArray,
  toJson: postgresQuery.json.toJson,
  typeOf: postgresQuery.json.typeOf,
  length: postgresQuery.json.length,
  keys: postgresQuery.json.keys,
  stripNulls: postgresQuery.json.stripNulls,
  delete: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base,
    target: Target & JsonDeletePathGuard<Expression.RuntimeOf<Base>, Target, "json.delete">
  ): JsonResultExpression<
    JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.delete">,
    Expression.DbTypeOf<Base>
  > => postgresQuery.json.delete(base as any, target as any) as unknown as JsonResultExpression<
    JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.delete">,
    Expression.DbTypeOf<Base>
  >,
  remove: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base,
    target: Target & JsonDeletePathGuard<Expression.RuntimeOf<Base>, Target, "json.remove">
  ): JsonResultExpression<
    JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.remove">,
    Expression.DbTypeOf<Base>
  > => postgresQuery.json.remove(base as any, target as any) as unknown as JsonResultExpression<
    JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.remove">,
    Expression.DbTypeOf<Base>
  >
}

const jsonb = {
  key: postgresQuery.jsonb.key,
  index: postgresQuery.jsonb.index,
  wildcard: postgresQuery.jsonb.wildcard,
  slice: postgresQuery.jsonb.slice,
  descend: postgresQuery.jsonb.descend,
  path: postgresQuery.jsonb.path,
  get: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.get">,
    target: Target & JsonValuePathGuard<Expression.RuntimeOf<Base>, Target, "json.get">
  ) => postgresQuery.jsonb.get(base as Base, target),
  access: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.access">,
    target: Target & JsonValuePathGuard<Expression.RuntimeOf<Base>, Target, "json.access">
  ) => postgresQuery.jsonb.access(base as Base, target),
  traverse: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.traverse">,
    target: Target & JsonValuePathGuard<Expression.RuntimeOf<Base>, Target, "json.traverse">
  ) => postgresQuery.jsonb.traverse(base as Base, target),
  text: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.text">,
    target: Target & JsonValuePathGuard<Expression.RuntimeOf<Base>, Target, "json.text">
  ) => postgresQuery.jsonb.text(base as Base, target),
  accessText: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.accessText">,
    target: Target & JsonValuePathGuard<Expression.RuntimeOf<Base>, Target, "json.accessText">
  ) => postgresQuery.jsonb.accessText(base as Base, target),
  traverseText: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.traverseText">,
    target: Target & JsonValuePathGuard<Expression.RuntimeOf<Base>, Target, "json.traverseText">
  ) => postgresQuery.jsonb.traverseText(base as Base, target),
  contains: <
    Left extends PostgresJsonExpression<any>,
    Right extends Parameters<typeof postgresQuery.jsonb.contains>[1]
  >(
    left: Left & JsonbBaseGuard<Left, "jsonb.contains">,
    right: Right
  ) => postgresQuery.jsonb.contains(left as Left, right),
  containedBy: <
    Left extends PostgresJsonExpression<any>,
    Right extends Parameters<typeof postgresQuery.jsonb.containedBy>[1]
  >(
    left: Left & JsonbBaseGuard<Left, "jsonb.containedBy">,
    right: Right
  ) => postgresQuery.jsonb.containedBy(left as Left, right),
  hasKey: <
    Base extends PostgresJsonExpression<any>,
    Key extends string
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.hasKey">,
    key: Key
  ) => postgresQuery.jsonb.hasKey(base as Base, key),
  keyExists: <
    Base extends PostgresJsonExpression<any>,
    Key extends string
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.keyExists">,
    key: Key
  ) => postgresQuery.jsonb.keyExists(base as Base, key),
  hasAnyKeys: <
    Base extends PostgresJsonExpression<any>,
    Keys extends readonly [string, ...string[]]
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.hasAnyKeys">,
    ...keys: Keys
  ) => postgresQuery.jsonb.hasAnyKeys(base as Base, ...keys),
  hasAllKeys: <
    Base extends PostgresJsonExpression<any>,
    Keys extends readonly [string, ...string[]]
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.hasAllKeys">,
    ...keys: Keys
  ) => postgresQuery.jsonb.hasAllKeys(base as Base, ...keys),
  delete: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.delete">,
    target: Target & JsonDeletePathGuard<Expression.RuntimeOf<Base>, Target, "json.delete">
  ): JsonResultExpression<
    JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.delete">,
    Expression.DbTypeOf<Base>
  > => postgresQuery.jsonb.delete(base as any, target as any) as unknown as JsonResultExpression<
    JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.delete">,
    Expression.DbTypeOf<Base>
  >,
  remove: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.remove">,
    target: Target & JsonDeletePathGuard<Expression.RuntimeOf<Base>, Target, "json.remove">
  ): JsonResultExpression<
    JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.remove">,
    Expression.DbTypeOf<Base>
  > => postgresQuery.jsonb.remove(base as any, target as any) as unknown as JsonResultExpression<
    JsonDeleteOutputOf<Expression.RuntimeOf<Base>, Target, "json.remove">,
    Expression.DbTypeOf<Base>
  >,
  set: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>,
    Next extends Parameters<typeof postgresQuery.jsonb.set>[2]
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.set">,
    target: Target & JsonSetPathGuard<Expression.RuntimeOf<Base>, Target, Next, "json.set">,
    next: Next,
    options?: Parameters<typeof postgresQuery.jsonb.set>[3]
  ): JsonResultExpression<
    JsonSetOutputOf<Expression.RuntimeOf<Base>, Target, Next, "json.set">,
    Expression.DbTypeOf<Base>
  > => postgresQuery.jsonb.set(base as any, target as any, next, options) as unknown as JsonResultExpression<
    JsonSetOutputOf<Expression.RuntimeOf<Base>, Target, Next, "json.set">,
    Expression.DbTypeOf<Base>
  >,
  insert: <
    Base extends PostgresJsonExpression<any>,
    Target extends JsonPath.CanonicalSegment | JsonPath.Path<any>,
    Next extends Parameters<typeof postgresQuery.jsonb.insert>[2],
    InsertAfter extends boolean = false
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.insert">,
    target: Target & JsonInsertPathGuard<Expression.RuntimeOf<Base>, Target, Next, InsertAfter, "json.insert">,
    next: Next,
    options?: {
      readonly insertAfter?: InsertAfter
    }
  ): JsonResultExpression<
    JsonInsertOutputOf<Expression.RuntimeOf<Base>, Target, Next, InsertAfter, "json.insert">,
    Expression.DbTypeOf<Base>
  > => postgresQuery.jsonb.insert(base as any, target as any, next, options) as unknown as JsonResultExpression<
    JsonInsertOutputOf<Expression.RuntimeOf<Base>, Target, Next, InsertAfter, "json.insert">,
    Expression.DbTypeOf<Base>
  >,
  concat: postgresQuery.jsonb.concat,
  merge: postgresQuery.jsonb.merge,
  buildObject: postgresQuery.jsonb.buildObject,
  buildArray: postgresQuery.jsonb.buildArray,
  toJsonb: postgresQuery.jsonb.toJsonb,
  typeOf: <
    Base extends PostgresJsonExpression<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.typeOf">
  ) => postgresQuery.jsonb.typeOf(base as Base),
  length: <
    Base extends PostgresJsonExpression<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.length">
  ) => postgresQuery.jsonb.length(base as Base),
  keys: <
    Base extends PostgresJsonExpression<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.keys">
  ) => postgresQuery.jsonb.keys(base as Base),
  stripNulls: <
    Base extends PostgresJsonExpression<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.stripNulls">
  ) => postgresQuery.jsonb.stripNulls(base as Base),
  pathExists: <
    Base extends PostgresJsonExpression<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.pathExists">,
    query: Parameters<typeof postgresQuery.jsonb.pathExists>[1]
  ) => postgresQuery.jsonb.pathExists(base as Base, query),
  pathMatch: <
    Base extends PostgresJsonExpression<any>
  >(
    base: Base & JsonbBaseGuard<Base, "jsonb.pathMatch">,
    query: Parameters<typeof postgresQuery.jsonb.pathMatch>[1]
  ) => postgresQuery.jsonb.pathMatch(base as Base, query)
}

/** Postgres shared JSON helpers for exact paths and functions that work on both json and jsonb. */
export { json }
/** Postgres jsonb-only helpers for containment, mutation, wildcard paths, and SQL/JSON path predicates. */
export { jsonb }
