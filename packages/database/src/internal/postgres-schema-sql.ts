import type { ColumnModel, EnumModel, TableModel } from "effect-qb/postgres/metadata"
import { SchemaExpression } from "effect-qb/postgres"
import type { IndexKeySpec, TableOptionSpec } from "effect-qb/postgres/metadata"

const quote = (value: string): string =>
  `"${value.replaceAll("\"", "\"\"")}"`

const qualify = (schemaName: string | undefined, name: string): string =>
  `${quote(schemaName ?? "public")}.${quote(name)}`

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

const parseQualifiedIdentifier = (value: string): readonly string[] | undefined => {
  const input = value.trim()
  if (input.length === 0) {
    return undefined
  }
  const parts: string[] = []
  let index = 0
  while (index < input.length) {
    const part = parseIdentifierPart(input, index)
    if (part === undefined) {
      return undefined
    }
    parts.push(part.value)
    index = part.next
    if (index === input.length) {
      return parts
    }
    if (input[index] !== ".") {
      return undefined
    }
    index += 1
  }
  return undefined
}

const qualifyIdentifier = (value: string): string =>
  (parseQualifiedIdentifier(value) ?? value.split(".")).map(quote).join(".")

const safeIdentifier = /^[A-Za-z_][A-Za-z0-9_$]*$/

const renderIndexMethod = (method: unknown): string => {
  if (method === undefined) {
    return ""
  }
  if (typeof method !== "string") {
    throw new Error("Postgres index method must be an identifier")
  }
  const trimmed = method.trim()
  if (safeIdentifier.test(trimmed)) {
    return ` using ${trimmed}`
  }
  const parsed = parseQualifiedIdentifier(trimmed)
  if (parsed?.length === 1) {
    return ` using ${quote(parsed[0]!)}`
  }
  throw new Error("Postgres index method must be an identifier")
}

const renderAction = (action: unknown): string => {
  switch (action) {
    case "noAction":
      return "no action"
    case "restrict":
      return "restrict"
    case "cascade":
      return "cascade"
    case "setNull":
      return "set null"
    case "setDefault":
      return "set default"
  }
  throw new Error("Foreign key action must be noAction, restrict, cascade, setNull, or setDefault")
}

const renderIdentity = (generation: "always" | "byDefault"): string =>
  `generated ${generation === "byDefault" ? "by default" : "always"} as identity`

export const defaultIndexName = (
  tableName: string,
  keys: readonly string[],
  unique: boolean
): string => `${tableName}_${keys.join("_")}_${unique ? "uniq" : "idx"}`

export const defaultConstraintName = (
  table: TableModel,
  option: Exclude<TableOptionSpec, { readonly kind: "index" }>
): string => {
  switch (option.kind) {
    case "primaryKey":
      return `${table.name}_pkey`
    case "unique":
      return `${table.name}_${option.columns.join("_")}_key`
    case "foreignKey":
      return `${table.name}_${option.columns.join("_")}_fkey`
    case "check":
      return option.name
  }
}

export const renderColumnDefinition = (column: ColumnModel): string => {
  const clauses = [
    quote(column.name),
    column.ddlType
  ]
  if (column.identity) {
    clauses.push(renderIdentity(column.identity.generation))
  } else if (column.generatedSql) {
    clauses.push(`generated always as (${column.generatedSql}) stored`)
  } else if (column.defaultSql) {
    clauses.push(`default ${column.defaultSql}`)
  }
  if (!column.nullable) {
    clauses.push("not null")
  }
  return clauses.join(" ")
}

