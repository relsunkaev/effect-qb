import * as Schema from "effect/Schema"
import { pipeArguments, type Pipeable } from "effect/Pipeable"

import type * as Expression from "../internal/scalar.js"
import { makeColumnDefinition, type ColumnDefinition } from "../internal/column-state.js"
import type { NonEmptyStringInput } from "../internal/table-options.js"

export const EnumTypeId: unique symbol = Symbol.for("effect-qb/SchemaManagement/Enum")
export const SequenceTypeId: unique symbol = Symbol.for("effect-qb/SchemaManagement/Sequence")

type QualifiedName<
  Name extends string,
  SchemaName extends string | undefined
> = SchemaName extends string
  ? SchemaName extends "public"
    ? Name
    : `${SchemaName}.${Name}`
  : Name

type LowerAlpha =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z"

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
type SafeIdentifierStart = LowerAlpha | "_"
type SafeIdentifierRest = SafeIdentifierStart | Digit | "$"

type EscapeIdentifier<Value extends string> =
  Value extends `${infer Head}"${infer Tail}`
    ? `${Head}""${EscapeIdentifier<Tail>}`
    : Value

type IsSafeIdentifierRest<Value extends string> =
  Value extends ""
    ? true
    : Value extends `${infer Head}${infer Tail}`
      ? Head extends SafeIdentifierRest
        ? IsSafeIdentifierRest<Tail>
        : false
      : false

type IsSafeIdentifier<Value extends string> =
  Value extends `${infer Head}${infer Tail}`
    ? Head extends SafeIdentifierStart
      ? IsSafeIdentifierRest<Tail>
      : false
    : false

type RenderIdentifier<Value extends string> =
  string extends Value
    ? string
    : IsSafeIdentifier<Value> extends true
      ? Value
      : `"${EscapeIdentifier<Value>}"`

type RenderQualifiedTypeName<
  Name extends string,
  SchemaName extends string | undefined
> = SchemaName extends string
  ? SchemaName extends "public"
    ? RenderIdentifier<Name>
    : `${RenderIdentifier<SchemaName>}.${RenderIdentifier<Name>}`
  : RenderIdentifier<Name>

type EnumColumn<
  Name extends string,
  Values extends readonly [string, ...string[]],
  SchemaName extends string | undefined
> = ColumnDefinition<
  Values[number],
  Values[number],
  Values[number],
  Expression.DbType.Enum<"postgres", RenderQualifiedTypeName<Name, SchemaName>>,
  false,
  false,
  false,
  false,
  false,
  undefined
>

const safeUnquotedIdentifier = /^[a-z_][a-z0-9_$]*$/

const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll("\"", "\"\"")}"`

const renderIdentifier = (value: string): string =>
  safeUnquotedIdentifier.test(value)
    ? value
    : quoteIdentifier(value)

const renderQualifiedTypeName = (
  name: string,
  schemaName: string | undefined
): string =>
  schemaName === undefined || schemaName === "public"
    ? renderIdentifier(name)
    : `${renderIdentifier(schemaName)}.${renderIdentifier(name)}`

const EnumProto = {
  pipe(this: Pipeable) {
    return pipeArguments(this, arguments)
  },
  qualifiedName(this: EnumDefinition) {
    return this.schemaName === undefined || this.schemaName === "public"
      ? this.name
      : `${this.schemaName}.${this.name}`
  },
  type(this: EnumDefinition) {
    return {
      dialect: "postgres",
      kind: renderQualifiedTypeName(this.name, this.schemaName),
      variant: "enum"
    }
  },
  column(this: EnumDefinition) {
    const values = this.values.map((value) => Schema.Literal(value)) as unknown as readonly [Schema.Schema.Any, ...Schema.Schema.Any[]]
    return makeColumnDefinition(
      values.length === 1 ? values[0]! : Schema.Union(...values),
      {
        dbType: this.type(),
        nullable: false,
        hasDefault: false,
        generated: false,
        primaryKey: false,
        unique: false,
        references: undefined,
        ddlType: renderQualifiedTypeName(this.name, this.schemaName),
        identity: undefined,
        enum: {
          name: this.name,
          schemaName: this.schemaName,
          values: this.values
        }
      }
    )
  }
}

