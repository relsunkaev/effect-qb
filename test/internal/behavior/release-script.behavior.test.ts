import { expect, test } from "bun:test"
import { insertChangelogSection, selectReleaseTag } from "../../../scripts/release.ts"

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

test("stable releases use the latest stable tag as their boundary", () => {
  expect(selectReleaseTag([
    "v4.0.0-beta.98",
    "v4.0.0-beta.92",
    "v0.19.0",
    "v0.18.0"
  ], "0.20.0")).toBe("v0.19.0")
})

test("prereleases continue their version line before falling back to stable", () => {
  const tags = [
    "v4.0.0-beta.98",
    "v4.0.0-beta.92",
    "v0.19.0"
  ]

  expect(selectReleaseTag(tags, "4.0.0-beta.99")).toBe("v4.0.0-beta.98")
  expect(selectReleaseTag(tags, "0.20.0-beta.1")).toBe("v0.19.0")
})
