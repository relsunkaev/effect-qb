import { postgresDsl } from "../internal/dsl.js"

/** Postgres window functions. */
export const over = postgresDsl.over
export const rowNumber = postgresDsl.rowNumber
export const rank = postgresDsl.rank
export const denseRank = postgresDsl.denseRank
