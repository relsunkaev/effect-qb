import * as BaseTable from "../internal/table.js"
import type { TableOptionSpec } from "../internal/table-options.js"

export type {
  DdlExpressionLike,
  IndexKeySpec as IndexKey,
  ReferentialAction,
  TableOption
} from "../internal/table.js"

type NamedSpec = Extract<TableOptionSpec, { readonly name?: string }>
type PrimaryKeySpec = Extract<TableOptionSpec, { readonly kind: "primaryKey" }>
type UniqueSpec = Extract<TableOptionSpec, { readonly kind: "unique" }>
type IndexSpec = Extract<TableOptionSpec, { readonly kind: "index" }>
type ForeignKeySpec = Extract<TableOptionSpec, { readonly kind: "foreignKey" }>
type CheckSpec = Extract<TableOptionSpec, { readonly kind: "check" }>

type IndexKeyOptions = {
  readonly order?: "asc" | "desc"
  readonly nulls?: "first" | "last"
  readonly operatorClass?: string
  readonly collation?: string
}

type IndexKeyInput<Table extends BaseTable.SchemaTableDefinition = BaseTable.SchemaTableDefinition> =
  | {
      readonly column: BaseTable.TableColumn<Table>
    } & IndexKeyOptions
  | {
      readonly expression: BaseTable.DdlExpressionLike
    } & IndexKeyOptions

type EmptyIndexKeyOperatorClass<Key> = Key extends { readonly operatorClass: infer OperatorClass extends string }
  ? BaseTable.NonEmptyStringInput<OperatorClass> extends never ? Key : never
  : never

type EmptyIndexKeyCollation<Key> = Key extends { readonly collation: infer Collation extends string }
  ? BaseTable.NonEmptyStringInput<Collation> extends never ? Key : never
  : never

type InvalidIndexKeyMetadata<Key> =
  | EmptyIndexKeyOperatorClass<Key>
  | EmptyIndexKeyCollation<Key>

type NonEmptyIndexKeyInput<Key> =
  [InvalidIndexKeyMetadata<Key>] extends [never] ? unknown : never

type NormalizedIndexKey<Key> = Key extends { readonly expression: infer Expression extends BaseTable.DdlExpressionLike }
  ? {
      readonly kind: "expression"
      readonly expression: Expression
      readonly order: Key extends { readonly order: infer Order extends "asc" | "desc" } ? Order : undefined
      readonly nulls: Key extends { readonly nulls: infer Nulls extends "first" | "last" } ? Nulls : undefined
      readonly operatorClass: Key extends { readonly operatorClass: infer OperatorClass extends string } ? OperatorClass : undefined
      readonly collation: Key extends { readonly collation: infer Collation extends string } ? Collation : undefined
    }
  : Key extends { readonly column: infer Column extends BaseTable.AnyColumnSelection }
    ? {
        readonly kind: "column"
        readonly column: BaseTable.SelectedColumns<Column>[number]
        readonly order: Key extends { readonly order: infer Order extends "asc" | "desc" } ? Order : undefined
        readonly nulls: Key extends { readonly nulls: infer Nulls extends "first" | "last" } ? Nulls : undefined
        readonly operatorClass: Key extends { readonly operatorClass: infer OperatorClass extends string } ? OperatorClass : undefined
        readonly collation: Key extends { readonly collation: infer Collation extends string } ? Collation : undefined
      }
    : never

const normalizeIndexKey = (key: IndexKeyInput): BaseTable.IndexKeySpec =>
  "expression" in key
    ? {
        kind: "expression",
        expression: key.expression,
        order: key.order,
        nulls: key.nulls,
        operatorClass: key.operatorClass,
        collation: key.collation
      }
    : {
        kind: "column",
        column: BaseTable.selectedColumnList(key.column)[0]!,
        order: key.order,
        nulls: key.nulls,
        operatorClass: key.operatorClass,
        collation: key.collation
      }

