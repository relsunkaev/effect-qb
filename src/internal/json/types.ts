import type * as JsonPath from "./path.ts"
import type { JsonPathUsageError } from "./errors.ts"

export type JsonPrimitive = string | number | boolean | null

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

type OptionalKeyOf<ObjectType extends object, Key extends PropertyKey> =
  Key extends keyof ObjectType
    ? {} extends Pick<ObjectType, Key> ? true : false
    : true

type NormalizeJsonTuple<Values extends readonly unknown[]> =
  Values extends readonly []
    ? readonly []
    : Values extends readonly [infer Head, ...infer Tail]
      ? readonly [NormalizeJsonLiteral<Head>, ...NormalizeJsonTuple<Tail>]
      : readonly NormalizeJsonLiteral<Values[number]>[]

type NormalizeJsonObject<ObjectType extends object> = {
  readonly [Key in keyof ObjectType as Key extends string ? Key : never]:
    NormalizeJsonLiteral<Exclude<ObjectType[Key], undefined>>
}

export type NormalizeJsonLiteral<Value> =
  [Value] extends [never] ? never :
    Value extends JsonPrimitive ? Value :
      Value extends undefined | bigint | symbol | Date | ((...args: readonly any[]) => any) ? never :
        Value extends readonly unknown[] ? NormalizeJsonTuple<Value> :
          Value extends object ? NormalizeJsonObject<Value> :
            never

export type JsonLiteralInput = JsonPrimitive | readonly JsonLiteralInput[] | {
  readonly [key: string]: JsonLiteralInput
}

type StripNull<Value> = Exclude<Value, null>

type KeyStep<
  Root,
  Key extends string,
  Operation extends string
> = Root extends readonly unknown[]
  ? JsonPathUsageError<Operation, Root, JsonPath.KeySegment<Key>, "key segments cannot be applied to arrays">
  : Root extends object
    ? Key extends keyof Root
      ? NormalizeJsonLiteral<Exclude<Root[Key], undefined>> | (OptionalKeyOf<Root, Key> extends true ? null : never)
      : Root extends Record<string, infer Value>
        ? NormalizeJsonLiteral<Value> | null
        : null
    : JsonPathUsageError<Operation, Root, JsonPath.KeySegment<Key>, "key segments require an object-like json value">

type TupleIndex<
  Values extends readonly unknown[],
  Index extends number,
  Count extends readonly unknown[] = []
> = Values extends readonly [infer Head, ...infer Tail]
  ? Count["length"] extends Index
    ? Head
    : TupleIndex<Tail, Index, [...Count, unknown]>
  : never

type DropTupleIndex<
  Values extends readonly unknown[],
  Index extends number,
  Count extends readonly unknown[] = []
> = Values extends readonly [infer Head, ...infer Tail]
  ? Count["length"] extends Index
    ? readonly [...Tail]
    : readonly [Head, ...DropTupleIndex<Tail, Index, [...Count, unknown]>]
  : readonly []

type SetTupleIndex<
  Values extends readonly unknown[],
  Index extends number,
  Next,
  Count extends readonly unknown[] = []
> = Values extends readonly [infer Head, ...infer Tail]
  ? Count["length"] extends Index
    ? readonly [Next, ...Tail]
    : readonly [Head, ...SetTupleIndex<Tail, Index, Next, [...Count, unknown]>]
  : readonly NormalizeJsonLiteral<Next>[]

type InsertTupleIndex<
  Values extends readonly unknown[],
  Index extends number,
  Next,
  After extends boolean,
  Count extends readonly unknown[] = []
> = Values extends readonly [infer Head, ...infer Tail]
  ? Count["length"] extends Index
    ? After extends true
      ? readonly [Head, NormalizeJsonLiteral<Next>, ...Tail]
      : readonly [NormalizeJsonLiteral<Next>, Head, ...Tail]
    : readonly [Head, ...InsertTupleIndex<Tail, Index, Next, After, [...Count, unknown]>]
  : readonly NormalizeJsonLiteral<Next>[]

