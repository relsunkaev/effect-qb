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
