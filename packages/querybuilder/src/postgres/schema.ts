import { pipeArguments, type Pipeable } from "effect/Pipeable"

import { ColumnTypeId } from "../internal/column-state.js"
import type { AnyColumnDefinition } from "../internal/column-state.js"
import * as Casing from "../internal/casing.js"
import * as BaseTable from "../internal/table.js"
import type { TableFieldMap } from "../internal/schema-derivation.js"
import { schema as makeTableSchemaNamespace } from "../standard/table.js"
import { enumType, sequence, type EnumDefinition, type SequenceDefinition } from "./schema-management.js"

type InlinePrimaryKeyKeys<Fields extends TableFieldMap> = Extract<{
  [K in keyof Fields]: Fields[K]["metadata"]["primaryKey"] extends true ? K : never
}[keyof Fields], string>

type FieldDialect<Column extends AnyColumnDefinition> = Column[typeof ColumnTypeId]["dbType"]["dialect"]

type ValidatePostgresSchemaFields<Fields extends TableFieldMap> = {
  [K in keyof Fields]: Exclude<FieldDialect<Fields[K]>, "standard" | "postgres"> extends never ? Fields[K] : never
}

type ApplySchemaTableOptions<
  Name extends string,
  Fields extends TableFieldMap,
  PrimaryKeyColumns extends keyof Fields & string,
  SchemaName extends string,
  Options extends BaseTable.DeclaredTableOptions
> = BaseTable.ApplyDeclaredOptions<
  BaseTable.TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>,
  Options
> extends BaseTable.TableDefinition<any, any, infer AppliedPrimaryKeyColumns extends keyof Fields & string, "schema", any>
  ? BaseTable.TableDefinition<Name, Fields, AppliedPrimaryKeyColumns, "schema", SchemaName>
  : BaseTable.TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>

type ValidatePostgresSchemaTable<
  Table extends BaseTable.TableDefinition<any, any, any, any, any>
> = Table extends BaseTable.TableDefinition<any, infer Fields extends TableFieldMap, any, any, any>
  ? BaseTable.TableDefinition<any, Fields & ValidatePostgresSchemaFields<Fields>, any, any, any>
  : never

export type SchemaNamespace<SchemaName extends string> = Pipeable & {
  readonly schemaName: SchemaName
  readonly table: <
    Name extends string,
    Fields extends TableFieldMap,
    const Options extends BaseTable.DeclaredTableOptions,
    PrimaryKeyColumns extends keyof Fields & string = InlinePrimaryKeyKeys<Fields>
  >(
    name: Name,
    fields: Fields & ValidatePostgresSchemaFields<Fields>,
    ...options: Options & BaseTable.ValidateDeclaredOptions<BaseTable.TableDefinition<Name, Fields, PrimaryKeyColumns, "schema", SchemaName>, Options>
  ) => ApplySchemaTableOptions<Name, Fields, PrimaryKeyColumns, SchemaName, Options>
  readonly enum: <
    Name extends string,
    const Values extends readonly [string, ...string[]]
  >(
    name: Name,
    values: Values
  ) => EnumDefinition<Name, Values, SchemaName>
  readonly sequence: <
    Name extends string
  >(
    name: Name
  ) => SequenceDefinition<Name, SchemaName>
  readonly withSchema: <
    Table extends BaseTable.TableDefinition<any, any, any, any, any>
  >(table: Table & ValidatePostgresSchemaTable<Table>) => BaseTable.TableDefinition<
    Table[typeof BaseTable.TypeId]["name"],
    Table[typeof BaseTable.TypeId]["fields"],
    Table[typeof BaseTable.TypeId]["primaryKey"][number],
    Table[typeof BaseTable.TypeId]["kind"],
    SchemaName
  >
  readonly [Casing.TypeId]: Casing.State
  readonly withCasing: (options: Casing.Options) => SchemaNamespace<SchemaName>
}

const SchemaProto = {
  pipe(this: unknown) {
    return pipeArguments(this, arguments)
  }
}

export const make = <SchemaName extends string>(
  schemaName: SchemaName,
  options: { readonly casing?: Casing.Options } = {}
): SchemaNamespace<SchemaName> => {
  const physicalSchemaName = Casing.applyCategory(options.casing, "schemas", schemaName)
  const tableNamespace = makeTableSchemaNamespace(schemaName)
  const namespace = Object.create(SchemaProto)
  namespace.schemaName = schemaName
  namespace.table = ((name: string, fields: any, ...declaredOptions: any[]) => {
    const table = tableNamespace.table(name, fields, ...declaredOptions)
    return options.casing === undefined ? table : BaseTable.withCasing(table as any, options.casing)
  }) as SchemaNamespace<SchemaName>["table"]
  namespace.enum = <
    Name extends string,
    const Values extends readonly [string, ...string[]]
  >(
    name: Name,
    values: Values
  ) => enumType(Casing.applyCategory(options.casing, "types", name), values, physicalSchemaName) as unknown as EnumDefinition<Name, Values, SchemaName>
  namespace.sequence = <
    Name extends string
  >(
    name: Name
  ) => sequence(Casing.applyCategory(options.casing, "sequences", name), physicalSchemaName) as unknown as SequenceDefinition<Name, SchemaName>
  namespace.withSchema = <
    Table extends BaseTable.TableDefinition<any, any, any, any, any>
  >(table: Table & ValidatePostgresSchemaTable<Table>) => BaseTable.withSchema(table, schemaName, options.casing)
  namespace[Casing.TypeId] = {
    casing: options.casing
  }
  namespace.withCasing = (override: Casing.Options) =>
    make(schemaName, { casing: Casing.merge(options.casing, override) })
  return namespace as SchemaNamespace<SchemaName>
}