type IndexStep<
  Root,
  Index extends number,
  Operation extends string
> = Root extends readonly unknown[]
  ? number extends Root["length"]
    ? NormalizeJsonLiteral<Root[number]> | null
    : NormalizeJsonLiteral<TupleIndex<Root, Index>> | (TupleIndex<Root, Index> extends never ? null : never)
  : JsonPathUsageError<Operation, Root, JsonPath.IndexSegment<Index>, "index segments require an array-like json value">

type NonExactStep<
  Root,
  Segment extends JsonPath.CanonicalSegment
> = Segment extends JsonPath.WildcardSegment
  ? NormalizeJsonLiteral<Root> | null
  : Segment extends JsonPath.SliceSegment<any, any>
    ? NormalizeJsonLiteral<Root> | null
    : Segment extends JsonPath.DescendSegment
      ? NormalizeJsonLiteral<Root> | null
      : never

type StepValue<
  Root,
  Segment extends JsonPath.CanonicalSegment,
  Operation extends string
> = Segment extends JsonPath.KeySegment<infer Key extends string>
  ? KeyStep<Root, Key, Operation>
  : Segment extends JsonPath.IndexSegment<infer Index extends number>
    ? IndexStep<Root, Index, Operation>
    : NonExactStep<Root, Segment>

type StepSet<
  Root,
  Segment extends JsonPath.CanonicalSegment,
  Next,
  Operation extends string
> = Segment extends JsonPath.KeySegment<infer Key extends string>
  ? Root extends readonly unknown[]
    ? JsonPathUsageError<Operation, Root, Segment, "key segments cannot update arrays">
    : Root extends object
      ? Omit<Root, Key> & {
          readonly [K in Key]: NormalizeJsonLiteral<Next>
        }
      : JsonPathUsageError<Operation, Root, Segment, "key segments require an object-like json value">
  : Segment extends JsonPath.IndexSegment<infer Index extends number>
    ? Root extends readonly unknown[]
      ? number extends Root["length"]
        ? readonly (NormalizeJsonLiteral<Root[number]> | NormalizeJsonLiteral<Next>)[]
        : SetTupleIndex<Root, Index, Next>
      : JsonPathUsageError<Operation, Root, Segment, "index segments require an array-like json value">
    : NormalizeJsonLiteral<Root>

type StepDelete<
  Root,
  Segment extends JsonPath.CanonicalSegment,
  Operation extends string
> = Segment extends JsonPath.KeySegment<infer Key extends string>
  ? Root extends readonly unknown[]
    ? JsonPathUsageError<Operation, Root, Segment, "key segments cannot delete from arrays">
    : Root extends object
      ? Omit<Root, Key>
      : JsonPathUsageError<Operation, Root, Segment, "key segments require an object-like json value">
  : Segment extends JsonPath.IndexSegment<infer Index extends number>
    ? Root extends readonly unknown[]
      ? number extends Root["length"]
        ? Root
        : DropTupleIndex<Root, Index>
      : JsonPathUsageError<Operation, Root, Segment, "index segments require an array-like json value">
    : NormalizeJsonLiteral<Root>

type StepInsert<
  Root,
  Segment extends JsonPath.CanonicalSegment,
  Next,
  After extends boolean,
  Operation extends string
> = Segment extends JsonPath.IndexSegment<infer Index extends number>
  ? Root extends readonly unknown[]
    ? number extends Root["length"]
      ? readonly (NormalizeJsonLiteral<Root[number]> | NormalizeJsonLiteral<Next>)[]
      : InsertTupleIndex<Root, Index, Next, After>
    : JsonPathUsageError<Operation, Root, Segment, "index segments require an array-like json value">
  : Segment extends JsonPath.KeySegment<infer Key extends string>
    ? Root extends readonly unknown[]
      ? JsonPathUsageError<Operation, Root, Segment, "key segments cannot insert into arrays">
      : Root extends object
        ? Key extends keyof Root
          ? Root
          : Root & {
              readonly [K in Key]: NormalizeJsonLiteral<Next>
            }
        : JsonPathUsageError<Operation, Root, Segment, "key segments require an object-like json value">
    : NormalizeJsonLiteral<Root>

