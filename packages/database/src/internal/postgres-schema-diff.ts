import type { ColumnModel, EnumModel, SchemaModel, TableModel, IndexKeySpec, TableOptionSpec } from "effect-qb/postgres/metadata"
import { enumKey, tableKey, normalizeDdlExpressionSql } from "effect-qb/postgres/metadata"
import { canonicalizePostgresTypeName } from "./postgres-type-utils.js"
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
  renderIndexDefinition,
  renderRenameColumn,
  renderRenameConstraint,
  renderRenameIndex,
  renderRenameEnum,
  renderRenameTable
} from "./postgres-schema-sql.js"

export interface SchemaChange {
  readonly kind:
    | "createSchema"
    | "createEnum"
    | "alterEnumAddValue"
    | "renameEnum"
    | "dropEnum"
    | "createTable"
    | "renameTable"
    | "dropTable"
    | "addColumn"
    | "renameColumn"
    | "dropColumn"
    | "addConstraint"
    | "renameConstraint"
    | "dropConstraint"
    | "createIndex"
    | "renameIndex"
    | "dropIndex"
    | "manual"
  readonly key: string
  readonly summary: string
  readonly sql?: string
  readonly rollbackSql?: string
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
    ddlType: canonicalizePostgresTypeName(column.ddlType),
    dbTypeKind: canonicalizePostgresTypeName(column.dbTypeKind),
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
        predicate: normalizeDdlExpressionSql(option.predicate),
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
    predicate: option.predicate ? normalizeDdlExpressionSql(option.predicate) : null,
    keys: indexKeysOf(option).map((key) => key.kind === "column"
      ? {
          kind: key.kind,
          column: key.column,
          order: key.order ?? null,
          nulls: key.nulls ?? null
        }
      : {
          kind: key.kind,
          expression: normalizeDdlExpressionSql(key.expression),
          order: key.order ?? null,
          nulls: key.nulls ?? null
      })
  })

