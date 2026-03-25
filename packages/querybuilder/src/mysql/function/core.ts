import { mysqlQuery } from "../private/query.js"

/** MySQL scalar core functions. */
export const coalesce = mysqlQuery.coalesce
export const call = mysqlQuery.call
