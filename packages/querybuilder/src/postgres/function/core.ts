import type { ExpressionInput } from "../query.js"
import { postgresDsl } from "../internal/dsl.js"
import { isSequenceDefinition, type SequenceDefinition } from "../schema-management.js"

/** Postgres scalar core functions. */
export const coalesce = postgresDsl.coalesce
export const call = postgresDsl.call
export const uuidGenerateV4 = postgresDsl.uuidGenerateV4
export const nextVal = (
  value: ExpressionInput | SequenceDefinition<string, string | undefined>
) =>
  postgresDsl.nextVal(
    isSequenceDefinition(value)
      ? postgresDsl.cast(postgresDsl.literal(value.qualifiedName()), postgresDsl.type.regclass())
      : value
  )
