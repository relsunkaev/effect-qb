import * as BaseColumn from "../internal/column.ts"

/** MySQL-specialized column-definition DSL. */
export const uuid = BaseColumn.mysql.uuid
export const text = BaseColumn.mysql.text
export const int = BaseColumn.mysql.int
export const number = BaseColumn.mysql.number
export const boolean = BaseColumn.mysql.boolean
export const timestamp = BaseColumn.mysql.timestamp
export const json = BaseColumn.mysql.json
export const custom = BaseColumn.mysql.custom

export const nullable = BaseColumn.nullable
export const primaryKey = BaseColumn.primaryKey
export const unique = BaseColumn.unique
export const hasDefault = BaseColumn.hasDefault
export const generated = BaseColumn.generated
export const references = BaseColumn.references

export type Any = BaseColumn.Any
export type AnyBound = BaseColumn.AnyBound
