import type { ColumnModel, EnumModel, TableModel } from "effect-qb/postgres/metadata"
import { SchemaExpression } from "effect-qb/postgres"
import type { IndexKeySpec, ReferentialAction, TableOptionSpec } from "effect-qb/postgres/metadata"

const quote = (value: string): string =>
  `"${value.replaceAll("\"", "\"\"")}"`

const qualify = (schemaName: string | undefined, name: string): string =>
  `${quote(schemaName ?? "public")}.${quote(name)}`

const renderAction = (action: ReferentialAction): string => {
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

const indexKeysOf = (option: Extract<TableOptionSpec, { readonly kind: "index" }>): readonly IndexKeySpec[] =>
  option.keys ?? (option.columns ?? []).map((column) => ({
    kind: "column" as const,
    column
  }))

export const renderIndexDefinition = (
  table: TableModel,
  option: Extract<TableOptionSpec, { readonly kind: "index" }>
): string => {
  const keys = indexKeysOf(option)
  const name = option.name ?? defaultIndexName(
    table.name,
    keys.map((key) => key.kind === "column" ? key.column : "expr"),
    option.unique ?? false
  )
  const renderedKeys = keys.map((key) => {
    const base = key.kind === "column"
      ? quote(key.column)
      : `(${SchemaExpression.renderDdlExpressionSql(key.expression)})`
    return `${base}${key.order ? ` ${key.order}` : ""}${key.nulls ? ` nulls ${key.nulls}` : ""}`
  }).join(", ")
  return `create${option.unique ? " unique" : ""} index ${quote(name)} on ${qualify(table.schemaName, table.name)}${option.method ? ` using ${option.method}` : ""} (${renderedKeys})${option.include && option.include.length > 0 ? ` include (${option.include.map(quote).join(", ")})` : ""}${option.predicate ? ` where ${SchemaExpression.renderDdlExpressionSql(option.predicate)}` : ""}`
}

export const renderCreateTable = (table: TableModel): string => {
  const definitions = [
    ...table.columns.map(renderColumnDefinition),
    ...table.options
      .filter((option): option is Exclude<TableOptionSpec, { readonly kind: "index" }> => option.kind !== "index")
      .map((option) => renderConstraint(table, option))
  ]
  return `create table ${qualify(table.schemaName, table.name)} (${definitions.join(", ")})`
}

export const renderCreateEnum = (enumType: EnumModel): string =>
  `create type ${qualify(enumType.schemaName, enumType.name)} as enum (${enumType.values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ")})`

export const renderDropEnum = (enumType: EnumModel): string =>
  `drop type ${qualify(enumType.schemaName, enumType.name)}`

export const renderDropTable = (table: TableModel): string =>
  `drop table ${qualify(table.schemaName, table.name)}`

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
