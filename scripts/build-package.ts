import { stat } from "node:fs/promises"
import { join } from "node:path"

const cwd = process.cwd()

const runBuild = async (packageDir: string) => {
  const proc = Bun.spawn([
    process.execPath,
    "run",
    "build"
  ], {
    cwd: join(cwd, packageDir),
    stdout: "inherit",
    stderr: "inherit"
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    process.exit(exitCode)
  }

  const distStat = await stat(join(cwd, packageDir, "dist"))
  if (!distStat.isDirectory()) {
    throw new Error(`build did not produce a dist directory for ${packageDir}`)
  }
}

const main = async () => {
  await runBuild("packages/querybuilder")
  await runBuild("packages/database")
}

await main()
