const normalize = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase()

const stripOuterQuotes = (value: string): string =>
  value.startsWith("\"") && value.endsWith("\"")
    ? value.slice(1, -1).replaceAll("\"\"", "\"")
    : value

const canonicalBaseType = (value: string): string => {
  switch (value) {
    case "boolean":
      return "bool"
    case "smallint":
      return "int2"
    case "integer":
      return "int4"
    case "bigint":
      return "int8"
    case "real":
      return "float4"
    case "double precision":
      return "float8"
    case "character varying":
      return "varchar"
    case "character":
    case "bpchar":
      return "char"
    case "time without time zone":
      return "time"
    case "time with time zone":
      return "timetz"
    case "timestamp without time zone":
      return "timestamp"
    case "timestamp with time zone":
      return "timestamptz"
    case "bit varying":
      return "varbit"
    case "jsonb":
      return "jsonb"
    default:
      return value
  }
}

export const normalizePostgresTypeName = normalize

export const canonicalizePostgresTypeName = (value: string): string => {
  const normalized = normalize(value)
  if (normalized.endsWith("[]")) {
    return `${canonicalizePostgresTypeName(normalized.slice(0, -2))}[]`
  }
  const arrayPrefix = /^_+/.exec(normalized)
  if (arrayPrefix !== null) {
    const depth = arrayPrefix[0].length
    const base = stripOuterQuotes(normalized.slice(depth))
    return `${canonicalBaseType(base)}${"[]".repeat(depth)}`
  }
  const base = normalized.replace(/\(.+\)$/, "")
  const unquotedBase = stripOuterQuotes(base)
  if (unquotedBase === "character" || unquotedBase === "bpchar") {
    const suffix = normalized === base && base === unquotedBase
      ? "(1)"
      : normalized.slice(base.length)
    return `${canonicalBaseType(unquotedBase)}${suffix}`
  }
  return `${canonicalBaseType(unquotedBase)}${normalized.slice(base.length)}`
}

export const inferPostgresTypeKind = (ddlType: string): string => {
  const normalized = normalize(ddlType)
  if (normalized.endsWith("[]")) {
    return `${inferPostgresTypeKind(normalized.slice(0, -2))}[]`
  }
  const arrayPrefix = /^_+/.exec(normalized)
  if (arrayPrefix !== null) {
    const depth = arrayPrefix[0].length
    const base = stripOuterQuotes(normalized.slice(depth))
    return `${canonicalBaseType(base)}${"[]".repeat(depth)}`
  }
  const base = stripOuterQuotes(normalized.replace(/\(.+\)$/, ""))
  return canonicalBaseType(base)
}
