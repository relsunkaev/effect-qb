const cwd = process.cwd()

type Semver = {
  readonly major: number
  readonly minor: number
  readonly patch: number
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

const changelogPath = `${cwd}/CHANGELOG.md`
const packageJsonPath = `${cwd}/package.json`

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
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (!match) {
    throw new Error(`Invalid semver: ${value}`)
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
}

const formatSemver = (value: Semver): string => `${value.major}.${value.minor}.${value.patch}`

const bumpSemver = (value: Semver, bump: Bump): Semver => {
  switch (bump) {
    case "major":
      return { major: value.major + 1, minor: 0, patch: 0 }
    case "minor":
      return { major: value.major, minor: value.minor + 1, patch: 0 }
    case "patch":
      return { major: value.major, minor: value.minor, patch: value.patch + 1 }
  }
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

const getPackageVersion = async (): Promise<Semver> => {
  const raw = await Bun.file(packageJsonPath).text()
  const parsed = JSON.parse(raw) as { version: string }
  return parseSemver(parsed.version)
}

const setPackageVersion = async (version: Semver) => {
  const raw = await Bun.file(packageJsonPath).text()
  const parsed = JSON.parse(raw) as Record<string, unknown>
  parsed.version = formatSemver(version)
  await Bun.write(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`)
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
    .map((section) => renderSection(sectionNames[section], buckets.get(section) ?? []))

  return [
    `## ${version} - ${releaseDate}`,
    "",
    ...sections.flatMap((section) => [section, ""])
  ].join("\n").trimEnd()
}

const insertChangelogSection = (existing: string, section: string): string => {
  const unreleasedMarker = "## Unreleased"
  const unreleasedIndex = existing.indexOf(unreleasedMarker)

  if (unreleasedIndex === -1) {
    return `${existing.trimEnd()}\n\n${section}\n`
  }

  const afterUnreleased = existing.indexOf("\n\n", unreleasedIndex)

  if (afterUnreleased === -1) {
    return `${existing.trimEnd()}\n\n${section}\n`
  }

  const prefix = existing.slice(0, afterUnreleased + 2)
  const suffix = existing.slice(afterUnreleased + 2).trimStart()
  return `${prefix}${section}\n\n${suffix}`
}

const ensureGitIdentity = async () => {
  await run(["git", "config", "user.name", "Ramazan Elsunkaev"])
  await run(["git", "config", "user.email", "relsunkaev@outlook.com"])
}

const main = async () => {
  const args = new Set(process.argv.slice(2))
  const push = args.has("--push")
  const dryRun = args.has("--dry-run")

  const status = await run(["git", "status", "--short"])
  if (status.stdout.trim()) {
    throw new Error("Working tree must be clean before releasing")
  }

  const packageVersion = await getPackageVersion()
  const latestTag = await getLatestTag()
  const commits = await getCommits(latestTag ? `${latestTag}..HEAD` : "HEAD")

  if (latestTag && commits.length === 0) {
    throw new Error("No commits to release")
  }

  const baseVersion = latestTag ? parseSemver(latestTag.slice(1)) : packageVersion
  const nextVersion = latestTag ? bumpSemver(baseVersion, determineBump(commits, baseVersion.major)) : packageVersion
  const changelogSection = renderChangelogSection(formatSemver(nextVersion), commits)

  console.log(`Release version: ${formatSemver(nextVersion)}`)
  console.log(`Commits in release: ${commits.length}`)
  console.log(`Version bump: ${latestTag ? determineBump(commits, baseVersion.major) : "initial"}`)

  if (dryRun) {
    console.log(changelogSection)
    return
  }

  const currentPackageVersion = formatSemver(packageVersion)
  const nextPackageVersion = formatSemver(nextVersion)

  if (currentPackageVersion !== nextPackageVersion) {
    await setPackageVersion(nextVersion)
  }

  const existingChangelog = await Bun.file(changelogPath).text().catch(() => "# Changelog\n\nAll notable changes to this project are documented here.\n\n## Unreleased\n\n")
  await Bun.write(changelogPath, insertChangelogSection(existingChangelog, changelogSection))

  await ensureGitIdentity()
  await run(["git", "add", "package.json", "CHANGELOG.md"])
  await run(["git", "commit", "-m", `chore(release): v${formatSemver(nextVersion)}`])
  await run(["git", "tag", "-a", `v${formatSemver(nextVersion)}`, "-m", `v${formatSemver(nextVersion)}`])

  if (push) {
    await run(["git", "push", "origin", "HEAD:main", "--tags"])
  }
}

await main()
