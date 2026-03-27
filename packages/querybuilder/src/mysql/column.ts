import * as BaseColumn from "../internal/column.js"
import * as Expression from "../internal/scalar.js"
import { LocalDateTimeStringSchema } from "../internal/runtime-value.js"

/** MySQL-specialized column-definition DSL. */
export const uuid = BaseColumn.mysql.uuid
export const text = BaseColumn.mysql.text
export const int = BaseColumn.mysql.int
export const number = BaseColumn.mysql.number
export const boolean = BaseColumn.mysql.boolean
export const date = BaseColumn.mysql.date
export const datetime = () =>
  BaseColumn.mysql.custom(
    LocalDateTimeStringSchema,
    { dialect: "mysql", kind: "datetime" } as Expression.DbType.MySqlDatetime
  )
export const timestamp = BaseColumn.mysql.timestamp
export const json = BaseColumn.mysql.json
export const custom = BaseColumn.mysql.custom

export const nullable = BaseColumn.nullable
export const brand = BaseColumn.brand
export const primaryKey = BaseColumn.primaryKey
export const unique = BaseColumn.unique
const default_ = BaseColumn.default_
export const generated = BaseColumn.generated
export const references = BaseColumn.references
export const schema = BaseColumn.schema
export { default_ as default }

export type Any = BaseColumn.Any
export type AnyBound = BaseColumn.AnyBound
