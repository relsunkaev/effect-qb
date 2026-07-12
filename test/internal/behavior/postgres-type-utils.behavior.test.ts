import { expect, test } from "bun:test"

import {
  canonicalizePostgresTypeName,
  inferPostgresTypeKind
} from "../../../packages/database/src/internal/postgres-type-utils.js"

test("canonicalizes quoted postgres builtin type names", () => {
  expect(canonicalizePostgresTypeName("\"char\"")).toBe("char")
  expect(canonicalizePostgresTypeName("\"char\"[]")).toBe("char[]")
  expect(inferPostgresTypeKind("\"char\"")).toBe("char")
  expect(inferPostgresTypeKind("\"char\"[]")).toBe("char[]")
})

test("canonicalizes postgres builtin type aliases", () => {
  expect(canonicalizePostgresTypeName("int")).toBe("int4")
  expect(canonicalizePostgresTypeName("int")).toBe(canonicalizePostgresTypeName("integer"))
  expect(canonicalizePostgresTypeName("int[]")).toBe("int4[]")
  expect(canonicalizePostgresTypeName("dec")).toBe("numeric")
  expect(canonicalizePostgresTypeName("decimal")).toBe("numeric")
  expect(canonicalizePostgresTypeName("decimal(10, 2)")).toBe("numeric(10, 2)")
  expect(inferPostgresTypeKind("int")).toBe("int4")
  expect(inferPostgresTypeKind("decimal")).toBe("numeric")
})

test("canonicalizes quoted qualified postgres type names", () => {
  expect(canonicalizePostgresTypeName("\"public\".\"status\"[]")).toBe("public.status[]")
  expect(canonicalizePostgresTypeName("\"AuditSchema\".\"StatusType\"[]")).toBe("\"AuditSchema\".\"StatusType\"[]")
  expect(canonicalizePostgresTypeName("\"audit\"\"schema\".\"status\"\"type\"[]")).toBe("\"audit\"\"schema\".\"status\"\"type\"[]")
})

test("infers kind from quoted qualified postgres type names", () => {
  expect(inferPostgresTypeKind("\"public\".\"status\"[]")).toBe("status[]")
  expect(inferPostgresTypeKind("\"AuditSchema\".\"StatusType\"[]")).toBe("StatusType[]")
  expect(inferPostgresTypeKind("\"audit\"\"schema\".\"status\"\"type\"[]")).toBe("status\"type[]")
})
