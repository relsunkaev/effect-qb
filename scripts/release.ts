const cwd = process.cwd()
const packageJsonPaths = [
  `${cwd}/package.json`,
  `${cwd}/packages/querybuilder/package.json`,
  `${cwd}/packages/database/package.json`
] as const
const databaseCliPath = `${cwd}/packages/database/src/cli.ts`

type Semver = {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: string | null
}

type Commit = {
  readonly hash: string
  readonly subject: string
  readonly body: string
  readonly type: string
  readonly scope: string | null
  readonly description: string
  readonly breaking: boolean
}

type Bump = "major" | "minor" | "patch"
type ReleaseBoundary = {
  readonly hash: string
  readonly version: Semver
}

const changelogPath = `${cwd}/CHANGELOG.md`
const bunLockPath = `${cwd}/bun.lock`
const releaseDate = new Date().toISOString().slice(0, 10)
const recordSeparator = "\u001e"
const fieldSeparator = "\u001f"

const sectionNames: Record<string, string> = {
  breaking: "Breaking Changes",
  feat: "Features",
  fix: "Fixes",
  refactor: "Refactors",
  docs: "Docs",
  test: "Tests",
  build: "Build",
  ci: "CI",
  chore: "Chores",
  perf: "Performance",
  style: "Style",
  other: "Other"
}

const sectionOrder = [
  "breaking",
  "feat",
  "fix",
  "refactor",
  "docs",
  "test",
  "build",
  "ci",
  "chore",
  "perf",
  "style",
  "other"
] as const

const parseSemver = (value: string): Semver => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value)
  if (!match) {
    throw new Error(`Invalid semver: ${value}`)
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null
  }
}

const parseReleaseVersion = (subject: string): Semver | null => {
  const match = /^chore\(release\): v(?<version>\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(subject)
  if (!match?.groups?.version) {
    return null
  }
  return parseSemver(match.groups.version)
}

const formatSemver = (value: Semver): string =>
  `${value.major}.${value.minor}.${value.patch}${value.prerelease === null ? "" : `-${value.prerelease}`}`

const bumpSemver = (value: Semver, bump: Bump): Semver => {
  switch (bump) {
    case "major":
      return { major: value.major + 1, minor: 0, patch: 0, prerelease: null }
    case "minor":
      return { major: value.major, minor: value.minor + 1, patch: 0, prerelease: null }
    case "patch":
      return { major: value.major, minor: value.minor, patch: value.patch + 1, prerelease: null }
  }
}

const getArgValue = (args: readonly string[], name: string): string | null => {
  const inlinePrefix = `${name}=`
  const inline = args.find((arg) => arg.startsWith(inlinePrefix))
  if (inline !== undefined) {
    return inline.slice(inlinePrefix.length)
  }

  const index = args.indexOf(name)
  if (index === -1) {
    return null
  }

  const value = args[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`)
  }
  return value
}

const run = async (command: string[], options?: { readonly allowFailure?: boolean }) => {
  const proc = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  })

  const stdoutPromise = new Response(proc.stdout).text()
  const stderrPromise = new Response(proc.stderr).text()
  const exitCode = await proc.exited
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])

  if (exitCode !== 0 && !options?.allowFailure) {
    throw new Error([
      `Command failed: ${command.join(" ")}`,
      stderr.trim() || stdout.trim() || `exit code ${exitCode}`
    ].join("\n"))
  }

  return { exitCode, stdout, stderr }
}

const getLatestTag = async (): Promise<string | null> => {
  const result = await run([
    "git",
    "describe",
    "--tags",
    "--abbrev=0",
    "--match",
    "v[0-9]*"
  ], { allowFailure: true })

  return result.exitCode === 0 ? result.stdout.trim() : null
}

const getLatestReleaseBoundary = async (): Promise<ReleaseBoundary | null> => {
  const latestTag = await getLatestTag()

  if (latestTag) {
    const hashResult = await run(["git", "rev-list", "-n", "1", latestTag])
    return {
      hash: hashResult.stdout.trim(),
      version: parseSemver(latestTag.slice(1))
    }
  }

  const commits = await getCommits("HEAD")
  for (let index = commits.length - 1; index >= 0; index -= 1) {
    const commit = commits[index]!
    const version = parseReleaseVersion(commit.subject)
    if (version) {
      return {
        hash: commit.hash,
        version
      }
    }
  }

  return null
}

const getPackageVersion = async (): Promise<Semver> => {
  const raw = await Bun.file(packageJsonPaths[0]).text()
  const parsed = JSON.parse(raw) as { version: string }
  return parseSemver(parsed.version)
}

const setPackageVersion = async (version: Semver) => {
  for (const packageJsonPath of packageJsonPaths) {
    const raw = await Bun.file(packageJsonPath).text()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    parsed.version = formatSemver(version)
    await Bun.write(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`)
  }
}

