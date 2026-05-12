import type { FilterConfig } from "./postgres-config.js"
import type { ColumnModel } from "effect-qb/postgres/metadata"
import type { DiscoveredSourceSchema } from "./postgres-source-discovery.js"

const normalizeSchemas = (filter?: FilterConfig): ReadonlySet<string> | undefined =>
  filter?.schemas && filter.schemas.length > 0
    ? new Set(filter.schemas)
    : undefined

const normalizeTables = (filter?: FilterConfig): ReadonlySet<string> | undefined =>
  filter?.tables && filter.tables.length > 0
    ? new Set(filter.tables)
    : undefined

const stripTypeDecorations = (ddlType: string): string =>
  ddlType.trim().replace(/\(.+\)$/, "").replace(/\[\]$/, "")

const sourceIdentityKey = (schemaName: string | undefined, name: string): string =>
  JSON.stringify([schemaName ?? "public", name])

const parseIdentifierPart = (
  input: string,
  start: number
): { readonly value: string; readonly next: number } | undefined => {
  if (input[start] === "\"") {
    let value = ""
    for (let index = start + 1; index < input.length; index++) {
      if (input[index] !== "\"") {
        value += input[index]
        continue
      }
      if (input[index + 1] === "\"") {
        value += "\""
        index++
        continue
      }
      return {
        value,
        next: index + 1
      }
    }
    return undefined
  }
  const match = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(input.slice(start))
  return match === null
    ? undefined
    : {
        value: match[0],
        next: start + match[0].length
      }
}

const parseQualifiedDdlType = (
  ddlType: string
): { readonly schemaName: string; readonly name: string } | undefined => {
  const input = stripTypeDecorations(ddlType)
  const schema = parseIdentifierPart(input, 0)
  if (schema === undefined || input[schema.next] !== ".") {
    return undefined
  }
  const name = parseIdentifierPart(input, schema.next + 1)
  return name !== undefined && name.next === input.length
    ? {
        schemaName: schema.value,
        name: name.value
      }
    : undefined
}

const enumCandidatesForColumn = (
  column: ColumnModel,
  tableSchemaName: string | undefined
): readonly string[] => {
  const qualifiedDdlType = parseQualifiedDdlType(column.ddlType)
  return [
    sourceIdentityKey(column.typeSchema, column.dbTypeKind),
    sourceIdentityKey(qualifiedDdlType?.schemaName, qualifiedDdlType?.name ?? column.dbTypeKind),
    sourceIdentityKey(tableSchemaName, column.dbTypeKind)
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
  const filteredTableKeys = new Set(filteredTables.map((table) => sourceIdentityKey(table.schemaName, table.name)))

  const sourceEnumKeys = new Set(discovered.model.enums.map((enumType) => sourceIdentityKey(enumType.schemaName, enumType.name)))
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
    const key = sourceIdentityKey(enumType.schemaName, enumType.name)
    if (referencedEnumKeys.has(key)) {
      return true
    }
    return allowedTables === undefined
      && (allowedSchemas === undefined || allowedSchemas.has(enumType.schemaName ?? "public"))
  })
  const filteredEnumKeys = new Set(filteredEnums.map((enumType) => sourceIdentityKey(enumType.schemaName, enumType.name)))

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
