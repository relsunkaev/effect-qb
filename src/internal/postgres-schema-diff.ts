import type { ColumnModel, EnumModel, SchemaModel, TableModel } from "./postgres-schema-model.js"
import { enumKey, tableKey } from "./postgres-schema-model.js"
import {
  defaultConstraintName,
  defaultIndexName,
  renderAddColumn,
  renderAddConstraint,
  renderCreateEnum,
  renderCreateTable,
  renderDropColumn,
  renderDropConstraint,
  renderDropEnum,
  renderDropIndex,
  renderDropTable,
  renderIndexDefinition
} from "./postgres-schema-sql.js"
import { renderDdlExpressionSql } from "./schema-ddl.js"
import type { IndexKeySpec, TableOptionSpec } from "./table-options.js"

export interface SchemaChange {
  readonly kind:
    | "createSchema"
    | "createEnum"
    | "alterEnumAddValue"
    | "dropEnum"
    | "createTable"
    | "dropTable"
    | "addColumn"
    | "dropColumn"
    | "addConstraint"
    | "dropConstraint"
    | "createIndex"
    | "dropIndex"
    | "manual"
  readonly key: string
  readonly summary: string
  readonly sql?: string
  readonly safe: boolean
  readonly destructive: boolean
}

export interface SchemaPlan {
  readonly changes: readonly SchemaChange[]
  readonly safeChanges: readonly SchemaChange[]
  readonly unsafeChanges: readonly SchemaChange[]
  readonly executableChanges: readonly SchemaChange[]
  readonly manualChanges: readonly SchemaChange[]
}

const normalizeSql = (value: string | undefined): string | undefined =>
  value?.trim().replace(/\s+/g, " ")

const normalizeType = (value: string): string =>
  normalizeSql(value)?.toLowerCase() ?? value.toLowerCase()

const schemaNamesOf = (model: SchemaModel): Set<string> => {
  const schemas = new Set<string>()
  for (const enumType of model.enums) {
    schemas.add(enumType.schemaName ?? "public")
  }
  for (const table of model.tables) {
    schemas.add(table.schemaName ?? "public")
  }
  return schemas
}

const quoteLiteral = (value: string): string =>
  `'${value.replaceAll("'", "''")}'`

const effectiveConstraintName = (
  table: TableModel,
  option: Exclude<TableOptionSpec, { readonly kind: "index" }>
): string => option.name ?? defaultConstraintName(table, option)

const indexKeysOf = (
  option: Extract<TableOptionSpec, { readonly kind: "index" }>
): readonly IndexKeySpec[] =>
  option.keys ?? (option.columns ?? []).map((column) => ({
    kind: "column" as const,
    column
  }))

const effectiveIndexName = (
  table: TableModel,
  option: Extract<TableOptionSpec, { readonly kind: "index" }>
): string =>
  option.name ?? defaultIndexName(
    table.name,
    indexKeysOf(option).map((key) => key.kind === "column" ? key.column : "expr"),
    option.unique ?? false
  )

const columnSignature = (column: ColumnModel): string =>
  JSON.stringify({
    ddlType: normalizeType(column.ddlType),
    dbTypeKind: column.dbTypeKind,
    nullable: column.nullable,
    hasDefault: column.hasDefault,
    generated: column.generated,
    defaultSql: normalizeSql(column.defaultSql) ?? null,
    generatedSql: normalizeSql(column.generatedSql) ?? null,
    identity: column.identity ?? null
  })

const constraintSignature = (
  table: TableModel,
  option: Exclude<TableOptionSpec, { readonly kind: "index" }>
): string => {
  switch (option.kind) {
    case "primaryKey":
      return JSON.stringify({
        kind: option.kind,
        name: effectiveConstraintName(table, option),
        columns: option.columns,
        deferrable: option.deferrable ?? false,
        initiallyDeferred: option.initiallyDeferred ?? false
      })
    case "unique":
      return JSON.stringify({
        kind: option.kind,
        name: effectiveConstraintName(table, option),
        columns: option.columns,
        nullsNotDistinct: option.nullsNotDistinct ?? false,
        deferrable: option.deferrable ?? false,
        initiallyDeferred: option.initiallyDeferred ?? false
      })
    case "foreignKey": {
      const reference = option.references()
      return JSON.stringify({
        kind: option.kind,
        name: effectiveConstraintName(table, option),
        columns: option.columns,
        referencedSchemaName: reference.schemaName ?? "public",
        referencedTableName: reference.tableName,
        referencedColumns: reference.columns,
        onUpdate: option.onUpdate ?? null,
        onDelete: option.onDelete ?? null,
        deferrable: option.deferrable ?? false,
        initiallyDeferred: option.initiallyDeferred ?? false
      })
    }
    case "check":
      return JSON.stringify({
        kind: option.kind,
        name: effectiveConstraintName(table, option),
        predicate: renderDdlExpressionSql(option.predicate),
        noInherit: option.noInherit ?? false
      })
  }
}