const setCliVersion = async (version: Semver) => {
  const raw = await Bun.file(databaseCliPath).text()
  const next = raw.replace(
    /version: "\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?"/,
    `version: "${formatSemver(version)}"`
  )
  if (next === raw) {
    throw new Error("Failed to update CLI version")
  }
  await Bun.write(databaseCliPath, next)
}

const setBunLockWorkspaceVersions = async (version: Semver) => {
  const versionString = formatSemver(version)
  const raw = await Bun.file(bunLockPath).text()
  const lines = raw.split("\n")
  const workspaces = new Set(["packages/database", "packages/querybuilder"])
  const updated = new Set<string>()
  let currentWorkspace: string | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const workspaceMatch = /^    "(packages\/(?:database|querybuilder))": \{$/.exec(lines[index]!)
    if (workspaceMatch?.[1]) {
      currentWorkspace = workspaceMatch[1]
      continue
    }

    if (currentWorkspace !== null && /^      "version": "/.test(lines[index]!)) {
      lines[index] = `      "version": "${versionString}",`
      updated.add(currentWorkspace)
      currentWorkspace = null
    }
  }

  const missing = [...workspaces].filter((workspace) => !updated.has(workspace))
  if (missing.length > 0) {
    throw new Error(`Failed to update bun.lock workspace version(s): ${missing.join(", ")}`)
  }

  await Bun.write(bunLockPath, lines.join("\n"))
}

const parseCommit = (hash: string, subject: string, body: string): Commit => {
  const match = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?: (?<description>.+)$/.exec(subject)
  const bodyHasBreaking = /(?:^|\n)BREAKING[- ]CHANGE:/m.test(body)
  const type = match?.groups?.type ?? "other"
  return {
    hash,
    subject,
    body,
    type,
    scope: match?.groups?.scope ?? null,
    description: match?.groups?.description ?? subject,
    breaking: Boolean(match?.groups?.breaking) || bodyHasBreaking
  }
}

const getCommits = async (range: string): Promise<ReadonlyArray<Commit>> => {
  const result = await run([
    "git",
    "log",
    "--no-merges",
    "--reverse",
    "--format=%H%x1f%s%x1f%b%x1e",
    range
  ])

  return result.stdout
    .split(recordSeparator)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash = "", subject = "", body = ""] = record.split(fieldSeparator)
      return parseCommit(hash, subject, body.trim())
    })
}

const determineBump = (commits: ReadonlyArray<Commit>, baseMajor: number): Bump => {
  const hasBreaking = commits.some((commit) => commit.breaking)
  const hasFeat = commits.some((commit) => commit.type === "feat")

  if (baseMajor >= 1) {
    if (hasBreaking) {
      return "major"
    }
    if (hasFeat) {
      return "minor"
    }
    return "patch"
  }

  if (hasBreaking || hasFeat) {
    return "minor"
  }

  return "patch"
}

const formatBullet = (commit: Commit): string => `- ${commit.subject}`

const renderSection = (title: string, commits: ReadonlyArray<Commit>): string => [
  `### ${title}`,
  "",
  ...commits.map(formatBullet)
].join("\n")