type RecurseValue<
  Current,
  Segments extends readonly JsonPath.CanonicalSegment[],
  Operation extends string
> = Segments extends readonly [infer Head extends JsonPath.CanonicalSegment, ...infer Tail extends readonly JsonPath.CanonicalSegment[]]
  ? StepValue<Current, Head, Operation> extends infer Next
    ? Next extends JsonPathUsageError<any, any, any, any>
      ? Next
      : Tail extends readonly []
        ? Next
        : null extends Next
          ? RecurseValue<StripNull<Next>, Tail, Operation> | null
          : RecurseValue<Next, Tail, Operation>
    : never
  : NormalizeJsonLiteral<Current>

type RecurseSet<
  Current,
  Segments extends readonly JsonPath.CanonicalSegment[],
  Next,
  Operation extends string
> = Segments extends readonly [infer Head extends JsonPath.CanonicalSegment, ...infer Tail extends readonly JsonPath.CanonicalSegment[]]
  ? Tail extends readonly []
    ? StepSet<Current, Head, Next, Operation>
    : StepValue<Current, Head, Operation> extends infer Child
      ? Child extends JsonPathUsageError<any, any, any, any>
        ? Child
        : StepSet<
            Current,
            Head,
            RecurseSet<StripNull<Child>, Tail, Next, Operation>,
            Operation
          >
      : never
  : NormalizeJsonLiteral<Next>

type RecurseDelete<
  Current,
  Segments extends readonly JsonPath.CanonicalSegment[],
  Operation extends string
> = Segments extends readonly [infer Head extends JsonPath.CanonicalSegment, ...infer Tail extends readonly JsonPath.CanonicalSegment[]]
  ? Tail extends readonly []
    ? StepDelete<Current, Head, Operation>
    : StepValue<Current, Head, Operation> extends infer Child
      ? Child extends JsonPathUsageError<any, any, any, any>
        ? Child
        : StepSet<
            Current,
            Head,
            RecurseDelete<StripNull<Child>, Tail, Operation>,
            Operation
          >
      : never
  : NormalizeJsonLiteral<Current>

type RecurseInsert<
  Current,
  Segments extends readonly JsonPath.CanonicalSegment[],
  Next,
  After extends boolean,
  Operation extends string
> = Segments extends readonly [infer Head extends JsonPath.CanonicalSegment, ...infer Tail extends readonly JsonPath.CanonicalSegment[]]
  ? Tail extends readonly []
    ? StepInsert<Current, Head, Next, After, Operation>
    : StepValue<Current, Head, Operation> extends infer Child
      ? Child extends JsonPathUsageError<any, any, any, any>
        ? Child
        : StepSet<
            Current,
            Head,
            RecurseInsert<StripNull<Child>, Tail, Next, After, Operation>,
            Operation
          >
      : never
  : NormalizeJsonLiteral<Current>

export type JsonValueAtPath<
  Root,
  PathValue extends JsonPath.Path<any>,
  Operation extends string = "json.get"
> = RecurseValue<NormalizeJsonLiteral<Root>, JsonPath.SegmentsOf<PathValue>, Operation>

export type JsonSetAtPath<
  Root,
  PathValue extends JsonPath.Path<any>,
  Next,
  Operation extends string = "json.set"
> = RecurseSet<NormalizeJsonLiteral<Root>, JsonPath.SegmentsOf<PathValue>, Next, Operation>

export type JsonInsertAtPath<
  Root,
  PathValue extends JsonPath.Path<any>,
  Next,
  After extends boolean = false,
  Operation extends string = "json.insert"
