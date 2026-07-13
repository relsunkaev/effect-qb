import { expect, test } from "bun:test"
import { insertChangelogSection } from "../../../scripts/release.ts"

test("release changelog consumes unreleased entries", () => {
  const existing = [
    "# Changelog",
    "",
    "## Unreleased",
    "",
    "### Fixes",
    "",
    "- stale generated entry",
    "",
    "## 1.0.0 - 2026-01-01",
    "",
    "- previous release",
    ""
  ].join("\n")

  expect(insertChangelogSection(existing, "## 1.1.0 - 2026-02-01\n\n- current release")).toBe([
    "# Changelog",
    "",
    "## Unreleased",
    "",
    "## 1.1.0 - 2026-02-01",
    "",
    "- current release",
    "",
    "## 1.0.0 - 2026-01-01",
    "",
    "- previous release",
    ""
  ].join("\n"))
})
