import { postgresDsl } from "../internal/dsl.js"

/** Postgres string functions. */
export const lower = postgresDsl.lower
export const upper = postgresDsl.upper
export const concat = postgresDsl.concat