const indexSignature = (
  table: TableModel,
  option: Extract<TableOptionSpec, { readonly kind: "index" }>
): string =>
  JSON.stringify({
    kind: option.kind,
    name: effectiveIndexName(table, option),
    unique: option.unique ?? false,
    method: option.method ?? null,
    include: option.include ?? [],
    predicate: option.predicate ? renderDdlExpressionSql(option.predicate) : null,
    keys: indexKeysOf(option).map((key) => key.kind === "column"
      ? {
          kind: key.kind,
          column: key.column,
          order: key.order ?? null,
          nulls: key.nulls ?? null
        }
      : {
          kind: key.kind,
          expression: renderDdlExpressionSql(key.expression),
          order: key.order ?? null,
          nulls: key.nulls ?? null
        })
  })

const isSafeColumnAddition = (column: ColumnModel): boolean =>
  column.nullable || column.hasDefault || column.generated || column.identity !== undefined

const isSafeConstraintAddition = (
  option: Exclude<TableOptionSpec, { readonly kind: "index" }>
): boolean =>
  option.kind === "check"
    ? false
    : option.kind === "foreignKey"
      ? false
      : option.kind === "unique"
        ? false
        : false

const makeChange = (change: SchemaChange): SchemaChange => change

const diffEnum = (
  sourceEnum: EnumModel,
  dbEnum: EnumModel | undefined
): readonly SchemaChange[] => {
  const key = enumKey(sourceEnum.schemaName, sourceEnum.name)
  if (dbEnum === undefined) {
    return [makeChange({
      kind: "createEnum",
      key,
      summary: `create enum ${key}`,
      sql: renderCreateEnum(sourceEnum),
      safe: true,
      destructive: false
    })]
  }
  const sharedPrefix = dbEnum.values.every((value, index) => sourceEnum.values[index] === value)
  if (sharedPrefix && sourceEnum.values.length > dbEnum.values.length) {
    return sourceEnum.values
      .slice(dbEnum.values.length)
      .map((value) =>
        makeChange({
          kind: "alterEnumAddValue",
          key,
          summary: `add enum value ${quoteLiteral(value)} to ${key}`,
          sql: `alter type "${sourceEnum.schemaName ?? "public"}"."${sourceEnum.name}" add value if not exists ${quoteLiteral(value)}`,
          safe: true,
          destructive: false
        }))
  }
  if (sharedPrefix && sourceEnum.values.length === dbEnum.values.length) {
    return []
  }
  return [makeChange({
    kind: "manual",
    key,
    summary: `manual enum migration required for ${key}`,
    safe: false,
    destructive: true
  })]
}

const filterConstraints = (
  table: TableModel
): readonly Exclude<TableOptionSpec, { readonly kind: "index" }>[] =>
  table.options.filter((option): option is Exclude<TableOptionSpec, { readonly kind: "index" }> => option.kind !== "index")

const filterIndexes = (
  table: TableModel
): readonly Extract<TableOptionSpec, { readonly kind: "index" }>[] =>
  table.options.filter((option): option is Extract<TableOptionSpec, { readonly kind: "index" }> => option.kind === "index")

