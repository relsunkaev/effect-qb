import * as Table from "../../internal/table.js"
import type { AnyColumnDefinition } from "../../internal/column-state.js"
import type { RenderState } from "../../internal/dialect.js"
import * as Casing from "../../internal/casing.js"
import * as Expression from "../../internal/scalar.js"
import * as SchemaExpression from "../../internal/schema-expression.js"
import { normalizeDdlExpressionSql } from "./schema-ddl.js"
import { validateOptions, type ColumnList, type DdlExpressionLike, type IndexKeySpec, type TableOptionSpec } from "../../internal/table-options.js"
import type { EnumDefinition } from "../schema-management.js"
import { EnumTypeId } from "../schema-management.js"

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

const applyCasing = (
  casing: Casing.Options | undefined,
  category: Casing.Category,
  name: string
): string =>
  Casing.applyCategory(casing, category, name)

const mapColumnList = (
  columns: ColumnList,
  casing: Casing.Options | undefined
): ColumnList =>
  !Array.isArray(columns)
    ? columns
    : columns.length === 0
      ? columns
    : [
        mapCasedValue(columns[0], casing, "columns"),
        ...columns.slice(1).map((column) => mapCasedValue(column, casing, "columns"))
      ] as unknown as ColumnList

const expressionStateForTable = (
  state: Table.AnyTable[typeof Table.TypeId],
  tableName: string,
  columns: ReadonlyMap<string, string>,
  casing: Casing.Options | undefined
): Partial<RenderState> => ({
  casing,
  rowLocalColumns: true,
  sourceNames: new Map([
    [state.name, { tableName, columns }],
    [state.baseName, { tableName, columns }]
  ])
})

const mapDdlExpression = (
  expression: DdlExpressionLike,
  state: Partial<RenderState>
): SchemaExpression.SchemaExpression =>
  SchemaExpression.fromSql(normalizeDdlExpressionSql(expression, state))

const mapOptionName = (
  name: unknown,
  casing: Casing.Options | undefined,
  category: "indexes" | "constraints"
): unknown =>
  typeof name === "string"
    ? applyCasing(casing, category, name)
    : name

const mapCasedValue = (
  value: unknown,
  casing: Casing.Options | undefined,
  category: Casing.Category
): unknown =>
  typeof value === "string"
    ? applyCasing(casing, category, value)
    : value

const isDdlExpressionLike = (value: unknown): value is DdlExpressionLike =>
  typeof value === "object" &&
  value !== null &&
  (Expression.TypeId in value || SchemaExpression.TypeId in value)

const mapIndexKey = (
  key: IndexKeySpec,
  casing: Casing.Options | undefined,
  expressionState: Partial<RenderState>
): IndexKeySpec => {
  const kind = (key as { readonly kind?: unknown }).kind
  if (kind === "column") {
    const column = (key as { readonly column?: unknown }).column
    return typeof column === "string"
      ? {
          ...key,
          column: applyCasing(casing, "columns", column)
        }
      : key
  }
  if (kind === "expression") {
    const expression = (key as { readonly expression?: unknown }).expression
    return isDdlExpressionLike(expression)
      ? {
          ...key,
          expression: mapDdlExpression(expression, expressionState)
        }
      : key
  }
  return key
}

