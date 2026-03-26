import type { ExpressionInput } from "../query.js"
import { postgresQuery } from "../private/query.js"
import { isSequenceDefinition, type SequenceDefinition } from "../schema-management.js"

/** Postgres scalar core functions. */
export const coalesce = postgresQuery.coalesce
export const call = postgresQuery.call
export const uuidGenerateV4 = postgresQuery.uuidGenerateV4
export const nextVal = (
  value: ExpressionInput | SequenceDefinition<string, string | undefined>
) =>
  postgresQuery.nextVal(
    isSequenceDefinition(value)
      ? postgresQuery.cast(postgresQuery.literal(value.qualifiedName()), postgresQuery.type.regclass())
      : value
  )
