import {
  BoundColumnTypeId,
  type AnyBoundColumn,
  type AnyColumnDefinition,
  type IsNullable
} from "./column-state.js"
import type * as Casing from "./casing.js"
import type { Any as AnyExpression } from "./scalar.js"
import type { Any as AnySchemaExpression } from "./schema-expression.js"
import type { TableFieldMap } from "./schema-derivation.js"

/** Non-empty list of column names. */
export type ColumnList = readonly [string, ...string[]]

export type DdlExpressionLike = AnyExpression | AnySchemaExpression

export type ReferentialAction = "noAction" | "restrict" | "cascade" | "setNull" | "setDefault"

const referentialActionError = "Foreign key action must be noAction, restrict, cascade, setNull, or setDefault"

export const renderReferentialAction = (action: unknown): string => {
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
  throw new Error(referentialActionError)
}

const validateReferentialAction = (action: unknown): void => {
  if (action !== undefined) {
    renderReferentialAction(action)
  }
}

const requireColumnArray = (
  value: unknown,
  message: string
): readonly string[] => {
  if (!Array.isArray(value) || value.some((column) => typeof column !== "string" || column.length === 0)) {
    throw new Error(message)
  }
  return value
}

const requireOptionalColumnArray = (
  value: unknown,
  message: string
): readonly string[] =>
  value === undefined ? [] : requireColumnArray(value, message)