/** Adds a Postgres constraint or index name to a standard table option. */
export const named = <const Name extends string>(
  name: BaseTable.NonEmptyStringInput<Name>
) =>
  <Spec extends NamedSpec, TableContext extends BaseTable.SchemaTableDefinition>(
    option: BaseTable.TableOption<Spec, TableContext>
  ): BaseTable.TableOption<Spec & { readonly name: Name }, TableContext> =>
    BaseTable.mapOption(option, (spec) => ({
      ...spec,
      name
    } as Spec & { readonly name: Name }))

/** Marks a standard primary key, unique, or foreign-key option as deferrable. */
export const deferrable = <
  Spec extends PrimaryKeySpec | UniqueSpec | ForeignKeySpec,
  TableContext extends BaseTable.SchemaTableDefinition
>(option: BaseTable.TableOption<Spec, TableContext>): BaseTable.TableOption<Spec & { readonly deferrable: true }, TableContext> =>
  BaseTable.mapOption(option, (spec) => ({
    ...spec,
    deferrable: true
  } as Spec & { readonly deferrable: true }))

/** Marks a deferrable standard primary key, unique, or foreign-key option as initially deferred. */
export const initiallyDeferred = <
  Spec extends PrimaryKeySpec | UniqueSpec | ForeignKeySpec,
  TableContext extends BaseTable.SchemaTableDefinition
>(option: BaseTable.TableOption<Spec, TableContext>): BaseTable.TableOption<Spec & {
  readonly deferrable: true
  readonly initiallyDeferred: true
}, TableContext> =>
  BaseTable.mapOption(option, (spec) => ({
    ...spec,
    deferrable: true,
    initiallyDeferred: true
  } as Spec & { readonly deferrable: true; readonly initiallyDeferred: true }))

/** Adds Postgres NULLS NOT DISTINCT to a standard unique option. */
export const nullsNotDistinct = <Spec extends UniqueSpec, TableContext extends BaseTable.SchemaTableDefinition>(
  option: BaseTable.TableOption<Spec, TableContext>
): BaseTable.TableOption<Spec & { readonly nullsNotDistinct: true }, TableContext> =>
  BaseTable.mapOption(option, (spec) => ({
    ...spec,
    nullsNotDistinct: true
  } as Spec & { readonly nullsNotDistinct: true }))

/** Marks a standard index option as a Postgres unique index. */
export const uniqueIndex = <Spec extends IndexSpec, TableContext extends BaseTable.SchemaTableDefinition>(
  option: BaseTable.TableOption<Spec, TableContext>
): BaseTable.TableOption<Spec & { readonly unique: true }, TableContext> =>
  BaseTable.mapOption(option, (spec) => ({
    ...spec,
    unique: true
  } as Spec & { readonly unique: true }))

/** Adds a Postgres index method to a standard index option. */
export const using = <const Method extends string>(
  method: BaseTable.NonEmptyStringInput<Method>
) =>
  <Spec extends IndexSpec, TableContext extends BaseTable.SchemaTableDefinition>(
    option: BaseTable.TableOption<Spec, TableContext>
  ): BaseTable.TableOption<Spec & { readonly method: Method }, TableContext> =>
    BaseTable.mapOption(option, (spec) => ({
      ...spec,
      method
    } as Spec & { readonly method: Method }))

/** Adds Postgres INCLUDE columns to a standard index option. */
export const include = <
  Selection extends BaseTable.AnyColumnSelection
>(
  columns: (table: any) => Selection
) =>
  <Spec extends IndexSpec, TableContext extends BaseTable.SchemaTableDefinition>(
    option: BaseTable.TableOption<Spec, TableContext>
  ): BaseTable.TableOption<Spec & { readonly include: BaseTable.SelectedColumns<Selection> }, TableContext> =>
    BaseTable.optionFromTable({
      ...option.option,
      include: [] as unknown as BaseTable.SelectedColumns<Selection>
    } as Spec & { readonly include: BaseTable.SelectedColumns<Selection> }, (table) => ({
      ...BaseTable.resolveOption(option, table as TableContext),
      include: BaseTable.selectedColumnList(columns(table))
    } as Spec & { readonly include: BaseTable.SelectedColumns<Selection> }))

