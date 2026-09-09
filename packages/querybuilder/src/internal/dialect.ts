import type * as Schema from "effect/Schema"

import type * as QueryAst from "./query-ast.js"
import type { Projection } from "./projections.js"
import type * as Expression from "./scalar.js"
import type * as Casing from "./casing.js"

/**
 * Mutable rendering state shared while serializing SQL for a concrete dialect.
 *
 * Dialect implementations append bound parameter values into `params` and
 * refer to them positionally in the emitted SQL text.
 */
export interface RenderState {
  readonly params: unknown[]
  readonly valueMappings?: Expression.DriverValueMappings
  readonly casing?: Casing.Options
  readonly ctes: {
    readonly name: string
    readonly sql: string
    readonly recursive?: boolean
  }[]
  readonly cteNames: Set<string>
  readonly cteSources: Map<string, unknown>
  readonly sourceNames?: Map<string, {
    readonly tableName: string
    readonly columns: ReadonlyMap<string, string>
  }>
  readonly rowLocalColumns?: boolean
  readonly allowExcluded?: boolean
}

export interface RenderValueContext {
  readonly dbType?: Expression.DbType.Any
  readonly runtimeSchema?: Schema.Top
  readonly driverValueMapping?: Expression.DriverValueMapping
}

export const quoteDoubleQuotedIdentifier = (value: string): string => {
  return `"${value.replaceAll("\"", "\"\"")}"`
}

export const quoteBacktickIdentifier = (value: string): string => {
  return `\`${value.replaceAll("`", "``")}\``
}

export const renderDbTypeName = (value: string): string =>
  value

export interface RenderedAst {
  readonly sql: string
  readonly projections: readonly Projection[]
}

/** Runtime contract for dialect-owned SQL lowering and shared traversal. */
export interface SqlDialect<Name extends string = string> {
  readonly name: Name
  quoteIdentifier(value: string): string
  renderLiteral(value: unknown, state: RenderState, context?: RenderValueContext): string
  renderTableReference(tableName: string, baseTableName: string, schemaName?: string): string
  renderSourceReference(
    source: unknown,
    tableName: string,
    baseTableName: string,
    state: RenderState,
    dialect: SqlDialect<Name>
  ): string
  renderConcat(values: readonly string[]): string
  renderQueryAst(
    ast: QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>,
    state: RenderState,
    dialect: SqlDialect<Name>
  ): RenderedAst
  renderExpression(
    expression: Expression.Any,
    state: RenderState,
    dialect: SqlDialect<Name>
  ): string
}
