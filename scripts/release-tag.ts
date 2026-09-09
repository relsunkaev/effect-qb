/** Validate a release against the authoritative main ref before creating a tag. */
export const prepareReleaseTag = async (options: {
  readonly cwd: string
  readonly tag: string
  readonly ref: string
  readonly mainRef: string
}): Promise<string> => {
  const git = async (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: options.cwd })
    if (result.exitCode !== 0) throw new Error(result.stderr.toString() || `git ${args[0]} failed`)
    return result.stdout.toString().trim()
  }
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(options.tag)) {
    throw new Error("Expected a version tag such as v0.23.0")
  }
  const commit = await git("rev-parse", "--verify", `${options.ref}^{commit}`)
  await git("merge-base", "--is-ancestor", commit, options.mainRef)
  const version = options.tag.slice(1)
  for (const path of ["package.json", "packages/querybuilder/package.json", "packages/database/package.json"]) {
    const manifest = JSON.parse(await git("show", `${commit}:${path}`))
    if (manifest.version !== version) throw new Error(`${path} does not match ${options.tag}`)
  }
  const changelog = await git("show", `${commit}:CHANGELOG.md`)
  if (!changelog.split("\n").some((line) => line.startsWith(`## ${version} - `))) {
    throw new Error(`Missing release notes for ${options.tag}`)
  }
  const existing = Bun.spawnSync(["git", "show-ref", "--verify", "--quiet", `refs/tags/${options.tag}`], { cwd: options.cwd })
  if (existing.exitCode === 0) {
    if (await git("rev-parse", `refs/tags/${options.tag}^{commit}`) !== commit) {
      throw new Error(`Existing ${options.tag} points to a different commit`)
    }
  } else {
    await git("tag", "-a", options.tag, commit, "-m", options.tag)
  }
  return commit
}

if (import.meta.main) {
  const [tag, ref] = process.argv.slice(2)
  if (!tag || !ref) throw new Error("Usage: bun scripts/release-tag.ts <tag> <commit-or-ref>")
  await prepareReleaseTag({ cwd: process.cwd(), tag, ref, mainRef: "refs/remotes/origin/main" })
}
