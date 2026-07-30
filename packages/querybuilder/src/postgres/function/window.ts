import {
  makeDialectFirstValue,
  makeDialectLastValue
} from "../../internal/analytics.js"
export type { WindowSpec } from "../../internal/analytics.js"

/** Postgres window functions. */
export { over, rowNumber, rank, denseRank } from "../internal/dsl.js"

/** First value in a PostgreSQL window frame. */
export const firstValue = makeDialectFirstValue("postgres")

/** Last value in a PostgreSQL window frame. */
export const lastValue = makeDialectLastValue("postgres")
