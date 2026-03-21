import { postgresQuery } from "../private/query.js"

/** Postgres aggregate functions. */
export const count = postgresQuery.count
export const max = postgresQuery.max
export const min = postgresQuery.min
