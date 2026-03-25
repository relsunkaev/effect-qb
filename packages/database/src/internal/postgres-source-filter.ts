import type { FilterConfig } from "./postgres-config.js"
import { enumKey, tableKey, type ColumnModel } from "effect-qb/postgres/metadata"
import type { DiscoveredSourceSchema } from "./postgres-source-discovery.js"

const normalizeSchemas = (filter?: FilterConfig): ReadonlySet<string> | undefined =>
  filter?.schemas && filter.schemas.length > 0
    ? new Set(filter.schemas)
    : undefined

const normalizeTables = (filter?: FilterConfig): ReadonlySet<string> | undefined =>
  filter?.tables && filter.tables.length > 0
    ? new Set(filter.tables)
    : undefined

const inferSchemaFromDdlType = (ddlType: string): string | undefined => {
  const withoutParams = ddlType.trim().replace(/\(.+\)$/, "").replace(/\[\]$/, "")
  const match = /^(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\.(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))$/.exec(withoutParams)
  if (match === null) {
    return undefined
  }
  return match[1] ?? match[2]
}

const inferNameFromDdlType = (ddlType: string): string | undefined => {
  const withoutParams = ddlType.trim().replace(/\(.+\)$/, "").replace(/\[\]$/, "")
  const match = /^(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\.(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))$/.exec(withoutParams)
  if (match === null) {
    return undefined
  }
  return match[3] ?? match[4]
}

const enumCandidatesForColumn = (
  column: ColumnModel,
  tableSchemaName: string | undefined
): readonly string[] => {
  const schemaFromDdl = inferSchemaFromDdlType(column.ddlType)
  const nameFromDdl = inferNameFromDdlType(column.ddlType)
  return [
    enumKey(column.typeSchema, column.dbTypeKind),
    enumKey(schemaFromDdl, nameFromDdl ?? column.dbTypeKind),
    enumKey(tableSchemaName, column.dbTypeKind)
  ]
}

const matchesTableFilter = (
  schemaName: string | undefined,
  name: string,
  allowedSchemas: ReadonlySet<string> | undefined,
  allowedTables: ReadonlySet<string> | undefined
): boolean =>
  (allowedSchemas === undefined || allowedSchemas.has(schemaName ?? "public"))
  && (allowedTables === undefined || allowedTables.has(name))

export const filterDiscoveredSourceSchema = (
  discovered: DiscoveredSourceSchema,
  filter?: FilterConfig
): DiscoveredSourceSchema => {
  const allowedSchemas = normalizeSchemas(filter)
  const allowedTables = normalizeTables(filter)
  if (allowedSchemas === undefined && allowedTables === undefined) {
    return discovered
  }

  const filteredTables = discovered.model.tables.filter((table) =>
    matchesTableFilter(table.schemaName, table.name, allowedSchemas, allowedTables)
  )
  const filteredTableKeys = new Set(filteredTables.map((table) => tableKey(table.schemaName, table.name)))

  const sourceEnumKeys = new Set(discovered.model.enums.map((enumType) => enumKey(enumType.schemaName, enumType.name)))
  const referencedEnumKeys = new Set<string>()
  for (const table of filteredTables) {
    for (const column of table.columns) {
      for (const candidate of enumCandidatesForColumn(column, table.schemaName)) {
        if (sourceEnumKeys.has(candidate)) {
          referencedEnumKeys.add(candidate)
        }
      }
    }
  }

  const filteredEnums = discovered.model.enums.filter((enumType) => {
    const key = enumKey(enumType.schemaName, enumType.name)
    if (referencedEnumKeys.has(key)) {
      return true
    }
    return allowedTables === undefined
      && (allowedSchemas === undefined || allowedSchemas.has(enumType.schemaName ?? "public"))
  })
  const filteredEnumKeys = new Set(filteredEnums.map((enumType) => enumKey(enumType.schemaName, enumType.name)))

  const allowedBindingKeys = new Set([
    ...filteredTableKeys,
    ...filteredEnumKeys
  ])
  const bindings = discovered.bindings.filter((binding) => allowedBindingKeys.has(binding.key))
  const declarations = discovered.declarations.filter((declaration) =>
    bindings.some((binding) => binding.declaration === declaration)
  )

  return {
    declarations,
    bindings,
    model: {
      dialect: "postgres",
      enums: filteredEnums,
      tables: filteredTables
    }
  }
}