const mapOption = (
  option: TableOptionSpec,
  casing: Casing.Options | undefined,
  expressionState: Partial<RenderState>
): TableOptionSpec => {
  switch (option.kind) {
    case "index":
      return {
        ...option,
        columns: option.columns === undefined ? undefined : mapColumnList(option.columns, casing),
        name: option.name === undefined ? undefined : mapOptionName(option.name, casing, "indexes"),
        include: option.include === undefined
          ? undefined
          : Array.isArray(option.include)
            ? option.include.map((column) => mapCasedValue(column, casing, "columns")) as unknown as readonly string[]
            : option.include,
        predicate: option.predicate === undefined
          ? undefined
          : isDdlExpressionLike(option.predicate)
            ? mapDdlExpression(option.predicate, expressionState)
            : option.predicate,
        keys: option.keys === undefined
          ? undefined
          : option.keys.length === 0
            ? option.keys
          : [
              mapIndexKey(option.keys[0], casing, expressionState),
              ...option.keys.slice(1).map((key) => mapIndexKey(key, casing, expressionState))
            ]
      }
    case "primaryKey":
      return {
        ...option,
        columns: mapColumnList(option.columns, casing),
        name: option.name === undefined ? undefined : mapOptionName(option.name, casing, "constraints")
      }
    case "unique":
      return {
        ...option,
        columns: mapColumnList(option.columns, casing),
        name: option.name === undefined ? undefined : mapOptionName(option.name, casing, "constraints")
      }
    case "foreignKey":
      return {
        ...option,
        columns: mapColumnList(option.columns, casing),
        name: option.name === undefined ? undefined : mapOptionName(option.name, casing, "constraints"),
        references: () => {
          const reference = typeof option.references === "function"
            ? option.references()
            : option.references
          if (typeof reference !== "object" || reference === null) {
            return reference
          }
          const referenceCasing = reference.casing
          return {
            ...reference,
            tableName: mapCasedValue(reference.tableName, referenceCasing, "tables"),
            schemaName: reference.schemaName === undefined
              ? undefined
              : mapCasedValue(reference.schemaName, referenceCasing, "schemas"),
            columns: mapColumnList(reference.columns, referenceCasing),
            knownColumns: reference.knownColumns === undefined
              ? undefined
              : Array.isArray(reference.knownColumns)
                ? reference.knownColumns.map((column) =>
                  mapCasedValue(column, referenceCasing, "columns")) as unknown as readonly string[]
                : reference.knownColumns
          }
        }
      }
    case "check":
      return {
        ...option,
        name: mapOptionName(option.name, casing, "constraints"),
        predicate: isDdlExpressionLike(option.predicate)
          ? mapDdlExpression(option.predicate, expressionState)
          : option.predicate
      }
  }
}

export const toTableModel = (table: Table.AnyTable): TableModel => {
  const state = table[Table.TypeId]
  const casing = state.casing
  const tableName = applyCasing(casing, "tables", state.baseName)
  const schemaName = state.schemaName === undefined
    ? undefined
    : applyCasing(casing, "schemas", state.schemaName)
  const fields = state.fields as Record<string, AnyColumnDefinition>
  const options = table[Table.OptionsSymbol]
  validateOptions(state.name, fields, options)
  const columnNames = new Map(
    Object.keys(fields).map((name) => [name, applyCasing(casing, "columns", name)] as const)
  )
  const expressionState = expressionStateForTable(state, tableName, columnNames, casing)
  const columns = Object.entries(fields).map(([name, column]) => {
    const metadata = column.metadata
    const enumDefinition = metadata.enum
    const ddlType = metadata.ddlType ?? metadata.dbType.kind
    return {
      name: columnNames.get(name) ?? name,
      ddlType,
      dbTypeKind: enumDefinition?.name ?? column.metadata.dbType.kind,
      typeKind: enumDefinition === undefined ? undefined : "e",
      typeSchema: enumDefinition?.schemaName,
      nullable: column.metadata.nullable,
      hasDefault: column.metadata.hasDefault,
      generated: column.metadata.generated,
      defaultSql: column.metadata.defaultValue === undefined
        ? undefined
        : normalizeDdlExpressionSql(column.metadata.defaultValue, expressionState),
      generatedSql: column.metadata.generatedValue === undefined
        ? undefined
        : normalizeDdlExpressionSql(column.metadata.generatedValue, expressionState),
      identity: column.metadata.identity,
      column
    }
  }) satisfies ReadonlyArray<ColumnModel>
  return {
    kind: "table",
    schemaName,
    name: tableName,
    columns,
    options: options.map((option) => mapOption(option, casing, expressionState)),
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
      enums.set(modelIdentityKey(value.schemaName, value.name), toEnumModel(value))
    } else if (isTableDefinition(value)) {
      for (const enumModel of enumModelsOfTable(value)) {
        const key = modelIdentityKey(enumModel.schemaName, enumModel.name)
        const existing = enums.get(key)
        if (existing === undefined) {
          enums.set(key, enumModel)
          continue
        }
        if (JSON.stringify(existing.values) !== JSON.stringify(enumModel.values)) {
          throw new Error(`Conflicting enum definitions discovered for '${enumKey(enumModel.schemaName, enumModel.name)}'`)
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

const modelIdentityKey = (schemaName: string | undefined, name: string): string =>
  JSON.stringify([schemaName ?? "public", name])
