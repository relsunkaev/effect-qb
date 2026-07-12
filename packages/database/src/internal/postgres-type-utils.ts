const normalize = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase()

const stripOuterQuotes = (value: string): string =>
  value.startsWith("\"") && value.endsWith("\"")
    ? value.slice(1, -1).replaceAll("\"\"", "\"")
    : value

const safeUnquotedIdentifier = /^[a-z_][a-z0-9_$]*$/

const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll("\"", "\"\"")}"`

const renderCanonicalIdentifier = (value: string, quoted: boolean): string => {
  const canonical = quoted ? value : value.toLowerCase()
  return safeUnquotedIdentifier.test(canonical)
    ? canonical
    : quoteIdentifier(canonical)
}

const parseIdentifierPart = (
  input: string,
  start: number
): { readonly value: string; readonly quoted: boolean; readonly next: number } | undefined => {
  if (input[start] === "\"") {
    let value = ""
    for (let index = start + 1; index < input.length; index++) {
      if (input[index] !== "\"") {
        value += input[index]
        continue
      }
      if (input[index + 1] === "\"") {
        value += "\""
        index++
        continue
      }
      return {
        value,
        quoted: true,
        next: index + 1
      }
    }
    return undefined
  }
  const match = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(input.slice(start))
  return match === null
    ? undefined
    : {
        value: match[0],
        quoted: false,
        next: start + match[0].length
      }
}

const parseQualifiedTypeName = (
  value: string
): { readonly schemaName: string; readonly name: string } | undefined => {
  const schema = parseIdentifierPart(value, 0)
  if (schema === undefined || value[schema.next] !== ".") {
    return undefined
  }
  const name = parseIdentifierPart(value, schema.next + 1)
  return name !== undefined && name.next === value.length
    ? {
        schemaName: renderCanonicalIdentifier(schema.value, schema.quoted),
        name: renderCanonicalIdentifier(name.value, name.quoted)
      }
    : undefined
}

const parseTypeKindName = (value: string): string | undefined => {
  const first = parseIdentifierPart(value, 0)
  if (first !== undefined && value[first.next] === ".") {
    const second = parseIdentifierPart(value, first.next + 1)
    return second !== undefined && second.next === value.length
      ? canonicalBaseType(second.quoted ? second.value : second.value.toLowerCase())
      : undefined
  }
  return first !== undefined && first.next === value.length
    ? canonicalBaseType(first.quoted ? first.value : first.value.toLowerCase())
    : undefined
}

const canonicalBaseType = (value: string): string => {
  switch (value) {
    case "boolean":
      return "bool"
    case "smallint":
      return "int2"
    case "int":
    case "integer":
      return "int4"
    case "bigint":
      return "int8"
    case "dec":
    case "decimal":
      return "numeric"
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
  const trimmed = value.trim()
  if (trimmed.endsWith("[]")) {
    return `${canonicalizePostgresTypeName(trimmed.slice(0, -2))}[]`
  }
  const normalized = normalize(trimmed)
  const arrayPrefix = /^_+/.exec(normalized)
  if (arrayPrefix !== null) {
    const depth = arrayPrefix[0].length
    const base = stripOuterQuotes(normalized.slice(depth))
    return `${canonicalBaseType(base)}${"[]".repeat(depth)}`
  }
  const rawBase = trimmed.replace(/\(.+\)$/, "")
  const qualifiedTypeName = parseQualifiedTypeName(rawBase)
  if (qualifiedTypeName !== undefined) {
    return `${qualifiedTypeName.schemaName}.${qualifiedTypeName.name}${trimmed.slice(rawBase.length)}`
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
  const trimmed = ddlType.trim()
  if (trimmed.endsWith("[]")) {
    return `${inferPostgresTypeKind(trimmed.slice(0, -2))}[]`
  }
  const normalized = normalize(trimmed)
  const arrayPrefix = /^_+/.exec(normalized)
  if (arrayPrefix !== null) {
    const depth = arrayPrefix[0].length
    const base = stripOuterQuotes(normalized.slice(depth))
    return `${canonicalBaseType(base)}${"[]".repeat(depth)}`
  }
  const rawBase = trimmed.replace(/\(.+\)$/, "")
  const parsedKind = parseTypeKindName(rawBase)
  if (parsedKind !== undefined) {
    return parsedKind
  }
  const base = stripOuterQuotes(normalized.replace(/\(.+\)$/, ""))
  return canonicalBaseType(base)
}
