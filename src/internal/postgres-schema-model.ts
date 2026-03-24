import * as Table from "./table.js"
import type { AnyColumnDefinition } from "./column-state.js"
import { normalizeDdlExpressionSql } from "./schema-ddl.js"
import type { TableOptionSpec } from "./table-options.js"
import type { EnumDefinition } from "../postgres/schema-management.js"
import { EnumTypeId } from "../postgres/schema-management.js"

export interface EnumModel {
  readonly kind: "enum"
  readonly schemaName?: string
  readonly name: string
  readonly values: readonly string[]
}

export interface ColumnModel {
  readonly name: string
  readonly ddlType: string
  readonly dbTypeKind: string
  readonly typeKind?: string
  readonly typeSchema?: string
  readonly nullable: boolean
  readonly hasDefault: boolean
  readonly generated: boolean
  readonly defaultSql?: string
  readonly generatedSql?: string
  readonly identity?: {
    readonly generation: "always" | "byDefault"
  }
  readonly column?: AnyColumnDefinition
}

export interface TableModel {
  readonly kind: "table"
  readonly schemaName?: string
  readonly name: string
  readonly columns: readonly ColumnModel[]
  readonly options: readonly TableOptionSpec[]
  readonly table?: Table.AnyTable
}

export interface SchemaModel {
  readonly dialect: "postgres"
  readonly enums: readonly EnumModel[]
  readonly tables: readonly TableModel[]
}

export const isTableDefinition = (value: unknown): value is Table.AnyTable =>
  typeof value === "object" && value !== null && Table.TypeId in value

export const isEnumDefinition = (value: unknown): value is EnumDefinition =>
  typeof value === "object" && value !== null && EnumTypeId in value

export const toTableModel = (table: Table.AnyTable): TableModel => {
  const state = table[Table.TypeId]
  const fields = state.fields as Record<string, AnyColumnDefinition>
  const columns = Object.entries(fields).map(([name, column]) => ({
    name,
    ddlType: column.metadata.ddlType ?? column.metadata.dbType.kind,
    dbTypeKind: column.metadata.dbType.kind,
    typeKind: undefined,
    typeSchema: undefined,
    nullable: column.metadata.nullable,
    hasDefault: column.metadata.hasDefault,
    generated: column.metadata.generated,
    defaultSql: column.metadata.defaultValue === undefined
      ? undefined
      : normalizeDdlExpressionSql(column.metadata.defaultValue),
    generatedSql: column.metadata.generatedValue === undefined
      ? undefined
      : normalizeDdlExpressionSql(column.metadata.generatedValue),
    identity: column.metadata.identity,
    column
  })) satisfies ReadonlyArray<ColumnModel>
  return {
    kind: "table",
    schemaName: state.schemaName,
    name: state.baseName,
    columns,
    options: table[Table.OptionsSymbol],
    table
  }
}

export const toEnumModel = (definition: EnumDefinition): EnumModel => ({
  kind: "enum",
  schemaName: definition.schemaName,
  name: definition.name,
  values: [...definition.values]
})

export const fromDiscoveredValues = (values: ReadonlyArray<unknown>): SchemaModel => ({
  dialect: "postgres",
  enums: values.filter(isEnumDefinition).map(toEnumModel),
  tables: values.filter(isTableDefinition).map(toTableModel)
})

export const tableKey = (schemaName: string | undefined, name: string): string =>
  `${schemaName ?? "public"}.${name}`

export const enumKey = (schemaName: string | undefined, name: string): string =>
  `${schemaName ?? "public"}.${name}`
