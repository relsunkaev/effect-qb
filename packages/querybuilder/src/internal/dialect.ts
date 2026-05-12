import type * as Schema from "effect/Schema"

import type * as Expression from "./scalar.js"

/**
 * Mutable rendering state shared while serializing SQL for a concrete dialect.
 *
 * Dialect implementations append bound parameter values into `params` and
 * refer to them positionally in the emitted SQL text.
 */
export interface RenderState {
  readonly params: unknown[]
  readonly valueMappings?: Expression.DriverValueMappings
  readonly ctes: {
    readonly name: string
    readonly sql: string
    readonly recursive?: boolean
  }[]
  readonly cteNames: Set<string>
}

export interface RenderValueContext {
  readonly dbType?: Expression.DbType.Any
  readonly runtimeSchema?: Schema.Schema.Any
  readonly driverValueMapping?: Expression.DriverValueMapping
}

/**
 * Minimal runtime contract for a SQL dialect.
 *
 * This is intentionally small for the first abstraction pass. It covers the
 * renderer seams that are already dialect-sensitive today: identifier quoting,
 * literal serialization, and table-reference rendering.
 */
export interface SqlDialect<Name extends string = string> {
  readonly name: Name
  quoteIdentifier(value: string): string
  renderLiteral(value: unknown, state: RenderState, context?: RenderValueContext): string
  renderTableReference(tableName: string, baseTableName: string, schemaName?: string): string
  renderConcat(values: readonly string[]): string
}
