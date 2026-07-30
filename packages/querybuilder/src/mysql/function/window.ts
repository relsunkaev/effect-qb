import {
  makeDialectFirstValue,
  makeDialectLastValue
} from "../../internal/analytics.js"
export type { WindowSpec } from "../../internal/analytics.js"

/** MySQL window functions. */
export { over, rowNumber, rank, denseRank } from "../internal/dsl.js"

/** First value in a MySQL window frame. */
export const firstValue = makeDialectFirstValue("mysql")

/** Last value in a MySQL window frame. */
export const lastValue = makeDialectLastValue("mysql")