const constraintShapeSignature = (
  option: Exclude<TableOptionSpec, { readonly kind: "index" }>
): string => {
  switch (option.kind) {
    case "primaryKey":
      return JSON.stringify({
        kind: option.kind,
        columns: option.columns,
        deferrable: option.deferrable ?? false,
        initiallyDeferred: option.initiallyDeferred ?? false
      })
    case "unique":
      return JSON.stringify({
        kind: option.kind,
        columns: option.columns,
        nullsNotDistinct: option.nullsNotDistinct ?? false,
        deferrable: option.deferrable ?? false,
        initiallyDeferred: option.initiallyDeferred ?? false
      })
    case "foreignKey": {
      const reference = option.references()
      return JSON.stringify({
        kind: option.kind,
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
        predicate: normalizeDdlExpressionSql(option.predicate),
        noInherit: option.noInherit ?? false
      })
  }
}

const indexShapeSignature = (
  option: Extract<TableOptionSpec, { readonly kind: "index" }>
): string =>
  JSON.stringify({
    kind: option.kind,
    unique: option.unique ?? false,
    method: option.method ?? null,
    include: option.include ?? [],
    predicate: option.predicate ? normalizeDdlExpressionSql(option.predicate) : null,
    keys: indexKeysOf(option).map((key) => key.kind === "column"
      ? {
          kind: key.kind,
          column: key.column,
          order: key.order ?? null,
          nulls: key.nulls ?? null
        }
      : {
          kind: key.kind,
          expression: normalizeDdlExpressionSql(key.expression),
          order: key.order ?? null,
          nulls: key.nulls ?? null
      })
  })

const tableShapeSignature = (table: TableModel): string =>
  JSON.stringify({
    schemaName: table.schemaName ?? "public",
    columns: table.columns.map((column) => columnSignature(column)),
    options: table.options.map((option) =>
      option.kind === "index"
        ? indexShapeSignature(option)
        : constraintShapeSignature(option))
      .sort()
  })

const isSafeColumnAddition = (column: ColumnModel): boolean =>
  column.nullable || column.hasDefault || column.generated || column.identity !== undefined

const isSafeConstraintAddition = (
  option: Exclude<TableOptionSpec, { readonly kind: "index" }>
): boolean =>
  option.kind === "primaryKey" ||
  option.kind === "unique" ||
  option.kind === "foreignKey" ||
  option.kind === "check"

const makeChange = (change: SchemaChange): SchemaChange => change

const pairUniqueBySignature = <Source, Db>(
  sourceItems: readonly Source[],
  dbItems: readonly Db[],
  sourceSignatureOf: (item: Source) => string,
  dbSignatureOf: (item: Db) => string
): readonly { readonly source: Source; readonly db: Db }[] => {
  const sourceBySignature = new Map<string, Source[]>()
  for (const item of sourceItems) {
    const signature = sourceSignatureOf(item)
    const list = sourceBySignature.get(signature) ?? []
    list.push(item)
    sourceBySignature.set(signature, list)
  }
  const dbBySignature = new Map<string, Db[]>()
  for (const item of dbItems) {
    const signature = dbSignatureOf(item)
    const list = dbBySignature.get(signature) ?? []
    list.push(item)
    dbBySignature.set(signature, list)
  }
  const pairs: Array<{ readonly source: Source; readonly db: Db }> = []
  for (const [signature, source] of sourceBySignature) {
    const db = dbBySignature.get(signature)
    if (source.length === 1 && db?.length === 1) {
      pairs.push({
        source: source[0]!,
        db: db[0]!
      })
    }
  }
  return pairs
}

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
      rollbackSql: renderDropEnum(sourceEnum),
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

const enumShapeSignature = (enumType: EnumModel): string =>
  JSON.stringify({
    schemaName: enumType.schemaName ?? "public",
    values: enumType.values
  })

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
  const matchedDbColumns = new Set<string>()
  const matchedSourceColumns = new Set<string>()

  for (const { source, db } of pairUniqueBySignature(
    sourceTable.columns.filter((column) => !dbColumns.has(column.name)),
    dbTable.columns.filter((column) => !sourceColumns.has(column.name)),
    columnSignature,
    columnSignature
  )) {
    matchedDbColumns.add(db.name)
    matchedSourceColumns.add(source.name)
    if (db.name !== source.name) {
      changes.push(makeChange({
        kind: "renameColumn",
        key: `${key}.${db.name}`,
        summary: `rename column ${key}.${db.name} to ${source.name}`,
        sql: renderRenameColumn(sourceTable, db.name, source.name),
        rollbackSql: renderRenameColumn(sourceTable, source.name, db.name),
        safe: true,
        destructive: false
      }))
    }
  }

  for (const column of dbTable.columns) {
    if (matchedDbColumns.has(column.name)) {
      continue
    }
    if (!sourceColumns.has(column.name)) {
      changes.push(makeChange({
        kind: "dropColumn",
        key: `${key}.${column.name}`,
        summary: `drop column ${key}.${column.name}`,
        sql: renderDropColumn(sourceTable, column),
        rollbackSql: renderAddColumn(sourceTable, column),
        safe: false,
        destructive: true
      }))
      continue
    }
    const sourceColumn = sourceColumns.get(column.name)!
    if (columnSignature(sourceColumn) !== columnSignature(column)) {
      changes.push(makeChange({
        kind: "dropColumn",
        key: `${key}.${column.name}`,
        summary: `replace column ${key}.${column.name} (drop)`,
        sql: renderDropColumn(sourceTable, column),
        rollbackSql: renderAddColumn(sourceTable, column),
        safe: false,
        destructive: true
      }))
      changes.push(makeChange({
        kind: "addColumn",
        key: `${key}.${column.name}`,
        summary: `replace column ${key}.${column.name} (add)`,
        sql: renderAddColumn(sourceTable, sourceColumn),
        rollbackSql: renderDropColumn(sourceTable, sourceColumn),
        safe: false,
        destructive: true
      }))
    }
  }

  for (const column of sourceTable.columns) {
    if (matchedSourceColumns.has(column.name)) {
      continue
    }
    const dbColumn = dbColumns.get(column.name)
    if (dbColumn === undefined) {
      changes.push(makeChange({
        kind: "addColumn",
        key: `${key}.${column.name}`,
        summary: `add column ${key}.${column.name}`,
        sql: renderAddColumn(sourceTable, column),
        rollbackSql: renderDropColumn(sourceTable, column),
        safe: isSafeColumnAddition(column),
        destructive: false
      }))
    }
  }

  const dbConstraints = new Map(filterConstraints(dbTable).map((option) => [effectiveConstraintName(dbTable, option), option]))
  const sourceConstraints = new Map(filterConstraints(sourceTable).map((option) => [effectiveConstraintName(sourceTable, option), option]))
  const matchedDbConstraints = new Set<string>()
  const matchedSourceConstraints = new Set<string>()

  for (const { source, db } of pairUniqueBySignature(
    filterConstraints(sourceTable).filter((option) => !dbConstraints.has(effectiveConstraintName(sourceTable, option))),
    filterConstraints(dbTable).filter((option) => !sourceConstraints.has(effectiveConstraintName(dbTable, option))),
    constraintShapeSignature,
    constraintShapeSignature
  )) {
    const sourceName = effectiveConstraintName(sourceTable, source)
    const dbName = effectiveConstraintName(dbTable, db)
    matchedDbConstraints.add(dbName)
    matchedSourceConstraints.add(sourceName)
    if (dbName !== sourceName) {
      changes.push(makeChange({
        kind: "renameConstraint",
        key: `${key}.${dbName}`,
        summary: `rename constraint ${key}.${dbName} to ${sourceName}`,
        sql: renderRenameConstraint(sourceTable, dbName, sourceName),
        rollbackSql: renderRenameConstraint(sourceTable, sourceName, dbName),
        safe: true,
        destructive: false
      }))
    }
  }

  for (const [name, option] of dbConstraints) {
    if (matchedDbConstraints.has(name)) {
      continue
    }
    const next = sourceConstraints.get(name)
    if (next === undefined) {
      changes.push(makeChange({
        kind: "dropConstraint",
        key: `${key}.${name}`,
        summary: `drop constraint ${key}.${name}`,
        sql: renderDropConstraint(sourceTable, option),
        rollbackSql: renderAddConstraint(sourceTable, option),
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
        sql: renderDropConstraint(sourceTable, option),
        rollbackSql: renderAddConstraint(sourceTable, option),
        safe: false,
        destructive: true
      }))
      changes.push(makeChange({
        kind: "addConstraint",
        key: `${key}.${name}`,
        summary: `replace constraint ${key}.${name} (add)`,
        sql: renderAddConstraint(sourceTable, next),
        rollbackSql: renderDropConstraint(sourceTable, next),
        safe: false,
        destructive: true
      }))
    }
  }

  for (const [name, option] of sourceConstraints) {
    if (matchedSourceConstraints.has(name)) {
      continue
    }
    if (!dbConstraints.has(name)) {
      changes.push(makeChange({
        kind: "addConstraint",
        key: `${key}.${name}`,
        summary: `add constraint ${key}.${name}`,
        sql: renderAddConstraint(sourceTable, option),
        rollbackSql: renderDropConstraint(sourceTable, option),
        safe: isSafeConstraintAddition(option),
        destructive: false
      }))
    }
  }

  const dbIndexes = new Map(filterIndexes(dbTable).map((option) => [effectiveIndexName(dbTable, option), option]))
  const sourceIndexes = new Map(filterIndexes(sourceTable).map((option) => [effectiveIndexName(sourceTable, option), option]))
  const matchedDbIndexes = new Set<string>()
  const matchedSourceIndexes = new Set<string>()

  for (const { source, db } of pairUniqueBySignature(
    filterIndexes(sourceTable).filter((option) => !dbIndexes.has(effectiveIndexName(sourceTable, option))),
    filterIndexes(dbTable).filter((option) => !sourceIndexes.has(effectiveIndexName(dbTable, option))),
    indexShapeSignature,
    indexShapeSignature
  )) {
    const sourceName = effectiveIndexName(sourceTable, source)
    const dbName = effectiveIndexName(dbTable, db)
    matchedDbIndexes.add(dbName)
    matchedSourceIndexes.add(sourceName)
    if (dbName !== sourceName) {
      changes.push(makeChange({
        kind: "renameIndex",
        key: `${key}.${dbName}`,
        summary: `rename index ${key}.${dbName} to ${sourceName}`,
        sql: renderRenameIndex(sourceTable, dbName, sourceName),
        rollbackSql: renderRenameIndex(sourceTable, sourceName, dbName),
        safe: true,
        destructive: false
      }))
    }
  }

  for (const [name, option] of dbIndexes) {
    if (matchedDbIndexes.has(name)) {
      continue
    }
    const next = sourceIndexes.get(name)
    if (next === undefined) {
      changes.push(makeChange({
        kind: "dropIndex",
        key: `${key}.${name}`,
        summary: `drop index ${key}.${name}`,
        sql: renderDropIndex(sourceTable, option),
        rollbackSql: renderIndexDefinition(sourceTable, option),
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
        sql: renderDropIndex(sourceTable, option),
        rollbackSql: renderIndexDefinition(sourceTable, option),
        safe: false,
        destructive: true
      }))
      changes.push(makeChange({
        kind: "createIndex",
        key: `${key}.${name}`,
        summary: `replace index ${key}.${name} (create)`,
        sql: renderIndexDefinition(sourceTable, next),
        rollbackSql: renderDropIndex(sourceTable, next),
        safe: false,
        destructive: true
      }))
    }
  }

  for (const [name, option] of sourceIndexes) {
    if (matchedSourceIndexes.has(name)) {
      continue
    }
    if (!dbIndexes.has(name)) {
      changes.push(makeChange({
        kind: "createIndex",
        key: `${key}.${name}`,
        summary: `create index ${key}.${name}`,
        sql: renderIndexDefinition(sourceTable, option),
        rollbackSql: renderDropIndex(sourceTable, option),
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
    renameEnum: 3,
    createTable: 4,
    renameTable: 5,
    renameColumn: 6,
    renameConstraint: 7,
    renameIndex: 8,
    dropConstraint: 9,
    dropIndex: 10,
    dropColumn: 11,
    addColumn: 12,
    addConstraint: 13,
    createIndex: 14,
    dropTable: 15,
    dropEnum: 16,
    manual: 17
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
        rollbackSql: `drop schema if exists "${schemaName}" cascade`,
        safe: true,
        destructive: false
      }))
    }
  }

  const dbEnums = new Map(database.enums.map((enumType) => [enumKey(enumType.schemaName, enumType.name), enumType]))
  const sourceEnums = new Map(source.enums.map((enumType) => [enumKey(enumType.schemaName, enumType.name), enumType]))
  const matchedDbEnumKeys = new Set<string>()
  const matchedSourceEnumKeys = new Set<string>()

  for (const enumType of source.enums) {
    const key = enumKey(enumType.schemaName, enumType.name)
    const dbEnum = dbEnums.get(key)
    if (dbEnum !== undefined) {
      matchedDbEnumKeys.add(key)
      matchedSourceEnumKeys.add(key)
      changes.push(...diffEnum(enumType, dbEnum))
    }
  }

  for (const { source: sourceEnum, db: dbEnum } of pairUniqueBySignature(
    source.enums.filter((enumType) => !dbEnums.has(enumKey(enumType.schemaName, enumType.name))),
    database.enums.filter((enumType) => !sourceEnums.has(enumKey(enumType.schemaName, enumType.name))),
    enumShapeSignature,
    enumShapeSignature
  )) {
    const sourceKey = enumKey(sourceEnum.schemaName, sourceEnum.name)
    const dbKey = enumKey(dbEnum.schemaName, dbEnum.name)
    matchedSourceEnumKeys.add(sourceKey)
    matchedDbEnumKeys.add(dbKey)
    if (sourceKey !== dbKey) {
      changes.push(makeChange({
        kind: "renameEnum",
        key: dbKey,
        summary: `rename enum ${dbKey} to ${sourceKey}`,
        sql: renderRenameEnum(dbEnum, sourceEnum.name),
        rollbackSql: renderRenameEnum(sourceEnum, dbEnum.name),
        safe: true,
        destructive: false
      }))
    }
  }

  for (const enumType of source.enums) {
    const key = enumKey(enumType.schemaName, enumType.name)
    if (matchedSourceEnumKeys.has(key) || dbEnums.has(key)) {
      continue
    }
    changes.push(makeChange({
      kind: "createEnum",
      key,
      summary: `create enum ${key}`,
      sql: renderCreateEnum(enumType),
      rollbackSql: renderDropEnum(enumType),
      safe: true,
      destructive: false
    }))
  }

  for (const enumType of database.enums) {
    const key = enumKey(enumType.schemaName, enumType.name)
    if (!matchedDbEnumKeys.has(key) && !sourceEnums.has(key)) {
      changes.push(makeChange({
        kind: "dropEnum",
        key,
        summary: `drop enum ${key}`,
        sql: renderDropEnum(enumType),
        rollbackSql: renderCreateEnum(enumType),
        safe: false,
        destructive: true
      }))
    }
  }

  const dbTables = new Map(database.tables.map((table) => [tableKey(table.schemaName, table.name), table]))
  const sourceTables = new Map(source.tables.map((table) => [tableKey(table.schemaName, table.name), table]))
  const matchedDbTableKeys = new Set<string>()
  const matchedSourceTableKeys = new Set<string>()

  for (const table of source.tables) {
    const key = tableKey(table.schemaName, table.name)
    const dbTable = dbTables.get(key)
    if (dbTable !== undefined) {
      matchedDbTableKeys.add(key)
      matchedSourceTableKeys.add(key)
      changes.push(...diffExistingTable(table, dbTable))
    }
  }

  for (const { source: sourceTable, db: dbTable } of pairUniqueBySignature(
    source.tables.filter((table) => !dbTables.has(tableKey(table.schemaName, table.name))),
    database.tables.filter((table) => !sourceTables.has(tableKey(table.schemaName, table.name))),
    tableShapeSignature,
    tableShapeSignature
  )) {
    const sourceKey = tableKey(sourceTable.schemaName, sourceTable.name)
    const dbKey = tableKey(dbTable.schemaName, dbTable.name)
    matchedDbTableKeys.add(dbKey)
    matchedSourceTableKeys.add(sourceKey)
    changes.push(makeChange({
      kind: "renameTable",
      key: dbKey,
      summary: `rename table ${dbKey} to ${sourceKey}`,
      sql: renderRenameTable(dbTable, sourceTable.name),
      rollbackSql: renderRenameTable(sourceTable, dbTable.name),
      safe: true,
      destructive: false
    }))
    changes.push(...diffExistingTable(sourceTable, dbTable))
  }

  for (const table of source.tables) {
    const key = tableKey(table.schemaName, table.name)
    if (matchedSourceTableKeys.has(key)) {
      continue
    }
    if (!dbTables.has(key)) {
      changes.push(makeChange({
        kind: "createTable",
        key,
        summary: `create table ${key}`,
        sql: renderCreateTable(table),
        rollbackSql: renderDropTable(table),
        safe: true,
        destructive: false
      }))
      for (const option of filterIndexes(table)) {
        changes.push(makeChange({
          kind: "createIndex",
          key: `${key}.${effectiveIndexName(table, option)}`,
          summary: `create index ${key}.${effectiveIndexName(table, option)}`,
          sql: renderIndexDefinition(table, option),
          rollbackSql: renderDropIndex(table, option),
          safe: true,
          destructive: false
        }))
      }
    }
  }

  for (const table of database.tables) {
    const key = tableKey(table.schemaName, table.name)
    if (!matchedDbTableKeys.has(key) && !sourceTables.has(key)) {
      changes.push(makeChange({
        kind: "dropTable",
        key,
        summary: `drop table ${key}`,
        sql: renderDropTable(table),
        rollbackSql: renderCreateTable(table),
        safe: false,
        destructive: true
      }))
      for (const option of filterIndexes(table)) {
        changes.push(makeChange({
          kind: "dropIndex",
          key: `${key}.${effectiveIndexName(table, option)}`,
          summary: `drop index ${key}.${effectiveIndexName(table, option)}`,
          sql: renderDropIndex(table, option),
          rollbackSql: renderIndexDefinition(table, option),
          safe: false,
          destructive: true
        }))
      }
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