const renderConstraint = (table: TableModel, option: Exclude<TableOptionSpec, { readonly kind: "index" }>): string => {
  switch (option.kind) {
    case "primaryKey":
      return `${option.name ? `constraint ${quote(option.name)} ` : ""}primary key (${option.columns.map(quote).join(", ")})${option.deferrable ? ` deferrable${option.initiallyDeferred ? " initially deferred" : ""}` : ""}`
    case "unique":
      return `${option.name ? `constraint ${quote(option.name)} ` : ""}unique${option.nullsNotDistinct ? " nulls not distinct" : ""} (${option.columns.map(quote).join(", ")})${option.deferrable ? ` deferrable${option.initiallyDeferred ? " initially deferred" : ""}` : ""}`
    case "foreignKey": {
      const reference = option.references()
      return `${option.name ? `constraint ${quote(option.name)} ` : ""}foreign key (${option.columns.map(quote).join(", ")}) references ${qualify(reference.schemaName, reference.tableName)} (${reference.columns.map(quote).join(", ")})${option.onDelete ? ` on delete ${renderAction(option.onDelete)}` : ""}${option.onUpdate ? ` on update ${renderAction(option.onUpdate)}` : ""}${option.deferrable ? ` deferrable${option.initiallyDeferred ? " initially deferred" : ""}` : ""}`
    }
    case "check":
      return `constraint ${quote(option.name)} check (${SchemaExpression.renderDdlExpressionSql(option.predicate)})${option.noInherit ? " no inherit" : ""}`
  }
}

const isKnownConstraintOption = (
  option: unknown
): option is Exclude<TableOptionSpec, { readonly kind: "index" }> => {
  if (typeof option !== "object" || option === null || !("kind" in option)) {
    return false
  }
  const hasValidName = (
    option as { readonly name?: unknown }
  ).name === undefined || typeof (option as { readonly name?: unknown }).name === "string"
  const hasStringColumns = (value: unknown): value is readonly string[] =>
    Array.isArray(value) && value.every((column) => typeof column === "string")
  switch ((option as { readonly kind?: unknown }).kind) {
    case "primaryKey":
    case "unique":
      return hasValidName && hasStringColumns((option as { readonly columns?: unknown }).columns)
    case "foreignKey": {
      if (!hasValidName || !hasStringColumns((option as { readonly columns?: unknown }).columns)) {
        return false
      }
      const references = (option as { readonly references?: unknown }).references
      if (typeof references !== "function") {
        return false
      }
      try {
        const reference = references()
        return typeof reference === "object" &&
          reference !== null &&
          typeof (reference as { readonly tableName?: unknown }).tableName === "string" &&
          ((reference as { readonly schemaName?: unknown }).schemaName === undefined ||
            typeof (reference as { readonly schemaName?: unknown }).schemaName === "string") &&
          hasStringColumns((reference as { readonly columns?: unknown }).columns)
      } catch {
        return false
      }
    }
    case "check":
      return hasValidName && typeof (option as { readonly predicate?: unknown }).predicate === "object"
    default:
      return false
  }
}

const isIndexKeySpec = (key: unknown): key is IndexKeySpec => {
  if (typeof key !== "object" || key === null || !("kind" in key)) {
    return false
  }
  if ((key as { readonly kind?: unknown }).kind === "column") {
    return typeof (key as { readonly column?: unknown }).column === "string"
  }
  if ((key as { readonly kind?: unknown }).kind === "expression") {
    return "expression" in key
  }
  return false
}

const indexKeysOf = (option: Extract<TableOptionSpec, { readonly kind: "index" }>): readonly IndexKeySpec[] => {
  if (Array.isArray(option.keys)) {
    return option.keys.filter(isIndexKeySpec)
  }
  if (Array.isArray(option.columns)) {
    return option.columns
      .filter((column): column is string => typeof column === "string")
      .map((column) => ({
        kind: "column" as const,
        column
      }))
  }
  return []
}

const renderIndexOrder = (order: unknown): string => {
  if (order === undefined) {
    return ""
  }
  if (order !== "asc" && order !== "desc") {
    throw new Error("Postgres index key order must be asc or desc")
  }
  return ` ${order}`
}

const renderIndexNulls = (nulls: unknown): string => {
  if (nulls === undefined) {
    return ""
  }
  if (nulls !== "first" && nulls !== "last") {
    throw new Error("Postgres index key nulls must be first or last")
  }
  return ` nulls ${nulls}`
}

const renderOptionalIndexPredicate = (predicate: unknown): string => {
  if (predicate === undefined) {
    return ""
  }
  try {
    return ` where ${SchemaExpression.renderDdlExpressionSql(predicate as never)}`
  } catch {
    return ""
  }
}

