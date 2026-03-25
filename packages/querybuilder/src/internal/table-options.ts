import {
  BoundColumnTypeId,
  type AnyBoundColumn,
  type AnyColumnDefinition,
  type IsNullable
} from "./column-state.js"
import type { Any as AnyExpression } from "./expression.js"
import type { Any as AnySchemaExpression } from "./schema-expression.js"
import type { TableFieldMap } from "./schema-derivation.js"

/** Non-empty list of column names. */
export type ColumnList = readonly [string, ...string[]]

export type DdlExpressionLike = AnyExpression | AnySchemaExpression

export type ReferentialAction = "noAction" | "restrict" | "cascade" | "setNull" | "setDefault"

export type IndexKeySpec =
  | {
      readonly kind: "column"
      readonly column: string
      readonly order?: "asc" | "desc"
      readonly nulls?: "first" | "last"
    }
  | {
      readonly kind: "expression"
      readonly expression: DdlExpressionLike
      readonly order?: "asc" | "desc"
      readonly nulls?: "first" | "last"
    }

/** Normalized table-level option record. */
export type TableOptionSpec =
  | {
      readonly kind: "index"
      readonly columns?: ColumnList
      readonly name?: string
      readonly unique?: boolean
      readonly method?: string
      readonly include?: readonly string[]
      readonly predicate?: DdlExpressionLike
      readonly keys?: readonly [IndexKeySpec, ...IndexKeySpec[]]
    }
  | {
      readonly kind: "unique"
      readonly columns: ColumnList
      readonly name?: string
      readonly nullsNotDistinct?: boolean
      readonly deferrable?: boolean
      readonly initiallyDeferred?: boolean
    }
  | {
      readonly kind: "primaryKey"
      readonly columns: ColumnList
      readonly name?: string
      readonly deferrable?: boolean
      readonly initiallyDeferred?: boolean
    }
  | {
      readonly kind: "foreignKey"
      readonly columns: ColumnList
      readonly name?: string
      readonly references: () => {
        readonly tableName: string
        readonly schemaName?: string
        readonly columns: ColumnList
        readonly knownColumns?: readonly string[]
      }
      readonly onUpdate?: ReferentialAction
      readonly onDelete?: ReferentialAction
      readonly deferrable?: boolean
      readonly initiallyDeferred?: boolean
    }
  | {
      readonly kind: "check"
      readonly name: string
      readonly predicate: DdlExpressionLike
      readonly noInherit?: boolean
    }

/** Thin wrapper used by the public `Table.*` option builders. */
export interface TableOptionBuilder<Spec extends TableOptionSpec = TableOptionSpec> {
  readonly option: Spec
}

/** Collection of declared table options. */
export type DeclaredTableOptions = readonly TableOptionBuilder[]

type ColumnNameUnion<Fields extends TableFieldMap> = Extract<keyof Fields, string>
type NullableColumnNames<Fields extends TableFieldMap> = {
  [K in keyof Fields]: Fields[K] extends AnyColumnDefinition
    ? IsNullable<Fields[K]> extends true ? K : never
    : never
}[keyof Fields]

type TupleFromColumns<Columns> = Columns extends readonly [infer Head extends string, ...infer Tail extends string[]]
  ? readonly [Head, ...Tail]
  : Columns extends readonly string[]
    ? Columns extends readonly [string, ...string[]]
      ? Columns
      : never
    : Columns extends string
      ? readonly [Columns]
      : never

type AssertKnownColumns<Fields extends TableFieldMap, Columns extends readonly string[]> = Exclude<
  Columns[number],
  ColumnNameUnion<Fields>
> extends never
  ? Columns
  : never

type AssertPrimaryKeyColumns<
  Fields extends TableFieldMap,
  Columns extends readonly string[]
> = Extract<Columns[number], NullableColumnNames<Fields>> extends never
  ? Columns
  : never

type InlinePrimaryKeyKeys<Fields extends TableFieldMap> = Extract<{
  [K in keyof Fields]: Fields[K] extends AnyColumnDefinition
    ? Fields[K]["metadata"]["primaryKey"] extends true ? K : never
    : never
}[keyof Fields], string>

/** Normalizes a string or tuple input into a non-empty column list. */
export const normalizeColumnList = (columns: string | readonly string[]): ColumnList => {
  const normalized = Array.isArray(columns) ? [...columns] : [columns]
  if (normalized.length === 0) {
    throw new Error("Table options require at least one column")
  }
  return normalized as unknown as ColumnList
}