> = RecurseInsert<NormalizeJsonLiteral<Root>, JsonPath.SegmentsOf<PathValue>, Next, After, Operation>

export type JsonDeleteAtPath<
  Root,
  PathValue extends JsonPath.Path<any>,
  Operation extends string = "json.delete"
> = RecurseDelete<NormalizeJsonLiteral<Root>, JsonPath.SegmentsOf<PathValue>, Operation>

type ArrayElement<Value> = Value extends readonly (infer Element)[] ? Element : never

type MergeJsonObjects<
  Left extends object,
  Right extends object
> = Omit<Left, keyof Right> & Right

type StripNullsTuple<Values extends readonly unknown[]> =
  Values extends readonly []
    ? readonly []
    : Values extends readonly [infer Head, ...infer Tail]
      ? readonly [JsonStripNullsResult<Head>, ...StripNullsTuple<Tail>]
      : readonly JsonStripNullsResult<Values[number]>[]

type StripNullsObject<ObjectType extends object> = (
  {
    readonly [Key in keyof ObjectType as Key extends string
      ? null extends NormalizeJsonLiteral<Exclude<ObjectType[Key], undefined>>
        ? never
        : Key
      : never]-?: JsonStripNullsResult<Exclude<ObjectType[Key], null>>
  } & {
    readonly [Key in keyof ObjectType as Key extends string
      ? null extends NormalizeJsonLiteral<Exclude<ObjectType[Key], undefined>>
        ? Key
        : never
      : never]?: JsonStripNullsResult<Exclude<ObjectType[Key], null>>
  }
)

export type JsonStripNullsResult<Value> =
  Value extends null ? null :
    Value extends readonly unknown[] ? StripNullsTuple<Value> :
      Value extends object ? StripNullsObject<Value> :
        Value

export type JsonConcatResult<
  Left,
  Right
> = NormalizeJsonLiteral<Left> extends infer NormalizedLeft
  ? NormalizeJsonLiteral<Right> extends infer NormalizedRight
    ? NormalizedLeft extends readonly unknown[]
      ? NormalizedRight extends readonly unknown[]
        ? number extends NormalizedLeft["length"] | NormalizedRight["length"]
          ? readonly (ArrayElement<NormalizedLeft> | ArrayElement<NormalizedRight>)[]
          : readonly [...NormalizedLeft, ...NormalizedRight]
        : unknown
      : NormalizedLeft extends object
        ? NormalizedRight extends object
          ? MergeJsonObjects<NormalizedLeft, NormalizedRight>
          : unknown
        : unknown
    : never
    : never

export type JsonBuildObject<
  Shape extends Record<string, unknown>
> = {
  readonly [K in keyof Shape]: NormalizeJsonLiteral<Shape[K]>
}

export type JsonBuildArray<
  Values extends readonly unknown[]
> = {
  readonly [K in keyof Values]: NormalizeJsonLiteral<Values[K]>
} & readonly unknown[]

export type JsonTextResult<Value> = Value extends JsonPrimitive ? `${Value}` : string

export type JsonTypeName<Value> =
  NormalizeJsonLiteral<Value> extends null ? "null"
    : NormalizeJsonLiteral<Value> extends string ? "string"
      : NormalizeJsonLiteral<Value> extends number ? "number"
        : NormalizeJsonLiteral<Value> extends boolean ? "boolean"
          : NormalizeJsonLiteral<Value> extends readonly unknown[] ? "array"
            : NormalizeJsonLiteral<Value> extends object ? "object"
              : "unknown"

export type JsonLengthResult<Value> =
  NormalizeJsonLiteral<Value> extends readonly unknown[] ? number :
    NormalizeJsonLiteral<Value> extends object ? number :
      null

export type JsonKeysResult<Value> =
  NormalizeJsonLiteral<Value> extends object
    ? NormalizeJsonLiteral<Value> extends readonly unknown[]
      ? readonly []
      : readonly Extract<keyof NormalizeJsonLiteral<Value>, string>[]
    : null