export const renderIndexDefinition = (
  table: TableModel,
  option: Extract<TableOptionSpec, { readonly kind: "index" }>
): string => {
  const keys = indexKeysOf(option)
  const includeColumns = Array.isArray(option.include)
    ? option.include.filter((column): column is string => typeof column === "string")
    : []
  const name = option.name ?? defaultIndexName(
    table.name,
    keys.map((key) => key.kind === "column" ? key.column : "expr"),
    option.unique ?? false
  )
  const renderedKeys = keys.map((key) => {
    const base = key.kind === "column"
      ? quote(key.column)
      : `(${SchemaExpression.renderDdlExpressionSql(key.expression)})`
    return `${base}${key.collation ? ` collate ${qualifyIdentifier(key.collation)}` : ""}${key.operatorClass ? ` ${qualifyIdentifier(key.operatorClass)}` : ""}${renderIndexOrder(key.order)}${renderIndexNulls(key.nulls)}`
  }).join(", ")
  return `create${option.unique ? " unique" : ""} index ${quote(name)} on ${qualify(table.schemaName, table.name)}${renderIndexMethod(option.method)} (${renderedKeys})${includeColumns.length > 0 ? ` include (${includeColumns.map(quote).join(", ")})` : ""}${renderOptionalIndexPredicate(option.predicate)}`
}

export const renderCreateTable = (table: TableModel): string => {
  const definitions = [
    ...table.columns.map(renderColumnDefinition),
    ...(table.options as readonly unknown[])
      .filter(isKnownConstraintOption)
      .map((option) => renderConstraint(table, option))
  ]
  return `create table ${qualify(table.schemaName, table.name)} (${definitions.join(", ")})`
}

export const renderCreateEnum = (enumType: EnumModel): string =>
  `create type ${qualify(enumType.schemaName, enumType.name)} as enum (${enumType.values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ")})`

export const renderDropEnum = (enumType: EnumModel): string =>
  `drop type ${qualify(enumType.schemaName, enumType.name)}`

export const renderRenameEnum = (
  enumType: EnumModel,
  nextName: string
): string =>
  `alter type ${qualify(enumType.schemaName, enumType.name)} rename to ${quote(nextName)}`

export const renderDropTable = (table: TableModel): string =>
  `drop table ${qualify(table.schemaName, table.name)}`

export const renderRenameTable = (
  table: TableModel,
  nextName: string
): string =>
  `alter table ${qualify(table.schemaName, table.name)} rename to ${quote(nextName)}`

export const renderRenameColumn = (
  table: TableModel,
  column: string,
  nextName: string
): string =>
  `alter table ${qualify(table.schemaName, table.name)} rename column ${quote(column)} to ${quote(nextName)}`

export const renderRenameConstraint = (
  table: TableModel,
  name: string,
  nextName: string
): string =>
  `alter table ${qualify(table.schemaName, table.name)} rename constraint ${quote(name)} to ${quote(nextName)}`

export const renderRenameIndex = (
  table: TableModel,
  name: string,
  nextName: string
): string =>
  `alter index ${qualify(table.schemaName, name)} rename to ${quote(nextName)}`

export const renderAddColumn = (table: TableModel, column: ColumnModel): string =>
  `alter table ${qualify(table.schemaName, table.name)} add column ${renderColumnDefinition(column)}`

export const renderDropColumn = (table: TableModel, column: ColumnModel): string =>
  `alter table ${qualify(table.schemaName, table.name)} drop column ${quote(column.name)}`

export const renderAddConstraint = (
  table: TableModel,
  option: Exclude<TableOptionSpec, { readonly kind: "index" }>
): string =>
  `alter table ${qualify(table.schemaName, table.name)} add ${renderConstraint(table, {
    ...option,
    name: option.name ?? defaultConstraintName(table, option)
  })}`

export const renderDropConstraint = (
  table: TableModel,
  option: Exclude<TableOptionSpec, { readonly kind: "index" }>
): string =>
  `alter table ${qualify(table.schemaName, table.name)} drop constraint ${quote(option.name ?? defaultConstraintName(table, option))}`

export const renderDropIndex = (
  table: TableModel,
  option: Extract<TableOptionSpec, { readonly kind: "index" }>
): string => {
  const keys = indexKeysOf(option)
  const name = option.name ?? defaultIndexName(
    table.name,
    keys.map((key) => key.kind === "column" ? key.column : "expr"),
    option.unique ?? false
  )
  return `drop index ${qualify(table.schemaName, name)}`
}
