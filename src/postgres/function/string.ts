import { postgresQuery } from "../private/query.js"

/** Postgres string functions. */
export const lower = postgresQuery.lower
export const upper = postgresQuery.upper
export const concat = postgresQuery.concat