const diffExistingTable = (
  sourceTable: TableModel,
  dbTable: TableModel
): readonly SchemaChange[] => {
  const changes: SchemaChange[] = []
  const key = tableKey(sourceTable.schemaName, sourceTable.name)

  const dbColumns = new Map(dbTable.columns.map((column) => [column.name, column]))
  const sourceColumns = new Map(sourceTable.columns.map((column) => [column.name, column]))

  for (const column of dbTable.columns) {
    if (!sourceColumns.has(column.name)) {
      changes.push(makeChange({
        kind: "dropColumn",
        key: `${key}.${column.name}`,
        summary: `drop column ${key}.${column.name}`,
        sql: renderDropColumn(dbTable, column),
        safe: false,
        destructive: true
      }))
    }
  }

  for (const column of sourceTable.columns) {
    const dbColumn = dbColumns.get(column.name)
    if (dbColumn === undefined) {
      changes.push(makeChange({
        kind: "addColumn",
        key: `${key}.${column.name}`,
        summary: `add column ${key}.${column.name}`,
        sql: renderAddColumn(sourceTable, column),
        safe: isSafeColumnAddition(column),
        destructive: false
      }))
      continue
    }
    if (columnSignature(column) !== columnSignature(dbColumn)) {
      changes.push(makeChange({
        kind: "dropColumn",
        key: `${key}.${column.name}`,
        summary: `replace column ${key}.${column.name} (drop)`,
        sql: renderDropColumn(dbTable, dbColumn),
        safe: false,
        destructive: true
      }))
      changes.push(makeChange({
        kind: "addColumn",
        key: `${key}.${column.name}`,
        summary: `replace column ${key}.${column.name} (add)`,
        sql: renderAddColumn(sourceTable, column),
        safe: false,
        destructive: true
      }))
    }
  }

  const dbConstraints = new Map(filterConstraints(dbTable).map((option) => [effectiveConstraintName(dbTable, option), option]))
  const sourceConstraints = new Map(filterConstraints(sourceTable).map((option) => [effectiveConstraintName(sourceTable, option), option]))

  for (const [name, option] of dbConstraints) {
    const next = sourceConstraints.get(name)
    if (next === undefined) {
      changes.push(makeChange({
        kind: "dropConstraint",
        key: `${key}.${name}`,
        summary: `drop constraint ${key}.${name}`,
        sql: renderDropConstraint(dbTable, option),
        safe: false,
        destructive: true
      }))
      continue
    }
    if (constraintSignature(dbTable, option) !== constraintSignature(sourceTable, next)) {
      changes.push(makeChange({
        kind: "dropConstraint",
        key: `${key}.${name}`,
        summary: `replace constraint ${key}.${name} (drop)`,
        sql: renderDropConstraint(dbTable, option),
        safe: false,
        destructive: true
      }))
      changes.push(makeChange({
        kind: "addConstraint",
        key: `${key}.${name}`,
        summary: `replace constraint ${key}.${name} (add)`,
        sql: renderAddConstraint(sourceTable, next),
        safe: false,
        destructive: true
      }))
    }
  }

  for (const [name, option] of sourceConstraints) {
    if (!dbConstraints.has(name)) {
      changes.push(makeChange({
        kind: "addConstraint",
        key: `${key}.${name}`,
        summary: `add constraint ${key}.${name}`,
        sql: renderAddConstraint(sourceTable, option),
        safe: isSafeConstraintAddition(option),
        destructive: false
      }))
    }
  }

  const dbIndexes = new Map(filterIndexes(dbTable).map((option) => [effectiveIndexName(dbTable, option), option]))
  const sourceIndexes = new Map(filterIndexes(sourceTable).map((option) => [effectiveIndexName(sourceTable, option), option]))

  for (const [name, option] of dbIndexes) {
    const next = sourceIndexes.get(name)
    if (next === undefined) {
      changes.push(makeChange({
        kind: "dropIndex",
        key: `${key}.${name}`,
        summary: `drop index ${key}.${name}`,
        sql: renderDropIndex(dbTable, option),
        safe: false,
        destructive: true
      }))
      continue
    }
    if (indexSignature(dbTable, option) !== indexSignature(sourceTable, next)) {
      changes.push(makeChange({
        kind: "dropIndex",
        key: `${key}.${name}`,
        summary: `replace index ${key}.${name} (drop)`,
        sql: renderDropIndex(dbTable, option),
        safe: false,
        destructive: true
      }))
      changes.push(makeChange({
        kind: "createIndex",
        key: `${key}.${name}`,
        summary: `replace index ${key}.${name} (create)`,
        sql: renderIndexDefinition(sourceTable, next),
        safe: false,
        destructive: true
      }))
    }
  }

  for (const [name, option] of sourceIndexes) {
    if (!dbIndexes.has(name)) {
      changes.push(makeChange({
        kind: "createIndex",
        key: `${key}.${name}`,
        summary: `create index ${key}.${name}`,
        sql: renderIndexDefinition(sourceTable, option),
        safe: true,
        destructive: false
      }))
    }
  }

  return changes
}