const SequenceProto = {
  pipe(this: Pipeable) {
    return pipeArguments(this, arguments)
  },
  qualifiedName(this: SequenceDefinition) {
    return this.schemaName === undefined || this.schemaName === "public"
      ? this.name
      : `${this.schemaName}.${this.name}`
  }
}

export interface EnumDefinition<
  Name extends string = string,
  Values extends readonly [string, ...string[]] = readonly [string, ...string[]],
  SchemaName extends string | undefined = undefined
> extends Pipeable {
  readonly name: Name
  readonly values: Values
  readonly schemaName: SchemaName
  readonly [EnumTypeId]: {
    readonly kind: "enum"
    readonly name: Name
    readonly values: Values
    readonly schemaName: SchemaName
  }
  readonly qualifiedName: () => QualifiedName<Name, SchemaName>
  readonly type: () => Expression.DbType.Enum<"postgres", RenderQualifiedTypeName<Name, SchemaName>>
  readonly column: () => EnumColumn<Name, Values, SchemaName>
}

export interface SequenceDefinition<
  Name extends string = string,
  SchemaName extends string | undefined = undefined
> extends Pipeable {
  readonly name: Name
  readonly schemaName: SchemaName
  readonly [SequenceTypeId]: {
    readonly kind: "sequence"
    readonly name: Name
    readonly schemaName: SchemaName
  }
  readonly qualifiedName: () => QualifiedName<Name, SchemaName>
}

export type AnyEnumDefinition = EnumDefinition<string, readonly [string, ...string[]], string | undefined>
export type AnySequenceDefinition = SequenceDefinition<string, string | undefined>
export type AnyDefinition = AnyEnumDefinition | AnySequenceDefinition

export function enumType<
  Name extends string,
  const Values extends readonly [string, ...string[]]
>(
  name: NonEmptyStringInput<Name>,
  values: Values
): EnumDefinition<Name, Values, undefined>
export function enumType<
  Name extends string,
  const Values extends readonly [string, ...string[]],
  SchemaName extends string
>(
  name: NonEmptyStringInput<Name>,
  values: Values,
  schemaName: NonEmptyStringInput<SchemaName>
): EnumDefinition<Name, Values, SchemaName>
export function enumType(
  name: string,
  values: readonly [string, ...string[]],
  schemaName?: string
): EnumDefinition<string, readonly [string, ...string[]], string | undefined> {
  const definition = Object.create(EnumProto)
  definition.name = name
  definition.values = values
  definition.schemaName = schemaName
  definition[EnumTypeId] = {
    kind: "enum",
    name,
    values,
    schemaName
  }
  return definition
}

export function sequence<Name extends string>(
  name: NonEmptyStringInput<Name>
): SequenceDefinition<Name, undefined>
export function sequence<Name extends string, SchemaName extends string>(
  name: NonEmptyStringInput<Name>,
  schemaName: NonEmptyStringInput<SchemaName>
): SequenceDefinition<Name, SchemaName>
export function sequence(
  name: string,
  schemaName?: string
): SequenceDefinition<string, string | undefined> {
  const definition = Object.create(SequenceProto)
  definition.name = name
  definition.schemaName = schemaName
  definition[SequenceTypeId] = {
    kind: "sequence",
    name,
    schemaName
  }
  return definition
}

export const schema = <SchemaName extends string>(
  schemaName: NonEmptyStringInput<SchemaName>
) => ({
  schemaName,
  enumType: <
    Name extends string,
    const Values extends readonly [string, ...string[]]
  >(
    name: NonEmptyStringInput<Name>,
    values: Values
  ): EnumDefinition<Name, Values, SchemaName> =>
    enumType(name, values, schemaName) as EnumDefinition<Name, Values, SchemaName>,
  sequence: <
    Name extends string
  >(
    name: NonEmptyStringInput<Name>
  ): SequenceDefinition<Name, SchemaName> =>
    sequence(name, schemaName) as SequenceDefinition<Name, SchemaName>
})

export const isEnumDefinition = (value: unknown): value is AnyEnumDefinition =>
  typeof value === "object" && value !== null && EnumTypeId in value

export const isSequenceDefinition = (value: unknown): value is AnySequenceDefinition =>
  typeof value === "object" && value !== null && SequenceTypeId in value