export type IndexKeySpec =
  | {
      readonly kind: "column"
      readonly column: string
      readonly order?: "asc" | "desc"
      readonly nulls?: "first" | "last"
      readonly operatorClass?: string
      readonly collation?: string
    }
  | {
      readonly kind: "expression"
      readonly expression: DdlExpressionLike
      readonly order?: "asc" | "desc"
      readonly nulls?: "first" | "last"
      readonly operatorClass?: string
      readonly collation?: string
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
        readonly casing?: Casing.Options
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

export type NonEmptyColumnInput<Columns extends string | readonly string[]> =
  TupleFromColumns<Columns> extends never ? never : Columns

export type MatchingColumnArityInput<
  Left extends string | readonly string[],
  Right extends string | readonly string[]
> = TupleFromColumns<Left>["length"] extends TupleFromColumns<Right>["length"]
  ? TupleFromColumns<Right>["length"] extends TupleFromColumns<Left>["length"]
    ? unknown
    : never
  : never

type AssertKnownColumns<Fields extends TableFieldMap, Columns extends readonly string[]> = Exclude<
  Columns[number],
  ColumnNameUnion<Fields>
> extends never
  ? Columns
  : never

type IndexKeyColumnNames<Keys> = Keys extends readonly (infer Key)[]
  ? Key extends { readonly kind: "column"; readonly column: infer Column extends string }
    ? Column
    : never
  : never

type IndexOptionColumnNames<Spec> =
  | (Spec extends { readonly columns: infer Columns extends readonly string[] } ? Columns[number] : never)
  | (Spec extends { readonly include: infer Include extends readonly string[] } ? Include[number] : never)
  | (Spec extends { readonly keys: infer Keys } ? IndexKeyColumnNames<Keys> : never)

type ForeignKeyReferencedColumnNames<Spec> = Spec extends { readonly references: () => infer Reference }
  ? Reference extends { readonly columns: infer Columns extends readonly string[] }
    ? Columns[number]
    : never
  : never

type ForeignKeyKnownReferencedColumnNames<Spec> = Spec extends { readonly references: () => infer Reference }
  ? Reference extends { readonly knownColumns: infer KnownColumns extends readonly string[] }
    ? KnownColumns[number]
    : string
  : string

type AssertKnownColumnNames<Fields extends TableFieldMap, Columns extends string> = [Columns] extends [never]
  ? true
  : string extends Columns
    ? true
    : Exclude<Columns, ColumnNameUnion<Fields>> extends never
      ? true
      : false

type AssertKnownReferenceColumnNames<KnownColumns extends string, Columns extends string> = [Columns] extends [never]
  ? true
  : string extends Columns
    ? true
    : string extends KnownColumns
      ? true
      : Exclude<Columns, KnownColumns> extends never
        ? true
        : false

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
        columns: [columnName],
        name: column.metadata.uniqueConstraint?.name,
        nullsNotDistinct: column.metadata.uniqueConstraint?.nullsNotDistinct,
        deferrable: column.metadata.uniqueConstraint?.deferrable,
        initiallyDeferred: column.metadata.uniqueConstraint?.initiallyDeferred
      })
    }
    if (column.metadata.references) {
      validateReferentialAction(column.metadata.references.onUpdate)
      validateReferentialAction(column.metadata.references.onDelete)
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
            casing: bound.casing,
            columns: [bound.columnName]
          }
        },
        name: column.metadata.references.name,
        onUpdate: column.metadata.references.onUpdate,
        onDelete: column.metadata.references.onDelete,
        deferrable: column.metadata.references.deferrable,
        initiallyDeferred: column.metadata.references.initiallyDeferred
      })
    }
    if (column.metadata.index) {
      options.push({
        kind: "index",
        keys: [{
          kind: "column",
          column: columnName,
          order: column.metadata.index.order,
          nulls: column.metadata.index.nulls,
          operatorClass: column.metadata.index.operatorClass,
          collation: column.metadata.index.collation
        }],
        name: column.metadata.index.name,
        method: column.metadata.index.method,
        include: column.metadata.index.include,
        predicate: column.metadata.index.predicate
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
          ? requireOptionalColumnArray(
            option.columns,
            `Option '${option.kind}' on table '${tableName}' requires a column array`
          )
          : requireColumnArray(
            option.columns,
            `Option '${option.kind}' on table '${tableName}' requires a column array`
          )
        if (columns.length === 0 && option.kind !== "index") {
          throw new Error(`Option '${option.kind}' on table '${tableName}' requires at least one column`)
        }
        for (const column of columns) {
          if (!knownColumns.has(column)) {
            throw new Error(`Unknown column '${column}' on table '${tableName}'`)
          }
        }
        if (option.kind === "foreignKey") {
          validateReferentialAction(option.onUpdate)
          validateReferentialAction(option.onDelete)
          if (typeof option.references !== "function") {
            throw new Error(`Foreign key on table '${tableName}' requires a reference resolver`)
          }
          const reference = option.references()
          if (typeof reference !== "object" || reference === null) {
            throw new Error(`Foreign key on table '${tableName}' requires a reference target`)
          }
          const referenceColumns = requireColumnArray(
            reference.columns,
            `Foreign key on table '${tableName}' requires referenced columns to be an array`
          )
          if (referenceColumns.length !== columns.length) {
            throw new Error(`Foreign key on table '${tableName}' must reference the same number of columns`)
          }
          if (reference.knownColumns) {
            if (!Array.isArray(reference.knownColumns)) {
              throw new Error(`Foreign key on table '${tableName}' requires known referenced columns to be an array`)
            }
            const referenced = new Set(reference.knownColumns)
            for (const column of referenceColumns) {
              if (!referenced.has(column)) {
                throw new Error(`Unknown referenced column '${column}' on table '${reference.tableName}'`)
              }
            }
          }
        }
        if (option.kind === "index") {
          const includedColumns = requireOptionalColumnArray(
            option.include,
            `Index on table '${tableName}' requires included columns to be an array`
          )
          for (const column of includedColumns) {
            if (!knownColumns.has(column)) {
              throw new Error(`Unknown included column '${column}' on table '${tableName}'`)
            }
          }
          if (option.keys !== undefined && !Array.isArray(option.keys)) {
            throw new Error(`Index on table '${tableName}' requires keys to be an array`)
          }
          const keys = option.keys ?? []
          for (const key of keys) {
            if (typeof key !== "object" || key === null || !("kind" in key)) {
              throw new Error(`Index on table '${tableName}' requires key metadata objects`)
            }
            if (key.kind === "column" && !knownColumns.has(key.column)) {
              throw new Error(`Unknown index key column '${key.column}' on table '${tableName}'`)
            }
          }
          if (columns.length === 0 && keys.length === 0) {
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

/** Compile-time validation that index columns, included columns, and column keys exist on the table. */
export type ValidateIndexOptionColumns<
  Fields extends TableFieldMap,
  Spec
> = AssertKnownColumnNames<Fields, IndexOptionColumnNames<Spec>> extends true ? Spec : never

/** Compile-time validation that foreign keys reference known local and target columns. */
export type ValidateForeignKeyOptionColumns<
  Fields extends TableFieldMap,
  Spec
> = Spec extends { readonly columns: infer Columns extends readonly string[] }
  ? AssertKnownColumns<Fields, Columns> extends never
    ? never
    : AssertKnownReferenceColumnNames<
        ForeignKeyKnownReferencedColumnNames<Spec>,
        ForeignKeyReferencedColumnNames<Spec>
      > extends true
      ? Spec
      : never
  : AssertKnownReferenceColumnNames<
      ForeignKeyKnownReferencedColumnNames<Spec>,
      ForeignKeyReferencedColumnNames<Spec>
    > extends true
    ? Spec
    : never

/** Normalizes a public column input into the internal tuple form. */
export type NormalizeColumns<Columns extends string | readonly string[]> = TupleFromColumns<Columns>
