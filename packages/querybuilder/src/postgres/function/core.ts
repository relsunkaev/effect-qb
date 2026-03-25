import { postgresQuery } from "../private/query.js"

/** Postgres scalar core functions. */
export const coalesce = postgresQuery.coalesce
export const uuidGenerateV4 = postgresQuery.uuidGenerateV4
export const nextVal = postgresQuery.nextVal
