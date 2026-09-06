import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareReleaseTag } from "../../../scripts/release-tag.ts"

const directories: string[] = []
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true })
})
const fixture = () => {
  const cwd = mkdtempSync(join(tmpdir(), "effect-qb-release-"))
  directories.push(cwd)
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd })
    if (result.exitCode !== 0) throw new Error(result.stderr.toString())
    return result.stdout.toString().trim()
  }
  git("init", "-b", "main")
  git("config", "user.email", "test@example.com")
  git("config", "user.name", "Test")
  for (const path of ["", "packages/querybuilder", "packages/database"]) {
    mkdirSync(join(cwd, path), { recursive: true })
    writeFileSync(join(cwd, path, "package.json"), JSON.stringify({ version: "0.23.0" }))
  }
  writeFileSync(join(cwd, "CHANGELOG.md"), "## 0.23.0 - 2026-09-06\n\nRelease notes\n")
  git("add", ".")
  git("commit", "-m", "release")
  return { cwd, git, tag: "v0.23.0", ref: git("rev-parse", "HEAD"), mainRef: "refs/heads/main" }
}

test("merged release can be tagged and retried without moving the tag", async () => {
  const f = fixture()
  const commit = await prepareReleaseTag(f)
  expect(f.git("rev-parse", "v0.23.0^{commit}")).toBe(commit)
  expect(await prepareReleaseTag(f)).toBe(commit)
})

test("rejected main update leaves no release tag", async () => {
  const f = fixture()
  f.git("switch", "-c", "release/prepared")
  writeFileSync(join(f.cwd, "new.txt"), "unmerged release")
  f.git("add", ".")
  f.git("commit", "-m", "unmerged")
  await expect(prepareReleaseTag({ ...f, ref: f.git("rev-parse", "HEAD") })).rejects.toThrow()
  expect(f.git("tag", "--list")).toBe("")
})

test("mismatched release version cannot create a tag", async () => {
  const f = fixture()
  await expect(prepareReleaseTag({ ...f, tag: "v0.24.0" })).rejects.toThrow("does not match")
  expect(f.git("tag", "--list")).toBe("")
})

test("an existing tag on a different commit is never replaced", async () => {
  const f = fixture()
  f.git("tag", "v0.23.0")
  writeFileSync(join(f.cwd, "new.txt"), "later commit")
  f.git("add", ".")
  f.git("commit", "-m", "later")
  await expect(prepareReleaseTag({ ...f, ref: f.git("rev-parse", "HEAD") })).rejects.toThrow("different commit")
  expect(f.git("rev-parse", "v0.23.0")).toBe(f.ref)
})
