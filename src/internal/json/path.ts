import type * as Expression from "../../expression.ts"
import type { JsonPathUsageError } from "./errors.ts"
import type {
  JsonBuildArray as JsonBuildArrayResult,
  JsonBuildObject as JsonBuildObjectResult,
  JsonConcatResult,
  JsonDeleteAtPath,
  JsonInsertAtPath,
  JsonLiteralInput,
  JsonStripNullsResult as JsonStripNullsResultValue,
  JsonValueAtPath,
  JsonSetAtPath
} from "./types.ts"
import type { JsonKeysResult as JsonKeysResultValue, JsonLengthResult as JsonLengthResultValue, JsonTextResult as JsonTextResultValue, JsonTypeName as JsonTypeNameValue } from "./types.ts"

export const SegmentTypeId: unique symbol = Symbol.for("effect-qb/JsonPathSegment")

export type SegmentTypeId = typeof SegmentTypeId

export const TypeId: unique symbol = Symbol.for("effect-qb/JsonPath")

export type TypeId = typeof TypeId

type SegmentState<Kind extends string> = {
  readonly kind: Kind
}

export interface KeySegment<Key extends string = string> {
  readonly [SegmentTypeId]: SegmentState<"key">
  readonly kind: "key"
  readonly key: Key
}

export interface IndexSegment<Index extends number = number> {
  readonly [SegmentTypeId]: SegmentState<"index">
  readonly kind: "index"
  readonly index: Index
}

export interface WildcardSegment {
  readonly [SegmentTypeId]: SegmentState<"wildcard">
  readonly kind: "wildcard"
}

export interface SliceSegment<
  Start extends number | undefined = number | undefined,
  End extends number | undefined = number | undefined
> {
  readonly [SegmentTypeId]: SegmentState<"slice">
  readonly kind: "slice"
  readonly start: Start
  readonly end: End
}

export interface DescendSegment {
  readonly [SegmentTypeId]: SegmentState<"descend">
  readonly kind: "descend"
}

export type CanonicalSegment =
  | KeySegment
  | IndexSegment
  | WildcardSegment
  | SliceSegment
  | DescendSegment

export type AnySegment = any

export type ExactSegment = KeySegment | IndexSegment

type PathState<Segments extends readonly CanonicalSegment[]> = {
  readonly segments: Segments
}

export interface Path<Segments extends readonly CanonicalSegment[] = readonly CanonicalSegment[]> {
  readonly [TypeId]: PathState<Segments>
  readonly segments: Segments
}

export type JsonPath<Segments extends readonly CanonicalSegment[] = readonly CanonicalSegment[]> = Path<Segments>

export type JsonPathSegments = readonly CanonicalSegment[]

export type JsonPrimitive = JsonLiteralInput

export type JsonLiteral = JsonLiteralInput

export type JsonInput = Expression.Any | JsonLiteral

const makeSegment = <Segment extends CanonicalSegment>(segment: Segment): Segment => segment

export const key = <Key extends string>(value: Key): KeySegment<Key> =>
  makeSegment({
    [SegmentTypeId]: {
      kind: "key"
    },
    kind: "key",
    key: value
  } as KeySegment<Key>)

export const index = <Index extends number>(value: Index): IndexSegment<Index> =>
  makeSegment({
    [SegmentTypeId]: {
      kind: "index"
    },
    kind: "index",
    index: value
  } as IndexSegment<Index>)

export const wildcard = (): WildcardSegment =>
  makeSegment({
    [SegmentTypeId]: {
      kind: "wildcard"
    },
    kind: "wildcard"
  })

export const slice = <
  Start extends number | undefined = undefined,
  End extends number | undefined = undefined
>(
  start?: Start,
  end?: End
): SliceSegment<Start, End> =>
  makeSegment({
    [SegmentTypeId]: {
      kind: "slice"
    },
    kind: "slice",
    start: start as Start,
    end: end as End
  } as SliceSegment<Start, End>)

export const descend = (): DescendSegment =>
  makeSegment({
    [SegmentTypeId]: {
      kind: "descend"
    },
    kind: "descend"
  })

export const path = <Segments extends readonly CanonicalSegment[]>(
  ...segments: Segments
): Path<Segments> => ({
  [TypeId]: {
    segments
  },
  segments
})

export const makeJsonPath = path

export type SegmentsOf<Value extends Path<any>> = Value[typeof TypeId]["segments"]

export type IsExactSegment<Segment extends CanonicalSegment> = Segment extends ExactSegment ? true : false

export type IsExactPath<PathValue extends Path<any>> =
  SegmentsOf<PathValue> extends readonly [infer Head extends CanonicalSegment, ...infer Tail extends readonly CanonicalSegment[]]
    ? IsExactSegment<Head> extends true
      ? Tail extends readonly []
        ? true
        : IsExactPath<Path<Tail>>
      : false
    : true

export type JsonPathValue<
  Root,
  PathValue extends Path<any>,
  Operation extends string = "json.get"
> = JsonValueAtPath<Root, PathValue, Operation>

export type JsonPathOutput<
  Root,
  PathValue extends Path<any>,
  Operation extends string = "json.get"
> = JsonValueAtPath<Root, PathValue, Operation>

export type JsonPathCompatible<
  Root,
  PathValue extends Path<any>,
  Operation extends string = "json.get"
> = JsonValueAtPath<Root, PathValue, Operation> extends JsonPathUsageError<any, any, any, any>
  ? JsonValueAtPath<Root, PathValue, Operation>
  : PathValue

export type JsonPathUpdate<
  Root,
  PathValue extends Path<any>,
  Next,
  Operation extends string = "json.set"
> = JsonSetAtPath<Root, PathValue, Next, Operation>

export type JsonPathDelete<
  Root,
  PathValue extends Path<any>,
  Operation extends string = "json.delete"
> = JsonDeleteAtPath<Root, PathValue, Operation>

export type JsonConcat<
  Left,
  Right
> = JsonConcatResult<Left, Right>

export type JsonBuildObject<
  Shape extends Record<string, JsonInput>
> = JsonBuildObjectResult<Shape>

export type JsonBuildArray<
  Values extends readonly JsonInput[]
> = JsonBuildArrayResult<Values>

export type JsonTextResult<Value> = JsonTextResultValue<Value>

export type JsonTypeName<Value> = JsonTypeNameValue<Value>

export type JsonLengthResult<Value> = JsonLengthResultValue<Value>

export type JsonKeysResult<Value> = JsonKeysResultValue<Value>

export type JsonStripNullsResult<Value> = JsonStripNullsResultValue<Value>

export type JsonValueOfInput<Input> =
  Input extends Expression.Any
    ? Expression.RuntimeOf<Input>
    : Input extends JsonLiteral
      ? Input
      : never
