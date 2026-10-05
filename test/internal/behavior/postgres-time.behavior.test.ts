import { expect, test } from "bun:test"
import { fromDriverValue } from "#internal/runtime/driver-value-mapping.ts"
import { Type } from "#standard"

test("native PostgreSQL time decoding preserves microseconds and the local-time contract", () => {
  const context = { dialect: "postgres", dbType: Type.time() }
  expect(fromDriverValue(0n, context)).toBe("00:00:00")
  expect(fromDriverValue(45_296_123_456n, context)).toBe("12:34:56.123456")
  expect(fromDriverValue(45_296_120_000n, context)).toBe("12:34:56.12")
  expect(fromDriverValue(86_399_999_999n, context)).toBe("23:59:59.999999")
  expect(() => fromDriverValue(-1n, context)).toThrow()
  expect(() => fromDriverValue(86_400_000_000n, context)).toThrow()
  expect(() => fromDriverValue(1n, { ...context, dialect: "sqlite" })).toThrow()
  expect(fromDriverValue(1n, { ...context, valueMappings: { time: { fromDriver: () => "custom" } } })).toBe("custom")
})
