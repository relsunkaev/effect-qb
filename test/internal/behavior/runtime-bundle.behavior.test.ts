import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { verifyRuntimeBundles } from "../../../scripts/check-runtime-bundles.js"

test("published ESM runtime imports exclude unused renderer, error, and schema tooling", async () => {
  const bundles = await verifyRuntimeBundles(resolve("packages/querybuilder"))
  expect(bundles.length).toBeGreaterThan(0)
})
