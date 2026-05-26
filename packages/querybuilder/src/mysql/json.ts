/** MySQL JSON expression helpers. */
export { json } from "./internal/dsl.js"
import { json } from "./internal/dsl.js"

export const key = json.key
export const index = json.index
export const wildcard = json.wildcard
export const slice = json.slice
export const descend = json.descend
export const path = json.path
export const get = json.get
export const access = json.access
export const traverse = json.traverse
export const text = json.text
export const accessText = json.accessText
export const traverseText = json.traverseText
export const contains = json.contains
export const containedBy = json.containedBy
export const hasKey = json.hasKey
export const keyExists = json.keyExists
export const hasAnyKeys = json.hasAnyKeys
export const hasAllKeys = json.hasAllKeys
export const delete_ = json.delete
export { delete_ as delete }
export const remove = json.remove
export const set = json.set
export const insert = json.insert
export const concat = json.concat
export const merge = json.merge
export const buildObject = json.buildObject
export const buildArray = json.buildArray
export const toJson = json.toJson
export const toJsonb = json.toJsonb
export const typeOf = json.typeOf
export const length = json.length
export const keys = json.keys
export const stripNulls = json.stripNulls
export const pathExists = json.pathExists
export const pathMatch = json.pathMatch
