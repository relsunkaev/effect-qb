import type { ExpressionInput } from "../query.js"
import {
  call,
  cast,
  literal,
  nextVal as nextValInternal,
  type as postgresType,
  uuidGenerateV4
} from "../internal/dsl.js"
import { isSequenceDefinition, type SequenceDefinition } from "../schema-management.js"

/** Postgres scalar core functions. */
export { call, uuidGenerateV4 }

const safeUnquotedIdentifier = /^[a-z_][a-z0-9_$]*$/

const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll("\"", "\"\"")}"`

const renderIdentifier = (value: string): string =>
  safeUnquotedIdentifier.test(value)
    ? value
    : quoteIdentifier(value)

const renderQualifiedSequenceName = (
  value: SequenceDefinition<string, string | undefined>
): string =>
  value.schemaName === undefined || value.schemaName === "public"
    ? renderIdentifier(value.name)
    : `${renderIdentifier(value.schemaName)}.${renderIdentifier(value.name)}`

export const nextVal = (
  value: ExpressionInput | SequenceDefinition<string, string | undefined>
) =>
  nextValInternal(
    isSequenceDefinition(value)
      ? cast(literal(renderQualifiedSequenceName(value)), postgresType.regclass())
      : value
  )
