import { jsonb } from "./json.js"

/** Postgres jsonb-only helpers for containment, mutation, wildcard paths, and SQL/JSON path predicates. */
export { jsonb }
export const key = jsonb.key
export const index = jsonb.index
export const wildcard = jsonb.wildcard
export const slice = jsonb.slice
export const descend = jsonb.descend
export const path = jsonb.path
export const get = jsonb.get
export const access = jsonb.access
export const traverse = jsonb.traverse
export const text = jsonb.text
export const accessText = jsonb.accessText
export const traverseText = jsonb.traverseText
export const contains = jsonb.contains
export const containedBy = jsonb.containedBy
export const hasKey = jsonb.hasKey
export const keyExists = jsonb.keyExists
export const hasAnyKeys = jsonb.hasAnyKeys
export const hasAllKeys = jsonb.hasAllKeys
export const delete_ = jsonb.delete
export { delete_ as delete }
export const remove = jsonb.remove
export const set = jsonb.set
export const insert = jsonb.insert
export const concat = jsonb.concat
export const merge = jsonb.merge
export const buildObject = jsonb.buildObject
export const buildArray = jsonb.buildArray
export const toJsonb = jsonb.toJsonb
export const typeOf = jsonb.typeOf
export const length = jsonb.length
export const keys = jsonb.keys
export const stripNulls = jsonb.stripNulls
export const pathExists = jsonb.pathExists
export const pathMatch = jsonb.pathMatch
