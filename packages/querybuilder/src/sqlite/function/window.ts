import {
  makeDialectFirstValue,
  makeDialectLastValue
} from "../../internal/analytics.js"
export type { WindowSpec } from "../../internal/analytics.js"

/** SQLite window functions. */
export { over, rowNumber, rank, denseRank } from "../internal/dsl.js"

/** First value in a SQLite window frame. */
export const firstValue = makeDialectFirstValue("sqlite")

/** Last value in a SQLite window frame. */
export const lastValue = makeDialectLastValue("sqlite")
