import type { SqlDialect } from "../dialect.js"
import * as JsonPath from "./path.js"

export const unsupportedJsonFeature = (
  dialect: SqlDialect,
  feature: string
): never => {
  const error = new Error(`Unsupported JSON feature for ${dialect.name}: ${feature}`) as Error & {
    readonly tag: string
    readonly dialect: string
    readonly feature: string
  }
  Object.assign(error, {
    tag: `@${dialect.name}/unsupported/json-feature`,
    dialect: dialect.name,
    feature
  })
  throw error
}

export const extractJsonBase = (node: Record<string, unknown>): unknown =>
  node.value ?? node.base ?? node.input ?? node.left ?? node.target

export const isJsonPathValue = (value: unknown): value is JsonPath.Path<any> =>
  value !== null && typeof value === "object" && JsonPath.TypeId in value

const isOptionalJsonPathNumber = (value: unknown): boolean =>
  value === undefined || (typeof value === "number" && Number.isFinite(value))

const isJsonPathSegment = (segment: unknown): boolean => {
  if (typeof segment === "string") {
    return true
  }
  if (typeof segment === "number") {
    return Number.isFinite(segment)
  }
  if (segment === null || typeof segment !== "object" || !("kind" in segment)) {
    return false
  }
  switch ((segment as { readonly kind?: unknown }).kind) {
    case "key":
      return typeof (segment as { readonly key?: unknown }).key === "string"
    case "index": {
      const index = (segment as { readonly index?: unknown }).index
      return typeof index === "number" && Number.isFinite(index)
    }
    case "wildcard":
    case "descend":
      return true
    case "slice":
      return isOptionalJsonPathNumber((segment as { readonly start?: unknown }).start) &&
        isOptionalJsonPathNumber((segment as { readonly end?: unknown }).end)
    default:
      return false
  }
}

const validateJsonPathSegments = (segments: unknown): ReadonlyArray<JsonPath.AnySegment> => {
  if (!Array.isArray(segments)) {
    throw new Error("JSON path expressions require a segment array")
  }
  if (segments.some((segment) => !isJsonPathSegment(segment))) {
    throw new Error("JSON path segments require string, number, or path segment objects")
  }
  return segments as ReadonlyArray<JsonPath.AnySegment>
}

export const extractJsonPathSegments = (node: Record<string, unknown>): ReadonlyArray<JsonPath.AnySegment> => {
  const path = node.path ?? node.segments ?? node.keys
  if (isJsonPathValue(path)) {
    return validateJsonPathSegments(path.segments)
  }
  if (Array.isArray(path)) {
    return validateJsonPathSegments(path)
  }
  if (node.segments !== undefined) {
    return validateJsonPathSegments(node.segments)
  }
  if ("key" in node) {
    return [JsonPath.key(String(node.key))]
  }
  if ("segment" in node) {
    const segment = node.segment
    if (typeof segment === "string") {
      return [JsonPath.key(segment)]
    }
    if (typeof segment === "number") {
      return [JsonPath.index(segment)]
    }
    if (segment !== null && typeof segment === "object" && JsonPath.SegmentTypeId in segment) {
      return [segment as JsonPath.AnySegment]
    }
    return []
  }
  if ("right" in node && isJsonPathValue(node.right)) {
    return validateJsonPathSegments(node.right.segments)
  }
  return []
}

export const extractJsonKeys = (
  node: Record<string, unknown>,
  segments: ReadonlyArray<JsonPath.AnySegment>
): readonly unknown[] =>
  Array.isArray(node.keys)
    ? node.keys
    : segments.map((segment) =>
        typeof segment === "object" && segment !== null && segment.kind === "key"
          ? segment.key
          : segment
      )

export const extractJsonValue = (node: Record<string, unknown>): unknown =>
  node.newValue ?? node.insert ?? node.right

export const renderJsonPathSegment = (segment: JsonPath.AnySegment | string | number): string => {
  const renderKey = (value: string): string =>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
      ? `.${value}`
      : `.${JSON.stringify(value)}`
  if (typeof segment === "string") {
    return renderKey(segment)
  }
  if (typeof segment === "number") {
    return `[${segment}]`
  }
  switch (segment.kind) {
    case "key":
      return renderKey(segment.key)
    case "index":
      return `[${segment.index}]`
    case "wildcard":
      return "[*]"
    case "slice":
      return `[${segment.start ?? 0} to ${segment.end ?? "last"}]`
    case "descend":
      return ".**"
    default:
      throw new Error("Unsupported JSON path segment")
  }
}