const renderChangelogSection = (version: string, commits: ReadonlyArray<Commit>): string => {
  const buckets = new Map<string, Commit[]>()

  for (const commit of commits) {
    const key = commit.breaking ? "breaking" : (sectionNames[commit.type] ? commit.type : "other")
    const bucket = buckets.get(key) ?? []
    bucket.push(commit)
    buckets.set(key, bucket)
  }

  const sections = sectionOrder
    .filter((section) => (buckets.get(section)?.length ?? 0) > 0)
    .map((section) => renderSection(sectionNames[section] ?? section, buckets.get(section) ?? []))

  return [
    `## ${version} - ${releaseDate}`,
    "",
    ...sections.flatMap((section) => [section, ""])
  ].join("\n").trimEnd()
}

export const insertChangelogSection = (existing: string, section: string): string => {
  const unreleasedMarker = "## Unreleased"
  const unreleasedIndex = existing.indexOf(unreleasedMarker)

  if (unreleasedIndex === -1) {
    return `${existing.trimEnd()}\n\n${section}\n`
  }

  const afterUnreleased = existing.indexOf("\n", unreleasedIndex)

  if (afterUnreleased === -1) {
    return `${existing.trimEnd()}\n\n${section}\n`
  }

  const nextSection = existing.indexOf("\n## ", afterUnreleased)
  const prefix = existing.slice(0, afterUnreleased + 1)
  const suffix = nextSection === -1 ? "" : existing.slice(nextSection + 1).trimStart()
  return `${prefix}\n${section}\n${suffix ? `\n${suffix}` : ""}`
}

const main = async () => {
  const argv = process.argv.slice(2)
  const args = new Set(argv)
  const push = args.has("--push")
  const dryRun = args.has("--dry-run")
  const explicitVersion = getArgValue(argv, "--version")

  const status = await run(["git", "status", "--short"])
  if (status.stdout.trim()) {
    throw new Error("Working tree must be clean before releasing")
  }

  const packageVersion = await getPackageVersion()
  const boundary = await getLatestReleaseBoundary()
  const commits = await getCommits(boundary ? `${boundary.hash}..HEAD` : "HEAD")

  if (boundary && commits.length === 0) {
    throw new Error("No commits to release")
  }

  const baseVersion = boundary?.version ?? packageVersion
  const bump = determineBump(commits, baseVersion.major)
  const nextVersion = explicitVersion === null
    ? bumpSemver(baseVersion, bump)
    : parseSemver(explicitVersion)
  const changelogSection = renderChangelogSection(formatSemver(nextVersion), commits)

  console.log(`Release version: ${formatSemver(nextVersion)}`)
  console.log(`Commits in release: ${commits.length}`)
  console.log(`Version bump: ${explicitVersion === null ? bump : "explicit"}`)

  if (dryRun) {
    console.log(changelogSection)
    return
  }

  const currentPackageVersion = formatSemver(packageVersion)
  const nextPackageVersion = formatSemver(nextVersion)

  if (currentPackageVersion !== nextPackageVersion) {
    await setPackageVersion(nextVersion)
  }
  await setCliVersion(nextVersion)
  await run(["bun", "install", "--lockfile-only"])
  await setBunLockWorkspaceVersions(nextVersion)

  const existingChangelog = await Bun.file(changelogPath).text().catch(() => "# Changelog\n\nAll notable changes to this project are documented here.\n\n## Unreleased\n\n")
  await Bun.write(changelogPath, insertChangelogSection(existingChangelog, changelogSection))

  const branch = (await run(["git", "branch", "--show-current"])).stdout.trim()
  if (!branch) {
    throw new Error("Release requires a checked-out branch")
  }

  await run(["git", "add", "package.json", "packages/querybuilder/package.json", "packages/database/package.json", "packages/database/src/cli.ts", "bun.lock", "CHANGELOG.md"])
  await run(["git", "commit", "-m", `chore(release): v${formatSemver(nextVersion)}`])
  await run(["git", "tag", "-a", `v${formatSemver(nextVersion)}`, "-m", `v${formatSemver(nextVersion)}`])

  if (push) {
    await run(["git", "push", "origin", `HEAD:${branch}`, "--tags"])
  }
}

if (import.meta.main) {
  await main()
}
