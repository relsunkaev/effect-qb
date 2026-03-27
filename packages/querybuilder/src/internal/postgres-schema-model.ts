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
  value !== null &&
  (typeof value === "object" || typeof value === "function") &&
  Table.TypeId in value

export const isEnumDefinition = (value: unknown): value is EnumDefinition =>
  typeof value === "object" && value !== null && EnumTypeId in value

export const toTableModel = (table: Table.AnyTable): TableModel => {
  const state = table[Table.TypeId]
  const fields = state.fields as Record<string, AnyColumnDefinition>
  const columns = Object.entries(fields).map(([name, column]) => {
    const metadata = column.metadata
    const enumDefinition = metadata.enum
    const ddlType = metadata.ddlType ?? metadata.dbType.kind
    return {
      name,
      ddlType,
      dbTypeKind: enumDefinition?.name ?? column.metadata.dbType.kind,
      typeKind: enumDefinition === undefined ? undefined : "e",
      typeSchema: enumDefinition?.schemaName,
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
    }
  }) satisfies ReadonlyArray<ColumnModel>
  return {
    kind: "table",
    schemaName: state.schemaName,
    name: state.baseName,
    columns,
    options: table[Table.OptionsSymbol],
    table
  }
}

export const toEnumModel = <
  Name extends string,
  Values extends readonly [string, ...string[]],
  SchemaName extends string | undefined
>(
  definition: EnumDefinition<Name, Values, SchemaName>
): EnumModel => ({
  kind: "enum",
  schemaName: definition.schemaName,
  name: definition.name,
  values: [...definition.values]
})

const enumModelsOfTable = (table: Table.AnyTable): readonly EnumModel[] => {
  const state = table[Table.TypeId]
  const fields = state.fields as Record<string, AnyColumnDefinition>
  return Object.values(fields)
    .flatMap((column) => column.metadata.enum === undefined
      ? []
      : [{
          kind: "enum" as const,
          schemaName: column.metadata.enum.schemaName,
          name: column.metadata.enum.name,
          values: [...column.metadata.enum.values]
        } satisfies EnumModel
      ])
}

export const fromDiscoveredValues = (values: ReadonlyArray<unknown>): SchemaModel => {
  const tables = values.filter(isTableDefinition).map(toTableModel)
  const enums = new Map<string, EnumModel>()
  for (const value of values) {
    if (isEnumDefinition(value)) {
      enums.set(enumKey(value.schemaName, value.name), toEnumModel(value))
    } else if (isTableDefinition(value)) {
      for (const enumModel of enumModelsOfTable(value)) {
        const key = enumKey(enumModel.schemaName, enumModel.name)
        const existing = enums.get(key)
        if (existing === undefined) {
          enums.set(key, enumModel)
          continue
        }
        if (JSON.stringify(existing.values) !== JSON.stringify(enumModel.values)) {
          throw new Error(`Conflicting enum definitions discovered for '${key}'`)
        }
      }
    }
  }
  return {
    dialect: "postgres",
    enums: [...enums.values()],
    tables
  }
}

export const tableKey = (schemaName: string | undefined, name: string): string =>
  `${schemaName ?? "public"}.${name}`

export const enumKey = (schemaName: string | undefined, name: string): string =>
  `${schemaName ?? "public"}.${name}`