/** Adds a Postgres partial-index predicate to a standard index option. */
export const indexPredicate = <Predicate extends BaseTable.DdlExpressionLike>(
  predicate: Predicate
) =>
  <Spec extends IndexSpec, TableContext extends BaseTable.SchemaTableDefinition>(
    option: BaseTable.TableOption<Spec, TableContext>
  ): BaseTable.TableOption<Spec & { readonly predicate: Predicate }, TableContext> =>
    BaseTable.mapOption(option, (spec) => ({
      ...spec,
      predicate
    } as Spec & { readonly predicate: Predicate }))

/** Replaces standard index columns with a single Postgres index key. */
export const key = <
  Column extends BaseTable.TableColumn<BaseTable.SchemaTableDefinition>,
  const Options extends IndexKeyOptions = {}
>(
  column: (table: any) => Column,
  options?: Options & NonEmptyIndexKeyInput<Options>
) =>
  <Spec extends IndexSpec, TableContext extends BaseTable.SchemaTableDefinition>(
    option: BaseTable.TableOption<Spec, TableContext>
  ): BaseTable.TableOption<Spec & {
    readonly keys: readonly [NormalizedIndexKey<{ readonly column: Column } & Options>]
  }, TableContext> =>
    BaseTable.optionFromTable({
      ...option.option,
      columns: undefined,
      keys: [] as unknown as readonly [NormalizedIndexKey<{ readonly column: Column } & Options>]
    } as unknown as Spec & { readonly keys: readonly [NormalizedIndexKey<{ readonly column: Column } & Options>] }, (table) => ({
      ...BaseTable.resolveOption(option, table as TableContext),
      columns: undefined,
      keys: [normalizeIndexKey({ column: column(table), ...options })]
    } as unknown as Spec & { readonly keys: readonly [NormalizedIndexKey<{ readonly column: Column } & Options>] }))

/** Replaces standard index columns with Postgres index keys. */
export const keys = (
  keys: (table: any) => readonly [IndexKeyInput, ...IndexKeyInput[]]
) =>
  <Spec extends IndexSpec, TableContext extends BaseTable.SchemaTableDefinition>(
    option: BaseTable.TableOption<Spec, TableContext>
  ): BaseTable.TableOption<Spec & {
    readonly keys: readonly [BaseTable.IndexKeySpec, ...BaseTable.IndexKeySpec[]]
  }, TableContext> =>
    BaseTable.optionFromTable({
      ...option.option,
      columns: undefined,
      keys: [] as unknown as readonly [BaseTable.IndexKeySpec, ...BaseTable.IndexKeySpec[]]
    } as Spec & { readonly keys: readonly [BaseTable.IndexKeySpec, ...BaseTable.IndexKeySpec[]] }, (table) => {
      const resolvedKeys = keys(table)
      return {
        ...BaseTable.resolveOption(option, table as TableContext),
        columns: undefined,
        keys: [normalizeIndexKey(resolvedKeys[0]), ...resolvedKeys.slice(1).map(normalizeIndexKey)]
      } as Spec & { readonly keys: readonly [BaseTable.IndexKeySpec, ...BaseTable.IndexKeySpec[]] }
    })

/** Adds Postgres NO INHERIT to a standard check option. */
export const noInherit = <Spec extends CheckSpec, TableContext extends BaseTable.SchemaTableDefinition>(
  option: BaseTable.TableOption<Spec, TableContext>
): BaseTable.TableOption<Spec & { readonly noInherit: true }, TableContext> =>
  BaseTable.mapOption(option, (spec) => ({
    ...spec,
    noInherit: true
  } as Spec & { readonly noInherit: true }))
