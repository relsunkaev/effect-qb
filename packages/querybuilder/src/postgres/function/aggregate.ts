import { postgresDsl } from "../internal/dsl.js"

/** Postgres aggregate functions. */
export const count = postgresDsl.count
export const max = postgresDsl.max
export const min = postgresDsl.min
