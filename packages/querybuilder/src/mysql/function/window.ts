import { mysqlDsl } from "../internal/dsl.js"

/** MySQL window functions. */
export const over = mysqlDsl.over
export const rowNumber = mysqlDsl.rowNumber
export const rank = mysqlDsl.rank
export const denseRank = mysqlDsl.denseRank
