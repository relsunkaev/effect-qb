import { mysqlQuery } from "../private/query.js"

/** MySQL window functions. */
export const over = mysqlQuery.over
export const rowNumber = mysqlQuery.rowNumber
export const rank = mysqlQuery.rank
export const denseRank = mysqlQuery.denseRank