const orderChanges = (changes: readonly SchemaChange[]): readonly SchemaChange[] => {
  const order: Record<SchemaChange["kind"], number> = {
    createSchema: 0,
    createEnum: 1,
    alterEnumAddValue: 2,
    createTable: 3,
    dropConstraint: 4,
    dropIndex: 5,
    dropColumn: 6,
    addColumn: 7,
    addConstraint: 8,
    createIndex: 9,
    dropTable: 10,
    dropEnum: 11,
    manual: 12
  }
  return [...changes].sort((left, right) => {
    const delta = order[left.kind] - order[right.kind]
    return delta !== 0
      ? delta
      : left.key.localeCompare(right.key)
  })
}

export const planPostgresSchemaDiff = (
  source: SchemaModel,
  database: SchemaModel
): SchemaPlan => {
  const changes: SchemaChange[] = []

  const dbSchemas = schemaNamesOf(database)
  for (const schemaName of [...schemaNamesOf(source)].sort()) {
    if (!dbSchemas.has(schemaName)) {
      changes.push(makeChange({
        kind: "createSchema",
        key: schemaName,
        summary: `create schema ${schemaName}`,
        sql: `create schema if not exists "${schemaName}"`,
        safe: true,
        destructive: false
      }))
    }
  }

  const dbEnums = new Map(database.enums.map((enumType) => [enumKey(enumType.schemaName, enumType.name), enumType]))
  const sourceEnums = new Map(source.enums.map((enumType) => [enumKey(enumType.schemaName, enumType.name), enumType]))

  for (const enumType of source.enums) {
    changes.push(...diffEnum(enumType, dbEnums.get(enumKey(enumType.schemaName, enumType.name))))
  }
  for (const enumType of database.enums) {
    if (!sourceEnums.has(enumKey(enumType.schemaName, enumType.name))) {
      changes.push(makeChange({
        kind: "dropEnum",
        key: enumKey(enumType.schemaName, enumType.name),
        summary: `drop enum ${enumKey(enumType.schemaName, enumType.name)}`,
        sql: renderDropEnum(enumType),
        safe: false,
        destructive: true
      }))
    }
  }

  const dbTables = new Map(database.tables.map((table) => [tableKey(table.schemaName, table.name), table]))
  const sourceTables = new Map(source.tables.map((table) => [tableKey(table.schemaName, table.name), table]))

  for (const table of source.tables) {
    const key = tableKey(table.schemaName, table.name)
    const dbTable = dbTables.get(key)
    if (dbTable === undefined) {
      changes.push(makeChange({
        kind: "createTable",
        key,
        summary: `create table ${key}`,
        sql: renderCreateTable(table),
        safe: true,
        destructive: false
      }))
      for (const option of filterIndexes(table)) {
        changes.push(makeChange({
          kind: "createIndex",
          key: `${key}.${effectiveIndexName(table, option)}`,
          summary: `create index ${key}.${effectiveIndexName(table, option)}`,
          sql: renderIndexDefinition(table, option),
          safe: true,
          destructive: false
        }))
      }
      continue
    }
    changes.push(...diffExistingTable(table, dbTable))
  }

  for (const table of database.tables) {
    const key = tableKey(table.schemaName, table.name)
    if (!sourceTables.has(key)) {
      changes.push(makeChange({
        kind: "dropTable",
        key,
        summary: `drop table ${key}`,
        sql: renderDropTable(table),
        safe: false,
        destructive: true
      }))
    }
  }

  const ordered = orderChanges(changes)
  return {
    changes: ordered,
    safeChanges: ordered.filter((change) => change.safe),
    unsafeChanges: ordered.filter((change) => !change.safe),
    executableChanges: ordered.filter((change) => change.sql !== undefined),
    manualChanges: ordered.filter((change) => change.sql === undefined)
  }
}
