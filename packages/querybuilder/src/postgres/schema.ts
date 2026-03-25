import { schema as makeTableSchemaNamespace, type TableSchemaNamespace } from "../internal/table.js"
import { enumType, type EnumDefinition } from "./schema-management.js"

export type SchemaNamespace<SchemaName extends string> = TableSchemaNamespace<SchemaName> & {
  readonly enum: <
    Name extends string,
    Values extends readonly [string, ...string[]]
  >(
    name: Name,
    values: Values
  ) => EnumDefinition<Name, Values, SchemaName>
}

export const schema = <SchemaName extends string>(
  schemaName: SchemaName
): SchemaNamespace<SchemaName> => ({
  ...makeTableSchemaNamespace(schemaName),
  enum: <
    Name extends string,
    Values extends readonly [string, ...string[]]
  >(
    name: Name,
    values: Values
  ) => enumType(name, values, schemaName) as EnumDefinition<Name, Values, SchemaName>
})