/** Converts inline column flags into normalized table option records. */
export const collectInlineOptions = <Fields extends TableFieldMap>(
  fields: Fields
): readonly TableOptionSpec[] => {
  const options: TableOptionSpec[] = []
  for (const [columnName, column] of Object.entries(fields)) {
    if (column.metadata.primaryKey) {
      options.push({
        kind: "primaryKey",
        columns: [columnName]
      })
    }
    if (column.metadata.unique && !column.metadata.primaryKey) {
      options.push({
        kind: "unique",
        columns: [columnName]
      })
    }
    if (column.metadata.references) {
      const local = [columnName] as ColumnList
      options.push({
        kind: "foreignKey",
        columns: local,
        references: () => {
          const targetColumn = column.metadata.references.target() as AnyBoundColumn
          const bound = targetColumn[BoundColumnTypeId]
          return {
            tableName: bound.baseTableName,
            schemaName: bound.schemaName,
            columns: [bound.columnName]
          }
        }
      })
    }
  }
  return options
}

/** Resolves the effective primary-key columns for a table. */
export const resolvePrimaryKeyColumns = <Fields extends TableFieldMap>(
  fields: Fields,
  declaredOptions: readonly TableOptionSpec[]
): readonly (keyof Fields & string)[] => {
  const inline = Object.entries(fields)
    .filter(([, column]) => column.metadata.primaryKey)
    .map(([key]) => key) as (keyof Fields & string)[]
  const explicit = declaredOptions
    .filter((option) => option.kind === "primaryKey")
    .map((option) => option.columns)
  if (explicit.length > 1) {
    throw new Error("Only one primary key declaration is allowed")
  }
  if (explicit.length === 0) {
    return inline
  }
  const tablePrimaryKey = [...explicit[0]!] as (keyof Fields & string)[]
  if (inline.length > 0) {
    const same =
      inline.length === tablePrimaryKey.length &&
      inline.every((column) => tablePrimaryKey.includes(column))
    if (!same) {
      throw new Error("Inline primary keys conflict with table-level primary key declaration")
    }
  }
  return tablePrimaryKey
}

/** Validates that options reference known, legal columns for the table. */
export const validateOptions = <Fields extends TableFieldMap>(
  tableName: string,
  fields: Fields,
  options: readonly TableOptionSpec[]
): void => {
  const knownColumns = new Set(Object.keys(fields))
  for (const option of options) {
    switch (option.kind) {
      case "index":
      case "primaryKey":
      case "unique":
      case "foreignKey": {
        const columns = option.kind === "index"
          ? option.columns ?? []
          : option.columns
        if (columns.length === 0 && option.kind !== "index") {
          throw new Error(`Option '${option.kind}' on table '${tableName}' requires at least one column`)
        }
        for (const column of columns) {
          if (!knownColumns.has(column)) {
            throw new Error(`Unknown column '${column}' on table '${tableName}'`)
          }
        }
        if (option.kind === "foreignKey") {
          const reference = option.references()
          if (reference.columns.length !== columns.length) {
            throw new Error(`Foreign key on table '${tableName}' must reference the same number of columns`)
          }
          if (reference.knownColumns) {
            const referenced = new Set(reference.knownColumns)
            for (const column of reference.columns) {
              if (!referenced.has(column)) {
                throw new Error(`Unknown referenced column '${column}' on table '${reference.tableName}'`)
              }
            }
          }
        }
        if (option.kind === "index") {
          for (const column of option.include ?? []) {
            if (!knownColumns.has(column)) {
              throw new Error(`Unknown included column '${column}' on table '${tableName}'`)
            }
          }
          for (const key of option.keys ?? []) {
            if (key.kind === "column" && !knownColumns.has(key.column)) {
              throw new Error(`Unknown index key column '${key.column}' on table '${tableName}'`)
            }
          }
          if (option.columns === undefined && (option.keys === undefined || option.keys.length === 0)) {
            throw new Error(`Index on table '${tableName}' requires at least one column or key`)
          }
        }
        break
      }
      case "check": {
        break
      }
    }
  }
  for (const column of resolvePrimaryKeyColumns(fields, options)) {
    if (fields[column]!.metadata.nullable) {
      throw new Error(`Primary key column '${String(column)}' cannot be nullable`)
    }
  }
}

/** Compile-time validation that option columns exist on the table. */
export type ValidateKnownColumns<
  Fields extends TableFieldMap,
  Columns extends readonly string[]
> = AssertKnownColumns<Fields, Columns>

/** Compile-time validation that primary-key columns are known and non-nullable. */
export type ValidatePrimaryKeyColumns<
  Fields extends TableFieldMap,
  Columns extends readonly string[]
> = AssertPrimaryKeyColumns<Fields, AssertKnownColumns<Fields, Columns>>

/** Normalizes a public column input into the internal tuple form. */
export type NormalizeColumns<Columns extends string | readonly string[]> = TupleFromColumns<Columns>
