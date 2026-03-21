import { postgresQuery } from "../private/query.js"

/** Postgres window functions. */
export const rowNumber = postgresQuery.rowNumber
export const rank = postgresQuery.rank
export const denseRank = postgresQuery.denseRank
