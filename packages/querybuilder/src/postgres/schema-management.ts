import { pipeArguments, type Pipeable } from "effect/Pipeable"

export const EnumTypeId: unique symbol = Symbol.for("effect-qb/SchemaManagement/Enum")

const EnumProto = {
  pipe(this: unknown) {
    return pipeArguments(this, arguments)
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
}

export type AnyDefinition = EnumDefinition

export const enumType = <
  Name extends string,
  Values extends readonly [string, ...string[]]
>(
  name: Name,
  values: Values,
  schemaName?: string
): EnumDefinition<Name, Values, string | undefined> => {
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

export const schema = <SchemaName extends string>(
  schemaName: SchemaName
) => ({
  schemaName,
  enumType: <
    Name extends string,
    Values extends readonly [string, ...string[]]
  >(
    name: Name,
    values: Values
  ): EnumDefinition<Name, Values, SchemaName> =>
    enumType(name, values, schemaName) as EnumDefinition<Name, Values, SchemaName>
})

export const isEnumDefinition = (value: unknown): value is EnumDefinition =>
  typeof value === "object" && value !== null && EnumTypeId in value
